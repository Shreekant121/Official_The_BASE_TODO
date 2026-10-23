/**
 * Public, read-only "sharable link" layer — the Google-Docs-style share view
 * that the SimpleURL short link (see `lib/simpleUrl.ts`) ultimately points at.
 *
 * A share is a self-contained, denormalized *snapshot* of a task / task-list /
 * project written to a top-level `publicShares/{shareId}` Firestore doc that
 * anyone can read (see `firestore.rules`). It never exposes anything under
 * `users/{uid}` — the public `SharePage` only ever reads these mirror docs, so
 * an anonymous viewer can see exactly what was shared and nothing else.
 *
 * The snapshot is kept *live* (not a one-time export): `scheduleShareReconcile`
 * is invoked from `firestoreSync.ts` after every debounced cloud write, so any
 * edit to a shared entity re-pushes its snapshot and open share links update
 * on their own via `onSnapshot`.
 *
 * **What it contains moved to `publicShareSnapshot.ts` at item 13.** This file
 * is now the Firestore half and that one is the pure half, because the MCP
 * server has to build the same document from Node with the Admin SDK and
 * cannot import anything that reaches `./firebase` — see the header there.
 * Everything the app used to import from here is still exported from here.
 *
 * **BUILD-14 gave it the two things only a browser knows**: the focus log
 * (the client view's "time taken"), and the focus run going on right now
 * (its live timer). Both ride on every write as `ShareDocExtras`.
 */
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { withResolvedShareCover } from './covers/coverRef';
import { coverDataUrl } from './covers/coverCache';
import { db, auth } from './firebase';
import {
  buildShareDoc, type PublicLiveRun, type PublicShareDoc, type ShareDocExtras,
} from './publicShareSnapshot';
import { useStore, type FocusLogEntry, type Task, type TaskList, type Project } from '../store/useStore';
import { useFocusRun } from '../store/useFocusRun';

export {
  makeShareId,
  sharePath,
  shareExpiryInstant,
  snapshotList,
  snapshotProject,
  snapshotTask,
  buildShareDoc,
} from './publicShareSnapshot';
export type {
  PublicList,
  PublicLiveRun,
  PublicProject,
  PublicShareDoc,
  PublicSubtask,
  PublicTask,
  ShareSettings,
  ShareType,
} from './publicShareSnapshot';

/** The public URL a share link points at — always on the app's own origin. */
export function shareUrl(shareId: string): string {
  return `${window.location.origin}/s/${shareId}`;
}

// ─── Writers ─────────────────────────────────────────────────────────────────

/**
 * The name the page puts on the link. **Never the email** (BUILD-14, his
 * call): it used to fall back to the address, which published it to anyone
 * holding a link. No display name means no name, and the page copes.
 */
function ownerName(): string | undefined {
  return auth.currentUser?.displayName?.trim() || undefined;
}

/**
 * How long past its own clock reaching zero a run still shows as live. A run
 * that goes over is real work and is shown; a tab closed mid-run is not, and
 * this is what eventually stops its timer on the page.
 */
const LIVE_GRACE_MS = 30 * 60 * 1000;

/**
 * The focus run going on now, in the shape a share publishes. Read at write
 * time rather than handed in, so every write — the reconcile after an edit as
 * much as the one a pressed play asks for — carries the run as it is.
 */
function liveRunNow(): PublicLiveRun | null {
  const s = useFocusRun.getState();
  if (!s.task || !s.running || s.runningSince === null || s.segmentStartedAt === null) return null;
  return {
    taskId: s.task.id,
    since: s.runningSince,
    segmentStartedAt: s.segmentStartedAt,
    until: Math.max(s.taskZeroAt, Date.now()) + LIVE_GRACE_MS,
  };
}

function extras(focusLog: FocusLogEntry[] | undefined): ShareDocExtras {
  return { focusLog, live: liveRunNow() };
}

async function writeShare(payload: PublicShareDoc): Promise<void> {
  // A stranger cannot open `users/{uid}/covers`, so the picture itself goes
  // into the share, never the `cover:` pointer (lib/covers/).
  const published = await withResolvedShareCover(payload, coverDataUrl);
  await setDoc(doc(db, 'publicShares', payload.shareId), published);
}

/*
 * The focus log defaults to the store's, so a call site that publishes one
 * share (the Share dialog, a mode change) needs to know nothing about it.
 */
export async function shareTask(
  shareId: string,
  ownerId: string,
  task: Task,
  focusLog: FocusLogEntry[] | undefined = useStore.getState().focusLog,
): Promise<void> {
  await writeShare(buildShareDoc(shareId, ownerId, ownerName(), { type: 'task', task }, extras(focusLog)));
}

export async function shareList(
  shareId: string,
  ownerId: string,
  list: TaskList,
  allTasks: Task[],
  focusLog: FocusLogEntry[] | undefined = useStore.getState().focusLog,
): Promise<void> {
  await writeShare(buildShareDoc(shareId, ownerId, ownerName(), { type: 'list', list, allTasks }, extras(focusLog)));
}

export async function shareProject(
  shareId: string,
  ownerId: string,
  project: Project,
  allLists: TaskList[],
  allTasks: Task[],
  focusLog: FocusLogEntry[] | undefined = useStore.getState().focusLog,
  /** Every project, so the ones inside this one are published with it (BIG-2). */
  allProjects: Project[] = useStore.getState().projects,
): Promise<void> {
  await writeShare(buildShareDoc(
    shareId, ownerId, ownerName(), { type: 'project', project, allLists, allTasks, allProjects }, extras(focusLog),
  ));
}

export async function deleteShare(shareId: string): Promise<void> {
  await deleteDoc(doc(db, 'publicShares', shareId));
}

// ─── Live reconciliation (keeps shared links fresh on every store write) ─────

interface ReconcileSnapshot {
  projects: Project[];
  taskLists: TaskList[];
  backlogTasks: Task[];
  focusLog?: FocusLogEntry[];
}

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced re-push of every currently-shared entity's snapshot. Called from
 * `firestoreSync.ts` right after each successful cloud write, mirroring the
 * notification reconcile pass — so a shared link never goes stale after an
 * edit. Cheap: only touches entities that actually carry a `shareId`.
 */
export function scheduleShareReconcile(ownerId: string, snapshot: ReconcileSnapshot): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void reconcileShares(ownerId, snapshot);
  }, 1500);
}

async function reconcileShares(
  ownerId: string,
  { projects, taskLists, backlogTasks, focusLog }: ReconcileSnapshot,
): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const t of backlogTasks) {
    if (t.shareId) jobs.push(shareTask(t.shareId, ownerId, t, focusLog).catch(() => {}));
  }
  for (const l of taskLists) {
    if (l.shareId) jobs.push(shareList(l.shareId, ownerId, l, backlogTasks, focusLog).catch(() => {}));
  }
  for (const p of projects) {
    if (p.shareId) jobs.push(shareProject(p.shareId, ownerId, p, taskLists, backlogTasks, focusLog, projects).catch(() => {}));
  }
  await Promise.allSettled(jobs);
}

/**
 * Re-publish the client-view shares when the focus run starts, pauses, stops
 * or has its clock moved (BUILD-14). Pressing play writes nothing to the store,
 * so the reconcile after a sync would never hear of it. With no client-view
 * share there is nothing a run would change, and nothing is written.
 */
export function republishForFocusRun(ownerId: string): void {
  const s = useStore.getState();
  const any = [...s.projects, ...s.taskLists, ...s.backlogTasks].some(
    (e) => e.shareId && e.shareShowPeople && !e.shareAllowContributions,
  );
  if (!any) return;
  scheduleShareReconcile(ownerId, {
    projects: s.projects, taskLists: s.taskLists, backlogTasks: s.backlogTasks, focusLog: s.focusLog,
  });
}
