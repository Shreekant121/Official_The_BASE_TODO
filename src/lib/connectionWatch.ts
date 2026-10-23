/**
 * Offline, and it's fine (29-1P14d1, idea 114) — the live half of
 * `connectionPill.ts`: the browser's online/offline events in, the pill's
 * state out. In memory only, like `useUIStore`; nothing here is persisted or
 * synced.
 *
 * "Back" is not the `online` event. That only says the network is up; the
 * pill says the changes are synced, so it waits for Firestore's own
 * `waitForPendingWrites` — every write it was holding acknowledged by the
 * server — before it turns lime. Until then it says "syncing".
 *
 * The connection banner (`SyncStatusBanner`) stands down while the pill is up:
 * a listener that errored because the Wi-Fi went is the pill's news, said
 * calmly, not a broken sync. Online and still broken is the banner's again.
 */
import { create } from 'zustand';
import { waitForPendingWrites } from 'firebase/firestore';
import { db } from './firebase';
import { BACK_HOLD_MS, PILL_IDLE, stepPill, type PillEvent, type PillState } from './connectionPill';

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const useConnectionPill = create<PillState>(() =>
  isOffline() ? { phase: 'offline', changes: 0 } : PILL_IDLE,
);

let hideTimer: ReturnType<typeof setTimeout> | null = null;

function send(event: PillEvent) {
  const before = useConnectionPill.getState();
  const after = stepPill(before, event);
  if (after === before) return;
  useConnectionPill.setState(after, true);
  if (hideTimer && after.phase !== 'back') {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (after.phase === 'back' && before.phase !== 'back') {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      send({ type: 'hide' });
    }, BACK_HOLD_MS);
  }
}

/** One save of `data/main` was made (`firestoreSync.ts`); counted only offline. */
export function noteLocalSave() {
  send({ type: 'change' });
}

let installed = false;

/** Mounted once, at startup (`main.tsx`). */
export function installConnectionWatch() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('offline', () => send({ type: 'offline' }));
  window.addEventListener('online', () => {
    send({ type: 'online' });
    waitForPendingWrites(db)
      // A sign-out drops the queue and rejects this; nothing is left to wait for.
      .catch(() => undefined)
      .then(() => {
        // Gone again while waiting: the next `online` asks afresh.
        if (!isOffline()) send({ type: 'synced' });
      });
  });
}
