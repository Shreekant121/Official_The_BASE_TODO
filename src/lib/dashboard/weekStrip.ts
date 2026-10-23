/**
 * The Dashboard's week strip (29-1c3, ideas 40 and 128) — pure: the backlog,
 * the hours, the time zone and the day are arguments.
 *
 * HIS CALLS
 * ---------
 * - **The load dots are hours due against that weekday's hours** (2026-10-15):
 *   the open work due on a day, by `taskEstimatedMinutes` (the length the
 *   timeline and his Google Calendar draw), against what `hours.ts` says that
 *   day has — its override, else its weekday's default.
 * - **The strip sits at the top of the Dashboard, under the greeting, in place
 *   of the date chip** (2026-10-21), and **picking a day moves the blocks that
 *   have a day** — Today, the timeline, Hours and Focus this week. The blocks
 *   about right now stay as they are (his pick, the same day).
 *
 * THE SESSION'S CALLS (minimal, his delegation)
 * ---------------------
 * - **Open work only**: a day's dots fall as he ticks it off, so today's tell
 *   him what is left, and a past day's are what is still overdue from it.
 * - **Four dots, a quarter of the day each**, at least one for any work at
 *   all; **past the day's hours they turn coral** (over time is coral's job),
 *   as does any work on a day with no hours.
 * - Ignored work (BIG-3) and subtasks are not counted, as on the timeline.
 */
import { parseStoredDate, toZonedDayString } from '../agent/dates';
import { addDays, availableOn, weekOf, type HoursSettings } from './hours';

/** A day's dots at most: four quarters of its hours. */
export const MAX_DOTS = 4;

/** The few fields of a task the dots read. */
export interface LoadTask {
  id: string;
  status: string;
  deadline?: string;
  parent?: string;
}

export interface DayLoad {
  day: string;
  /** Open work due that day, in minutes. */
  dueMinutes: number;
  /** What the day has, in minutes (`hours.ts`). */
  availableMinutes: number;
  /** 0 to `MAX_DOTS`. */
  dots: number;
  /** More due than the day has. */
  over: boolean;
}

/** How many dots, and whether they are coral: a quarter of the day each. */
export function loadDots(dueMinutes: number, availableMinutes: number): { dots: number; over: boolean } {
  if (dueMinutes <= 0) return { dots: 0, over: false };
  if (availableMinutes <= 0) return { dots: MAX_DOTS, over: true };
  const ratio = dueMinutes / availableMinutes;
  return { dots: Math.max(1, Math.min(MAX_DOTS, Math.ceil(ratio * MAX_DOTS))), over: ratio > 1 };
}

/** Each of `days`, with the open work due on it against its hours. */
export function dayLoads<T extends LoadTask>(
  backlog: readonly T[],
  days: readonly string[],
  timeZone: string,
  ignored: ReadonlySet<string>,
  hours: HoursSettings,
  minutesOf: (task: T) => number,
): DayLoad[] {
  const due = new Map(days.map((d) => [d, 0]));
  for (const task of backlog) {
    if (task.status === 'completed' || task.parent || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (!at) continue;
    const day = toZonedDayString(at, timeZone);
    const sum = due.get(day);
    if (sum !== undefined) due.set(day, sum + minutesOf(task));
  }
  return days.map((day) => {
    const dueMinutes = due.get(day) ?? 0;
    const availableMinutes = availableOn(hours, day) / 60;
    return { day, dueMinutes, availableMinutes, ...loadDots(dueMinutes, availableMinutes) };
  });
}

// ─── Words ──────────────────────────────────────────────────────────────────

const dayName = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/** "Today", "Tomorrow", "Yesterday", else "Thu 23 Oct" — a block's title on that day. */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  if (day === addDays(today, -1)) return 'Yesterday';
  return dayName(day, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The same inside a sentence: "today", "tomorrow", "on Thu 23 Oct". */
export function dayPhrase(day: string, today: string): string {
  const near = Math.abs(daysBetween(today, day)) <= 1;
  return near ? dayWord(day, today).toLowerCase() : `on ${dayWord(day, today)}`;
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** "this week", "next week", "last week", else "in the week of 3 Nov" — for Focus this week. */
export function weekPhrase(day: string, today: string): string {
  const week = weekOf(day);
  if (week.includes(today)) return 'this week';
  if (week.includes(addDays(today, 7))) return 'next week';
  if (week.includes(addDays(today, -7))) return 'last week';
  return `in the week of ${dayName(week[0], { day: 'numeric', month: 'short' })}`;
}

/** The strip's month: "October", or "Oct – Nov 2026" across a turn of the month or year. */
export function weekMonths(week: readonly string[], today: string): string {
  const first = week[0];
  const last = week[week.length - 1];
  const yearOff = first.slice(0, 4) !== today.slice(0, 4) || last.slice(0, 4) !== today.slice(0, 4);
  if (first.slice(0, 7) === last.slice(0, 7)) {
    return dayName(first, yearOff ? { month: 'long', year: 'numeric' } : { month: 'long' });
  }
  const tail = yearOff ? { month: 'short', year: 'numeric' } as const : { month: 'short' } as const;
  return `${dayName(first, { month: 'short' })} – ${dayName(last, tail)}`;
}
