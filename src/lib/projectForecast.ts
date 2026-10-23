/**
 * When a project will be done, and its milestones (29-1P9b, ideas 156 and
 * 155). Pure: the tasks, the clock and the time zone are arguments.
 *
 * **The forecast** (156) is the project's tasks done so far, one count per
 * calendar day in his zone, carried on at **the last fourteen days' pace** —
 * the same pace the card's "At risk" word reads (`projectHealth.ts`) — until
 * every task is done. The day it lands is set against the project's own
 * **Finish by** date (`Project.finishBy`, his pick C, 2026-10-14), when it has
 * one; a project without one gets the date and no "late".
 *
 * Every count is the whole tree's, each task once (`subtreeTasks`), as
 * "40% done" is, so the chart and the words beside it cannot disagree. A task
 * ticked before `completedAt` existed counts as done from before the chart
 * starts: it has no day to land on.
 *
 * **Milestones** (155) are tasks he switched to one in the sheet
 * (`Task.milestone`). In date order, done ones first by nature, the first
 * not done is the one he is on. What a milestone **waits on is its own
 * "Depends on"** (`dependsOn`), his pick B: the tasks he linked, wherever they
 * live, so the tree is not where they are looked up — the backlog is.
 */
import { parseStoredDate, toZonedDayString } from './agent/dates';
import { doneByDay, lastDays } from './stats';
import type { Task } from '../store/useStore';

/** How far back the pace is measured: two weeks, as `projectHealth` does. */
export const PACE_DAYS = 14;
/** How many days of history the chart draws, today included. */
export const HISTORY_DAYS = 28;
/** Past this many days the forecast says "over a year" instead of a date. */
export const FORECAST_CAP_DAYS = 365;

const DAY = 86_400_000;

type Counted = Pick<Task, 'status' | 'completedAt'>;

export interface ForecastDay {
  /** `YYYY-MM-DD` in his zone. */
  day: string;
  /** Tasks done by the end of that day. */
  done: number;
}

export type ForecastState =
  /** Nothing in it. */
  | 'empty'
  /** Every task done. */
  | 'done'
  /** Nothing done in the last two weeks, so no pace to carry on at. */
  | 'no-pace'
  /** A pace, but more than `FORECAST_CAP_DAYS` to go at it. */
  | 'slow'
  | 'forecast';

export interface ProjectForecast {
  state: ForecastState;
  total: number;
  done: number;
  /** The last `HISTORY_DAYS` days, today last. */
  history: ForecastDay[];
  /** Tasks done per day over the last `PACE_DAYS`. */
  pace: number;
  /** The day the last task is done at that pace (`YYYY-MM-DD`); null unless `state` is 'forecast'. */
  finishDay: string | null;
  /** Whole days from today to `finishDay`; null with it. */
  daysLeft: number | null;
  /** The project's Finish by, when it has a valid one. */
  finishBy: string | null;
  /** `finishDay` minus `finishBy` in days: above 0 is late, 0 on the day, below early. */
  lateBy: number | null;
}

/** `YYYY-MM-DD` plus `n` calendar days. Arithmetic on a UTC midnight: no zone, no DST hour. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + n * DAY).toISOString().slice(0, 10);
}

/** Whole days from one `YYYY-MM-DD` to another. */
export function daysFrom(from: string, to: string): number {
  const at = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / DAY);
}

/** A `YYYY-MM-DD` that is a real date, or null. */
export function validDay(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d ? value : null;
}

export function projectForecast(
  tasks: readonly Counted[],
  now: Date,
  timeZone: string,
  finishByRaw?: string,
): ProjectForecast {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'completed').length;
  const finishBy = validDay(finishByRaw);

  /* Walk back from today: what was done by the end of each day is what is
     done now, less what was finished after it. */
  const counts = doneByDay(tasks, now, timeZone, HISTORY_DAYS);
  const history: ForecastDay[] = new Array(counts.length);
  let running = done;
  for (let i = counts.length - 1; i >= 0; i -= 1) {
    history[i] = { day: counts[i].day, done: running };
    running -= counts[i].count;
  }

  const pace = counts.slice(-PACE_DAYS).reduce((sum, d) => sum + d.count, 0) / PACE_DAYS;
  const base = { total, done, history, pace, finishBy, finishDay: null, daysLeft: null, lateBy: null };
  if (total === 0) return { ...base, state: 'empty' };
  if (done === total) return { ...base, state: 'done' };
  if (pace === 0) return { ...base, state: 'no-pace' };

  /* Today counts as a day of work, as a deadline's share does in
     `projectHealth`: one task left at one a day lands today. */
  const daysLeft = Math.max(0, Math.ceil((total - done) / pace) - 1);
  if (daysLeft > FORECAST_CAP_DAYS) return { ...base, state: 'slow' };
  const today = lastDays(now, timeZone, 1)[0];
  const finishDay = addDays(today, daysLeft);
  return {
    ...base,
    state: 'forecast',
    finishDay,
    daysLeft,
    lateBy: finishBy ? daysFrom(finishBy, finishDay) : null,
  };
}

/** How many tasks are done by `day` at the forecast's pace (a fraction; the chart draws it). */
export function forecastDoneBy(f: ProjectForecast, today: string, day: string): number {
  const ahead = daysFrom(today, day);
  if (ahead <= 0) {
    const h = f.history.find((x) => x.day === day);
    return h ? h.done : (f.history[0]?.done ?? f.done);
  }
  /* Today is the first day of work, as in `daysLeft`, so tomorrow is the
     second: on `finishDay` this reaches the total and not a day before. */
  return Math.min(f.total, f.done + f.pace * (ahead + 1));
}

const shortFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const yearFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });

/** "12 Nov", or "12 Nov 2027" when it is not this year. */
export function shortDay(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return (day.slice(0, 4) === today.slice(0, 4) ? shortFormat : yearFormat).format(at);
}

/** "Fri 24 Oct". */
export function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}

export type FinishTone = 'early' | 'on' | 'late' | 'plain';

/**
 * The words beside "40% done": when it lands, and against Finish by. Null
 * says nothing — an empty project, or one already done (the 100% says it).
 */
export function finishPhrase(f: ProjectForecast, today: string): { text: string; detail: string | null; tone: FinishTone } | null {
  if (f.state === 'empty' || f.state === 'done') return null;
  if (f.state === 'no-pace') return { text: 'No pace yet', detail: 'nothing done in two weeks', tone: f.finishBy ? 'late' : 'plain' };
  if (f.state === 'slow') return { text: 'Over a year', detail: 'at this pace', tone: f.finishBy ? 'late' : 'plain' };
  const text = `Done ${f.finishDay === today ? 'today' : shortDay(f.finishDay!, today)}`;
  if (f.lateBy === null) return { text, detail: null, tone: 'plain' };
  const n = Math.abs(f.lateBy);
  if (f.lateBy === 0) return { text, detail: 'on the day', tone: 'on' };
  return f.lateBy > 0
    ? { text, detail: `${n} day${n === 1 ? '' : 's'} late`, tone: 'late' }
    : { text, detail: `${n} day${n === 1 ? '' : 's'} early`, tone: 'early' };
}

// ─── Milestones (155) ────────────────────────────────────────────────────────

export type MilestoneState = 'done' | 'now' | 'ahead';

export interface Milestone<T> {
  task: T;
  state: MilestoneState;
  /** Its "Depends on", in the order he linked them; links to tasks that are gone are dropped. */
  waitsOn: T[];
  waitsDone: number;
}

type MilestoneTask = Pick<Task, 'id' | 'status' | 'deadline' | 'milestone' | 'dependsOn' | 'order' | 'createdAt'>;

/**
 * The project's milestones on its line, earliest first. Dated ones by date,
 * then undated ones in the order they sit in their lists — a milestone with
 * no date still belongs on the line, it just has nowhere better to be.
 */
export function projectMilestones<T extends MilestoneTask>(
  tasks: readonly T[],
  backlog: readonly T[],
  timeZone: string,
): Milestone<T>[] {
  const byId = new Map(backlog.map((t) => [t.id, t]));
  const ms = tasks
    .filter((t) => t.milestone)
    .map((t) => ({ t, at: parseStoredDate(t.deadline, timeZone)?.getTime() ?? Infinity }))
    .sort((a, b) => a.at - b.at || (a.t.order ?? 0) - (b.t.order ?? 0) || (a.t.createdAt ?? 0) - (b.t.createdAt ?? 0));
  let current = false;
  return ms.map(({ t }) => {
    const waitsOn = (t.dependsOn ?? []).map((id) => byId.get(id)).filter((x): x is T => x !== undefined);
    let state: MilestoneState = 'done';
    if (t.status !== 'completed') {
      state = current ? 'ahead' : 'now';
      current = true;
    }
    return { task: t, state, waitsOn, waitsDone: waitsOn.filter((w) => w.status === 'completed').length };
  });
}

/** The day a milestone's date falls on, in his zone, or null. */
export function milestoneDay(task: Pick<Task, 'deadline'>, timeZone: string): string | null {
  const at = parseStoredDate(task.deadline, timeZone);
  return at ? toZonedDayString(at, timeZone) : null;
}
