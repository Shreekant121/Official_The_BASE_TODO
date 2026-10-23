/**
 * Where a cover picture is actually kept, and how a screen gets one to draw.
 * The pointer format and the rules are in `coverRef.ts`; this is the I/O.
 *
 * Three layers, read in this order:
 * - **Memory** — one `Map` for the life of the page, read synchronously by
 *   `useCoverSrc`, so a cover that has been seen once never flickers again.
 * - **IndexedDB on this device** (`base-covers`) — a cover is downloaded once
 *   per device, not once per open, and still draws offline. Not localStorage:
 *   that holds ~5 MB and the store is already in it.
 * - **Firestore**, `users/{uid}/covers/{id}` — one document per picture, each
 *   with its own 1 MiB, under the owner rule `firestore.rules` already has.
 *
 * `users/{uid}/data/covers` lists every picture the account has stored. The
 * sweep reads that one small document instead of the covers themselves,
 * which would download every picture just to learn its name.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc, type FieldValue,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { fitCoverDocument } from '../compressImage';
import {
  coverIdOf, coverRef, isCoverRef, planCoverSweep, type CoverIndexEntry,
} from './coverRef';

// ─── This page's memory ──────────────────────────────────────────────────────

const srcs = new Map<string, string>();
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
/** Ids a screen asked for that could not be found yet — re-asked on sign-in. */
const missing = new Set<string>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function remember(id: string, dataUrl: string) {
  srcs.set(id, dataUrl);
  missing.delete(id);
  emit();
}

// ─── This device (IndexedDB) ─────────────────────────────────────────────────

interface LocalCover {
  id: string;
  dataUrl: string;
  /** False until the cloud has confirmed the upload — retried on next open. */
  synced: boolean;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openLocal(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open('base-covers', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('covers', { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      // A private window or a blocked site: the cloud alone still works.
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function localTx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const idb = await openLocal();
  if (!idb) return undefined;
  return new Promise((resolve) => {
    try {
      const req = run(idb.transaction('covers', mode).objectStore('covers'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

const getLocal = (id: string) => localTx<LocalCover | undefined>('readonly', (s) => s.get(id));
const putLocal = (rec: LocalCover) => localTx('readwrite', (s) => s.put(rec));
const deleteLocal = (id: string) => localTx('readwrite', (s) => s.delete(id));
const allLocal = () => localTx<LocalCover[]>('readonly', (s) => s.getAll());

// ─── The cloud ───────────────────────────────────────────────────────────────

const coverDoc = (uid: string, id: string) => doc(db, 'users', uid, 'covers', id);
const indexDoc = (uid: string) => doc(db, 'users', uid, 'data', 'covers');

/** Resolves once the server has the picture, and the index lists it. */
async function uploadCover(uid: string, id: string, dataUrl: string): Promise<void> {
  const createdAt = Date.now();
  await setDoc(coverDoc(uid, id), { dataUrl, createdAt });
  await setDoc(indexDoc(uid), { ids: { [id]: { createdAt } } }, { merge: true });
  await putLocal({ id, dataUrl, synced: true });
}

/**
 * The id is the picture's own SHA-256, so the same picture is one document
 * however many times it is uploaded or lifted out (`coverRef.ts`).
 */
export async function coverIdFor(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(dataUrl);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function requestCover(id: string): Promise<void> {
  if (srcs.has(id)) return Promise.resolve();
  const running = inflight.get(id);
  if (running) return running;
  const job = (async () => {
    const local = await getLocal(id);
    if (local?.dataUrl) { remember(id, local.dataUrl); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { missing.add(id); return; }
    try {
      const snap = await getDoc(coverDoc(uid, id));
      const dataUrl = snap.data()?.dataUrl;
      if (typeof dataUrl === 'string') {
        remember(id, dataUrl);
        await putLocal({ id, dataUrl, synced: true });
      } else {
        // Another device may not have finished uploading it yet.
        missing.add(id);
      }
    } catch {
      missing.add(id);
    }
  })().finally(() => { inflight.delete(id); });
  inflight.set(id, job);
  return job;
}

/** Ask again for every cover a screen wanted and could not have — on sign-in, and after a lift. */
export function retryMissingCovers(): void {
  for (const id of [...missing]) void requestCover(id);
}

/**
 * What an `<img src>` should be for an `imageUrl`. A pointer resolves through
 * the three layers and is `undefined` until it lands; anything else (an old
 * inline picture, a web address) is itself.
 */
export function useCoverSrc(imageUrl: string | undefined): string | undefined {
  const id = isCoverRef(imageUrl) ? coverIdOf(imageUrl) : null;
  const src = useSyncExternalStore(subscribe, () => (id ? srcs.get(id) : undefined));
  useEffect(() => { if (id) void requestCover(id); }, [id]);
  return id ? src : imageUrl || undefined;
}

/** The picture behind a pointer, for a caller outside React (a share being published). */
export async function coverDataUrl(id: string): Promise<string | undefined> {
  await requestCover(id);
  return srcs.get(id);
}

// ─── Writing ─────────────────────────────────────────────────────────────────

/**
 * Keep a newly picked cover and return what goes on `imageUrl`. It is saved
 * on this device first and drawn at once; the upload runs behind it, and one
 * that does not finish (offline, tab closed) is retried the next time the app
 * opens (`flushUnsyncedCovers`). Signed out — the screenshot harness — there
 * is nowhere to put it but inline, as before, and the next signed-in open
 * lifts it out.
 */
export async function storeCover(picked: string): Promise<string> {
  const dataUrl = await fitCoverDocument(picked);
  const uid = auth.currentUser?.uid;
  if (!uid) return dataUrl;
  const id = await coverIdFor(dataUrl);
  remember(id, dataUrl);
  const existing = await getLocal(id);
  if (!existing?.synced) {
    await putLocal({ id, dataUrl, synced: false });
    void uploadCover(uid, id, dataUrl).catch(() => {});
  }
  return coverRef(id);
}

export async function flushUnsyncedCovers(uid: string): Promise<void> {
  const all = (await allLocal()) ?? [];
  for (const rec of all) {
    if (!rec.synced) await uploadCover(uid, rec.id, rec.dataUrl).catch(() => {});
  }
}

/**
 * Upload each old inline picture and return picture → pointer for the ones
 * the server confirmed. **Only a confirmed one is swapped**: a pointer written
 * to `data/main` before its picture exists would be a broken cover on every
 * other device. A picture that fails stays inline and is tried next time.
 */
export async function liftCovers(uid: string, pictures: Iterable<string>): Promise<Map<string, string>> {
  const refs = new Map<string, string>();
  for (const dataUrl of pictures) {
    try {
      const id = await coverIdFor(dataUrl);
      const local = await getLocal(id);
      if (!local?.synced) await uploadCover(uid, id, dataUrl);
      remember(id, dataUrl);
      refs.set(dataUrl, coverRef(id));
    } catch {
      /* stays inline; the next pass tries again */
    }
  }
  return refs;
}

/**
 * Delete pictures nothing points at, now (his call, 2026-09-30). The picture
 * first, then its line in the index, so a failure leaves a listed picture the
 * next sweep finds rather than an unlisted one nothing ever finds again.
 */
export async function deleteCovers(uid: string, ids: Iterable<string>): Promise<void> {
  const patch: Record<string, FieldValue> = {};
  for (const id of ids) {
    try {
      await deleteDoc(coverDoc(uid, id));
      await deleteLocal(id);
      srcs.delete(id);
      patch[`ids.${id}`] = deleteField();
    } catch {
      /* the next sweep tries again */
    }
  }
  if (Object.keys(patch).length > 0) await updateDoc(indexDoc(uid), patch).catch(() => {});
}

/**
 * The sweep on opening. `referenced` must be every pointer the account holds —
 * the store, the Trash and the Archive, each read from the cloud first.
 */
export async function sweepCovers(uid: string, referenced: ReadonlySet<string>): Promise<void> {
  const snap = await getDoc(indexDoc(uid));
  const index = (snap.data()?.ids ?? {}) as Record<string, CoverIndexEntry>;
  const unused = planCoverSweep(index, referenced, Date.now());
  if (unused.length > 0) await deleteCovers(uid, unused);
}
