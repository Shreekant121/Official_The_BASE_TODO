/**
 * The half of BUILD-15's durable queue that runs on app open.
 *
 * WHAT IT IS FOR
 * --------------
 * `notificationSync.ts` writes a flag to the account's notification settings
 * whenever a pass does not finish cleanly, and retries it three times two
 * minutes apart. That covers a tab that stays open. It does not cover the tab
 * closing — which is the ordinary case, because the pass runs two seconds
 * after a store write and he closes the laptop rather than sitting watching
 * it. Before this, a failure that outlived the tab was re-attempted only if he
 * pressed "Try again" or happened to edit something else later; a task deleted
 * on a bad connection kept its calendar event, and a finished repeat kept
 * popping a reminder every day, indefinitely.
 *
 * So: on open, if the account says the last pass failed, run one. **One flag
 * is the whole queue** — the pass is a diff over the entire backlog plus a
 * sweep of the whole calendar, so there is nothing per-item to replay.
 *
 * WHY IT ALSO WATCHES RATHER THAN JUST READING ONCE
 * -------------------------------------------------
 * The same document carries `googleReconnectRequiredAt`, raised by
 * `api/refresh-token.ts` on the server the moment Google refuses the stored
 * grant — which happens while no browser is open at all. A one-shot read would
 * show him the banner on the *next* open after that; an `onSnapshot` shows it
 * the moment it lands, including on a tab that is sitting open when the grant
 * dies. Item 4's complaint was that he sees nothing at the moment it breaks,
 * and only finds a nav dot later.
 */
import { useEffect, useRef } from 'react';
import { CALENDAR_RECONNECT_MESSAGE } from './calendarRetry';
import { subscribeNotificationSettings } from './notifications';
import { hasPendingCalendarSync, scheduleReconcile } from './notificationSync';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';

/**
 * Watches the account's sync flags: raises the reconnect banner while one is
 * up, and drains the queue once per session.
 *
 * @param uid    the signed-in user, or `null` (signed out, or the screenshot
 *               harness's stand-in, which has no Firestore at all)
 * @param getToken the Calendar access token getter — read at pass time, not
 *               now, because a session that opens disconnected usually has one
 *               a second later.
 */
export function useCalendarSyncQueue(uid: string | null, getToken: () => string | null): void {
  // Once per signed-in session. The pass reschedules itself from then on —
  // three attempts on a failure, and every store write fires one anyway — so
  // re-firing on every snapshot would only mean a second full pass every time
  // the flag it just wrote came back down the listener.
  const drainedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeNotificationSettings(uid, (settings) => {
      const setIssue = useUIStore.getState().setReminderSyncIssue;
      if (settings.googleReconnectRequiredAt) {
        setIssue(CALENDAR_RECONNECT_MESSAGE, 'reconnect');
      } else if (useUIStore.getState().reminderSyncIssueKind === 'reconnect') {
        // The flag came down — a refresh or a pass succeeded somewhere, quite
        // possibly on his other device. Take the banner with it rather than
        // leaving him told to reconnect something that is already connected.
        setIssue(null);
      }

      if (drainedRef.current === uid) return;
      // Marked on the *first* snapshot whatever it says, not on the first one
      // that happens to be pending. The pass writes its own failure flag to
      // this very document, so a snapshot-driven drain that only latched on a
      // pending read would answer that write with a fresh pass two seconds
      // later — spending one of his three attempts instantly and undoing the
      // two-minute pacing. Opening the app is the trigger; everything after it
      // belongs to the retry timer.
      drainedRef.current = uid;
      if (!hasPendingCalendarSync(settings)) return;
      // The backlog may not be hydrated yet on a cold open. That is safe: the
      // pass does not sweep an empty backlog (see `notificationSync.ts`), and
      // the hydration itself fires a store write, which fires a pass of its
      // own with the real list a moment later.
      scheduleReconcile(uid, useStore.getState().backlogTasks, getToken);
    });
    return unsubscribe;
    // `getToken` is a stable callback from `AuthContext`; re-subscribing on it
    // would tear down the listener on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
}
