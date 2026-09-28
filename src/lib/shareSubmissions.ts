/**
 * Outsourcing / "hive of workers" layer for public shares.
 *
 * When a share has `allowContributions === true` (see `lib/publicShare.ts`), the
 * anonymous people the owner sends the link to can *act* on tasks — claim one,
 * mark it done for review — without signing in. Their actions are written to a
 * `publicShares/{shareId}/submissions/{taskId}` subcollection (one doc per task,
 * last writer wins) that both the public `SharePage` and the owner's app read
 * live via `onSnapshot`.
 *
 * The owner then *approves* a submission from inside the app, which completes
 * the underlying task in the normal store (that re-pushes the public snapshot,
 * so the worker instantly sees it flip to "done ✓ approved").
 *
 * Security: writes are guarded by `firestore.rules` — anonymous writers can only
 * ever set the non-final states below and must attach a name; only the signed-in
 * owner can approve (complete the task) or delete a submission.
 *
 * WHAT A WORKER SENDS ONLY THE OWNER (BUILD-14)
 * ---------------------------------------------
 * The redrawn page asks a worker for an email to claim, and a link to the
 * files plus a note to submit. None of that goes in the submission above,
 * which **anyone holding the link can read** — every other worker would see
 * every email. It goes in `publicShares/{shareId}/details/{taskId}` instead,
 * which the rules let a stranger write and only the owner read.
 * Those rules, and the new `released` state, have to be published by hand
 * (the Firebase console; nothing on the laptop can). Until they are, a claim
 * still works without its email, and a submit refuses — a submission with
 * its link lost is worse than one that says it failed.
 *
 * There is no lock, his call: a claimed task is drawn as taken, but nothing
 * stops a second claim. Which claims are *this device's* is remembered in
 * localStorage, since a worker has no account to remember it by.
 */
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

/** `released`: the worker gave it back. Reads as unclaimed everywhere. */
export type SubmissionState = 'in_progress' | 'submitted' | 'released';

export interface ShareSubmission {
  taskId: string;
  /** Free-text name the worker typed (no account required). */
  workerName: string;
  state: SubmissionState;
  updatedAt: number;
}

const WORKER_NAME_KEY = 'mutineer-worker-name';

export function loadWorkerName(): string {
  try {
    return localStorage.getItem(WORKER_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveWorkerName(name: string): void {
  try {
    localStorage.setItem(WORKER_NAME_KEY, name);
  } catch {
    /* storage blocked — non-fatal */
  }
}

const WORKER_EMAIL_KEY = 'base.worker-email';
const CLAIMS_KEY = 'base.share-claims';

export function loadWorkerEmail(): string {
  try {
    return localStorage.getItem(WORKER_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveWorkerEmail(email: string): void {
  try {
    localStorage.setItem(WORKER_EMAIL_KEY, email);
  } catch {
    /* storage blocked — non-fatal */
  }
}

function readClaims(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/** Task ids this device claimed on this share. */
export function loadClaims(shareId: string): string[] {
  const ids = readClaims()[shareId];
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
}

function rememberClaim(shareId: string, taskId: string, mine: boolean): void {
  const all = readClaims();
  const ids = new Set(Array.isArray(all[shareId]) ? all[shareId] : []);
  if (mine) ids.add(taskId); else ids.delete(taskId);
  all[shareId] = [...ids];
  try {
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked — the claim still stands, this device just forgets it */
  }
}

/** Anything a person could plausibly type as an email. The rules cap its length. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The link a worker typed, as a web address, or `null`. `https://` is added
 * when they left it off; any other scheme is refused, because the owner's
 * panel turns this into a link he clicks.
 */
export function normaliseFilesLink(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.href.slice(0, 2000);
  } catch {
    return null;
  }
}

/** The owner-only half of a submission. */
export interface SubmissionDetails {
  taskId: string;
  email?: string;
  link?: string;
  note?: string;
  updatedAt: number;
}

function detailsRef(shareId: string, taskId: string) {
  return doc(db, 'publicShares', shareId, 'details', taskId);
}

async function setDetails(shareId: string, taskId: string, patch: Omit<SubmissionDetails, 'taskId' | 'updatedAt'>) {
  await setDoc(detailsRef(shareId, taskId), { taskId, ...patch, updatedAt: Date.now() }, { merge: true });
}

/** A worker claims a task: the public claim, then the email only the owner sees. */
export async function claimTask(shareId: string, taskId: string, workerName: string, email: string): Promise<void> {
  await setSubmission(shareId, taskId, workerName, 'in_progress');
  rememberClaim(shareId, taskId, true);
  try {
    await setDetails(shareId, taskId, { email: email.trim().slice(0, 254) });
  } catch (err) {
    // The rules that let a stranger write this may not be published yet (see
    // the header). The claim itself stands.
    console.warn('Claim saved without its email:', err);
  }
}

/** A worker hands in the work. The link has to land, or nothing is submitted. */
export async function submitWork(
  shareId: string,
  taskId: string,
  workerName: string,
  link: string,
  note: string,
): Promise<void> {
  await setDetails(shareId, taskId, { link, note: note.trim().slice(0, 2000) });
  await setSubmission(shareId, taskId, workerName, 'submitted');
}

/** A worker gives the task back. */
export async function releaseTask(shareId: string, taskId: string, workerName: string): Promise<void> {
  await setSubmission(shareId, taskId, workerName, 'released');
  rememberClaim(shareId, taskId, false);
}

/** Owner-only: every worker's email, link and note on a share, live. */
export function subscribeSubmissionDetails(
  shareId: string,
  onChange: (details: SubmissionDetails[]) => void,
): () => void {
  return onSnapshot(
    collection(db, 'publicShares', shareId, 'details'),
    (snap) => onChange(snap.docs.map((d) => d.data() as SubmissionDetails)),
    () => onChange([]),
  );
}

function submissionRef(shareId: string, taskId: string) {
  return doc(db, 'publicShares', shareId, 'submissions', taskId);
}

/**
 * Worker (or owner, on reject) sets a task's submission state. `workerName` is
 * required and validated in the security rules.
 */
export async function setSubmission(
  shareId: string,
  taskId: string,
  workerName: string,
  state: SubmissionState,
): Promise<void> {
  const name = workerName.trim().slice(0, 60);
  if (!name) throw new Error('Please enter your name first.');
  await setDoc(submissionRef(shareId, taskId), {
    taskId,
    workerName: name,
    state,
    updatedAt: Date.now(),
  } satisfies ShareSubmission);
}

/** Owner-only: remove a submission (used after approving/completing the task). */
export async function clearSubmission(shareId: string, taskId: string): Promise<void> {
  await deleteDoc(submissionRef(shareId, taskId));
}

/**
 * Live-subscribe to every submission on a share. Used by both the public
 * `SharePage` (to render each task's current worker state) and the owner's
 * approval panel. Returns an unsubscribe function.
 */
export function subscribeSubmissions(
  shareId: string,
  onChange: (submissions: ShareSubmission[]) => void,
): () => void {
  return onSnapshot(
    collection(db, 'publicShares', shareId, 'submissions'),
    (snap) => onChange(snap.docs.map((d) => d.data() as ShareSubmission)),
    () => onChange([]),
  );
}
