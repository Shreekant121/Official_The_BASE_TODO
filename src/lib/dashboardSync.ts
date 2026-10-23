/**
 * Cloud sync for the Dashboard (BIG-6) — its own document,
 * `users/{uid}/data/dashboard`.
 *
 * `lib/archiveSync.ts` again, and for a reason of its own:
 * `store/useDashboardStore.ts` says why the layout must not ride in
 * `data/main`. `firestore.rules` lets the owner read and write anything under
 * `users/{uid}`, so the document needed no rules change.
 *
 * Cloud wins on first read, then local changes push — his call was one layout,
 * synced, so the tablet and the laptop show the same Dashboard. A layout is
 * small and written whole; nothing merges field by field.
 */
import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { dashboardDocOf, isDashboardDoc, useDashboardStore, type DashboardDoc } from '../store/useDashboardStore';

const snapshotOf = (): DashboardDoc => dashboardDocOf(useDashboardStore.getState());

export function useDashboardSync(uid: string | null): void {
  const isAdoptingRef = useRef(false);
  /** Never blind-write over a cloud copy that has not been read yet. */
  const hasLoadedOnceRef = useRef(false);
  const unsubRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    if (!uid) {
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    const ref = doc(db, 'users', uid, 'data', 'dashboard');
    unsubRef.current = onSnapshot(
      ref,
      (snap) => {
        /* Offline, with no cache of its own, Firestore can answer "no such
           document" from memory. That is not the cloud saying this account
           is new: asking it the questions, or writing this device's copy over
           his real one when the network returns, would both be wrong. */
        if (!snap.exists() && snap.metadata.fromCache) return;
        const data = snap.data();
        if (snap.exists() && isDashboardDoc(data)) {
          isAdoptingRef.current = true;
          useDashboardStore.getState().adopt(data);
          setTimeout(() => { isAdoptingRef.current = false; }, 100);
        } else if (!snap.exists()) {
          // First Dashboard on this account: this device's is the only copy.
          // A new account, so it is asked the three questions (29-1c4); the
          // flag rides in the document, so answering on one device ends them
          // on the other.
          useDashboardStore.getState().askFirstRun();
          void setDoc(ref, snapshotOf()).catch(() => {});
        }
        hasLoadedOnceRef.current = true;
      },
      () => { /* keep the local copy; SyncStatusBanner already says the cloud is away */ },
    );

    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: DashboardDoc | null = null;

    const flush = () => {
      if (!pending) return;
      const body = pending;
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      void setDoc(doc(db, 'users', uid, 'data', 'dashboard'), body).catch(() => {});
    };

    const unsub = useDashboardStore.subscribe((state) => {
      if (isAdoptingRef.current || !hasLoadedOnceRef.current) return;
      pending = dashboardDocOf(state);
      if (timer) clearTimeout(timer);
      /* A resize or a move is one write when the finger lifts, not one a frame. */
      timer = setTimeout(flush, 800);
    });

    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      unsub();
    };
  }, [uid]);
}
