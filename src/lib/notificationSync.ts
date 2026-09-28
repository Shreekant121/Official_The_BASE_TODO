/**
 * Google Calendar-backed Notification System.
 *
 * Replaces the old Web Push + Vercel Cron pipeline: whenever a task deadline
 * or quick reminder (see `reminders.ts`) needs to notify the user, this
 * module creates/updates a Google Calendar event carrying a
 * `reminders.overrides` entry at the exact moment it should fire. Google's
 * own infrastructure then delivers the alert — the app never needs to be
 * running at send time, unlike the old 5-minute Vercel cron.
 *
 * Deadline blocks (and quick reminders) live on a dedicated "BASE"
 * secondary calendar (kept out of the user's real agenda — see
 * `getOrCreateNotificationCalendar`) and use a *deterministic* event id
 * derived from the source's own id (`deadlineEventId`), so there's never a
 * need to write a Google-generated id back into a Firestore task document —
 * important since the debounced global `reconcileAllNotifications` pass
 * iterates every task on every store write, and writing back would risk a
 * feedback loop.
 *
 * One-way sync only: Mutineer -> Google. Edits made directly in Google
 * Calendar/Tasks are never read back.
 *
 * WHY THE PASS IS A DIFF NOW, AND NOT A LOOP (item 3)
 * ---------------------------------------------------
 * The event used to be one minute long, written only for a task whose
 * reminder offset was above zero. Item 3 made it the picture of the working
 * day: it runs `deadline − duration` → `deadline`, **every** dated task draws
 * one, and a completed task keeps its block with a `✓`. The rule itself is in
 * `deadlineReminder.ts`, pure and tested; this file is the network half.
 *
 * That change multiplied the volume, so the shape of the pass had to change
 * with it. It used to walk the backlog and issue a PATCH (or a DELETE) per
 * task, every two seconds after every store write — one API call per task,
 * whether or not anything about that task had moved. Now:
 *
 *   1. **one read** of the calendar's events and one of the history
 *      collection, fired together;
 *   2. **a diff** — an event is written only when what Google holds differs
 *      from what the task says, so the steady state costs no writes at all;
 *   3. **one batch**, fifty writes to a request, through
 *      `runCalendarWrites`.
 *
 * The orphan sweep got simpler and stronger for the same reason. It used to
 * infer a dead event from a dead *history row*, which missed any event whose
 * row had already been pruned; now it reads the calendar and deletes anything
 * under the `d1` prefix that no live task claims. The prefix is the whole
 * safety rule: quick reminders share this calendar under `d4` and must
 * survive a sweep untouched.
 *
 * WHAT REPEATS IS NOW GOOGLE'S TO DRAW (item 4)
 * ---------------------------------------------
 * A repeating task's event carries an `RRULE` and Google expands the whole
 * future series itself — on the phone, in the web UI, everywhere — which is
 * what the deleted in-app calendar was going to be built for. The rule comes
 * from `deadlineBlockFor`, which hands it to exactly one task at a time: the
 * *open* occurrence. The finished one drops its rule as it drops its ping, or
 * two overlapping infinite series would appear on the calendar the moment
 * somebody ticked a box.
 *
 * The app still owns the occurrences. Only the next one is a real `Task`, and
 * what Google draws past it is a picture that is never read back — so a repeat
 * edited in Google Calendar is overwritten by the next pass, and the event
 * description says so in plain words rather than letting somebody find out.
 * A read-back sync is deliberately not built: two recurrence engines arguing
 * is a conflict-resolution project with real data-corruption risk, and it is
 * out of scope for the same reason Google Tasks sync is.
 *
 * Three things follow, all of them in the diff rather than in a new pass:
 * `recurrence` is compared through the app's own RRULE parser (Google respells
 * what you send it, and a string comparison would rewrite every event for
 * ever); clearing a repeat is written as `null`, not `[]`; and an instance
 * somebody broke out of a series in Google's UI carries our `d1` prefix
 * without being ours, so the sweep steps over it.
 */

import { getDocs, deleteDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import {
  deleteEvent,
  getOrCreateNotificationCalendar,
  listCalendarEvents,
  runCalendarWrites,
  type CalendarWrite,
  type EventReminders,
  type GoogleCalendarEvent,
} from './googleCalendar';
import {
  fetchNotificationSettings,
  updateNotificationSettings,
  notificationDocRef,
  notificationsCollectionRef,
  type NotificationSettings,
} from './notifications';
import { useUIStore } from '../store/useUIStore';
import { resolveUserTimeZone } from './agent/dates';
import { formatRRule, parseRRule } from './recurrence';
import { logDiag } from './googleDiagnostics';
import { DEADLINE_EVENT_PREFIX, deadlineEventId, deadlineBlockFor, type DeadlineBlock } from './deadlineReminder';
import {
  CALENDAR_RECONNECT_MESSAGE,
  SYNC_RETRY_DELAY_MS,
  classifyCalendarFailure,
  isFailureLive,
  recordFailure,
  shouldRetry,
  type SyncFailureKind,
  type SyncFailureState,
} from './calendarRetry';
import type { Task } from '../store/useStore';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Firestore's hard ceiling on a single `writeBatch`. */
const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Shown on every block in Google Calendar's own event detail, which is why
 * APP-1 changed it from "Synced from Mutineer OS".
 *
 * **Changing this string rewrites the whole calendar, once.** The description
 * is part of the diff at `needsUpdate` below, so after a change every existing
 * event differs from what the app now wants and the next reconcile pass
 * PATCHes all of them. That is a batched, id-preserving, one-time burst — the
 * events keep their times, summaries, reminders and repeats — and the pass
 * after it is quiet again. Worth knowing before changing the wording a second
 * time for cosmetic reasons.
 */
const EVENT_DESCRIPTION = 'Synced from BASE';

/**
 * The line item 4 asks for, in plain words and no jargon.
 *
 * A recurring event *looks* editable in Google Calendar, and it is not: change
 * the repeat there and the app never learns, and the next reconcile writes it
 * straight back over. The honest fix is to say so where the person is standing
 * when they are about to try — not to build a read-back sync, which is a
 * two-way argument between two recurrence engines and a real way to lose
 * somebody's schedule.
 */
const RECURRENCE_NOTE = 'This repeat is set in the app — change it there. Edits made here are overwritten.';

/**
 * Loud banner — reserved for a genuine, actionable failure that happened
 * while we DO hold a working Google token (a Calendar API write error, an
 * unexpected reconcile crash). The far more common "not connected" case goes
 * through `reportNeedsReconnect` instead so it stays quiet.
 */
function reportSyncIssue(message: string, kind: 'failed' | 'reconnect' = 'failed'): void {
  useUIStore.getState().setReminderSyncIssue(message, kind);
}

function clearSyncIssue(): void {
  useUIStore.getState().setReminderSyncIssue(null);
}

/**
 * Quiet "Google is disconnected, sync is queued" signal — lights the Alerts
 * nav dot only (no banner). Everything eligible is re-attempted wholesale on
 * the next reconcile once a token is available, so this doubles as the
 * "pending sync queue" indicator: it's on iff there's something waiting.
 */
function reportNeedsReconnect(needed: boolean): void {
  useUIStore.getState().setNotificationsNeedReconnect(needed);
}

// ── Dedicated calendar resolution (shared with reminders.ts) ───────────────

export async function resolveNotificationCalendarId(
  uid: string,
  settings: NotificationSettings,
  token: string,
): Promise<{ ok: true; calendarId: string } | { ok: false; message: string; status?: number }> {
  const result = await getOrCreateNotificationCalendar(
    token,
    settings.googleNotificationCalendarId,
    settings.googleNotificationCalendarName,
  );
  if (!result.ok) {
    const scopeIssue = result.message.includes('insufficient') || result.message.includes('scope');
    const message = scopeIssue
      ? 'Google is missing permission to manage the notifications calendar — reconnect Google on the Notifications page.'
      : `Could not open the notifications calendar: ${result.message}`;
    logDiag({
      level: 'error',
      phase: 'calendar-api',
      code: scopeIssue ? 'calendar_scope_denied' : 'calendar_open_failed',
      message,
      detail: result.message,
    });
    // BUILD-15 — the status, not the prose, is what decides whether the pass
    // waits two minutes or tells him to reconnect. `scopeIssue` above is still
    // the right *wording*; it is not a sound classifier.
    return { ok: false, message, status: result.status };
  }
  // Records the rename as much as the id: with the name cached and matching,
  // the next pass resolves the calendar without touching the network at all.
  if (
    result.data.id !== settings.googleNotificationCalendarId ||
    result.data.summary !== settings.googleNotificationCalendarName
  ) {
    updateNotificationSettings(uid, {
      googleNotificationCalendarId: result.data.id,
      googleNotificationCalendarName: result.data.summary,
    }).catch(() => {});
  }
  return { ok: true, calendarId: result.data.id };
}

// ── What a task's block should look like ───────────────────────────────────

/** The event body as we would write it — start, end, title, whether it pings, and whether it repeats. */
interface EventBody {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  reminders: EventReminders;
  /** `[]` for a block that stands alone; one `RRULE:` line for one that repeats. */
  recurrence: string[];
}

interface DesiredBlock {
  task: Task;
  eventId: string;
  block: DeadlineBlock;
  body: EventBody;
}

function eventBodyFor(block: DeadlineBlock, timeZone: string): EventBody {
  const repeats = block.recurrence !== null;
  return {
    summary: block.summary,
    // The extra line only where there is a repeat to warn about — a one-off
    // block has nothing anybody could edit wrongly, and giving every event the
    // sentence would rewrite the user's whole calendar to say nothing.
    description: repeats ? `${EVENT_DESCRIPTION}\n${RECURRENCE_NOTE}` : EVENT_DESCRIPTION,
    // `timeZone` is the zone a repeat *expands* in, and Google requires it on
    // a recurring event: without it, "every day at nine" drifts by an hour
    // across a daylight-saving boundary, which is precisely the mistake
    // `recurrence.ts` goes to such lengths locally not to make. A one-off
    // block does not need one — the offset in its `dateTime` already fixes the
    // instant — and is left exactly as it was written before this item.
    start: { dateTime: new Date(block.startMs!).toISOString(), ...(repeats ? { timeZone } : {}) },
    end: { dateTime: new Date(block.deadlineMs!).toISOString(), ...(repeats ? { timeZone } : {}) },
    // Always explicit, never `useDefault`. A block that does not ping says so
    // with an empty override list, which is what stops the calendar's own
    // default alert firing on a task the user asked not to be reminded about.
    reminders: {
      useDefault: false,
      overrides: block.reminds ? [{ method: 'popup', minutes: block.offsetMinutes }] : [],
    },
    recurrence: repeats ? [block.recurrence!] : [],
  };
}

/**
 * The body as the API wants it *written*, which is not quite the body the diff
 * compares.
 *
 * `recurrence` is the one field that cannot simply be sent empty. Under patch
 * semantics a repeated field is replaced by whatever you send and `null` is
 * the documented way to remove one, so clearing a repeat — which is what
 * every completion of a repeating task does, the finished occurrence dropping
 * its series to the successor — has to say `null` rather than `[]`. An insert
 * has nothing to clear, and omits the field entirely.
 */
function writeBodyFor(body: EventBody, method: 'POST' | 'PATCH'): Record<string, unknown> {
  const { recurrence, ...rest } = body;
  if (recurrence.length > 0) return { ...rest, recurrence };
  return method === 'POST' ? rest : { ...rest, recurrence: null };
}

/** Two timestamps for the same instant, however each side chose to spell it (`…Z` vs `+05:30`). */
function sameInstant(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const left = Date.parse(a);
  return !Number.isNaN(left) && left === Date.parse(b);
}

function sameReminders(existing: GoogleCalendarEvent['reminders'], desired: EventReminders): boolean {
  if (existing?.useDefault !== false) return false;
  const have = existing.overrides ?? [];
  if (have.length !== desired.overrides.length) return false;
  return desired.overrides.every(
    (want, i) => have[i]?.method === want.method && have[i]?.minutes === want.minutes,
  );
}

/**
 * The `RRULE` lines of a recurrence list, each said one way.
 *
 * Compared through the parser rather than as raw strings because Google is
 * entitled to give a rule back in its own spelling — parts reordered, a
 * redundant `INTERVAL=1` dropped — and a string comparison would read every
 * one of those as a difference and rewrite the event on every single pass, for
 * ever. `parseRRule`/`formatRRule` is the app's own canonical form and both
 * sides go through it.
 *
 * `EXDATE`/`RDATE` lines are **ignored, not matched**. Google adds one when
 * somebody deletes a single occurrence in its UI, and the app has no opinion
 * about individual occurrences — only about the pattern. Counting them as a
 * difference would un-delete that occurrence on the next pass, which is a
 * fight with the user over something the app never claimed to own.
 */
function rruleLines(lines: string[] | undefined): string {
  return (lines ?? [])
    .filter((line) => /^RRULE[:;]/i.test(line.trim()))
    .map((line) => {
      const rule = parseRRule(line);
      return rule ? formatRRule(rule) : line.trim().toUpperCase();
    })
    .join('|');
}

/**
 * The zone a repeat expands in. Only asked about when the block being written
 * actually has one: a block with no `timeZone` of its own has no opinion, and
 * demanding Google hold none either would rewrite for ever an event that kept
 * a stale zone from back when it repeated — harmless on a single event, whose
 * `dateTime` carries its own offset.
 *
 * Compared as written, not canonicalised. Two IANA names for one zone
 * (`Asia/Calcutta`, `Asia/Kolkata`) would read as a difference, and browsers
 * disagree about which of them `Intl` hands back, so there is no canonical
 * form to compare *to*. Google echoes what it was sent, which makes this
 * stable in practice — if `reconcile_ok` ever starts logging a write on every
 * single pass with nothing changing, this is the line to suspect first.
 */
function sameZone(existing: string | undefined, desired: string | undefined): boolean {
  return desired === undefined || existing === desired;
}

/**
 * Whether Google already holds what the task says — the test that keeps a
 * quiet pass free. A `cancelled` event never matches: it has to be revived
 * whatever else it says.
 */
function eventMatches(existing: GoogleCalendarEvent, desired: EventBody): boolean {
  return (
    existing.status !== 'cancelled' &&
    existing.summary === desired.summary &&
    (existing.description ?? '') === desired.description &&
    sameInstant(existing.start?.dateTime, desired.start.dateTime) &&
    sameInstant(existing.end?.dateTime, desired.end.dateTime) &&
    sameZone(existing.start?.timeZone, desired.start.timeZone) &&
    sameReminders(existing.reminders, desired.reminders) &&
    rruleLines(existing.recurrence) === rruleLines(desired.recurrence)
  );
}

// ── Task deadline blocks ───────────────────────────────────────────────────

/**
 * Cancels the deadline blocks of tasks that have been **deleted**.
 *
 * A courtesy fast path rather than the only line of defence: it runs the
 * moment a task is deleted so the event goes with it, but
 * `reconcileAllNotifications`'s own sweep would catch the same orphan on the
 * next pass — it reads the calendar and drops every `d1` event no live task
 * claims, which is true whether or not this ran and whether or not the
 * history row survived. Idempotent; deleting an event that isn't there is not
 * an error.
 */
export async function cancelDeletedTaskDeadlines(
  uid: string,
  taskIds: string[],
  token: string | null,
): Promise<void> {
  if (taskIds.length === 0) return;
  const settings = await fetchNotificationSettings(uid);
  const calendarId = settings.googleNotificationCalendarId;
  if (!token || !calendarId) {
    reportNeedsReconnect(true);
    return;
  }
  await Promise.allSettled(
    taskIds.map(async (taskId) => {
      await deleteEvent(token, deadlineEventId(taskId), calendarId);
      await deleteDoc(notificationDocRef(uid, `${taskId}_deadline`)).catch(() => {});
    }),
  );
}

/** Cancels a task's block outright (used by "dismiss" in the Notifications UI). */
export async function cancelTaskDeadline(
  task: Task,
  settings: NotificationSettings,
  token: string,
): Promise<void> {
  if (!settings.googleNotificationCalendarId) return;
  await deleteEvent(token, deadlineEventId(task.id), settings.googleNotificationCalendarId);
}

/** The history row a task's block should have, or `null` when it should have none. */
function historyRowFor(
  desired: DesiredBlock,
  event: GoogleCalendarEvent | undefined,
  now: number,
): Record<string, unknown> | null {
  // Only a block that actually pings owns a row. Every dated task draws a
  // block now, so writing a row per block would fill the Notifications page
  // with silent entries and completed work — it is a list of alerts, and it
  // should keep meaning that.
  if (!desired.block.reminds) return null;
  const { deadlineMs, offsetMinutes, summary } = desired.block;
  const sendAtMs = deadlineMs! - offsetMinutes * 60_000;
  return {
    type: 'deadline',
    title: summary,
    body: `Due ${new Date(deadlineMs!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    sourceId: desired.task.id,
    sendAt: Timestamp.fromMillis(sendAtMs),
    status: sendAtMs > now ? 'scheduled' : 'passed',
    googleEventId: event?.id ?? desired.eventId,
    googleEventLink: event?.htmlLink ?? null,
  };
}

/** The same row, but for a task whose Calendar write didn't go through. */
function failedHistoryRowFor(desired: DesiredBlock, reason: string): Record<string, unknown> {
  const { deadlineMs, offsetMinutes, summary } = desired.block;
  return {
    type: 'deadline',
    title: summary,
    body: `Due ${new Date(deadlineMs!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} — Calendar sync failed: ${reason}`,
    sourceId: desired.task.id,
    sendAt: Timestamp.fromMillis(deadlineMs! - offsetMinutes * 60_000),
    status: 'failed',
  };
}

/** True when the stored row already says exactly this, so writing it again would be churn. */
function rowUnchanged(stored: Record<string, unknown>, row: Record<string, unknown>): boolean {
  const storedSendAt = (stored.sendAt as Timestamp | undefined)?.toMillis() ?? null;
  const rowSendAt = (row.sendAt as Timestamp).toMillis();
  return (
    stored.title === row.title &&
    stored.body === row.body &&
    stored.status === row.status &&
    stored.sourceId === row.sourceId &&
    (stored.googleEventId ?? null) === (row.googleEventId ?? null) &&
    (stored.googleEventLink ?? null) === (row.googleEventLink ?? null) &&
    storedSendAt === rowSendAt
  );
}

/** Commits a list of Firestore operations in `writeBatch`-sized chunks. */
async function commitInChunks(
  operations: ((batch: ReturnType<typeof writeBatch>) => void)[],
): Promise<void> {
  for (let start = 0; start < operations.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const apply of operations.slice(start, start + FIRESTORE_BATCH_LIMIT)) apply(batch);
    await batch.commit();
  }
}

/**
 * What one pass managed to do — BUILD-15.
 *
 * The pass used to answer with `void` and four bare `return`s, and that was
 * the fault behind three of Shreekant's complaints at once: on exactly the
 * runs where something went wrong, the diff and the orphan sweep both sat
 * below the `return` and nothing he had done in BASE ever reached Google. A
 * deleted task kept its event; a completed repeat kept its `RRULE` and popped
 * a reminder every day, for ever. Saying what happened — rather than leaving —
 * is what lets one place decide whether to try again, whether to tell him, and
 * what to write down so a closed tab does not lose the fact that work is owed.
 */
type PassOutcome =
  /** Everything Google holds now says what the app says. */
  | { kind: 'ok' }
  /**
   * Nothing was attempted, because there is nothing to attempt with: no token,
   * or notifications have never been connected. **Not a failure** — it leaves
   * any stored failure exactly as it was, because that work is still owed —
   * and deliberately silent beyond the nav dot. A missing token used to spam
   * the banner on every store write.
   */
  | { kind: 'waiting' }
  /** Something refused. `failureKind` decides whether waiting could fix it. */
  | { kind: 'failed'; reason: string; failureKind: SyncFailureKind };

/** The durable failure as stored on the settings document, or `null` when the last pass was clean. */
function storedFailure(settings: NotificationSettings | null): SyncFailureState | null {
  const failedAt = settings?.calendarSyncFailedAt ?? 0;
  if (!failedAt) return null;
  const kind = settings?.calendarSyncKind;
  return {
    failedAt,
    attempts: settings?.calendarSyncAttempts ?? 1,
    reason: settings?.calendarSyncReason ?? 'unknown error',
    kind: kind === 'reconnect' || kind === 'permanent' ? kind : 'retry',
  };
}

/**
 * Writes the queue entry. Zero rather than a deleted field for "clean", so
 * every reader sees the same falsy value whether the account has ever failed
 * or not, and a merge write never has to name a field it is removing.
 */
function storeFailure(uid: string, state: SyncFailureState): Promise<void> {
  return updateNotificationSettings(uid, {
    calendarSyncFailedAt: state.failedAt,
    calendarSyncAttempts: state.attempts,
    calendarSyncReason: state.reason.slice(0, 500),
    calendarSyncKind: state.kind,
  }).catch(() => {});
}

/**
 * Clears the queue entry and, with it, both reconnect flags — a pass that
 * completed is proof the grant works, whatever the server thought when it last
 * failed to refresh.
 */
function clearStoredFailure(uid: string): Promise<void> {
  return updateNotificationSettings(uid, {
    calendarSyncFailedAt: 0,
    calendarSyncAttempts: 0,
    calendarSyncReason: '',
    calendarSyncKind: '',
    googleReconnectRequiredAt: 0,
    googleReconnectPushedAt: 0,
  }).catch(() => {});
}

/**
 * Raises the flag that reaches the tablet.
 *
 * `api/refresh-token.ts` raises the same one from the server, where an
 * `invalid_grant` is seen with no browser open. This is the half the server
 * can never see: a grant that still refreshes fine but has lost the
 * `calendar.app.created` scope, which refuses every write with a 403 and looks
 * to the refresh endpoint like a perfectly healthy connection.
 *
 * Re-raised only when it is not already up, so the once-per-breakage rule
 * `pushRun` enforces is not defeated by a pass that fails every two minutes.
 */
function flagReconnectRequired(uid: string, settings: NotificationSettings | null, now: number): Promise<void> {
  if (settings?.googleReconnectRequiredAt) return Promise.resolve();
  return updateNotificationSettings(uid, { googleReconnectRequiredAt: now }).catch(() => {});
}

// ── The retry timer ───────────────────────────────────────────────────────

/**
 * His numbers are three attempts two minutes apart, and this is the second and
 * third of them. It is a plain `setTimeout` and dies with the tab **on
 * purpose**: the durable half of the promise is the Firestore flag, which
 * brings the pass back on next open, and a timer that tried to survive a
 * closed tab would be a service worker's job and a much larger item.
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function cancelRetry(): void {
  if (retryTimer === null) return;
  clearTimeout(retryTimer);
  retryTimer = null;
}

function armRetry(uid: string, backlogTasks: Task[], getToken: () => string | null): void {
  cancelRetry();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runReconcile(uid, backlogTasks, getToken);
  }, SYNC_RETRY_DELAY_MS);
}

/**
 * Whether anything is owed that a pass would settle — read on app open by
 * `calendarSyncQueue.ts`, which is the other half of "a failure survives a
 * closed tab". Without it, a pass runs on open only because a store write
 * happens to fire one, which is precisely the gap this item is closing.
 */
export function hasPendingCalendarSync(settings: NotificationSettings, now = Date.now()): boolean {
  return isFailureLive(storedFailure(settings), now);
}

// ── Full reconciliation pass (debounced, runs on every store write) ───────

/**
 * One pass: read, diff, write, sweep, then write the history rows.
 *
 * It reports rather than returns early, and everything it decides about what
 * to *say* — banner, retry, the stored queue entry — belongs to
 * `settleOutcome` below, so there is exactly one place where "this failed" is
 * turned into "and here is what happens now".
 */
async function runReconcilePass(
  uid: string,
  backlogTasks: Task[],
  token: string | null,
  settings: NotificationSettings,
): Promise<PassOutcome> {
  // One answer for the whole pass, and the same one `recurrence.ts` uses when
  // it works out the successor's dates — a repeat that expanded in a different
  // zone from the one it was scheduled in would drift by an hour twice a year.
  const timeZone = resolveUserTimeZone();

  const desiredBlocks: DesiredBlock[] = [];
  /**
   * Every eligible task's event id — built here rather than from
   * `desiredBlocks` below, and that separation is the point.
   *
   * The sweep deletes what nothing claims. If a task claimed its event only by
   * getting as far as a built body, then one task the app could not describe
   * would have its live event swept, which is the one way this pass could
   * actively destroy something. A task claims its event by *existing and being
   * eligible*; whether the app can also say what that event should look like
   * is a separate, weaker question.
   */
  const claimed = new Set<string>();
  const unbuildable: string[] = [];
  for (const task of backlogTasks) {
    const block = deadlineBlockFor(task, settings, timeZone);
    if (!block.eligible) continue;
    const eventId = deadlineEventId(task.id);
    claimed.add(eventId);
    try {
      desiredBlocks.push({ task, eventId, block, body: eventBodyFor(block, timeZone) });
    } catch (err) {
      // A deadline or duration that `Date` will not accept — `toISOString`
      // throws on one, and it used to take the entire pass down with it,
      // sweep included. One task's block is a fair thing to lose; the other
      // fifty-six and the cleanup are not.
      unbuildable.push(err instanceof Error ? `${task.title}: ${err.message}` : task.title);
    }
  }
  if (unbuildable.length > 0) {
    logDiag({
      level: 'warn',
      phase: 'reconcile',
      code: 'block_unbuildable',
      message: `${unbuildable.length} task${unbuildable.length === 1 ? '' : 's'} could not be turned into a calendar block and ${unbuildable.length === 1 ? 'was' : 'were'} skipped. Check the deadline and time estimate.`,
      detail: unbuildable.slice(0, 3).join(' | '),
    });
  }

  if (!token) {
    // Disconnected → go quiet. No banner, and crucially NO per-task "failed"
    // history row (that used to write one row for every eligible task on
    // every single store write). Just light the Alerts nav dot when there's
    // actually something waiting to be delivered, and log a single deduped
    // diagnostic. The whole eligible set is re-attempted on the next
    // reconcile once a token exists, so this flag is the pending-sync queue.
    const waiting = desiredBlocks.filter((d) => d.block.reminds).length;
    reportNeedsReconnect(waiting > 0);
    if (waiting > 0) {
      logDiag({
        level: 'warn',
        phase: 'reconcile',
        code: 'no_token',
        message: `${waiting} deadline reminder${waiting === 1 ? '' : 's'} waiting — Google Calendar isn’t connected. Reconnect on the Notifications page.`,
      });
    }
    return { kind: 'waiting' };
  }

  const calendar = await resolveNotificationCalendarId(uid, settings, token);
  if (!calendar.ok) {
    // Still the nav dot — something is genuinely waiting to be delivered —
    // but no longer *only* the nav dot. `resolveNotificationCalendarId`
    // already logged the real reason; what happens next is decided by the
    // status it came back with, because a calendar that could not be opened
    // because the laptop is offline and one that could not be opened because
    // the scope is gone are not the same event and used to be the same
    // silence.
    reportNeedsReconnect(desiredBlocks.some((d) => d.block.reminds));
    return {
      kind: 'failed',
      reason: calendar.message,
      failureKind: classifyCalendarFailure(calendar.status),
    };
  }

  // We have a working token and calendar — nothing is stuck "waiting on
  // reconnect" anymore, so clear the quiet queue indicator up front.
  reportNeedsReconnect(false);

  const now = Date.now();
  const eventsPath = `/calendars/${encodeURIComponent(calendar.calendarId)}/events`;

  // The two reads the whole pass is built on, fired together. Neither depends
  // on the other, and the pass cannot start until both have landed.
  const [eventsResult, historySnapshot] = await Promise.all([
    listCalendarEvents(token, calendar.calendarId),
    getDocs(notificationsCollectionRef(uid)).catch(() => null),
  ]);

  if (!eventsResult.ok) {
    // Without the listing there is no diff, and the alternative — pushing all
    // of them blind — is exactly the per-task flood this pass exists to avoid.
    // A pass that cannot read cannot write and cannot sweep either, so this is
    // the one failure with no partial recovery available; what it gets instead
    // is a real one. It is reported, written to the durable queue, and tried
    // again — rather than the bare `return` that used to leave the calendar
    // holding yesterday's answer with nobody the wiser.
    logDiag({
      level: 'error',
      phase: 'calendar-api',
      code: 'events_list_failed',
      message: 'Could not read the BASE calendar, so this sync pass was skipped.',
      detail: eventsResult.message,
    });
    return {
      kind: 'failed',
      reason: eventsResult.message,
      failureKind: classifyCalendarFailure(eventsResult.status),
    };
  }

  const existingEvents = new Map(eventsResult.data.map((event) => [event.id, event]));

  // ── The diff ────────────────────────────────────────────────────────────
  const writes: CalendarWrite[] = [];
  for (const desired of desiredBlocks) {
    const existing = existingEvents.get(desired.eventId);
    if (existing && eventMatches(existing, desired.body)) continue;
    writes.push(
      existing
        ? {
            key: desired.task.id,
            method: 'PATCH',
            path: `${eventsPath}/${desired.eventId}`,
            // `status` revives a cancelled event. Harmless on a live one, and
            // it is the documented way past the 409 an insert would hit.
            body: { ...writeBodyFor(desired.body, 'PATCH'), status: 'confirmed' },
          }
        : {
            key: desired.task.id,
            method: 'POST',
            path: eventsPath,
            body: { id: desired.eventId, ...writeBodyFor(desired.body, 'POST') },
          },
    );
  }

  // Orphans: an event under our own prefix that no live task claims — a task
  // deleted while Google was unreachable, or one that lost its deadline.
  // Scoped to `d1` on purpose: `d4` is `reminders.ts`, which owns its whole
  // lifecycle and must not be swept by this pass.
  //
  // **An empty backlog does not sweep** (BUILD-15). The pass now also runs on
  // app open, off the durable queue, and the backlog is hydrated from
  // Firestore a moment later — so "no tasks at all" is far more often "not
  // loaded yet" than "he deleted all fifty-seven", and the two used to be
  // indistinguishable here. A backlog with tasks in it but none eligible still
  // sweeps, which is what keeps the off switch and a cleared deadline working.
  const canSweep = backlogTasks.length > 0;
  if (canSweep) {
    for (const event of existingEvents.values()) {
      if (!event.id.startsWith(DEADLINE_EVENT_PREFIX)) continue;
      // An instance broken out of a series — somebody moved or deleted one
      // occurrence in Google Calendar. Its id is `{masterId}_{originalStart}`,
      // so it wears our prefix and no task claims it by name, and deleting it
      // would cancel that occurrence outright. The master above it is claimed
      // and carries the rule; leave its instances to it.
      if (event.recurringEventId) continue;
      if (claimed.has(event.id) || event.status === 'cancelled') continue;
      writes.push({ key: `orphan:${event.id}`, method: 'DELETE', path: `${eventsPath}/${event.id}` });
    }
  }

  const results = await runCalendarWrites(token, writes);

  // An insert that raced something into the same id — the event existed after
  // all, cancelled and invisible even to `showDeleted`, or written by another
  // device between our read and our write. PATCH is the way back in.
  const conflicted = results.filter((r) => !r.ok && r.status === 409);
  if (conflicted.length > 0) {
    const retries = conflicted
      .map((r) => desiredBlocks.find((d) => d.task.id === r.key))
      .filter((d): d is DesiredBlock => d !== undefined)
      .map<CalendarWrite>((d) => ({
        key: d.task.id,
        method: 'PATCH',
        path: `${eventsPath}/${d.eventId}`,
        body: { ...writeBodyFor(d.body, 'PATCH'), status: 'confirmed' },
      }));
    const retried = await runCalendarWrites(token, retries);
    for (const result of retried) {
      const index = results.findIndex((r) => r.key === result.key);
      if (index >= 0) results[index] = result;
    }
  }

  const failures = new Map(results.filter((r) => !r.ok).map((r) => [r.key, r.message ?? 'unknown error']));
  const written = new Map(
    results.flatMap((r) => (r.ok && r.event ? [[r.key, r.event] as const] : [])),
  );
  const failedCount = failures.size;
  const syncedCount = results.length - failedCount;

  // ── The history rows, in one Firestore batch ────────────────────────────
  if (historySnapshot) {
    const stored = new Map(historySnapshot.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
    const operations: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];
    const live = new Set<string>();

    for (const desired of desiredBlocks) {
      const failure = failures.get(desired.task.id);
      const event = written.get(desired.task.id) ?? existingEvents.get(desired.eventId);
      // A failed write is written to history as `failed` rather than left
      // silent — otherwise it looks identical to "nothing due yet" until the
      // deadline passes with no alert ever having fired. Google's own message
      // is preserved, not a generic "sync failed".
      const row = failure
        ? desired.block.reminds
          ? failedHistoryRowFor(desired, failure)
          : null
        : historyRowFor(desired, event, now);
      if (!row) continue;

      const id = `${desired.task.id}_deadline`;
      live.add(id);
      const existingRow = stored.get(id);
      if (existingRow && rowUnchanged(existingRow, row)) continue;
      const payload = existingRow ? row : { ...row, createdAt: serverTimestamp() };
      operations.push((batch) => batch.set(notificationDocRef(uid, id), payload, { merge: true }));
    }

    // Standalone quick reminders (see reminders.ts) own their full lifecycle,
    // including their own history row — deliberately excluded from the
    // live/orphan check, only ever pruned here once truly stale. The Calendar
    // side of an orphan is already handled by the sweep above, so this only
    // has rows to tidy.
    //
    // Skipped entirely when the sweep was (an unhydrated backlog), for the
    // same reason: nothing claims anything yet, so everything would look dead.
    for (const doc of historySnapshot.docs) {
      const data = doc.data() as { sendAt?: Timestamp; type?: string; status?: string };
      // Keep failed rows visible longer so the user can see/reconnect; only
      // prune them with the normal 30-day stale window.
      const isStale = (data.sendAt?.toMillis() ?? 0) < now - THIRTY_DAYS_MS;
      const isOrphan =
        canSweep && data.type !== 'reminder' && data.status !== 'failed' && !live.has(doc.id);
      if (isOrphan || isStale) operations.push((batch) => batch.delete(doc.ref));
    }

    // Non-critical: a history write that fails costs the Notifications list a
    // row, not the alert — the Calendar event is what actually fires.
    await commitInChunks(operations).catch(() => {});
  }

  if (failedCount > 0) {
    logDiag({
      level: 'error',
      phase: 'reconcile',
      code: 'reconcile_partial_fail',
      message: `${failedCount} calendar block${failedCount === 1 ? '' : 's'} failed to sync (${syncedCount} succeeded). See per-item detail above.`,
      detail: [...failures.values()].slice(0, 3).join(' | '),
    });
    // The worst status in the batch decides what happens next, and "worst"
    // means least recoverable: one 403 among thirty timeouts is still a grant
    // he has to fix by hand, and retrying the other twenty-nine around it
    // would only bury the message saying so.
    const statuses = results.filter((r) => !r.ok).map((r) => r.status);
    const kinds = statuses.map(classifyCalendarFailure);
    const failureKind: SyncFailureKind = kinds.includes('reconnect')
      ? 'reconnect'
      : kinds.includes('retry')
        ? 'retry'
        : 'permanent';
    return {
      kind: 'failed',
      reason: `${failedCount} calendar block${failedCount === 1 ? '' : 's'} failed to sync to Google Calendar. Open Notifications for details.`,
      failureKind,
    };
  }

  if (syncedCount > 0) {
    logDiag({
      level: 'info',
      phase: 'reconcile',
      code: 'reconcile_ok',
      message: `${syncedCount} calendar block${syncedCount === 1 ? '' : 's'} synced to Google Calendar.`,
    });
  }
  // Nothing to write is the common case and the point of the diff: Google
  // already holds exactly what the app says. Either way the pass completed,
  // which is what clears the banner and the queue.
  return { kind: 'ok' };
}

/**
 * What a pass's outcome *means* — the only place that decides whether to try
 * again, whether to tell him, and what to write down.
 *
 * It is separate from the pass for the reason the pass now reports instead of
 * returning: four exits each doing their own half of this is how the sweep
 * came to share the fate of the write, and how a failure came to be forgotten
 * the moment the tab closed.
 */
async function settleOutcome(
  uid: string,
  backlogTasks: Task[],
  getToken: () => string | null,
  settings: NotificationSettings | null,
  outcome: PassOutcome,
): Promise<void> {
  // Nothing was attempted, so nothing is known. Anything already owed stays
  // owed, and the nav dot the pass lit is the whole of what is said.
  if (outcome.kind === 'waiting') return;

  const previous = storedFailure(settings);

  if (outcome.kind === 'ok') {
    cancelRetry();
    clearSyncIssue();
    if (previous || settings?.googleReconnectRequiredAt) await clearStoredFailure(uid);
    return;
  }

  const now = Date.now();
  const state = recordFailure(previous, now, outcome.reason, outcome.failureKind);
  await storeFailure(uid, state);

  if (shouldRetry(state)) {
    // Silent, and that is the point: "a transient failure heals itself without
    // him noticing" is half of what this item is for. The failure is on the
    // account either way, so a tab closed before the retry lands still brings
    // the pass back on next open.
    armRetry(uid, backlogTasks, getToken);
    return;
  }

  cancelRetry();
  if (state.kind === 'reconnect') {
    // Both halves, deliberately: the banner is for the next time he opens
    // BASE, and the flag is what `server/pushRun.ts` turns into a push to the
    // tablet within the minute. He has a working push channel and this is
    // exactly what it is for.
    reportSyncIssue(CALENDAR_RECONNECT_MESSAGE, 'reconnect');
    await flagReconnectRequired(uid, settings, now);
    return;
  }
  reportSyncIssue(state.reason);
}

/**
 * One pass, settled. Everything that runs a reconcile ends up here.
 *
 * The whole thing is inside one `try`: a crash used to be caught by
 * `scheduleReconcile`'s callback, which meant it had no way to write the
 * durable queue entry or arm a retry, and a pass that threw halfway simply
 * lost whatever it had not done yet. A crash is classified `retry` — it is
 * usually a malformed answer or a dead connection surfacing as a throw, and
 * three attempts is a cheap thing to be wrong about.
 */
async function runReconcile(
  uid: string,
  backlogTasks: Task[],
  getToken: () => string | null,
): Promise<void> {
  cancelRetry();
  let settings: NotificationSettings | null = null;
  let outcome: PassOutcome;
  try {
    settings = await fetchNotificationSettings(uid);
    outcome = await runReconcilePass(uid, backlogTasks, getToken(), settings);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    logDiag({
      level: 'error',
      phase: 'reconcile',
      code: 'reconcile_crashed',
      message: 'Calendar sync crashed unexpectedly.',
      detail,
    });
    outcome = {
      kind: 'failed',
      reason: 'Calendar sync crashed unexpectedly. It will try again on its own.',
      failureKind: 'retry',
    };
  }
  await settleOutcome(uid, backlogTasks, getToken, settings, outcome).catch(() => {});
}

/**
 * The pass, run now, against a token the caller already has.
 *
 * Kept for "Try again" (`ReminderSyncBanner`) and the Notifications page,
 * which both hold a token value rather than a way of getting one. A retry
 * armed from here therefore re-uses that same token two minutes later — fine
 * for a token minted for the hour, and any store write in the meantime
 * replaces it with a fresh one anyway.
 */
export async function reconcileAllNotifications(
  uid: string,
  backlogTasks: Task[],
  token: string | null,
): Promise<void> {
  await runReconcile(uid, backlogTasks, () => token);
}

// ── Debounced scheduler (2s window, always uses the latest args) ──────────

let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let pendingArgs: {
  uid: string;
  backlogTasks: Task[];
  getToken: () => string | null;
} | null = null;

export function scheduleReconcile(
  uid: string,
  backlogTasks: Task[],
  getToken: () => string | null,
): void {
  pendingArgs = { uid, backlogTasks, getToken };
  if (reconcileTimer) return;
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    const args = pendingArgs;
    pendingArgs = null;
    if (!args) return;
    // `runReconcile` catches its own crashes now — it has to, or it could not
    // write the queue entry a crash produces — so there is nothing left for a
    // `.catch` here to do.
    void runReconcile(args.uid, args.backlogTasks, args.getToken);
  }, 2000);
}
