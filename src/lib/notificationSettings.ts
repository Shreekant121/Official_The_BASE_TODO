/**
 * The account's notification settings, as a shape and a default — and nothing
 * else, so it loads anywhere.
 *
 * Split out of `notifications.ts` for BUILD-5: that file reaches `./firebase`,
 * which cannot load in Node, and the sender (`server/pushRun.ts`) has to honour
 * the same off switch with the same default. `notifications.ts` re-exports
 * both, so every existing import still reads `from './notifications'`.
 */
export interface NotificationSettings {
  enabled: boolean;
  /** Minutes before a task's deadline to notify, used when a task doesn't set its own `reminderMinutes`. */
  defaultDeadlineOffsetMinutes: number;
  /** Cached id of the dedicated "BASE" Google Calendar, once created. */
  googleNotificationCalendarId?: string;
  /**
   * The name that calendar currently carries in Google.
   *
   * Only here to keep `getOrCreateNotificationCalendar` off the network on
   * the fast path: the calendar has been renamed twice — "Mutineer OS
   * Notifications" → "Mutineer OS" at item 3, "Mutineer OS" → "BASE" at APP-1
   * — and without somewhere to record that a rename went through, every
   * reconcile, one two seconds after every store write, would have to ask
   * Google what the calendar is called before it could know. A stale value
   * here means "not checked since the latest rename", which costs one PATCH
   * and then fills itself in.
   */
  googleNotificationCalendarName?: string;

  // ── BUILD-15: the durable queue, and the two flags that reach him ────────

  /**
   * When the last reconcile pass failed, `0`/absent once one has succeeded.
   *
   * The three `calendarSync*` fields together are `calendarRetry.ts`'s
   * `SyncFailureState`, stored flat so a partial write cannot leave half an
   * object behind. Stored on the account rather than in the tab because the
   * failure has to outlive the tab — that is the entire point of it — and
   * because it then reaches his other device too. See that file for why one
   * flag is the whole queue.
   */
  calendarSyncFailedAt?: number;
  /** Passes that have failed in a row, his three attempts counted against it. */
  calendarSyncAttempts?: number;
  /** Google's own words, for the banner and the diagnostics log. */
  calendarSyncReason?: string;
  /** `retry` | `reconnect` | `permanent` — `SyncFailureKind`, widened for storage. */
  calendarSyncKind?: string;

  /**
   * When Google's grant was found to be dead — revoked, expired, or missing
   * the scope the calendar needs. Written by `api/refresh-token.ts` (which is
   * where an `invalid_grant` is seen, on the server, with no browser open) and
   * by the reconcile pass itself (which is where a missing *scope* is seen,
   * and which the server can never learn about). Cleared the moment a refresh
   * or a pass succeeds.
   *
   * It is on this document, which every client can read, rather than beside
   * the refresh token on `googleTokens/{uid}`, which no client may ever read.
   * `server/pushRun.ts` reads this same document on every knock, so putting it
   * here is also what lets the tablet be told.
   */
  googleReconnectRequiredAt?: number;
  /**
   * The value of `googleReconnectRequiredAt` the tablet has already been
   * pushed about. One push per breakage, not one a minute — `pushRun` knocks
   * every sixty seconds and would otherwise say it every time until he fixed
   * it.
   */
  googleReconnectPushedAt?: number;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  defaultDeadlineOffsetMinutes: 30,
};
