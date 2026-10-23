/**
 * The numbers BASE counts about how work is going (BIG-15's shared piece,
 * born in 29-1P8b for the pulse on a project card, idea 151).
 *
 * Pure: the clock and the time zone are arguments, so every count here is
 * testable without a store or a browser. A day is a calendar day in his zone
 * (`lib/agent/dates.ts`), never the browser's and never a 24-hour slice, so a
 * task ticked at 23:50 counts on that day and not the next.
 *
 * Later sessions add here, not beside it: focus minutes from `focusLog` and
 * the Dashboard's `timeLog`, days in a row, bests.
 */
import { toZonedDayString, zonedParts } from './agent/dates';
import type { Task } from '../store/useStore';

const DAY = 86_400_000;

export interface DayCount {
  /** `YYYY-MM-DD` in the zone. */
  day: string;
  count: number;
}

type Finished = Pick<Task, 'status' | 'completedAt'>;

/** The `days` calendar days ending today in `timeZone`, oldest first, as `YYYY-MM-DD`. */
export function lastDays(now: Date, timeZone: string, days: number): string[] {
  const n = zonedParts(now, timeZone);
  /* Day arithmetic on a UTC midnight: no zone, so no DST hour to lose. */
  const today = Date.UTC(n.year, n.month - 1, n.day);
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

/**
 * Tasks done per day over the last `days` days, today last. Only a finished
 * task with a `completedAt` counts — a task ticked before that stamp existed
 * has no day to land on, and reopening a task clears it (`updateBacklogTask`).
 */
export function doneByDay(tasks: readonly Finished[], now: Date, timeZone: string, days = 14): DayCount[] {
  const keys = lastDays(now, timeZone, days);
  const at = new Map(keys.map((k, i) => [k, i]));
  const counts = keys.map(() => 0);
  /* A day and a half of slack either side of the window covers any zone's
     offset; everything older is skipped before the costly zone lookup. */
  const from = now.getTime() - (days + 1.5) * DAY;
  for (const t of tasks) {
    if (t.status !== 'completed' || t.completedAt === undefined || t.completedAt < from) continue;
    const i = at.get(dayOf(t.completedAt, timeZone));
    if (i !== undefined) counts[i] += 1;
  }
  return keys.map((day, i) => ({ day, count: counts[i] }));
}

/** When the last of these tasks was finished, or null when none says. */
export function lastDoneAt(tasks: readonly Finished[]): number | null {
  let last: number | null = null;
  for (const t of tasks) {
    if (t.status === 'completed' && t.completedAt !== undefined && (last === null || t.completedAt > last)) last = t.completedAt;
  }
  return last;
}

/**
 * An instant's calendar day in `timeZone`, remembered. Asking the zone is the
 * costly part of every count here (`Intl` parts, once per entry), and the
 * bests below walk his whole history — up to 5,000 focus stretches — every
 * minute the Dashboard is open. A stretch's start and a task's `completedAt`
 * never change, so each is asked once per zone and read from here after.
 * Still a function of its arguments: the cache only skips repeat work.
 */
const dayCache = new Map<string, Map<number, string>>();
const DAY_CACHE_LIMIT = 50_000;

export function dayOf(at: number, timeZone: string): string {
  let zone = dayCache.get(timeZone);
  if (!zone) {
    zone = new Map();
    dayCache.set(timeZone, zone);
  }
  let day = zone.get(at);
  if (day === undefined) {
    day = toZonedDayString(new Date(at), timeZone);
    if (zone.size >= DAY_CACHE_LIMIT) zone.clear();
    zone.set(at, day);
  }
  return day;
}

/** Whole calendar days from `from` to `to` in `timeZone`, whatever the hours: Mon 23:00 to Tue 01:00 is 1. */
export function calendarDaysBetween(from: Date, to: Date, timeZone: string): number {
  const a = zonedParts(from, timeZone);
  const b = zonedParts(to, timeZone);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY);
}

// ─── Bests (29-1P14a, idea 108) ──────────────────────────────────────────────

/**
 * His three bests, his call (2026-10-15): **most focus in a day, most tasks
 * done in a day, and the longest run of days.** (Badges and trophies that
 * count how often things were done are BIG-14's, not these.)
 *
 * - **Focus** is the Hours block's own "worked" — the timer plus time logged by
 *   hand, less what doesn't count (`dashboard/hours.ts`'s `workByDay`) — so
 *   the number that turns gold is the number he is looking at.
 * - **Tasks done** is the Today block's tally (`finishedToday`): top-level
 *   tasks by `completedAt`, ignored work included — he still did it.
 * - **A day in the run** is one with any focus counted or any task done.
 *   Proper streaks, habits and rest days are 29-3's; this is only the best.
 *
 * **A best is new only when there was one to beat**: the first day BASE ever
 * counts is not a record, or every number would be gold on day one. It is
 * measured against the days before today, so a record set this morning stays
 * "new" for the rest of the day. History is what the store still holds: an
 * archived or deleted task's tick leaves the count with it.
 */
export type BestKind = 'focus' | 'done' | 'run';

export interface Best {
  kind: BestKind;
  /** Today's figure: seconds focused, tasks done, or days in a row ending today. */
  today: number;
  /** The best before today, 0 when there is none. */
  record: number;
  /** The day it was set (a run's last day), `YYYY-MM-DD`; null with no record. */
  recordDay: string | null;
  /** Today beat a record that existed. */
  isNew: boolean;
}

export type Bests = Record<BestKind, Best>;

type Ticked = Pick<Task, 'status' | 'completedAt' | 'parent'>;

/** Top-level tasks done per day, over everything the store holds. */
export function doneCountsByDay(tasks: readonly Ticked[], timeZone: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of tasks) {
    if (t.parent || t.status !== 'completed' || typeof t.completedAt !== 'number') continue;
    const day = dayOf(t.completedAt, timeZone);
    out.set(day, (out.get(day) ?? 0) + 1);
  }
  return out;
}

/** The day before a `YYYY-MM-DD`, on the calendar (no zone, so no DST hour). */
function dayBefore(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - DAY).toISOString().slice(0, 10);
}

/** The highest value before `today`, and the first day it was reached. */
function recordBefore(values: ReadonlyMap<string, number>, today: string): { record: number; recordDay: string | null } {
  let record = 0;
  let recordDay: string | null = null;
  for (const [day, n] of values) {
    if (day >= today || n <= 0) continue;
    if (n > record || (n === record && recordDay !== null && day < recordDay)) {
      record = n;
      recordDay = day;
    }
  }
  return { record, recordDay };
}

function bestOf(kind: BestKind, values: ReadonlyMap<string, number>, today: string): Best {
  const now = values.get(today) ?? 0;
  const { record, recordDay } = recordBefore(values, today);
  return { kind, today: now, record, recordDay, isNew: record > 0 && now > record };
}

/**
 * The run: days in a row ending today (0 until today counts), against the
 * longest run that ended before this one began. Two days at least, so a
 * single day after a gap is never "a new best run".
 */
function runBest(active: ReadonlySet<string>, today: string): Best {
  let current = 0;
  let cursor = today;
  while (active.has(cursor)) {
    current += 1;
    cursor = dayBefore(cursor);
  }
  /* `cursor` is now the day before this run began, or today when today does
     not count yet. Every older run ends on or before it. */
  const limit = current > 0 ? cursor : dayBefore(today);
  const before = [...active].filter((d) => d <= limit).sort();
  let record = 0;
  let recordDay: string | null = null;
  let length = 0;
  let prev: string | null = null;
  for (const day of before) {
    length = prev !== null && dayBefore(day) === prev ? length + 1 : 1;
    if (length > record) {
      record = length;
      recordDay = day;
    }
    prev = day;
  }
  return { kind: 'run', today: current, record, recordDay, isNew: record > 0 && current >= 2 && current > record };
}

/** All three bests for `today`, from seconds focused and tasks done per day. */
export function personalBests(
  focusByDay: ReadonlyMap<string, number>,
  doneByDayMap: ReadonlyMap<string, number>,
  today: string,
): Bests {
  const active = new Set<string>();
  for (const [day, n] of focusByDay) if (n > 0 && day <= today) active.add(day);
  for (const [day, n] of doneByDayMap) if (n > 0 && day <= today) active.add(day);
  return {
    focus: bestOf('focus', focusByDay, today),
    done: bestOf('done', doneByDayMap, today),
    run: runBest(active, today),
  };
}

/** The new ones, in the card's order: focus, tasks, the run. */
export function newBests(bests: Bests): Best[] {
  return [bests.focus, bests.done, bests.run].filter((b) => b.isNew);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "16 Sep" — the day a record was set, in his words. Its own months, not
 * `toLocaleDateString`: newer browsers write September "Sept" in en-GB and
 * Node does not, so the screen and the tests would disagree.
 */
export function shortDate(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${date} ${MONTHS[month - 1] ?? ''}`;
}

/**
 * The words for a new best (idea 108: "Beat 16 Sep by 5 min"). `span` writes
 * seconds as the screen does, so the line and the number beside it agree.
 */
export function bestWords(best: Best, span: (seconds: number) => string): { headline: string; beat: string } {
  const on = best.recordDay ? shortDate(best.recordDay) : '';
  if (best.kind === 'focus') {
    return { headline: `${span(best.today)} focused today`, beat: `Beat ${on} by ${span(best.today - best.record)}` };
  }
  if (best.kind === 'done') {
    const more = best.today - best.record;
    return {
      headline: `${best.today} ${best.today === 1 ? 'task' : 'tasks'} done today`,
      beat: `Beat ${on} by ${more} ${more === 1 ? 'task' : 'tasks'}`,
    };
  }
  return { headline: `${best.today} days in a row`, beat: `Your longest was ${best.record}, to ${on}` };
}

// ─── Perfect day (29-1P14a, idea 111) ────────────────────────────────────────

/**
 * His call (2026-10-15): a perfect day is **today's hours met and every habit
 * ticked**. Habits arrive with 29-3; until then it is the hours alone, and a
 * day with no hours set is never perfect (there was nothing to meet).
 */
export function isPerfectDay(workedSeconds: number, availableSeconds: number): boolean {
  return availableSeconds > 0 && workedSeconds >= availableSeconds;
}
