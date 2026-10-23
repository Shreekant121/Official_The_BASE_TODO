/**
 * Your month, wrapped (29-1P14e1, BIG-15, idea 107, after Spotify Wrapped):
 * last month's numbers, for the story the Dashboard plays from the 1st. Pure:
 * the clock, the zone and the data are arguments, so every count here is
 * tested (`monthWrapped.test.ts`); the story that draws them is
 * `components/dashboard/MonthWrapped.tsx`.
 *
 * His calls (2026-10-20): it is offered **from the 1st to the 7th, until he
 * has watched it**, so a skipped 1st does not lose it. 29-1P14e2 added the
 * task pushed most (`wrapPushed.ts`), the focus type (`wrapFocusType.ts`) and
 * **the year**: a period here is a month (`YYYY-MM`) or a year (`YYYY`), and
 * last year is offered on its own card from the 1st to the 7th of January,
 * beside December's (his call).
 *
 * Every number is one he already sees elsewhere, counted the same way:
 * - **Focused** is the Hours block's "worked" (`dashboard/hours.ts`'s
 *   `workByDay`): the timer plus time logged by hand, less what doesn't count.
 * - **Tasks done** is the Today block's tally: top-level tasks by
 *   `completedAt` (`stats.ts`'s `doneCountsByDay`).
 * - **When you focus** reads the timer's stretches only: time logged by hand
 *   has a day but no clock time, as on the night's recap.
 * - **A day in the run** is one with focus counted or a task done, as the
 *   bests count it.
 * History is what the store still holds: an archived or deleted task's tick
 * leaves the count with it.
 */
import { zonedParts } from './agent/dates';
import { dayOf, doneCountsByDay } from './stats';
import { workByDay, workedSeconds, weekdayOfDay, WEEKDAY_NAMES, type HandLogEntry } from './dashboard/hours';
import type { WorkedJudge } from './workedTime';
import { focusTypeOf, PHASE_COLOUR, type FocusType, type TypeStretch } from './wrapFocusType';
import { pushedMost, type PushedTask } from './wrapPushed';
import type { StoryEvent } from './taskStory';
import type { FocusLogEntry, Subtask, Task, TaskList } from '../store/useStore';

/** His call: offered from the 1st to the 7th. */
export const WRAP_OFFER_DAYS = 7;

/** How many projects the ranking shows. */
export const TOP_PROJECTS = 5;

/** Less timer time than this in a month says nothing about when he focuses. */
export const PRIME_MIN_SECONDS = 60 * 60;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

// ─── Months ─────────────────────────────────────────────────────────────────

/** `YYYY-MM` of a `YYYY-MM-DD`. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** The month before a `YYYY-MM`. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Every day of a `YYYY-MM`, in order, as `YYYY-MM-DD`. */
export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** "September". */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? '';
}

/**
 * The month to offer now, on his zone's calendar: last month, from the 1st to
 * the 7th (his call); null on any other day.
 */
export function wrapMonthAt(now: Date, timeZone: string): string | null {
  const p = zonedParts(now, timeZone);
  if (p.day > WRAP_OFFER_DAYS) return null;
  return previousMonth(`${p.year}-${String(p.month).padStart(2, '0')}`);
}

/** Last year, `YYYY`, from the 1st to the 7th of January (his call); null on any other day. */
export function wrapYearAt(now: Date, timeZone: string): string | null {
  const p = zonedParts(now, timeZone);
  if (p.month !== 1 || p.day > WRAP_OFFER_DAYS) return null;
  return String(p.year - 1);
}

// ─── Periods: a month or a year ─────────────────────────────────────────────

export type WrapKind = 'month' | 'year';

/** `YYYY` is a year, `YYYY-MM` a month. */
export function kindOf(period: string): WrapKind {
  return period.length === 4 ? 'year' : 'month';
}

/** The twelve `YYYY-MM` of a year. */
export function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/** Every day of a period, in order. */
export function daysOfPeriod(period: string): string[] {
  return kindOf(period) === 'year' ? monthsOfYear(period).flatMap(daysOfMonth) : daysOfMonth(period);
}

/** The period before: the month before, or the year before. */
export function previousPeriod(period: string): string {
  return kindOf(period) === 'year' ? String(Number(period) - 1) : previousMonth(period);
}

/** "September", or "2026". */
export function periodName(period: string): string {
  return kindOf(period) === 'year' ? period : monthName(period);
}

// ─── The wrap ───────────────────────────────────────────────────────────────

export interface WrapDay {
  day: string;
  seconds: number;
}

export interface WrapProject {
  id: string;
  name: string;
  seconds: number;
}

export interface WrapMonth {
  /** `YYYY-MM`. */
  month: string;
  seconds: number;
}

export interface MonthWrap {
  /** `YYYY-MM` for a month, `YYYY` for a year. */
  period: string;
  kind: WrapKind;
  /** "September", or "2026". */
  name: string;
  year: number;
  /** "August", or "2025". */
  previousName: string;
  /** Seconds focused, counted as the Hours block counts them. */
  focused: number;
  previousFocused: number;
  /** Every day of the month, with its seconds focused. */
  days: WrapDay[];
  /** The most-focused projects, most first, at most `TOP_PROJECTS`. */
  projects: WrapProject[];
  /** The timer's seconds in each clock hour, midnight first (24 entries). */
  hours: number[];
  /** The two hours he focuses most in, `from` to `to` (to = from + 2); null when the month is too thin to say. */
  prime: { from: number; to: number } | null;
  /** The most-focused day, the earliest of a tie; null with no focus. */
  best: WrapDay | null;
  /** Top-level tasks done in the period. */
  done: number;
  /** The longest run of days in a row inside the period. */
  run: number;
  /** A year's twelve months, each its seconds focused; empty for a month. */
  months: WrapMonth[];
  /** How he focused (`wrapFocusType.ts`); null when the timer says too little. */
  type: FocusType | null;
  /** The task pushed most (`wrapPushed.ts`); null with no stories or none pushed twice. */
  pushed: PushedTask | null;
}

export interface WrapInput {
  /** `YYYY-MM` for a month, `YYYY` for a year. */
  period: string;
  focusLog: readonly FocusLogEntry[];
  handLog: readonly HandLogEntry[];
  backlog: readonly Task[];
  lists: readonly TaskList[];
  projects: readonly { id: string; name: string }[];
  judge: WorkedJudge;
  timeZone: string;
  /** Each task's stored story, by task id; absent until read (none without an account). */
  stories?: ReadonlyMap<string, readonly StoryEvent[]>;
  /** Ignored work's task ids, left out of the pushed page (BIG-3). */
  ignored?: ReadonlySet<string>;
}

function indexSubtasks(projectId: string | undefined, subtasks: readonly Subtask[] | undefined, into: Map<string, string | undefined>): void {
  for (const s of subtasks ?? []) {
    into.set(s.id, projectId);
    indexSubtasks(projectId, s.subtasks, into);
  }
}

/**
 * Which project a stretch of work belongs to: the task's own place on the
 * board as it is now (a subtask answers as its task), else what the log
 * entry remembered when the task is gone.
 */
function projectFinder(backlog: readonly Task[], lists: readonly TaskList[]) {
  const listProject = new Map(lists.map((l) => [l.id, l.projectId]));
  const taskProject = new Map<string, string | undefined>();
  for (const t of backlog) {
    if (t.parent) continue;
    const projectId = t.listId ? listProject.get(t.listId) : undefined;
    taskProject.set(t.id, projectId);
    indexSubtasks(projectId, t.subtasks, taskProject);
  }
  return (taskId: string | undefined, listId: string | undefined, projectId: string | undefined): string | undefined => {
    if (taskId && taskProject.has(taskId)) return taskProject.get(taskId);
    return projectId ?? (listId ? listProject.get(listId) : undefined);
  };
}

function minuteOfDay(at: number, timeZone: string): number {
  const p = zonedParts(new Date(at), timeZone);
  return p.hour * 60 + p.minute + p.second / 60;
}

/** Spreads a stretch over the clock hours it ran through, across midnight too. */
function spreadOverHours(into: number[], startMinute: number, seconds: number): void {
  let minute = startMinute;
  let left = seconds;
  while (left > 0) {
    const hour = Math.floor(minute / 60) % 24;
    const take = Math.min(left, (60 - (minute % 60)) * 60);
    into[hour] += take;
    left -= take;
    minute += take / 60;
  }
}

/** The two clock hours together with the most focus in them, or null under `PRIME_MIN_SECONDS`. */
export function primeHours(hours: readonly number[]): { from: number; to: number } | null {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total < PRIME_MIN_SECONDS) return null;
  let from = 0;
  let most = -1;
  for (let h = 0; h < 23; h += 1) {
    const sum = hours[h] + hours[h + 1];
    if (sum > most) {
      most = sum;
      from = h;
    }
  }
  return { from, to: from + 2 };
}

/** The longest run of days in a row among `days` (in order) that pass `active`. */
function longestRun(days: readonly string[], active: (day: string) => boolean): number {
  let best = 0;
  let run = 0;
  for (const day of days) {
    run = active(day) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function buildMonthWrap(input: WrapInput): MonthWrap {
  const { period, focusLog, handLog, backlog, lists, judge, timeZone } = input;
  const kind = kindOf(period);
  const before = previousPeriod(period);
  const dayList = daysOfPeriod(period);
  const inMonth = new Set(dayList);

  const work = workByDay(dayList, focusLog, handLog, judge, timeZone);
  const days = work.map((d) => ({ day: d.day, seconds: workedSeconds(d) }));
  const focused = days.reduce((a, d) => a + d.seconds, 0);
  const previousFocused = workByDay(daysOfPeriod(before), focusLog, handLog, judge, timeZone)
    .reduce((a, d) => a + workedSeconds(d), 0);

  /* Projects and the clock: the same counted time, read stretch by stretch. */
  const projectOf = projectFinder(backlog, lists);
  const byProject = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);
  const timed: TypeStretch[] = [];
  for (const e of focusLog) {
    if (e.seconds <= 0 || !inMonth.has(dayOf(e.startedAt, timeZone))) continue;
    if (judge.taskReason(e.taskId, e.listId, e.projectId)) continue;
    const project = projectOf(e.taskId, e.listId, e.projectId);
    if (project) byProject.set(project, (byProject.get(project) ?? 0) + e.seconds);
    spreadOverHours(hours, minuteOfDay(e.startedAt, timeZone), e.seconds);
    timed.push(e);
  }
  for (const e of handLog) {
    if (e.seconds <= 0 || !inMonth.has(e.day)) continue;
    const reason = e.taskId ? judge.taskReason(e.taskId, undefined, e.projectId) : judge.projectReason(e.projectId);
    if (reason) continue;
    const project = e.taskId ? projectOf(e.taskId, undefined, e.projectId) : e.projectId;
    if (project) byProject.set(project, (byProject.get(project) ?? 0) + e.seconds);
  }
  const names = new Map(input.projects.map((p) => [p.id, p.name]));
  const projects = [...byProject]
    .filter(([id, seconds]) => names.has(id) && seconds > 0)
    .map(([id, seconds]) => ({ id, name: names.get(id)!, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))
    .slice(0, TOP_PROJECTS);

  let best: WrapDay | null = null;
  for (const d of days) if (d.seconds > 0 && (!best || d.seconds > best.seconds)) best = d;

  const doneByDay = doneCountsByDay(backlog, timeZone);
  const done = dayList.reduce((a, d) => a + (doneByDay.get(d) ?? 0), 0);
  const focusOn = new Map(days.map((d) => [d.day, d.seconds]));
  const run = longestRun(dayList, (d) => (focusOn.get(d) ?? 0) > 0 || (doneByDay.get(d) ?? 0) > 0);

  const months = kind === 'year'
    ? monthsOfYear(period).map((m) => ({ month: m, seconds: days.reduce((a, d) => a + (monthOf(d.day) === m ? d.seconds : 0), 0) }))
    : [];
  const prime = primeHours(hours);
  const pushed = input.stories
    ? pushedMost({ stories: input.stories, backlog, days: inMonth, focusLog, ignored: input.ignored ?? new Set(), timeZone })
    : null;

  return {
    period, kind, name: periodName(period), year: Number(period.slice(0, 4)), previousName: periodName(before),
    focused, previousFocused, days, projects, hours, prime, best, done, run,
    months, type: focusTypeOf(timed, prime, timeZone), pushed,
  };
}

/** A year's best month, the earliest of a tie; null with no focus. */
export function bestMonth(wrap: Pick<MonthWrap, 'months'>): WrapMonth | null {
  let best: WrapMonth | null = null;
  for (const m of wrap.months) if (m.seconds > 0 && (!best || m.seconds > best.seconds)) best = m;
  return best;
}

/** A month with no focus and no ticks is not played: a story of zeros is not a story. */
export function hasMonthToWrap(wrap: Pick<MonthWrap, 'focused' | 'done'>): boolean {
  return wrap.focused > 0 || wrap.done > 0;
}

export type WrapPage = 'cover' | 'hours' | 'projects' | 'when' | 'best' | 'months' | 'pushed' | 'type' | 'summary';

/**
 * The story's pages, in order: a page with nothing true to say is left out.
 * A month's best day is a calendar; a year's is its months, with the best day
 * said under them.
 */
export function wrapPages(wrap: Pick<MonthWrap, 'kind' | 'focused' | 'projects' | 'prime' | 'best' | 'pushed' | 'type'>): WrapPage[] {
  const pages: WrapPage[] = ['cover'];
  if (wrap.focused > 0) pages.push('hours');
  if (wrap.projects.length > 0) pages.push('projects');
  if (wrap.prime) pages.push('when');
  if (wrap.best) pages.push(wrap.kind === 'year' ? 'months' : 'best');
  if (wrap.pushed) pages.push('pushed');
  if (wrap.type) pages.push('type');
  pages.push('summary');
  return pages;
}

/** The share of the timer's time that fell in the prime hours, in whole percent. */
export function primeShare(hours: readonly number[], prime: { from: number; to: number }): number {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let inPrime = 0;
  for (let h = prime.from; h < prime.to; h += 1) inPrime += hours[h % 24];
  return Math.round((inPrime / total) * 100);
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** "9 am", "noon", "3 pm", "midnight". */
export function clockHour(h: number): string {
  const hour = ((h % 24) + 24) % 24;
  if (hour === 0) return 'midnight';
  if (hour === 12) return 'noon';
  return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

/** "9 to 11 am", "11 am to 1 pm", "10 am to noon". */
export function hoursWords(prime: { from: number; to: number }): string {
  const from = clockHour(prime.from);
  const to = clockHour(prime.to);
  const half = (s: string) => s.slice(-2);
  if (/ (am|pm)$/.test(from) && / (am|pm)$/.test(to) && half(from) === half(to)) return `${from.slice(0, -3)} to ${to}`;
  return `${from} to ${to}`;
}

/** "9–11 am": the prime hours, short, for the summary. */
export function hoursShort(prime: { from: number; to: number }): string {
  return hoursWords(prime).replace(' to ', '–');
}

const DAY_COUNT_WORDS: Record<number, string> = { 28: 'Twenty-eight', 29: 'Twenty-nine', 30: 'Thirty', 31: 'Thirty-one' };

/** The cover's line: "Thirty days, one story. Let's look back.", or a year's twelve months. */
export function coverWords(period: string): string {
  if (kindOf(period) === 'year') return "Twelve months, one story. Let's look back.";
  return `${DAY_COUNT_WORDS[daysOfMonth(period).length]} days, one story. Let's look back.`;
}

/** The big number on the hours page: whole hours, or minutes under one. */
export function focusFigure(seconds: number): { value: number; unit: string } {
  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600);
    return { value: hours, unit: hours === 1 ? 'hour' : 'hours' };
  }
  const minutes = Math.round(seconds / 60);
  return { value: minutes, unit: minutes === 1 ? 'minute' : 'minutes' };
}

/** "1st", "2nd", "15th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "Tuesday the 15th." */
export function bestDayWords(day: string): string {
  return `${WEEKDAY_NAMES[weekdayOfDay(day)]} the ${ordinal(Number(day.slice(8, 10)))}.`;
}

/** "Tuesday 15th", for the summary's narrow column; "15 March" in a year, where the weekday says less than the month. */
export function bestDayShort(day: string, kind: WrapKind = 'month'): string {
  if (kind === 'year') return `${Number(day.slice(8, 10))} ${monthName(monthOf(day))}`;
  return `${WEEKDAY_NAMES[weekdayOfDay(day)]} ${ordinal(Number(day.slice(8, 10)))}`;
}

/** "Tuesday 15 March": a year's best day, under its months. */
export function bestDayInYear(day: string): string {
  return `${WEEKDAY_NAMES[weekdayOfDay(day)]} ${Number(day.slice(8, 10))} ${monthName(monthOf(day))}`;
}

/**
 * The line under the hours: the minutes, then the month before. Never a
 * scold: a lighter month is said plainly, with no "only". Under an hour the
 * big number is already the minutes, so they are not said twice.
 */
export function hoursCompareWords(
  wrap: Pick<MonthWrap, 'focused' | 'previousFocused' | 'previousName'>,
  span: (seconds: number) => string,
): string {
  const minutes = wrap.focused >= 3600 ? `That's ${Math.round(wrap.focused / 60).toLocaleString('en-IN')} minutes.` : '';
  const diff = wrap.focused - wrap.previousFocused;
  let compare = '';
  if (wrap.previousFocused > 0) {
    if (Math.abs(diff) < 3600) compare = `About the same as ${wrap.previousName}.`;
    else compare = diff > 0
      ? `${span(diff)} more than ${wrap.previousName}.`
      : `${wrap.previousName} had ${span(-diff)} more. Some months are lighter.`;
  }
  return [minutes, compare].filter(Boolean).join(' ');
}

// ─── The summary ────────────────────────────────────────────────────────────

export interface WrapStat {
  label: string;
  value: string;
  /** A CSS colour, `var(--…)` allowed; none is the page's ink. */
  colour?: string;
  /** A big number. */
  big?: boolean;
  /** Across both columns. */
  wide?: boolean;
}

/**
 * The summary's numbers, in order: one list for the page and the picture
 * Share makes (29-1P14e2), so the two can never say different things.
 * `colours` is each ranked project's colour; `span` words a length.
 */
export function summaryStats(
  wrap: MonthWrap,
  colours: Readonly<Record<string, string>>,
  span: (seconds: number) => string,
): WrapStat[] {
  const [top] = wrap.projects;
  const stats: WrapStat[] = [
    { label: 'Focused', value: span(wrap.focused), colour: 'var(--job-teal)', big: true },
    { label: 'Tasks done', value: wrap.done.toLocaleString('en-IN'), colour: 'var(--job-lime)', big: true },
  ];
  if (top) stats.push({ label: 'Top project', value: top.name, colour: colours[top.id] });
  stats.push({ label: 'Longest run', value: `${wrap.run} ${wrap.run === 1 ? 'day' : 'days'} in a row` });
  if (wrap.prime) stats.push({ label: 'Sharpest', value: hoursShort(wrap.prime) });
  if (wrap.kind === 'year') {
    const month = bestMonth(wrap);
    if (month) stats.push({ label: 'Best month', value: monthName(month.month) });
  } else if (wrap.best) {
    stats.push({ label: 'Best day', value: bestDayShort(wrap.best.day) });
  }
  if (wrap.type) stats.push({ label: 'Focus type', value: wrap.type.name.replace(/^The /, ''), colour: PHASE_COLOUR[wrap.type.phase], wide: true });
  return stats;
}
