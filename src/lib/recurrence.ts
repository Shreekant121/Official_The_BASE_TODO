/**
 * When does a repeating task come round again?
 *
 * Recurrence has been stored on `Task` and drawn as a chip since long before
 * anything read it. This module is the part that reads it, kept as pure
 * arithmetic so the answer can be tested without a browser, a clock, or a
 * store — which matters more here than anywhere else in the app, because the
 * cases that go wrong are the ones nobody exercises by hand: the last day of
 * January, the hour that does not exist on the morning the clocks go forward,
 * a task nobody touched for five weeks.
 *
 * Three decisions shape everything below.
 *
 * **Occurrences are counted from the start of the series, never from the
 * previous one.** `Task.seriesAnchor` holds occurrence 1's date, and
 * occurrence *n* is that anchor advanced *n−1* whole periods. Deriving each
 * date from its predecessor instead looks simpler and is wrong: a monthly task
 * anchored on the 31st has to clamp to the 28th in February, and from there a
 * predecessor-based chain never finds its way back to the 31st again. Anchored
 * arithmetic clamps only in the months that need it.
 *
 * **Missed occurrences are skipped, not queued.** The successor is the first
 * occurrence falling strictly after `now`. Finishing a daily task five days
 * late gets you tomorrow, not five copies of last week. Because occurrences
 * are anchored, that skip keeps the *phase* of the series: "every third day"
 * stays on its original three-day grid rather than restarting from today.
 *
 * **Wall-clock time is what repeats.** A 09:00 task stays a 09:00 task across
 * a daylight-saving boundary even though the gap between those two instants is
 * 23 or 25 hours, because that is what "every day at nine" means to a person.
 * Everything here goes through the timezone helpers in `agent/dates.ts` — the
 * same ones the agent tool layer uses — so the app keeps exactly one idea of
 * what a stored `YYYY-MM-DDTHH:mm` means.
 *
 * **The pattern itself is an iCalendar RRULE string.**
 * `FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR` is "the last Friday of every month".
 * Storing the pattern as that string rather than as an object of our own
 * means the app never has to grow a new field for the next pattern somebody
 * asks for — the spec already has one — and it means very nearly the same
 * characters can be handed to a Google Calendar event's `recurrence` field, so
 * that Google draws the whole future series itself (`calendarRRuleOf`, which
 * is where the three differences live). Reading the string, writing it, saying
 * it in English and spelling it for Google are all in this file: no library,
 * and nothing outside here looks inside the string.
 *
 * Nothing here mutates, performs I/O, reads a clock or touches the store.
 * `now`, the timezone and the id factory all arrive as arguments.
 */
import type { LegacyRecurrenceRule, Subtask, Task } from '../store/useStore';
import { parseStoredDate, toTaskDateString, zonedParts, zonedTimeToInstant } from './agent/dates';

// ─── The rule, as an RRULE ───────────────────────────────────────────────────

/**
 * One entry in `BYDAY`: a weekday, plus — under a monthly rule — the ordinal
 * that picks *which* one of them in the month. `0 = Sunday … 6 = Saturday`,
 * the numbering the weekday chips and `WEEKDAY_LABELS` already use.
 */
export interface RRuleDay {
  weekday: number;
  /** `1`, `2`, … for "the nth", negative for "the nth from the end" (`-1` = last). */
  ordinal?: number;
}

/**
 * An RRULE, parsed down to the parts this engine can actually run. Anything
 * else the string carries — `WKST`, `BYSETPOS`, `BYMONTH` — is dropped on the
 * way in rather than kept, because a part nobody honours is a rule claiming a
 * schedule the engine does not keep.
 *
 * Two places are deliberately narrower than RFC 5545, both of them because the
 * alternative stops the series being one date per period, which is the
 * property `firstStepAfter`'s search rests on:
 *
 * - **`BYDAY` under a monthly rule is one ordinal weekday** (`-1FR`). The
 *   unqualified form — `FREQ=MONTHLY;BYDAY=FR`, every Friday of the month —
 *   is dropped, which leaves the rule on the task's own date. That is a
 *   defined answer; inventing an ordinal for it would invent a schedule.
 * - **`BYMONTHDAY` is one day, and it clamps** into a month too short for it
 *   instead of skipping that month as the spec says. It is the same answer
 *   `addMonths` already gives a task anchored on the 31st, and one file
 *   holding two opinions about February would be worse than one file
 *   differing from the spec in the months where the day does not exist.
 */
export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  /** Always at least 1 — the search below assumes occurrences strictly increase. */
  interval: number;
  /** Weekly: the chosen days, sorted. Monthly: one ordinal weekday. Otherwise empty. */
  byDay: RRuleDay[];
  /** Monthly only. Positive is that day of the month; `-1` is the last day of it. */
  byMonthDay?: number;
  /** The raw `UNTIL` token, `YYYYMMDD` or `YYYYMMDDTHHMMSS[Z]`. */
  until?: string;
  /** How many occurrences the series runs to in total, counting from occurrence 1. */
  count?: number;
}

const FREQUENCIES: RRule['freq'][] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
/** Index is the weekday number the rest of the app uses. */
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const BYDAY_PART = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/;
const UNTIL_PART = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/;

/** A whole number at or above `min`, or `undefined` for anything else. */
function positiveInt(raw: string | number | undefined, min: number): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  const whole = Math.trunc(value);
  return whole >= min ? whole : undefined;
}

function splitByDay(raw: string | undefined): RRuleDay[] {
  if (!raw) return [];
  const days: RRuleDay[] = [];
  for (const token of raw.split(',')) {
    const match = BYDAY_PART.exec(token.trim().toUpperCase());
    if (!match) continue;
    const weekday = WEEKDAY_CODES.indexOf(match[2]);
    const ordinal = match[1] ? Math.trunc(Number(match[1])) : 0;
    days.push(ordinal === 0 ? { weekday } : { weekday, ordinal });
  }
  return days;
}

function splitMonthDay(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  for (const token of raw.split(',')) {
    const value = Number(token.trim());
    if (Number.isInteger(value) && value !== 0 && Math.abs(value) <= 31) return value;
  }
  return undefined;
}

function isWeekday(value: number | undefined): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;
}

/**
 * The rule cut down to what its own frequency can mean. Values that arrived
 * from disk are clamped here rather than trusted — an `interval` below 1 would
 * make `occurrenceDay` return the same date for every occurrence, and the
 * search below assumes that sequence strictly increases.
 *
 * Changing the unit in the modal goes through here for the same reason: the
 * weekday chips left over from a weekly rule must not come back as "the first
 * Monday" the moment the unit reads Month.
 */
export function normaliseRRule(rule: RRule): RRule {
  const next: RRule = {
    freq: rule.freq,
    interval: positiveInt(rule.interval, 1) ?? 1,
    byDay: [],
  };

  if (rule.freq === 'WEEKLY') {
    // Ordinals mean nothing on a weekly rule, and the same weekday twice would
    // hand `occurrenceDay` a sequence that stands still.
    const chosen = new Set(rule.byDay.map((d) => d.weekday).filter(isWeekday));
    next.byDay = [...chosen].sort((a, b) => a - b).map((weekday) => ({ weekday }));
  } else if (rule.freq === 'MONTHLY') {
    // One `BY` part, and `BYDAY` wins — it is the more specific of the two.
    const ordinalDay = rule.byDay.find(
      (d) => isWeekday(d.weekday) && Number.isInteger(d.ordinal) && d.ordinal !== 0,
    );
    if (ordinalDay) next.byDay = [{ weekday: ordinalDay.weekday, ordinal: ordinalDay.ordinal }];
    else next.byMonthDay = splitMonthDay(rule.byMonthDay?.toString());
  }
  if (next.byMonthDay === undefined) delete next.byMonthDay;

  // A count and an end date cannot both be true of one series; RFC 5545 bans
  // the pair outright. The count wins, because a promise about how many times
  // a thing happens is the more surprising one to run past.
  const count = positiveInt(rule.count, 1);
  if (count !== undefined) next.count = count;
  else if (rule.until && UNTIL_PART.test(rule.until)) next.until = rule.until;

  return next;
}

/**
 * An RRULE string read into the shape above, or `null` when there is no usable
 * `FREQ` in it — which reads the same as "this does not repeat", and is the
 * only thing a caller could do with a rule it cannot understand anyway.
 *
 * Tolerant coming in and canonical going out: a leading `RRULE:`, lower case,
 * stray whitespace and parts in any order are all accepted, and `formatRRule`
 * writes back one spelling for all of them.
 */
export function parseRRule(text: string | undefined): RRule | null {
  if (!text) return null;

  const parts = new Map<string, string>();
  for (const chunk of text.trim().replace(/^RRULE:/i, '').split(';')) {
    const at = chunk.indexOf('=');
    if (at < 0) continue;
    parts.set(chunk.slice(0, at).trim().toUpperCase(), chunk.slice(at + 1).trim());
  }

  const freq = parts.get('FREQ')?.toUpperCase() as RRule['freq'] | undefined;
  if (!freq || !FREQUENCIES.includes(freq)) return null;

  return normaliseRRule({
    freq,
    interval: positiveInt(parts.get('INTERVAL'), 1) ?? 1,
    byDay: splitByDay(parts.get('BYDAY')),
    byMonthDay: splitMonthDay(parts.get('BYMONTHDAY')),
    until: parts.get('UNTIL')?.toUpperCase(),
    count: positiveInt(parts.get('COUNT'), 1),
  });
}

/**
 * The canonical spelling of a rule — one string per schedule, so two rules
 * that repeat the same way are the same characters.
 */
export function formatRRule(rule: RRule): string {
  const norm = normaliseRRule(rule);
  const parts = [`FREQ=${norm.freq}`, `INTERVAL=${norm.interval}`];
  if (norm.byDay.length > 0) {
    parts.push(`BYDAY=${norm.byDay.map((d) => `${d.ordinal ?? ''}${WEEKDAY_CODES[d.weekday]}`).join(',')}`);
  }
  if (norm.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${norm.byMonthDay}`);
  if (norm.count !== undefined) parts.push(`COUNT=${norm.count}`);
  else if (norm.until) parts.push(`UNTIL=${norm.until}`);
  return parts.join(';');
}

/**
 * `UNTIL` as the `YYYY-MM-DD` an `<input type="date">` wants, and back again.
 * The modal collects a bare day and nothing else in the app writes one, so the
 * date form is what this app produces; the datetime form is understood coming
 * in because an RRULE from anywhere else is entitled to use it.
 */
export function untilToDateInput(until: string | undefined): string {
  const match = until ? UNTIL_PART.exec(until) : null;
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function dateInputToUntil(value: string): string | undefined {
  const digits = value.slice(0, 10).replace(/-/g, '');
  return /^\d{8}$/.test(digits) ? digits : undefined;
}

/**
 * The moment a series' `UNTIL` runs out.
 *
 * A bare date means the **end** of that day where the user is, which is what
 * `parseStoredDate` says a `YYYY-MM-DD` means everywhere else in the app — so
 * an occurrence landing on the end date is inside the series rather than one
 * day past it.
 */
function untilInstant(rule: RRule, timeZone: string): Date | null {
  const match = rule.until ? UNTIL_PART.exec(rule.until) : null;
  if (!match) return null;

  const [, year, month, day, hour, minute, second, utc] = match;
  if (hour === undefined) return parseStoredDate(`${year}-${month}-${day}`, timeZone);

  const parts = {
    year: Number(year), month: Number(month), day: Number(day),
    hour: Number(hour), minute: Number(minute), second: Number(second),
  };
  return utc
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second))
    : zonedTimeToInstant(parts, timeZone);
}

// ─── Reading the rule off a task ─────────────────────────────────────────────

/** Everything on a task that says how it repeats. A `Task` satisfies it; so does a draft. */
export type RecurrenceSource = Pick<Task, 'recurrence' | 'recurrenceRule' | 'customRecurrence'>;

const PRESET_FREQUENCIES: Record<'daily' | 'weekly' | 'monthly' | 'yearly', RRule['freq']> = {
  daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY',
};

/**
 * The pre-v8 rule object as the RRULE that means the same thing:
 * `{freq: 'weekly', interval: 2, byWeekday: [1, 4]}` is
 * `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`, and `endType`/`endDate`/`endCount`
 * become `UNTIL`/`COUNT`. **No task converted through here changes schedule.**
 *
 * `byWeekday` was weekly-only in that object, so it is read for nothing else —
 * a monthly rule that somehow carried one never meant anything by it.
 */
export function rruleFromLegacyRule(legacy: LegacyRecurrenceRule): string {
  return formatRRule({
    freq: PRESET_FREQUENCIES[legacy.freq] ?? 'DAILY',
    interval: legacy.interval,
    byDay: legacy.freq === 'weekly' ? (legacy.byWeekday ?? []).map((weekday) => ({ weekday })) : [],
    until: legacy.endType === 'onDate' ? dateInputToUntil(legacy.endDate ?? '') : undefined,
    count: legacy.endType === 'afterCount' ? positiveInt(legacy.endCount ?? 1, 1) ?? 1 : undefined,
  });
}

/**
 * The RRULE string a task carries for a custom pattern.
 *
 * The `customRecurrence` fallback is not dead code. `useStore`'s persist
 * migration upgrades what is in *this browser*, but Firestore holds the whole
 * store as **one unversioned document** that lands straight in `setState`, and
 * the Trash keeps whole tasks for thirty days — so a pre-v8 rule can still
 * arrive long after that migration ran. Reading both here is what keeps such a
 * task on its schedule; saving it through the editor writes the string back.
 */
export function customRRuleOf(task: RecurrenceSource): string | undefined {
  if (task.recurrenceRule) return task.recurrenceRule;
  return task.customRecurrence ? rruleFromLegacyRule(task.customRecurrence) : undefined;
}

/**
 * The rule the engine actually runs, with the four presets folded into the
 * same shape as a custom one. `null` means "this task does not repeat" — which
 * covers `none`, an absent `recurrence`, and `custom` with no rule saved
 * alongside it (reachable today: `RecurrencePicker` only writes a rule once
 * the modal is saved).
 */
export function resolveRule(task: RecurrenceSource): RRule | null {
  const kind = task.recurrence;
  if (!kind || kind === 'none') return null;
  if (kind !== 'custom') return { freq: PRESET_FREQUENCIES[kind], interval: 1, byDay: [] };
  return parseRRule(customRRuleOf(task));
}

// ─── The rule, as Google draws it ────────────────────────────────────────────

/** An instant in RFC 5545's UTC form, `20260401T182959Z` — what `UNTIL` must be. */
function toUtcRRuleTime(instant: Date): string {
  return `${instant.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/**
 * The `RRULE:` line for a Google Calendar event's `recurrence` field, or
 * `null` when there is no series left for Google to draw.
 *
 * This is the whole of item 4: hand Google the pattern and it expands the
 * future series natively, on the phone and in the web UI, without the app
 * having to invent occurrences it does not own. The app still owns them — only
 * the *next* occurrence exists as a real `Task`, and what Google draws beyond
 * it is a picture, never read back.
 *
 * Three things have to change on the way out, and all three are here rather
 * than at the call site because nothing outside this file looks inside an
 * RRULE.
 *
 * **DTSTART is this occurrence, not the anchor.** The event carries the task's
 * own deadline, so Google expands from occurrence *n* while the engine here
 * counts from occurrence 1. That costs nothing for the pattern parts — the
 * sequence from occurrence *n* is the same one whichever end you count from,
 * because occurrence *n* always lands a whole number of periods after the
 * anchor — but it does mean `COUNT` has to be **rebased**: a five-times series
 * on its third occurrence has two left, and sending `COUNT=5` would draw seven.
 * A series with one occurrence left is not a series, and gets no rule at all.
 *
 * **`UNTIL` becomes a UTC instant.** The app stores a bare `YYYYMMDD`, which
 * RFC 5545 forbids beside a timed `DTSTART`, and Google reads such a token as
 * midnight UTC — cutting the series before an occurrence on the end date
 * itself, which is the opposite of what the app means by it (`untilInstant`:
 * the *end* of that day where the user is). Converted here, the two agree.
 *
 * **`WKST=SU` is added to weekly rules.** RFC 5545 defaults the week to
 * Monday; `occurrenceDay` counts weeks from Sunday. The two agree at
 * `INTERVAL=1` and diverge on "every other week" the moment the chosen days
 * straddle a weekend, so the app's week is stated outright rather than left to
 * a default that happens to match most of the time.
 *
 * **Where Google and this engine still differ:** a plain `FREQ=MONTHLY` task
 * anchored on the 31st. This engine clamps into a short month (the 28th of
 * February — see `RRule`), where RFC 5545 says skip it, and Google follows the
 * spec. It matters less than it reads: the app rewrites the event every time
 * the series moves on, so only the speculative tail past the current
 * occurrence can be wrong, and only in the months where the clamp bites.
 */
export function calendarRRuleOf(
  task: RecurrenceSource & Pick<Task, 'occurrence'>,
  timeZone: string,
): string | null {
  const rule = resolveRule(task);
  if (!rule) return null;

  const forGoogle: RRule = { ...rule };

  if (rule.count !== undefined) {
    const remaining = rule.count - (occurrenceNumberOf(task) - 1);
    if (remaining <= 1) return null;
    forGoogle.count = remaining;
  }

  if (rule.until) {
    const ends = untilInstant(rule, timeZone);
    if (ends) forGoogle.until = toUtcRRuleTime(ends);
  }

  const text = formatRRule(forGoogle);
  return `RRULE:${forGoogle.freq === 'WEEKLY' ? `${text};WKST=SU` : text}`;
}

// ─── Saying it in English ────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const UNIT_NAMES: Record<RRule['freq'], string> = {
  DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year',
};
/** Monday to Friday, the set "Every weekday" is a shorter way of saying. */
const WORKING_WEEK = [1, 2, 3, 4, 5];

/** `1st`, `2nd`, `23rd`, `31st` — the form the picker shows a day of the month in. */
function ordinalNumber(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Which day of the month a monthly rule picks, said out loud. */
function describeMonthDay(rule: RRule): string {
  const ordinalDay = rule.byDay[0];
  if (ordinalDay?.ordinal !== undefined) {
    const which = ordinalDay.ordinal === -1
      ? 'last'
      : ordinalDay.ordinal < 0
        ? `${ordinalNumber(-ordinalDay.ordinal)} last`
        : ordinalNumber(ordinalDay.ordinal);
    return ` on the ${which} ${WEEKDAY_NAMES[ordinalDay.weekday]}`;
  }
  if (rule.byMonthDay === undefined) return '';
  if (rule.byMonthDay === -1) return ' on the last day';
  if (rule.byMonthDay < 0) return ` on the ${ordinalNumber(-rule.byMonthDay)} last day`;
  return ` on the ${ordinalNumber(rule.byMonthDay)}`;
}

/**
 * The one short phrase for a repeat pattern. It is what the Repeat field shows
 * once a custom rule is saved and what the row's repeat chip reads, so it is
 * the only place the app puts an RRULE into words.
 */
export function describeRecurrenceRule(rule: RRule): string {
  const unit = UNIT_NAMES[rule.freq];
  const weekdays = rule.freq === 'WEEKLY' ? rule.byDay.map((d) => d.weekday) : [];

  let base: string;
  if (rule.interval === 1 && weekdays.length === WORKING_WEEK.length
      && WORKING_WEEK.every((d, i) => weekdays[i] === d)) {
    base = 'Every weekday';
  } else {
    base = rule.interval === 1 ? `Every ${unit}` : `Every ${rule.interval} ${unit}s`;
    if (weekdays.length > 0) base += ` on ${weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')}`;
    if (rule.freq === 'MONTHLY') base += describeMonthDay(rule);
  }

  if (rule.count !== undefined) return `${base}, ${rule.count}x`;

  const until = untilToDateInput(rule.until);
  if (!until) return base;
  // Built from the parts rather than parsed, because `new Date('2026-01-31')`
  // is UTC midnight and renders as the 30th anywhere west of Greenwich.
  const [year, month, day] = until.split('-').map(Number);
  const label = new Date(year, month - 1, day)
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${base}, until ${label}`;
}

/** Which of a task's two dates the series is pinned to. */
export type AnchorField = 'deadline' | 'startDate';

/**
 * The deadline wins when a task has both: it is the date the app schedules,
 * warns and syncs to Google Calendar on, so a successor whose *deadline*
 * landed in the past would be born overdue. `null` means the task carries no
 * dates at all, which is allowed — see `nextOccurrence`.
 */
export function anchorFieldOf(task: Pick<Task, 'startDate' | 'deadline'>): AnchorField | null {
  if (task.deadline) return 'deadline';
  if (task.startDate) return 'startDate';
  return null;
}

/**
 * Occurrence 1's date for this task: the stamped `seriesAnchor` once the
 * series has spawned at least once, and otherwise the task's own date, since a
 * task that has never cloned *is* occurrence 1.
 */
export function seriesAnchorOf(task: Pick<Task, 'startDate' | 'deadline' | 'seriesAnchor'>): string | null {
  if (task.seriesAnchor) return task.seriesAnchor;
  const field = anchorFieldOf(task);
  return field ? (task[field] as string) : null;
}

// ─── Civil-date arithmetic ───────────────────────────────────────────────────

/**
 * A calendar day, with no time and no zone. Held apart from `Date` on purpose:
 * "the 31st of next month" is a question about a calendar, and answering it
 * with instants is how month-end and DST bugs get in. The `Date.UTC` probes
 * below are pure calendar maths — UTC appears only because it is the one zone
 * that never shifts.
 */
interface CivilDate {
  year: number;
  month: number;
  day: number;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: CivilDate, days: number): CivilDate {
  const probe = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: probe.getUTCFullYear(), month: probe.getUTCMonth() + 1, day: probe.getUTCDate() };
}

function daysBetween(from: CivilDate, to: CivilDate): number {
  const ms = Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day);
  return Math.round(ms / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday, matching `RRuleDay.weekday`. */
function dayOfWeek(date: CivilDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/**
 * Whole months forward, clamped to the last day of the target month — the 31st
 * of January plus one month is the 28th (or 29th) of February. Because callers
 * always count from the series anchor, that clamp applies to February alone
 * and March is the 31st again. It is also what handles the 29th of February
 * under a yearly rule, which is just twelve months at a time.
 */
function addMonths(date: CivilDate, months: number): CivilDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/**
 * Which day of `month` a `BYMONTHDAY` picks. Negative counts back from the end,
 * so `-1` is the last day whatever the month's length; positive is clamped
 * into a month too short for it, for the reason set out on `RRule`.
 */
function monthDayIn(year: number, month: number, byMonthDay: number): CivilDate {
  const length = daysInMonth(year, month);
  const day = byMonthDay > 0 ? Math.min(byMonthDay, length) : Math.max(1, length + 1 + byMonthDay);
  return { year, month, day };
}

/**
 * "The second Tuesday", "the last Friday". Ordinals past the end of the month
 * clamp to the last matching weekday — a rule asking for a fifth Monday in a
 * month with four of them gets the fourth rather than silently skipping the
 * month, which is the same clamping choice `monthDayIn` and `addMonths` make.
 */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, ordinal: number): CivilDate {
  const first = 1 + ((weekday - dayOfWeek({ year, month, day: 1 }) + 7) % 7);
  const available = Math.floor((daysInMonth(year, month) - first) / 7) + 1;
  const index = ordinal > 0 ? Math.min(ordinal, available) : Math.max(1, available + 1 + ordinal);
  return { year, month, day: first + (index - 1) * 7 };
}

// ─── The occurrence sequence ─────────────────────────────────────────────────

/** An anchor split into the calendar day it falls on and the wall clock it shows. */
interface Anchor {
  date: CivilDate;
  hour: number;
  minute: number;
}

/**
 * Reads a stored date the way the rest of the app does (`parseStoredDate` — a
 * bare `YYYY-MM-DD` means the end of that day, so a task "due today" is not
 * overdue at 00:01) and splits the result into the user's calendar day and
 * wall clock.
 */
function readAnchor(value: string, timeZone: string): Anchor | null {
  const instant = parseStoredDate(value, timeZone);
  if (!instant) return null;
  const parts = zonedParts(instant, timeZone);
  return {
    date: { year: parts.year, month: parts.month, day: parts.day },
    hour: parts.hour,
    minute: parts.minute,
  };
}

/**
 * The calendar day of occurrence *step + 1*, counting the anchor itself as
 * step 0. Strictly increasing in `step` for every rule shape, which is what
 * lets `firstStepAfter` binary-search it.
 */
function occurrenceDay(anchor: Anchor, rule: RRule, step: number): CivilDate {
  const { interval } = rule;

  switch (rule.freq) {
    case 'DAILY':
      return addDays(anchor.date, step * interval);

    case 'MONTHLY':
      return monthlyDay(anchor, rule, step);

    case 'YEARLY':
      return addMonths(anchor.date, step * interval * 12);

    case 'WEEKLY': {
      const weekdays = rule.byDay.map((d) => d.weekday);
      if (weekdays.length === 0) return addDays(anchor.date, step * interval * 7);
      if (step === 0) return anchor.date;

      // The anchor is occurrence 1 whether or not its own weekday was picked,
      // because it is the date already sitting on the task. Its week therefore
      // contributes only the selected days that fall *after* it; every later
      // week in the series contributes all of them.
      const anchorDow = dayOfWeek(anchor.date);
      const restOfAnchorWeek = weekdays.filter((d) => d > anchorDow);
      if (step <= restOfAnchorWeek.length) {
        return addDays(anchor.date, restOfAnchorWeek[step - 1] - anchorDow);
      }

      const intoFullWeeks = step - restOfAnchorWeek.length - 1;
      const week = Math.floor(intoFullWeeks / weekdays.length) + 1;
      const weekday = weekdays[intoFullWeeks % weekdays.length];
      const weekStart = addDays(anchor.date, -anchorDow);
      return addDays(weekStart, week * interval * 7 + weekday);
    }
  }
}

/**
 * Which day of a month this rule picks, or `null` when it picks none and the
 * month therefore keeps the anchor's own day (`FREQ=MONTHLY` alone — the
 * behaviour every monthly task had before RRULEs, and the reason none of them
 * changed schedule).
 */
function monthlyPicker(rule: RRule): ((year: number, month: number) => CivilDate) | null {
  const ordinalDay = rule.byDay[0];
  if (ordinalDay?.ordinal !== undefined) {
    return (year, month) => nthWeekdayOfMonth(year, month, ordinalDay.weekday, ordinalDay.ordinal as number);
  }
  if (rule.byMonthDay !== undefined) {
    return (year, month) => monthDayIn(year, month, rule.byMonthDay as number);
  }
  return null;
}

/**
 * The calendar day of a monthly occurrence.
 *
 * With no `BY` part this is the anchor advanced whole months, clamped — what
 * `addMonths` has always done. With one, the same structure as the weekly case
 * above: **the anchor is occurrence 1 whatever day it lands on**, because it is
 * the date already sitting on the task, and its own month then contributes the
 * rule's day only when that day is still ahead of it. Setting a task due on
 * the 3rd to repeat on the last Friday of the month therefore gives you this
 * month's last Friday next, not next month's.
 */
function monthlyDay(anchor: Anchor, rule: RRule, step: number): CivilDate {
  const pick = monthlyPicker(rule);
  if (!pick) return addMonths(anchor.date, step * rule.interval);
  if (step === 0) return anchor.date;

  const inAnchorMonth = pick(anchor.date.year, anchor.date.month);
  const bonus = daysBetween(anchor.date, inAnchorMonth) > 0 ? 1 : 0;
  if (bonus === 1 && step === 1) return inAnchorMonth;

  const month = addMonths({ ...anchor.date, day: 1 }, (step - bonus) * rule.interval);
  return pick(month.year, month.month);
}

/**
 * The instant occurrence *step + 1* falls on. The wall clock is taken from the
 * anchor every time rather than carried forward, so the series keeps its time
 * of day across a daylight-saving change.
 *
 * On the one morning a year when the requested wall clock does not exist —
 * 02:30 in a zone that jumps 02:00 to 03:00 — `zonedTimeToInstant` lands on
 * 01:30, the last real moment before the gap, and that occurrence is stamped
 * an hour early. It is left that way deliberately: the alternative is a second
 * opinion in this file about what a stored wall clock means, and the app is
 * better off with one. It costs an hour, once, on one occurrence, and because
 * every later occurrence is measured from the anchor rather than from this one
 * the error does not travel.
 */
function occurrenceInstant(anchor: Anchor, rule: RRule, step: number, timeZone: string): Date {
  const day = occurrenceDay(anchor, rule, step);
  return zonedTimeToInstant(
    { year: day.year, month: day.month, day: day.day, hour: anchor.hour, minute: anchor.minute, second: 0 },
    timeZone,
  );
}

/**
 * Far enough out that nothing a person could enter reaches it — a daily rule
 * would have to have been running since the 1740s — and near enough that a
 * corrupt anchor cannot spin the search forever. Reaching it is reported as
 * the series being over rather than guessed at.
 */
const MAX_STEP = 100_000;

/**
 * The smallest `step >= minStep` whose occurrence lands strictly after
 * `after`, or `null` if that is past `MAX_STEP`.
 *
 * Doubling and then bisecting, rather than walking one occurrence at a time:
 * the gap being closed is "how long has this task been sitting untouched",
 * which for a daily task abandoned over a summer is a hundred-odd occurrences
 * and for one restored from an old backup is thousands. The search is valid
 * because `occurrenceDay` strictly increases with `step`.
 */
function firstStepAfter(
  anchor: Anchor,
  rule: RRule,
  minStep: number,
  after: Date,
  timeZone: string,
): number | null {
  const isAfter = (step: number) => occurrenceInstant(anchor, rule, step, timeZone).getTime() > after.getTime();
  if (isAfter(minStep)) return minStep;

  let lo = minStep; // known to land on or before `after`
  let hi = minStep + 1;
  while (hi <= MAX_STEP && !isAfter(hi)) {
    lo = hi;
    hi = minStep + (hi - minStep) * 2;
  }
  if (hi > MAX_STEP) return null;

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (isAfter(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

// ─── The answer ──────────────────────────────────────────────────────────────

/** The successor a completed occurrence should spawn. */
export interface ScheduledOccurrence {
  kind: 'next';
  /** 1-based position in the series. Always greater than the completed one's. */
  occurrence: number;
  /** Occurrence 1's date, stamped on the successor unchanged. Absent only for an undated series. */
  seriesAnchor?: string;
  startDate?: string;
  deadline?: string;
}

export type NextOccurrence =
  | ScheduledOccurrence
  | { kind: 'none' }
  | { kind: 'ended'; reason: 'count' | 'endDate' | 'exhausted' };

/**
 * When this task next comes round, given that it was completed at `now`.
 *
 * `none` — it does not repeat, so completing it is just completing it.
 * `ended` — it repeats, but the series is over: `count` when the rule's
 * `afterCount` is used up, `endDate` when the next occurrence would fall past
 * the rule's end date, `exhausted` when the anchor sits so far in the past
 * that the search gave up (corrupt data, not a real schedule).
 * `next` — the dates the successor should carry.
 *
 * A repeating task with **no dates at all** is allowed and still produces a
 * `next`. The picker lets a task repeat without ever being scheduled, and the
 * honest reading of that is a checklist item that comes back each time it is
 * done; having no date, it has nothing to skip forward through, so only the
 * end conditions can stop it.
 */
export function nextOccurrence(task: Task, now: Date, timeZone: string): NextOccurrence {
  const rule = resolveRule(task);
  if (!rule) return { kind: 'none' };

  const completed = occurrenceNumberOf(task);
  const endsAt = untilInstant(rule, timeZone);

  const anchorValue = seriesAnchorOf(task);
  const anchor = anchorValue ? readAnchor(anchorValue, timeZone) : null;
  if (!anchorValue || !anchor) return undatedNextOccurrence(rule, completed, now, endsAt);

  // Occurrence numbers are 1-based and steps are 0-based, so the completed
  // occurrence is step `completed - 1` and the earliest candidate is the step
  // after it, which is `completed`.
  const step = firstStepAfter(anchor, rule, completed, now, timeZone);
  if (step === null) return { kind: 'ended', reason: 'exhausted' };

  if (endedByCount(rule, step + 1)) return { kind: 'ended', reason: 'count' };

  const instant = occurrenceInstant(anchor, rule, step, timeZone);
  if (endsAt && instant.getTime() > endsAt.getTime()) return { kind: 'ended', reason: 'endDate' };

  return scheduleAt(task, rule, anchorValue, anchor, step, timeZone);
}

/**
 * Which occurrence a task is, defaulting to 1 — a repeating task that has
 * never cloned has no counter on it yet, and that state *is* occurrence 1.
 */
export function occurrenceNumberOf(task: Pick<Task, 'occurrence'>): number {
  return Number.isFinite(task.occurrence) ? Math.max(1, Math.floor(task.occurrence as number)) : 1;
}

/**
 * The dates occurrence `n` of this task's series carries — the same answer
 * `nextOccurrence` gives, minus the search for *which* n comes next, and so
 * without ever reading a clock.
 *
 * This exists for the un-complete rollback. Deleting the clone a completion
 * spawned means being sure the row about to go is the one that was spawned and
 * nothing about it has been touched, and the way `recurrenceCompletion.ts`
 * establishes that is by rebuilding the clone from scratch and comparing.
 * That rebuild has to land on exactly the dates the spawn did however much
 * time has passed since — which the `now`-driven search cannot promise, and
 * anchored arithmetic can.
 *
 * `null` only when the task does not repeat at all.
 */
export function occurrenceAt(task: Task, occurrence: number, timeZone: string): ScheduledOccurrence | null {
  const rule = resolveRule(task);
  if (!rule) return null;

  const n = occurrenceNumberOf({ occurrence });
  const anchorValue = seriesAnchorOf(task);
  const anchor = anchorValue ? readAnchor(anchorValue, timeZone) : null;
  if (!anchorValue || !anchor) return { kind: 'next', occurrence: n };

  return scheduleAt(task, rule, anchorValue, anchor, n - 1, timeZone);
}

/**
 * The successor payload for one step, once the rule and anchor are in hand.
 * Both public entry points end here, which is the point: the rollback's
 * rebuild and the spawn it is undoing must agree field for field, and they
 * cannot drift if there is only one place that builds the answer.
 */
function scheduleAt(
  task: Task,
  rule: RRule,
  anchorValue: string,
  anchor: Anchor,
  step: number,
  timeZone: string,
): ScheduledOccurrence {
  const instant = occurrenceInstant(anchor, rule, step, timeZone);
  return {
    kind: 'next',
    occurrence: step + 1,
    seriesAnchor: anchorValue,
    ...shiftedDates(task, instant, timeZone),
  };
}

function endedByCount(rule: RRule, occurrence: number): boolean {
  return rule.count !== undefined && occurrence > rule.count;
}

/**
 * A series with nothing to anchor to. There is no schedule to skip forward
 * through, so the successor is simply the next number and the end date is
 * measured against `now` instead of against an occurrence.
 */
function undatedNextOccurrence(
  rule: RRule,
  completed: number,
  now: Date,
  endsAt: Date | null,
): NextOccurrence {
  const occurrence = completed + 1;
  if (endedByCount(rule, occurrence)) return { kind: 'ended', reason: 'count' };
  if (endsAt && now.getTime() > endsAt.getTime()) return { kind: 'ended', reason: 'endDate' };
  return { kind: 'next', occurrence };
}

/**
 * Both dates moved onto the new occurrence, **preserving the gap between
 * them**. The anchored field lands on the computed instant; the other keeps
 * its own time of day and the same number of days' distance, so a task that
 * starts three days before it is due still starts three days before it is due.
 * Measuring that gap in days rather than milliseconds is what keeps a 09:00
 * start at 09:00 when the pair straddles a clock change.
 */
function shiftedDates(task: Task, instant: Date, timeZone: string): { startDate?: string; deadline?: string } {
  const field = anchorFieldOf(task);
  if (!field) return {};

  const anchored = toTaskDateString(instant, timeZone);
  const other: AnchorField = field === 'deadline' ? 'startDate' : 'deadline';
  const otherValue = task[other];

  const previous = readAnchor(task[field] as string, timeZone);
  const previousOther = otherValue ? readAnchor(otherValue, timeZone) : null;
  if (!previous || !previousOther) return { [field]: anchored };

  const gapDays = daysBetween(previous.date, previousOther.date);
  const landed = zonedParts(instant, timeZone);
  const shifted = addDays({ year: landed.year, month: landed.month, day: landed.day }, gapDays);
  const otherInstant = zonedTimeToInstant(
    { ...shifted, hour: previousOther.hour, minute: previousOther.minute, second: 0 },
    timeZone,
  );

  return { [field]: anchored, [other]: toTaskDateString(otherInstant, timeZone) };
}

// ─── The successor itself ────────────────────────────────────────────────────

/**
 * Every subtask reset to incomplete and given a fresh id. New ids are not
 * optional bookkeeping: subtask ids are globally unique across the app and a
 * subtask dragged into today's focus queue is matched by id alone (see
 * `isSubtaskProxy` in `useStore.ts`), so a successor that reused them would
 * find its checklist ticked off by work done on its predecessor.
 */
function resetSubtasks(subtasks: Subtask[] | undefined, newId: () => string): Subtask[] | undefined {
  if (!subtasks) return undefined;
  return subtasks.map((sub) => {
    const next: Subtask = {
      ...sub,
      id: newId(),
      status: 'needsAction',
      subtasks: resetSubtasks(sub.subtasks, newId),
    };
    delete next.allocatedTime;
    delete next.avoidedCount;
    /* Item 17 gave subtasks the Emergency field too — a subtask dragged into
       today is scored as a task, so it can carry one — and it goes for exactly
       the reason `avoidedCount` above it does: last month's emergency is not
       this month's. */
    delete next.emergencyBoost;
    if (!next.subtasks) delete next.subtasks;
    return next;
  });
}

/**
 * The successor task itself, as pure data. `newId` mints the successor's id and
 * its subtasks' — the caller passes `crypto.randomUUID`, a test passes a
 * counter. `seriesId` is used only when the completed task is not already part
 * of a series, i.e. on the first clone.
 *
 * What carries over is everything describing the *work*: title, notes, which
 * list it belongs to, its estimate, its scoring, its prerequisites, its tags
 * and links. What does not carry over is everything describing the *last time
 * it was done* — how it went (`status`, `completedAt`), how long was set aside
 * for it, the avoided count it earned by being deferred, and its public
 * share link, since a share is a URL somebody already holds and handing the
 * same one to a new copy would silently repoint it.
 *
 * `createdAt` is passed in rather than read from a clock so this stays pure.
 * The successor belongs in the backlog and not in today's focus queue, but
 * that is the caller's business either way.
 */
export function buildSuccessorTask(
  task: Task,
  next: ScheduledOccurrence,
  options: { newId: () => string; seriesId: string; createdAt: number },
): Task {
  const successor: Task = {
    ...task,
    id: options.newId(),
    status: 'needsAction',
    createdAt: options.createdAt,
    subtasks: resetSubtasks(task.subtasks, options.newId),
    startDate: next.startDate,
    deadline: next.deadline,
    seriesId: task.seriesId ?? options.seriesId,
    occurrence: next.occurrence,
    seriesAnchor: next.seriesAnchor,
  };

  successor.completedAt = undefined;
  successor.allocatedTime = undefined;
  successor.avoidedCount = undefined;
  // Last month's emergency is not this month's, and the anchor the escalator
  // measures lateness from belongs to the occurrence that was late. Both go
  // for the same reason `avoidedCount` does. `humanOverride` and
  // `deadlineIsFixed` stay: they describe the work, not the last attempt at it.
  successor.emergencyBoost = undefined;
  successor.originalDeadline = undefined;
  // A public link belongs to the occurrence that was shared, not to the
  // series. Same for the deprecated primary-calendar marker.
  successor.shareId = undefined;
  successor.shortUrlKeyword = undefined;
  successor.shortUrlDomain = undefined;
  successor.googleEventId = undefined;

  // Present-but-`undefined` is not the same as absent once this reaches
  // Firestore, where an `undefined` in the payload is a write error.
  for (const key of Object.keys(successor) as (keyof Task)[]) {
    if (successor[key] === undefined) delete successor[key];
  }
  return successor;
}

// ─── Where a task sits in its series ─────────────────────────────────────────

/** Why a series stopped. Same vocabulary `NextOccurrence` uses. */
export type SeriesEndReason = 'count' | 'endDate' | 'exhausted';

/**
 * What to tell the user about this occurrence's place in its series.
 *
 * `open` — something follows this one. `last` — it has not been finished yet,
 * and finishing it will not bring it back. `finished` — it was finished and
 * nothing followed. `none` — the task does not repeat.
 *
 * `total` is present only when the rule states one (`afterCount`); an
 * open-ended series has no total to count towards, and an `onDate` rule's end
 * is already spelled out by `describeRecurrenceRule`.
 */
export type SeriesStatus =
  | { kind: 'none' }
  | { kind: 'open'; occurrence: number; total?: number }
  | { kind: 'last'; occurrence: number; total?: number; reason: SeriesEndReason }
  | { kind: 'finished'; occurrence: number; total?: number; reason: SeriesEndReason };

/**
 * Reads the same answer `nextOccurrence` gives and turns it into something a
 * row can render. Pure, and takes its clock as an argument like everything
 * else here.
 *
 * **A finished task is asked about its own completion moment, not about now.**
 * "Does anything follow this one" was decided when it was ticked off, and
 * asking `nextOccurrence` again months later gets a different answer: the
 * search skips forward to the first occurrence after *now*, so a long-idle
 * occurrence 1 of a five-times daily series would report itself the end of the
 * road when in fact it spawned occurrence 2 the day it was completed.
 * `completedAt` is the instant the spawn actually used (both are written by
 * the same store update), so it reproduces that decision exactly. Data from
 * before `completedAt` was stamped everywhere falls back to `now`.
 */
export function seriesStatus(task: Task, now: Date, timeZone: string): SeriesStatus {
  const rule = resolveRule(task);
  if (!rule) return { kind: 'none' };

  const occurrence = occurrenceNumberOf(task);
  const total = rule.count;

  const completed = task.status === 'completed';
  const asked = completed && Number.isFinite(task.completedAt) ? new Date(task.completedAt as number) : now;
  const next = nextOccurrence(task, asked, timeZone);
  if (next.kind !== 'ended') return { kind: 'open', occurrence, total };

  return { kind: completed ? 'finished' : 'last', occurrence, total, reason: next.reason };
}

/**
 * The one short phrase every surface uses for a series status, so the task
 * row and the task card can never word it differently. `null` means there is
 * nothing worth saying — an open-ended series that is still running is just a
 * repeating task, which the repeat chip already says.
 */
export function describeSeriesStatus(status: SeriesStatus): string | null {
  switch (status.kind) {
    case 'none':
      return null;
    case 'open':
      return status.total ? `${status.occurrence} of ${status.total}` : null;
    case 'last':
      return status.total ? `Last one (${status.occurrence} of ${status.total})` : 'Last one';
    case 'finished':
      return 'Repeat finished';
  }
}
