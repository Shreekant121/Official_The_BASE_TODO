/**
 * Cloud sync for the Archive (BUILD-11) — its own document,
 * `users/{uid}/data/archive`.
 *
 * `lib/trashSync.ts` with the sweep taken out, and for the same reason it is
 * not part of `data/main`: an archived project carries every task it held, so
 * keeping it in the main document would archive nothing off the 1 MiB it is
 * capped at. `firestore.rules` already lets the owner read and write anything
 * under `users/{uid}`, so the document needed no rules change.
 *
 * Reconciliation is cloud-wins on first read, then local writes push — the
 * rule every synced slice follows — except for entries this device changed and
 * the cloud never confirmed (FIX-15, `lib/unsentEdits.ts`). Entries are whole and immutable, so the
 * only operations are add and put back, and nothing merges field by field.
 */
import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { useArchiveStore } from '../store/useArchiveStore';
import type { ArchiveEntry } from './archiveModel';
import { markCloudLoaded } from './covers/useCoverSync';
import { archiveUnsent } from './unsentEdits';

interface ArchiveDoc {
  entries: ArchiveEntry[];
}

function isValidArchiveDoc(data: unknown): data is ArchiveDoc {
  return !!data && typeof data === 'object' && Array.isArray((data as ArchiveDoc).entries);
}

/** FIX-15: a save the cloud confirms clears the Archive's list of unsent changes. */
function saveArchive(uid: string, entries: ArchiveEntry[]) {
  const seq = archiveUnsent.seq(uid);
  void setDoc(doc(db, 'users', uid, 'data', 'archive'), { entries }).then(
    () => archiveUnsent.confirmed(uid, seq),
    () => {},
  );
}

export function useArchiveSync(uid: string | null): void {
  const isAdoptingRef = useRef(false);
  /** Same gate as `useFirestoreSync`: never blind-write over cloud state we haven't read. */
  const hasLoadedOnceRef = useRef(false);
  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    hasLoadedOnceRef.current = false;

    if (!uid) {
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    const ref = doc(db, 'users', uid, 'data', 'archive');

    unsubRef.current = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        // FIX-15: what was archived here and never reached the cloud (offline,
        // then the tab died) is laid over the cloud's copy, not lost to it.
        const unsent = hasLoadedOnceRef.current ? null : archiveUnsent.read(uid);
        if (snap.exists() && isValidArchiveDoc(data)) {
          isAdoptingRef.current = true;
          const entries = unsent
            ? archiveUnsent.merge({ entries: data.entries }, useArchiveStore.getState(), unsent).entries
            : data.entries;
          useArchiveStore.getState().setEntries(entries);
          setTimeout(() => { isAdoptingRef.current = false; }, 100);
          if (unsent) saveArchive(uid, entries);
        } else if (!snap.exists() && useArchiveStore.getState().entries.length > 0) {
          // First sign-in on a browser that archived while signed out (or
          // before this document existed): the local shelf is the only copy,
          // and the subscription below only pushes on a change. Push it now.
          saveArchive(uid, useArchiveStore.getState().entries);
        }
        hasLoadedOnceRef.current = true;
        markCloudLoaded(uid, 'archive');
      },
      // Non-fatal, as the Trash's is: `SyncStatusBanner` already says the
      // cloud is unreachable, and the local copy is kept.
      () => { /* keep the local copy */ },
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: ArchiveEntry[] | null = null;

    const flush = () => {
      if (!pending) return;
      const entries = pending;
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      saveArchive(uid, entries);
    };

    const unsub = useArchiveStore.subscribe((state, prev) => {
      if (isAdoptingRef.current) return;
      if (!hasLoadedOnceRef.current) return;
      archiveUnsent.track(uid, prev, state);
      pending = state.entries;
      if (timer) clearTimeout(timer);
      // Shorter than the Trash's 1.5 s: an archive has taken the thing out of
      // `data/main` on the same tap, and the shelf is the only copy until
      // this lands.
      timer = setTimeout(flush, 400);
    });

    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      unsub();
    };
  }, [uid]);
}
