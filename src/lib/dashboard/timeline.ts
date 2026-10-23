/**
 * The Dashboard's timeline block (29-1c2, ideas 29, 38, 128) — pure, no React,
 * no store: the backlog, the clock and the time zone are arguments.
 *
 * HIS CALLS
 * ---------
 * - **A range per block**: today, three days, or the week (Monday first, as
 *   every week in BASE is, `hours.ts`'s `weekOf`); a swipe goes to the next.
 * - **A task is a block ending at its deadline** (2026-10-21): it runs
 *   `deadline − duration` → `deadline`, the very block BASE writes into his
 *   Google Calendar (`deadlineBlockFor`), with the duration from
 *   `taskEstimatedMinutes`, so the timeline and his calendar always agree.
 * - **"This evening" (38) is a deadline time, not a group**, and the evening
 *   starts at **6pm** (2026-10-15). A task due *at* 6pm is due before the
 *   evening starts, so the evening is strictly after it — and a bare date,
 *   which the app writes as 18:00, stays a day task.
 * - **Sending a task to the evening remembers the time it had, and bringing
 *   it back puts that time back** (2026-10-21) — unless the deadline was
 *   changed in between, when back means 6pm, the evening's edge.
 *
 * THE SESSION'S CALLS (his delegation: "which hour the deadline lands on is
 * the session's call")
 * ---------------------
 * The evening deadline is **9pm**: three hours into the evening, so an hour's
 * task draws 8-9pm, well inside it. Within an hour of 9pm or after it, the end
 * of the day (23:59) instead — a task sent "to this evening" at 9:30pm must
 * not be overdue the moment it lands there.
 */
import { addDays, weekOf } from './hours';
import { parseStoredDate, toTaskDateString, toZonedDayString, zonedTimeToInstant } from '../agent/dates';

export type TimelineRange = 'day' | 'three' | 'week';
export const TIMELINE_RANGES: readonly TimelineRange[] = ['day', 'three', 'week'];

/** A range this build does not know (a newer device, a hand edit) draws as today. */
export function timelineRange(raw: unknown): TimelineRange {
  return (TIMELINE_RANGES as readonly unknown[]).includes(raw) ? (raw as TimelineRange) : 'day';
}

/**
 * The days a page shows. Page 0 holds `anchor` — the day picked on the week
 * strip since 29-1c3, today unless he picked another; a swipe moves a whole
 * range, so page 1 of "three" is the three days after those, and page 1 of
 * "week" is next week.
 */
export function rangeDays(range: TimelineRange, anchor: string, page: number): string[] {
  if (range === 'day') return [addDays(anchor, page)];
  if (range === 'three') return [0, 1, 2].map((i) => addDays(anchor, page * RANGE_STEP.three + i));
  return weekOf(addDays(anchor, page * RANGE_STEP.week));
}

/** How many days one page turn moves the picked day. */
export const RANGE_STEP: Readonly<Record<TimelineRange, number>> = { day: 1, three: 3, week: 7 };

const DAY_MIN = 24 * 60;

// ─── What is on it ──────────────────────────────────────────────────────────

/** The few fields of a task the timeline reads. */
export interface TimelineTask {
  id: string;
  title: string;
  status: string;
  deadline?: string;
  parent?: string;
}

export interface TimelineItem {
  taskId: string;
  title: string;
  /** `YYYY-MM-DD`, the column it is drawn in. */
  day: string;
  /** Minutes from that day's midnight, clipped to the day: a block crossing midnight is drawn in both. */
  start: number;
  end: number;
  done: boolean;
  /** Open, and its deadline has passed. */
  late: boolean;
}

/**
 * Every top-level task whose block touches one of `days`, one item per day it
 * touches, earliest first. Finished tasks stay — drawn with their tick, as
 * his calendar keeps a finished block — and ignored work is left out, as
 * every block that offers or counts work leaves it (BIG-3).
 */
export function timelineItems<T extends TimelineTask>(
  backlog: readonly T[],
  days: readonly string[],
  timeZone: string,
  ignored: ReadonlySet<string>,
  now: Date,
  minutesOf: (task: T) => number,
): TimelineItem[] {
  if (days.length === 0) return [];
  const bounds = days.map((day) => ({ day, from: midnight(day, timeZone), to: midnight(addDays(day, 1), timeZone) }));
  const first = bounds[0].from;
  const last = bounds[bounds.length - 1].to;
  const items: TimelineItem[] = [];
  for (const task of backlog) {
    if (task.parent || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (!at) continue;
    const endMs = at.getTime();
    const startMs = endMs - Math.max(1, minutesOf(task)) * 60_000;
    if (endMs <= first || startMs >= last) continue;
    const done = task.status === 'completed';
    for (const b of bounds) {
      if (endMs <= b.from || startMs >= b.to) continue;
      items.push({
        taskId: task.id,
        title: task.title,
        day: b.day,
        start: Math.max(0, Math.round((startMs - b.from) / 60_000)),
        end: Math.min(DAY_MIN, Math.round((endMs - b.from) / 60_000)),
        done,
        late: !done && endMs < now.getTime(),
      });
    }
  }
  return items.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start || b.end - a.end));
}

function midnight(day: string, timeZone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return zonedTimeToInstant({ year, month, day: date, hour: 0, minute: 0, second: 0 }, timeZone).getTime();
}

// ─── Overlaps ───────────────────────────────────────────────────────────────

/** What `placeLanes` needs of a block: its column and its minutes. */
export interface Span {
  day: string;
  start: number;
  end: number;
}

/** 0-based column inside its cluster of overlapping blocks, and how many that cluster needs. */
export type Placed<T extends Span> = T & { lane: number; lanes: number };

export type PlacedItem = Placed<TimelineItem>;

/**
 * Side by side where blocks overlap, as a calendar draws them: within a day,
 * each block takes the first column free at its start, and every block in a
 * run of overlapping ones shares that run's column count, so they line up.
 * A block shorter than `minSpan` minutes is treated as that long, because it
 * is drawn that tall. Any block with a day and minutes: the calendar's
 * events share the lanes with its tasks (29-2e1).
 */
export function placeLanes<T extends Span>(items: readonly T[], minSpan = 0): Placed<T>[] {
  const out: Placed<T>[] = [];
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const list = byDay.get(item.day);
    if (list) list.push(item);
    else byDay.set(item.day, [item]);
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.start - b.start || b.end - a.end);
    let cluster: Placed<T>[] = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;
    const close = () => {
      for (const p of cluster) p.lanes = laneEnds.length;
      out.push(...cluster);
      cluster = [];
      laneEnds = [];
    };
    for (const item of sorted) {
      const end = Math.max(item.end, item.start + minSpan);
      if (cluster.length && item.start >= clusterEnd) close();
      let lane = laneEnds.findIndex((e) => e <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(end);
      } else {
        laneEnds[lane] = end;
      }
      cluster.push({ ...item, lane, lanes: 0 });
      clusterEnd = cluster.length === 1 ? end : Math.max(clusterEnd, end);
    }
    close();
  }
  return out;
}

// ─── This evening (idea 38) ─────────────────────────────────────────────────

/** 6pm, in minutes. A deadline after it is in the evening; one at it is not. */
export const EVENING_FROM_MIN = 18 * 60;
/** Where "this evening" lands: 9pm (the session's call, see the header). */
export const EVENING_AT = '21:00';
const EVENING_AT_MIN = 21 * 60;
const END_OF_DAY = '23:59';
/** Back from the evening with no time to restore: due by 6pm, the evening's edge. */
const BEFORE_EVENING = '18:00';

/** What a task remembers when it is sent to the evening: the deadline it had, and the one it was given. */
export interface BeforeEvening {
  /** Absent when it had no deadline. */
  was?: string;
  to: string;
}

/** The time part of a stored deadline, in minutes; a bare day is not in the evening. */
function minutesOfStored(deadline: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(deadline);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Due after 6pm on its day. */
export function isEvening(deadline: string | undefined): boolean {
  if (!deadline) return false;
  const min = minutesOfStored(deadline);
  return min !== null && min > EVENING_FROM_MIN;
}

/** The deadline "this evening" means right now: 9pm, or the day's end within an hour of it. */
export function eveningDeadline(now: Date, timeZone: string): string {
  const today = toZonedDayString(now, timeZone);
  const clock = minutesOfStored(toTaskDateString(now, timeZone)) ?? 0;
  return `${today}T${clock >= EVENING_AT_MIN - 60 ? END_OF_DAY : EVENING_AT}`;
}

/**
 * The patch the moon button writes: to the evening, or back from it.
 * `beforeEvening: undefined` removes the field (`withPatch`).
 */
export function eveningPatch(
  task: { deadline?: string; beforeEvening?: BeforeEvening },
  now: Date,
  timeZone: string,
): { deadline?: string; beforeEvening?: BeforeEvening } {
  if (isEvening(task.deadline)) {
    const memory = task.beforeEvening;
    if (memory && memory.to === task.deadline) return { deadline: memory.was, beforeEvening: undefined };
    return { deadline: `${task.deadline!.slice(0, 10)}T${BEFORE_EVENING}`, beforeEvening: undefined };
  }
  const to = eveningDeadline(now, timeZone);
  return { deadline: to, beforeEvening: task.deadline ? { was: task.deadline, to } : { to } };
}

// ─── Words ──────────────────────────────────────────────────────────────────

const dayName = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/** The block's title for a page: "Today", "Tomorrow", "Next 3 days", "This week", or its dates. */
export function rangeTitle(range: TimelineRange, days: readonly string[], today: string): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (range === 'day') {
    if (first === today) return 'Today';
    if (first === addDays(today, 1)) return 'Tomorrow';
    if (first === addDays(today, -1)) return 'Yesterday';
    return dayName(first, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  if (range === 'three' && first === today) return 'Next 3 days';
  if (range === 'week' && days.includes(today)) return 'This week';
  if (range === 'week' && days.includes(addDays(today, 7))) return 'Next week';
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  return sameMonth
    ? `${dayName(first, { day: 'numeric' })}–${dayName(last, { day: 'numeric', month: 'short' })}`
    : `${dayName(first, { day: 'numeric', month: 'short' })} – ${dayName(last, { day: 'numeric', month: 'short' })}`;
}

/** "9 am", "12 pm", "6 pm" — the hour marks down the side. */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Mon 12" over a column. */
export function columnLabel(day: string): { weekday: string; date: string } {
  return { weekday: dayName(day, { weekday: 'short' }), date: dayName(day, { day: 'numeric' }) };
}

/** Where a day column's now line sits, in minutes, or null when `day` is not today. */
export function nowMinutes(day: string, now: Date, timeZone: string): number | null {
  if (toZonedDayString(now, timeZone) !== day) return null;
  return minutesOfStored(toTaskDateString(now, timeZone));
}
