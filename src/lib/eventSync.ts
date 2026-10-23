/**
 * Cloud sync for events (29-2a) — their own document, `users/{uid}/data/events`.
 *
 * `lib/dashboardSync.ts` again: `store/useEventStore.ts` says why events stay
 * out of `data/main`. The owner may read and write anything under
 * `users/{uid}`, so the document needed no rules change.
 *
 * Cloud wins on first read, then local changes push. Atlas on the laptop
 * writes the same document (`mcp/store.ts`), and its write arrives here as an
 * ordinary snapshot.
 *
 * 29-2c1: events are on the BASE Google calendar, so a change that lands —
 * pushed from here, or arriving from the cloud — asks for the same debounced
 * reconcile pass a task write does (`scheduleReconcile`).
 */
import { useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { isEventsDoc, markEventsRead, useEventStore, type EventsDoc } from '../store/useEventStore';
import { useStore } from '../store/useStore';
import { markCloudLoaded } from './covers/useCoverSync';
import { scheduleReconcile } from './notificationSync';

const docOf = (): EventsDoc => ({ events: useEventStore.getState().events });

/** The calendar pass, with the backlog as it is now: tasks and events go to Google together. */
function reconcileCalendar(uid: string, getToken: { current: () => string | null }): void {
  scheduleReconcile(uid, useStore.getState().backlogTasks, () => getToken.current());
}

export function useEventSync(uid: string | null, getGoogleToken: () => string | null): void {
  const isAdoptingRef = useRef(false);
  /** Never blind-write over a cloud copy that has not been read yet. */
  const hasLoadedOnceRef = useRef(false);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const getTokenRef = useRef(getGoogleToken);
  useEffect(() => {
    getTokenRef.current = getGoogleToken;
  }, [getGoogleToken]);

  useEffect(() => {
    hasLoadedOnceRef.current = false;
    markEventsRead(null);
    if (!uid) {
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    const ref = doc(db, 'users', uid, 'data', 'events');
    unsubRef.current = onSnapshot(
      ref,
      (snap) => {
        /* Offline with no cache, "no such document" can come from memory: not
           the cloud saying there are none, so nothing is written over it. */
        if (!snap.exists() && snap.metadata.fromCache) return;
        const data = snap.data();
        if (snap.exists() && isEventsDoc(data)) {
          isAdoptingRef.current = true;
          useEventStore.getState().adopt(data);
          setTimeout(() => { isAdoptingRef.current = false; }, 100);
        } else if (!snap.exists() && useEventStore.getState().events.length > 0) {
          // The first events on this account: this device's are the only copy.
          void setDoc(ref, docOf()).catch(() => {});
        }
        hasLoadedOnceRef.current = true;
        markEventsRead(uid);
        /* From the cloud, not the echo of this device's own write: that one reconciles below. */
        if (!snap.metadata.hasPendingWrites) reconcileCalendar(uid, getTokenRef);
        /* 29-2b: an event's cover counts as in use only once this copy is the cloud's. */
        markCloudLoaded(uid, 'events');
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
    let pending: EventsDoc | null = null;

    const flush = () => {
      if (!pending) return;
      const body = pending;
      pending = null;
      if (timer) { clearTimeout(timer); timer = null; }
      void setDoc(doc(db, 'users', uid, 'data', 'events'), body).then(() => reconcileCalendar(uid, getTokenRef), () => {});
    };

    const unsub = useEventStore.subscribe((state) => {
      if (isAdoptingRef.current || !hasLoadedOnceRef.current) return;
      pending = { events: state.events };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 600);
    });

    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      unsub();
    };
  }, [uid]);
}
