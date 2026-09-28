/**
 * Which tasks get a Google Calendar block, how long it runs, what it is
 * called, and under what event id.
 *
 * Split out of `notificationSync.ts` — which owns the network half — because
 * this half is the answer to a question worth testing on its own: *what
 * should this task look like on the calendar?* `notificationSync.ts` cannot
 * be imported into a unit test, since reaching it drags in `./firebase` and
 * with it a live SDK, so the rule that decides what reaches Google would
 * otherwise be provable only by hand.
 *
 * THE EVENT IS NO LONGER A REMINDER (item 3)
 * ------------------------------------------
 * It used to be a one-minute event sitting at the deadline, written only when
 * notifications were on AND the task's reminder offset was above zero. Both
 * of those made sense while the event existed to *fire an alert*. It does not
 * any more: the event is the picture of the working day, so
 *
 * - it **runs the length of the work** — `deadline − duration` → `deadline`,
 *   the duration being `taskEstimatedMinutes`, the same number the priority
 *   score reasons about (see `store/useStore.ts`, where the two now sit
 *   adjacent for exactly this reason);
 * - **every task with a usable deadline draws one**, whatever its reminder
 *   offset says. The popup is a separate question, answered by `reminds`
 *   below, and *that* is what stays gated on the offset. Set a task's
 *   reminder to "none" and you still see the block, you are just not pinged;
 * - **a completed task keeps its block**, retitled with a `✓`. Deleting it
 *   would make an afternoon's work vanish the moment you tick the box, which
 *   is the opposite of satisfying; keeping it turns the calendar into a
 *   record of what was actually done, for free.
 *
 * `settings.enabled` is untouched and still gates everything — it is the
 * user's own off switch for the whole feature, not a statement about alerts.
 *
 * The distinction matters most for the copies a repeating task spawns. A
 * successor is an ordinary backlog task carrying its own deadline, so it is
 * picked up by the same reconcile pass as everything else and needs no
 * recurrence-aware code path of its own — but "needs no code of its own" is
 * exactly the kind of claim that quietly stops being true. It is pinned by
 * `recurrenceCalendar.test.ts` against this predicate, and the block geometry
 * by `deadlineReminder.test.ts`.
 *
 * THE BLOCK ALSO SAYS WHETHER IT REPEATS (item 4)
 * -----------------------------------------------
 * That is the *third* answer, `recurrence`: the `RRULE:` line Google needs to
 * draw the rest of the series natively, everywhere the user's calendar shows
 * up, without the app inventing occurrences it does not own. The string itself
 * is built by `calendarRRuleOf` in `recurrence.ts` — nothing outside that file
 * looks inside an RRULE — and *which* task gets one is decided here, beside
 * the two answers it has to stay consistent with. See `deadlineBlockFor`.
 *
 * Pure: no clock, no I/O, no Firebase. `taskEstimatedMinutes` comes from the
 * store module but is a plain function on a plain object; the
 * `NotificationSettings` import is type-only and erased at build time.
 */
import { calendarRRuleOf } from './recurrence';
import { taskEstimatedMinutes, type Task } from '../store/useStore';
import type { NotificationSettings } from './notificationSettings';

/** A stored `YYYY-MM-DDTHH:mm` read as local wall-clock time, as the rest of the app reads it. */
export function parseLocalDateTime(value: string | undefined | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Google Calendar event ids must match `[a-v0-9]{5,1024}` — strips anything else and lowercases. */
function sanitizeForEventId(id: string): string {
  return id.replace(/[^a-v0-9]/gi, '').toLowerCase();
}

/**
 * The prefix every deadline block's event id carries. It is what tells the
 * reconcile sweep in `notificationSync.ts` which events on the shared
 * calendar are its own to delete — quick reminders (`lib/reminders.ts`) live
 * on the same calendar under `d4`, and must survive a sweep untouched.
 */
export const DEADLINE_EVENT_PREFIX = 'd1';

/**
 * Deterministic id for a task's calendar block — never persisted, always
 * re-derivable. Derived from the task's own id, so a spawned successor gets
 * an event of its own rather than overwriting its predecessor's.
 */
export function deadlineEventId(taskId: string): string {
  return `${DEADLINE_EVENT_PREFIX}${sanitizeForEventId(taskId)}`.slice(0, 500);
}

/** Marks a finished block. A prefix rather than a new title, so the row still sorts and reads the same. */
const DONE_PREFIX = '✓ ';

export interface DeadlineBlock {
  /** True when this task should have an event on the notifications calendar. */
  eligible: boolean;
  /**
   * True when that event should also fire a popup. Gated on the offset — and
   * on the task still being open, since a done task has nothing to warn about.
   */
  reminds: boolean;
  /** Minutes before the deadline the popup fires — the task's own, else the account default. */
  offsetMinutes: number;
  /** The deadline as an epoch millisecond count, or `null` when there is no usable deadline. This is the block's END. */
  deadlineMs: number | null;
  /** The block's START: the deadline less `durationMinutes`. `null` whenever `deadlineMs` is. */
  startMs: number | null;
  /** How long the block runs. The app's one duration answer, so it cannot disagree with the score. */
  durationMinutes: number;
  /** The event's title, `✓`-prefixed once the task is done. */
  summary: string;
  /**
   * The `RRULE:` line the event carries so Google draws the rest of the
   * series itself, or `null` for a block that stands alone. See the note
   * below for why a finished occurrence is always `null`.
   */
  recurrence: string | null;
}

/**
 * What a task's calendar block should be, and whether it should exist.
 *
 * A completed task is still eligible — see the note above — but never
 * `reminds`, which is what silences a repeating task's popup at the moment it
 * spawns its successor: the pair moves through one reconcile as one retitled
 * block and one new one.
 *
 * **The series belongs to the open occurrence, and only to it (item 4).**
 * `recurrence` is the third answer, and it is `null` on a finished task for
 * the same reason `reminds` is false: at the moment a repeating task is
 * ticked there are two of it in the backlog, and if both carried the rule
 * Google would draw two overlapping infinite series — doubling again on the
 * next completion, and the one after that. So the finished occurrence drops
 * its rule and collapses back to the single `✓` block that records the
 * afternoon's work, while the successor, born with the same
 * `recurrenceRule`, picks the future series up from its own deadline. Exactly
 * one live series exists at a time, whatever else is on the calendar behind
 * it.
 *
 * `timeZone` is here for `UNTIL` alone — the zone an end date is the end of a
 * day *in*. It is a parameter rather than a lookup so this stays a pure
 * question with a testable answer, like `now` is everywhere else.
 */
export function deadlineBlockFor(
  task: Task,
  settings: NotificationSettings,
  timeZone: string,
): DeadlineBlock {
  const offsetMinutes = task.reminderMinutes ?? settings.defaultDeadlineOffsetMinutes;
  const deadlineMs = parseLocalDateTime(task.deadline ?? null);
  const durationMinutes = taskEstimatedMinutes(task);
  const completed = task.status === 'completed';
  const eligible = settings.enabled && deadlineMs !== null;
  return {
    eligible,
    reminds: eligible && !completed && offsetMinutes > 0,
    offsetMinutes,
    deadlineMs,
    startMs: deadlineMs === null ? null : deadlineMs - durationMinutes * 60_000,
    durationMinutes,
    summary: `${completed ? DONE_PREFIX : ''}Deadline: ${task.title}`,
    recurrence: eligible && !completed ? calendarRRuleOf(task, timeZone) : null,
  };
}
