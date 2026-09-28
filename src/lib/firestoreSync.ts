import { useEffect, useRef } from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { useStore } from '../store/useStore';
import { scheduleReconcile } from './notificationSync';
import { scheduleShareReconcile } from './publicShare';
import { useUIStore } from '../store/useUIStore';
import { buildSyncPayload, hydrateFromPayload, type SyncPayload } from './syncPayload';

/**
 * Exactly what gets written to `users/{uid}/data/main` — the whole app, in one
 * document, against Firebase's 1 MB per-document cap. If a slice is added it
 * must be added to `buildSyncPayload` too, and the Storage panel then accounts
 * for it for free (`lib/syncDocSize.ts`).
 *
 * **Both now live in `lib/syncPayload.ts` and are re-exported here**, so every
 * existing import still reads `from './firestoreSync'`. They moved because
 * this file is a React hook module — `window`, `document`, an `onSnapshot`
 * listener and Firebase behind it — and two things that must not depend on any
 * of that were reaching them through it: the pure byte-counter the Trash model
 * uses, and the MCP server, which writes this same document from the laptop
 * (item 9). That file's own header has the full reasoning.
 */
export type { SyncPayload };
export { buildSyncPayload };

function isValidFirestoreData(data: unknown): data is SyncPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d.taskLists) &&
    Array.isArray(d.backlogTasks) &&
    Array.isArray(d.tasks)
  );
}

/**
 * Set by the active `useFirestoreSync` instance so the "Not connected to the
 * cloud" banner can offer an immediate manual retry instead of forcing a
 * full page reload. `onSnapshot`'s error callback permanently terminates
 * that listener (Firestore does not auto-resubscribe), so without either
 * this or the automatic backoff retry below, one transient failure (a brief
 * network drop, laptop sleep/wake, a database that had not finished being
 * provisioned yet, etc.) would leave sync looking broken forever.
 */
let manualRetry: (() => void) | null = null;
export function retryFirestoreSync() {
  manualRetry?.();
}

/**
 * Which uid the persisted local store currently belongs to. Signing out
 * deliberately does NOT wipe localStorage (unsynced local edits would go with
 * it), so without this there is no way to tell "my own offline data" from
 * "the previous account's data still sitting in this browser".
 *
 * Only the focus log needs the distinction: it's the one slice reconciled by
 * union rather than cloud-replaces-local (see `mergeFocusLogs`), and unioning
 * across an account switch would hand one user another user's logged hours.
 */
const STORE_OWNER_KEY = 'mutineer-os-store-owner-uid';

function readStoreOwnerUid(): string | null {
  try {
    return localStorage.getItem(STORE_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeStoreOwnerUid(uid: string) {
  try {
    localStorage.setItem(STORE_OWNER_KEY, uid);
  } catch {
    // Best-effort — worst case the focus log falls back to cloud-wins, which
    // is exactly how every other slice already behaves.
  }
}

/**
 * Syncs Zustand store ↔ Firestore for the authenticated user. `getGoogleToken`
 * feeds the debounced Google Calendar notification reconciliation pass (see
 * `lib/notificationSync.ts`) — best-effort, skipped whenever it returns null.
 */
export function useFirestoreSync(uid: string | null, getGoogleToken: () => string | null) {
  const isSyncingFromFirestore = useRef(false);
  /**
   * Gate that stays `false` until the very first `onSnapshot` payload for
   * the current `uid` has been received and handled (whether the doc
   * existed or not). The debounced write effect below refuses to push
   * anything to Firestore while this is `false` — without it, a store
   * mutation that fires while the initial cloud read is still in flight
   * (slow/mobile network, a backgrounded tab reconnecting, cleared
   * localStorage, a fresh device/browser, etc.) would blind-overwrite the
   * user's real cloud data with whatever happens to be in memory, since the
   * write uses a full-document `setDoc`. This was the root cause of
   * projects/tasks silently disappearing.
   */
  const hasLoadedOnceRef = useRef(false);
  const unsubRef = useRef<Unsubscribe | null>(null);
  const getGoogleTokenRef = useRef(getGoogleToken);
  useEffect(() => {
    getGoogleTokenRef.current = getGoogleToken;
  });

  useEffect(() => {
    // Every sign-in (or account switch) re-arms the gate — we haven't
    // confirmed this uid's cloud state yet.
    hasLoadedOnceRef.current = false;

    if (!uid) {
      unsubRef.current?.();
      unsubRef.current = null;
      manualRetry = null;
      return;
    }

    const dataRef = doc(db, 'users', uid, 'data', 'main');
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelayMs = 2000;

    const subscribe = () => {
      if (cancelled) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      unsubRef.current?.();

      const unsub = onSnapshot(
        dataRef,
        (snap) => {
          retryDelayMs = 2000; // reset backoff after any successful read
          useUIStore.getState().setCloudSyncOk(true);

          if (!snap.exists()) {
            pushToFirestore(
              uid,
              buildSyncPayload(useStore.getState()),
              () => getGoogleTokenRef.current(),
            );
            hasLoadedOnceRef.current = true;
            writeStoreOwnerUid(uid);
            return;
          }

          const data = snap.data();
          if (!isValidFirestoreData(data)) {
            // Malformed doc — still counts as "checked the cloud once" so a
            // later legitimate local edit isn't blocked forever.
            hasLoadedOnceRef.current = true;
            return;
          }

          isSyncingFromFirestore.current = true;

          // Time entries this browser has recorded but not yet pushed (logged
          // offline, or written in the moments before this snapshot arrived)
          // are kept alongside the cloud's — but only when the local store is
          // this same user's, never across an account switch.
          const localFocusLog =
            readStoreOwnerUid() === uid ? useStore.getState().focusLog : undefined;

          // One reader of this document is `mcp/` on the laptop, and both
          // write the whole payload back — so the defaults and the two
          // migrations live in `syncPayload.ts` rather than here, where they
          // could drift apart and overwrite each other. See its own note.
          useStore.setState(hydrateFromPayload(data, localFocusLog));

          hasLoadedOnceRef.current = true;
          writeStoreOwnerUid(uid);

          setTimeout(() => {
            isSyncingFromFirestore.current = false;
          }, 100);
        },
        (err) => {
          // Firestore errors (e.g. rules not deployed yet, database missing,
          // offline, denied) — deliberately leave hasLoadedOnceRef false so we
          // never blind-write local data over cloud state we couldn't actually
          // confirm. Surfaced to the UI so this is never silent again — this
          // exact failure mode (no Firestore database had ever been
          // provisioned for the project) was the root cause of newly-created
          // lists/tasks appearing to "vanish": every edit was only ever saved
          // to this browser's localStorage, never the cloud.
          console.error('Firestore sync error — changes are not being saved to the cloud:', err);
          useUIStore.getState().setCloudSyncOk(false);

          // `onSnapshot` permanently terminates a listener once its error
          // callback fires — Firestore never auto-resubscribes on its own.
          // Without this, any transient failure (brief network drop, laptop
          // sleep/wake, a database that hadn't finished provisioning yet)
          // would leave sync broken until the user manually reloaded the
          // whole page. Retry with capped exponential backoff instead.
          if (cancelled) return;
          retryTimer = setTimeout(() => {
            retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
            subscribe();
          }, retryDelayMs);
        }
      );

      unsubRef.current = unsub;
    };

    subscribe();
    manualRetry = subscribe;

    // Retry immediately when the browser regains connectivity or the tab
    // becomes visible again, rather than waiting out the backoff timer.
    const handleReconnectHint = () => {
      if (!useUIStore.getState().cloudSyncOk) subscribe();
    };
    window.addEventListener('online', handleReconnectHint);
    document.addEventListener('visibilitychange', handleReconnectHint);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener('online', handleReconnectHint);
      document.removeEventListener('visibilitychange', handleReconnectHint);
      unsubRef.current?.();
      unsubRef.current = null;
      manualRetry = null;
    };
  }, [uid]);

  // Debounced push to Firestore on store changes
  useEffect(() => {
    if (!uid) return;

    const debounceMs = 1500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: SyncPayload | null = null;

    const flush = () => {
      if (!pending) return;
      const data = pending;
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pushToFirestore(uid, data, () => getGoogleTokenRef.current());
    };

    const unsub = useStore.subscribe((state) => {
      if (isSyncingFromFirestore.current) return;
      if (!hasLoadedOnceRef.current) return;

      pending = buildSyncPayload(state);

      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    });

    // Best-effort immediate flush instead of losing whatever's still sitting
    // in the debounce window — covers tab close, sign-out, and the app being
    // backgrounded (mobile browsers can suspend/kill a hidden tab shortly
    // after `visibilitychange`, well before an idle 1.5s debounce would fire).
    const handleVisibilityOrUnload = () => {
      if (document.visibilityState === 'hidden' || document.visibilityState === undefined) flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', handleVisibilityOrUnload);

    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', handleVisibilityOrUnload);
      unsub();
    };
  }, [uid]);
}

async function pushToFirestore(uid: string, data: SyncPayload, getGoogleToken: () => string | null) {
  try {
    await setDoc(doc(db, 'users', uid, 'data', 'main'), data, { merge: true });
    useUIStore.getState().setCloudSyncOk(true);
    // Reconcile Google Calendar notifications after every successful write.
    scheduleReconcile(uid, data.backlogTasks, getGoogleToken);
    // Keep any public "sharable link" snapshots live after every write too, so
    // an edit to a shared task/list/project updates open share links on its own.
    scheduleShareReconcile(uid, {
      projects: data.projects,
      taskLists: data.taskLists,
      backlogTasks: data.backlogTasks,
      focusLog: data.focusLog,
    });
  } catch (err) {
    console.error('Failed to sync data to Firestore:', err);
    useUIStore.getState().setCloudSyncOk(false);
  }
}
