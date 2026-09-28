/**
 * Cloud sync for the Trash — its own document, `users/{uid}/data/trash`.
 *
 * Deliberately not part of `firestoreSync.ts`'s `users/{uid}/data/main`. A
 * deleted project carries every task that was inside it, so trashing it in the
 * main document would *grow* the thing Firestore caps at 1 MiB, and deleting
 * to make room would make less. Its own document gets its own megabyte, and
 * `trimTrash` holds it under that (see `lib/trashModel.ts`).
 *
 * Reconciliation is cloud-wins on first read, then local writes push — the
 * same rule every slice of the main document follows. Entries are whole and
 * immutable, so there is nothing to merge field by field; the only operations
 * are add, restore and empty.
 *
 * The thirty-day sweep runs here, right after the cloud's copy is adopted,
 * rather than on mount: purging what is in localStorage a moment before the
 * server hands back the same expired entries would just put them straight back.
 */
import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { useTrashStore } from '../store/useTrashStore';
import { purgeExpiredTrash } from './trash';
import type { TrashEntry } from './trashModel';

interface TrashDoc {
  entries: TrashEntry[];
}

function isValidTrashDoc(data: unknown): data is TrashDoc {
  return !!data && typeof data === 'object' && Array.isArray((data as TrashDoc).entries);
}

export function useTrashSync(uid: string | null): void {
  const isAdoptingRef = useRef(false);
  /** Same gate as `useFirestoreSync`: never blind-write over cloud state we haven't read. */
  const hasLoadedOnceRef = useRef(false);
  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    hasLoadedOnceRef.current = false;

    if (!uid) {
      unsubRef.current?.();
      unsubRef.current = null;
      // Offline / signed out, the local copy is all there is — sweep it anyway
      // so an expired entry doesn't sit there until the next sign-in.
      purgeExpiredTrash();
      return;
    }

    const ref = doc(db, 'users', uid, 'data', 'trash');

    unsubRef.current = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (snap.exists() && isValidTrashDoc(data)) {
          isAdoptingRef.current = true;
          useTrashStore.getState().setEntries(data.entries);
          setTimeout(() => { isAdoptingRef.current = false; }, 100);
        }
        hasLoadedOnceRef.current = true;
        purgeExpiredTrash();
      },
      // Non-fatal by design: the Trash is a convenience, and `SyncStatusBanner`
      // is already telling the user that the cloud is unreachable. Failing
      // loudly a second time for the same outage would only add noise.
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
    let pending: TrashEntry[] | null = null;

    const flush = () => {
      if (!pending) return;
      const entries = pending;
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      void setDoc(doc(db, 'users', uid, 'data', 'trash'), { entries }).catch(() => {});
    };

    const unsub = useTrashStore.subscribe((state) => {
      if (isAdoptingRef.current) return;
      if (!hasLoadedOnceRef.current) return;
      pending = state.entries;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 1500);
    });

    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      unsub();
    };
  }, [uid]);
}
