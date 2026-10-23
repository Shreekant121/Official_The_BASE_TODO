/**
 * Keeps cover pictures out of `data/main` and cleans up the ones nobody uses.
 * Mounted once in `App.tsx` beside the other syncs. See `coverRef.ts` for why.
 *
 * **Lifting.** Whenever the store, the Trash or the Archive holds a picture
 * still stored inline — every cover from before this change, a restore from
 * the Trash, a cover added on a device that has not updated yet, or signed
 * out — it is uploaded and swapped for a pointer. The swap is an ordinary
 * store write, so `firestoreSync` pushes the smaller document on its own. It
 * waits two seconds after the last change, which also keeps it clear of the
 * 100 ms in which a sync adopting the cloud's copy ignores store writes.
 *
 * **Deleting — at once, his call (2026-09-30).** Once all four documents
 * that can point at a cover (`data/main`, the Trash, the Archive and, since
 * 29-2b, `data/events`) have been read from the cloud this session, every
 * settled change is compared with the one before it, and a cover that went
 * out of use — replaced, removed, or its project's last copy gone from the
 * Trash — is deleted there and then (`releasedCovers`). On opening, a sweep
 * catches any a closed device left behind (`planCoverSweep`). Reading the
 * three documents first is the whole safety of it: a store still holding this
 * device's stale local copy would count a cover another device just added as
 * unused. The Trash and the Archive count as "in use", so Restore still
 * brings a deleted project's cover back.
 */
import { useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useTrashStore } from '../../store/useTrashStore';
import { useArchiveStore } from '../../store/useArchiveStore';
import { useEventStore } from '../../store/useEventStore';
import { withoutStory } from '../../store/storyActor';
import { useSnapshotStore } from '../../store/useSnapshotStore';
import { collectCoverIds, collectInlineCovers, releasedCovers, rewriteInlineCovers } from './coverRef';
import {
  deleteCovers, flushUnsyncedCovers, liftCovers, retryMissingCovers, sweepCovers,
} from './coverCache';

// ─── Has the cloud been read? ────────────────────────────────────────────────

/* 29-2b: events carry covers too, in their own document, so it is the fourth. */
type CloudDoc = 'main' | 'trash' | 'archive' | 'events';
const CLOUD_DOCS = 4;
let loadedFor: string | null = null;
const loaded = new Set<CloudDoc>();

const loadListeners = new Set<() => void>();

/** Called by each sync the first time its document arrives for `uid`. */
export function markCloudLoaded(uid: string, which: CloudDoc): void {
  if (loadedFor !== uid) { loadedFor = uid; loaded.clear(); }
  const first = !loaded.has(which);
  loaded.add(which);
  if (first) for (const fn of loadListeners) fn();
}

/**
 * Whether `data/main` has been read from the cloud this session — so a
 * moment that judges his whole history (29-1P14b's welcome back) waits for
 * the other device's work rather than judging this device's stale copy.
 */
export function cloudMainLoaded(): boolean {
  return loadedFor !== null && loaded.has('main');
}

export function subscribeCloudLoaded(fn: () => void): () => void {
  loadListeners.add(fn);
  return () => { loadListeners.delete(fn); };
}

function allCloudLoaded(uid: string): boolean {
  return loadedFor === uid && loaded.size === CLOUD_DOCS;
}

// ─── Lifting ─────────────────────────────────────────────────────────────────

async function liftInlineCovers(uid: string): Promise<void> {
  const store = useStore.getState();
  const trash = useTrashStore.getState().entries;
  const archive = useArchiveStore.getState().entries;
  const pictures = collectInlineCovers(store, trash, archive, useEventStore.getState().events);
  if (pictures.size === 0) return;

  const refs = await liftCovers(uid, pictures);
  if (refs.size === 0) return;

  // Re-read after the uploads: he may have edited while they ran. Not an
  // edit for the task's story (29-1P9c): the picture is the same one.
  withoutStory(() => useStore.setState((state) => {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      if (typeof value === 'function') continue;
      const next = rewriteInlineCovers(value, refs);
      if (next !== value) patch[key] = next;
    }
    return patch;
  }));
  const trashNow = useTrashStore.getState().entries;
  const trashNext = rewriteInlineCovers(trashNow, refs);
  if (trashNext !== trashNow) useTrashStore.getState().setEntries(trashNext);
  const archiveNow = useArchiveStore.getState().entries;
  const archiveNext = rewriteInlineCovers(archiveNow, refs);
  if (archiveNext !== archiveNow) useArchiveStore.getState().setEntries(archiveNext);
  const eventsNow = useEventStore.getState().events;
  const eventsNext = rewriteInlineCovers(eventsNow, refs);
  if (eventsNext !== eventsNow) useEventStore.setState({ events: eventsNext });
  retryMissingCovers();
}

// ─── Deleting ────────────────────────────────────────────────────────────────

function referencedNow(): Set<string> {
  return collectCoverIds(
    useStore.getState(),
    useTrashStore.getState().entries,
    useArchiveStore.getState().entries,
    useEventStore.getState().events,
    // The Assistant's undo ring can put an old cover back too.
    useSnapshotStore.getState(),
  );
}

// ─── The hook ────────────────────────────────────────────────────────────────

export function useCoverSync(uid: string | null): void {
  useEffect(() => {
    if (!uid) return;
    retryMissingCovers();
    void flushUnsyncedCovers(uid);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let again = false;

    /** What was in use after the last settled change; null until the cloud has been read. */
    let inUse: Set<string> | null = null;
    let swept = false;

    const run = async () => {
      if (cancelled) return;
      if (running) { again = true; return; }
      running = true;
      try {
        await liftInlineCovers(uid);
        if (!allCloudLoaded(uid)) return;
        const now = referencedNow();
        const gone = inUse ? releasedCovers(inUse, now) : [];
        inUse = now;
        if (gone.length > 0) await deleteCovers(uid, gone);
        if (!swept) {
          swept = true;
          await sweepCovers(uid, now).catch(() => {});
        }
      } finally {
        running = false;
        if (again) { again = false; schedule(); }
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void run(); }, 2000);
    };

    const unsubs = [
      useStore.subscribe(schedule),
      useTrashStore.subscribe(schedule),
      useArchiveStore.subscribe(schedule),
      useEventStore.subscribe(schedule),
      useSnapshotStore.subscribe(schedule),
    ];
    schedule();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      for (const u of unsubs) u();
    };
  }, [uid]);
}
