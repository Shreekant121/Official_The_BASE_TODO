/**
 * Whether a failed calendar sync is worth trying again, how many times, and
 * how long the app should remember that it failed — BUILD-15.
 *
 * Split out of `notificationSync.ts` for the same reason `deadlineReminder.ts`
 * was: that file cannot be imported into a unit test (it reaches `./firebase`
 * and with it a live SDK), and the rule that decides whether the app gives up
 * on somebody's calendar is worth proving rather than reading. Pure: no clock,
 * no network, no Firebase. `now` is a parameter everywhere it is needed.
 *
 * WHY A SECOND RETRY LAYER AT ALL
 * -------------------------------
 * `googleCalendar.ts` already backs off — but only on being told to slow down
 * (FIX-8), four sends inside about eight seconds. That covers a quota window
 * turning over and nothing else. The failures Shreekant actually meets are a
 * laptop that lost its connection mid-pass, a Google 5xx, and a pass that
 * threw; all three got no second attempt at all, and the calendar quietly kept
 * whatever it was holding — a deleted task's event, a finished repeat's daily
 * popup. **Three attempts, two minutes apart** are his numbers (2026-09-22).
 *
 * THE ONE REFUSAL THAT MUST NEVER BE RETRIED
 * ------------------------------------------
 * A plain `403` is a missing OAuth scope. Waiting does not fix it, ever, and
 * re-sending only delays the message telling him to reconnect — so it is
 * classified `reconnect`, not `retry`. That rule predates this file
 * (`CLAUDE.md`, and `isRateLimitBody` in `googleCalendar.ts`, which exists
 * because the *rate-limited* 403 wears the same status) and still holds. The
 * classifier reads the status rather than Google's error prose, which is why
 * `GcalResult` now carries one.
 */

/** His number: how many sends a retryable failure gets in total, first included. */
export const SYNC_RETRY_ATTEMPTS = 3;

/** His number: the gap between them. Long on purpose — this heals a dead connection, not a quota. */
export const SYNC_RETRY_DELAY_MS = 2 * 60_000;

/**
 * A stored failure older than this is not a queue entry any more, it is
 * history. It stops a flag written on a laptop closed for a week from raising
 * a banner about a failure that a dozen successful passes have since fixed
 * anyway, and it is what keeps `calendarSyncAttempts` from creeping upward
 * over months until a real failure has no attempts left to spend.
 */
export const SYNC_FAILURE_TTL_MS = 24 * 60 * 60_000;

/**
 * What the app should do about a refusal.
 *
 * - `retry` — waiting plausibly fixes it: offline, a 5xx, a rate limit that
 *   outlasted the backoff, an unexpected throw.
 * - `reconnect` — the grant is the problem. Only he can fix it, so it goes to
 *   him (a banner here, a push to the tablet) instead of round a timer.
 * - `permanent` — the request was wrong and re-sending it verbatim cannot
 *   help. Reported once, not retried.
 */
export type SyncFailureKind = 'retry' | 'reconnect' | 'permanent';

/**
 * What to do about one refusal.
 *
 * `status` is `GcalResult`'s: `0` when the request never reached Google, and
 * `undefined` for a failure raised above the network — a pass that threw, a
 * 200 that carried no event. Unknown is treated as retryable, which is the
 * safe direction to be wrong in here: three extra sends two minutes apart cost
 * nothing, and the one refusal where a retry is actively harmful (the scope
 * 403) always arrives with a status.
 */
export function classifyCalendarFailure(status: number | undefined): SyncFailureKind {
  if (status === undefined) return 'retry';
  // Never reached Google — offline, DNS, a killed request.
  if (status === 0) return 'retry';
  if (status === 401) return 'reconnect';
  // The scope 403. Its rate-limited twin never gets here: `googleCalendar.ts`
  // answers that one with backoff and only reports it after four sends, by
  // which point two more minutes is the honest next move — so a 403 that has
  // survived that far is treated as the grant being wrong.
  if (status === 403) return 'reconnect';
  if (status === 429) return 'retry';
  if (status >= 500) return 'retry';
  return 'permanent';
}

/**
 * The durable record of a pass that did not finish cleanly, as it is stored on
 * the account's notification settings document.
 *
 * It lives in Firestore rather than in memory or `localStorage` because the
 * whole point is that it outlives the tab: today a failed write is re-attempted
 * only if he presses "Try again" or happens to edit something else later, and
 * a closed laptop loses the fact that anything was owed at all. Firestore also
 * carries it between his two devices, which `localStorage` cannot.
 *
 * **One flag is the whole queue.** The pass is a diff over the entire backlog
 * plus a sweep of the whole calendar, so there is nothing per-item to remember
 * — "the last pass did not finish" is a complete description of the work
 * outstanding, whatever it was that failed.
 */
export interface SyncFailureState {
  /** When the *first* failure of this run of bad luck happened. */
  failedAt: number;
  /** How many passes have now failed in a row, including that first one. */
  attempts: number;
  /** Google's own words where there are any, for the banner and the log. */
  reason: string;
  kind: SyncFailureKind;
}

/**
 * The state after one more failure, given whatever was stored before.
 *
 * A stored failure past its TTL is not continued — this is a fresh run of bad
 * luck, with its own three attempts, rather than the tail of one from last
 * week that would leave a real failure with no attempts to spend.
 */
export function recordFailure(
  previous: SyncFailureState | null,
  now: number,
  reason: string,
  kind: SyncFailureKind,
): SyncFailureState {
  const continuing = previous !== null && now - previous.failedAt < SYNC_FAILURE_TTL_MS;
  return {
    failedAt: continuing ? previous.failedAt : now,
    attempts: continuing ? previous.attempts + 1 : 1,
    reason,
    kind,
  };
}

/**
 * Whether to arm another attempt — the answer to "does this heal itself".
 *
 * Only a `retry` failure with attempts left. A `reconnect` never retries by
 * design, and a `permanent` one would only fail identically.
 */
export function shouldRetry(state: SyncFailureState): boolean {
  return state.kind === 'retry' && state.attempts < SYNC_RETRY_ATTEMPTS;
}

/**
 * Whether the person is told about it yet.
 *
 * **A transient failure is meant to heal without him noticing**, which is half
 * of this item's "done when" — so a retryable failure stays silent while it
 * still has attempts in hand, and only speaks once they are spent. Everything
 * else speaks at once: nothing about waiting is going to improve it.
 */
export function shouldWarn(state: SyncFailureState): boolean {
  return !shouldRetry(state);
}

/**
 * What he reads when the grant itself is the problem, on the banner.
 *
 * It does not repeat the title above it — the title says what broke, so this
 * says what that costs him and what fixes it. The push to the tablet
 * (`pushPlan.ts`) says the same thing in the same words on purpose: two
 * descriptions of one failure is how somebody ends up wondering whether they
 * have two.
 */
export const CALENDAR_RECONNECT_MESSAGE =
  'Deadlines, reminders and repeats have stopped syncing. One click on Reconnect Google puts it back.';

/**
 * Whether a stored failure still describes work that is owed, or has simply
 * been sitting there since last week. Read on app open, where it decides
 * whether to run a pass nothing else would have asked for.
 */
export function isFailureLive(state: SyncFailureState | null, now: number): boolean {
  return state !== null && now - state.failedAt < SYNC_FAILURE_TTL_MS;
}
