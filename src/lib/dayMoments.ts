/**
 * Moments on the Dashboard (29-1P14b, BIG-15) — what each one says, and when
 * it shows. Pure: the clock, the zone and the data are arguments, so every
 * rule here is tested (`dayMoments.test.ts`); the cards that draw them are
 * `components/dashboard/moments.tsx`.
 *
 * - **Idea 19, your day, recapped** (after Spotify Wrapped): one calm indigo
 *   card at night. His call (2026-10-15): it shows on **the first open after
 *   8pm**. It reads P14a's bests and perfect day from `stats.ts`.
 * - **Idea 110, welcome back, no guilt** (after Duolingo and Headspace): the
 *   first open after **three or more days away** says hello, what changed in
 *   one line, and offers one small task, before the Dashboard.
 * - **Idea 109, special days** (after Google Doodles): the greeting dresses up
 *   on his birthday (a date in Settings), Diwali (a fixed table to 2035),
 *   New Year (1 January only) and BASE's birthday (11 September).
 */
import { calendarDaysBetween, dayOf } from './stats';
import { zonedParts, parseStoredDate } from './agent/dates';
import type { FocusLogEntry, Task } from '../store/useStore';
import type { HandLogEntry, LiveStretch } from './dashboard/hours';
import type { WorkedJudge } from './workedTime';

// ─── Special days (idea 109) ────────────────────────────────────────────────

/**
 * Diwali's day, Lakshmi Puja, to 2035 — his call: a fixed table. 2026 to 2032
 * are Drik Panchang's; 2033 to 2035 follow the same rule, worked from the new
 * moon (the evening the Amavasya holds after sunset in India). Past 2035 the
 * greeting simply stops dressing up for Diwali until someone extends this.
 */
export const DIWALI: Readonly<Record<number, string>> = {
  2026: '2026-11-08',
  2027: '2027-10-29',
  2028: '2028-10-17',
  2029: '2029-11-05',
  2030: '2030-10-26',
  2031: '2031-11-14',
  2032: '2032-11-02',
  2033: '2033-10-22',
  2034: '2034-11-10',
  2035: '2035-10-30',
};

/** BASE's birthday, his call: 11 September 2026, the day it was named BASE. */
export const BASE_BORN = '2026-09-11';

export type SpecialDay =
  | { kind: 'birthday' }
  | { kind: 'diwali' }
  | { kind: 'new-year'; year: number }
  | { kind: 'base'; years: number };

/** A birthday as Settings keeps it: `MM-DD`, or null when it is not a date. */
export function cleanBirthday(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const date = Number(m[2]);
  /* 2024 is a leap year, so 29 February is a real birthday. */
  const probe = new Date(Date.UTC(2024, month - 1, date));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === date ? `${m[1]}-${m[2]}` : null;
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * What `day` (`YYYY-MM-DD`, his zone) is, if it is one of the four. When two
 * fall together his own birthday wins, then Diwali, then New Year, then
 * BASE's. A 29 February birthday is kept on 28 February in other years.
 */
export function specialDayOf(day: string, birthday: string | null): SpecialDay | null {
  const year = Number(day.slice(0, 4));
  const md = day.slice(5);
  if (birthday && (md === birthday || (birthday === '02-29' && md === '02-28' && !isLeap(year)))) {
    return { kind: 'birthday' };
  }
  if (DIWALI[year] === day) return { kind: 'diwali' };
  if (md === '01-01') return { kind: 'new-year', year };
  const years = year - Number(BASE_BORN.slice(0, 4));
  if (md === BASE_BORN.slice(5) && years >= 1) return { kind: 'base', years };
  return null;
}

const NUMBER_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "one", "two" … "ten", then digits. */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * The greeting on a special day: a small line above (in place of nothing)
 * and the big line itself. `name` may be empty; `tasksDone` is every task he
 * has ticked in BASE, for its birthday's thank-you.
 */
export function specialWords(special: SpecialDay, name: string | undefined, tasksDone: number): { kicker: string; line: string } {
  const you = name ? `, ${name}` : '';
  switch (special.kind) {
    case 'birthday':
      return { kicker: 'Your birthday', line: `Happy birthday${you}. Go easy today.` };
    case 'diwali':
      return { kicker: 'Diwali', line: `Happy Diwali${you}. The light is on.` };
    case 'new-year':
      return { kicker: `1 January ${special.year}`, line: `${special.year} starts today.` };
    case 'base': {
      const done = tasksDone > 0 ? ` ${tasksDone.toLocaleString('en-IN')} ${tasksDone === 1 ? 'task' : 'tasks'} done.` : '';
      const together = special.years === 1 ? 'A year' : `${countWord(special.years).replace(/^./, (c) => c.toUpperCase())} years`;
      return { kicker: `BASE turns ${countWord(special.years)}`, line: `${together} together.${done}` };
    }
  }
}

// ─── Your day, recapped (idea 19) ───────────────────────────────────────────

/** His call: the recap shows from 8pm. */
export const RECAP_FROM_HOUR = 20;

/** Whether it is recap time now, on his zone's clock (8pm to midnight). */
export function isRecapTime(now: Date, timeZone: string): boolean {
  return zonedParts(now, timeZone).hour >= RECAP_FROM_HOUR;
}

/** The night's one line, from what the day held. Never a scold. */
export function recapHeadline(d: { worked: number; available: number; done: number; perfect: boolean; newBests: number }): string {
  if (d.perfect) return 'A perfect day.';
  if (d.newBests > 0) return 'A record day.';
  if ((d.available > 0 && d.worked >= d.available / 2) || d.done >= 3) return 'A good day.';
  return 'A steady day.';
}

/**
 * The recap shows only when the day held something: no work and no ticks
 * makes no card, rather than a card that counts zeros at him.
 */
export function hasDayToRecap(worked: number, done: number): boolean {
  return worked > 0 || done > 0;
}

/** Where the recap's bar starts: 6am. Anything earlier is drawn from the edge. */
export const RECAP_BAR_FROM = 6 * 60;

/** One stretch of focus today, in minutes after midnight on his clock. */
export interface Span {
  from: number;
  to: number;
}

function minuteOfDay(at: number, timeZone: string): number {
  const p = zonedParts(new Date(at), timeZone);
  return p.hour * 60 + p.minute + p.second / 60;
}

/**
 * Today's counted focus stretches, for the recap's bar: the timer's, plus the
 * one running now. Time logged by hand has no clock time, so it counts in the
 * total but draws no stretch; a stretch on something that doesn't count as
 * worked draws none either, as the Hours block leaves it out of the total.
 * A stretch run across midnight is drawn to midnight.
 */
export function focusSpans(
  focusLog: readonly FocusLogEntry[],
  today: string,
  timeZone: string,
  judge: WorkedJudge,
  live?: LiveStretch | null,
): Span[] {
  const out: Span[] = [];
  const add = (taskId: string, listId: string | undefined, projectId: string | undefined, startedAt: number, seconds: number) => {
    if (seconds <= 0 || dayOf(startedAt, timeZone) !== today) return;
    if (judge.taskReason(taskId, listId, projectId)) return;
    const from = minuteOfDay(startedAt, timeZone);
    out.push({ from, to: Math.min(24 * 60, from + seconds / 60) });
  };
  for (const e of focusLog) add(e.taskId, e.listId, e.projectId, e.startedAt, e.seconds);
  if (live) add(live.taskId, live.listId, undefined, live.startedAt, Math.max(0, (live.now - live.startedAt) / 1000));
  return out.sort((a, b) => a.from - b.from);
}

// ─── Welcome back (idea 110) ────────────────────────────────────────────────

/** His call: three or more days away. */
export const AWAY_DAYS = 3;

type Active = Pick<Task, 'completedAt' | 'createdAt'>;

/**
 * The last sign of him anywhere in BASE — a task ticked or made, a stretch of
 * focus, time logged by hand — so a day on the tablet is not "away" when he
 * opens the laptop. Null when the store holds none.
 */
export function lastActivityAt(
  backlog: readonly Active[],
  focusLog: readonly Pick<FocusLogEntry, 'endedAt'>[],
  handLog: readonly Pick<HandLogEntry, 'at'>[],
): number | null {
  let last = -Infinity;
  for (const t of backlog) {
    if (typeof t.completedAt === 'number' && t.completedAt > last) last = t.completedAt;
    if (typeof t.createdAt === 'number' && t.createdAt > last) last = t.createdAt;
  }
  for (const e of focusLog) if (e.endedAt > last) last = e.endedAt;
  for (const e of handLog) if (e.at > last) last = e.at;
  return Number.isFinite(last) ? last : null;
}

/**
 * Whole calendar days away: from the later of this device's last visit and
 * the last sign of him in the data, to now. Null when neither is known — a
 * first-ever open is not a return.
 */
export function daysAway(lastHere: number | null, lastActive: number | null, now: Date, timeZone: string): number | null {
  const since = Math.max(lastHere ?? -Infinity, lastActive ?? -Infinity);
  if (!Number.isFinite(since)) return null;
  return calendarDaysBetween(new Date(since), now, timeZone);
}

type Due = Pick<Task, 'status' | 'parent' | 'deadline'>;

/** What changed while he was away, counted from the board. */
export interface AwayChanges {
  /** Open tasks whose deadline passed while he was away. */
  passed: number;
  /** Open tasks due later today. */
  dueToday: number;
  /** Open tasks due tomorrow. */
  dueTomorrow: number;
}

export function awayChanges(backlog: readonly Due[], awayFrom: number, now: Date, timeZone: string): AwayChanges {
  const out: AwayChanges = { passed: 0, dueToday: 0, dueTomorrow: 0 };
  for (const t of backlog) {
    if (t.parent || t.status === 'completed') continue;
    const at = parseStoredDate(t.deadline, timeZone);
    if (!at) continue;
    const ms = at.getTime();
    if (ms > awayFrom && ms <= now.getTime()) out.passed += 1;
    else if (ms > now.getTime()) {
      const ahead = calendarDaysBetween(now, at, timeZone);
      if (ahead === 0) out.dueToday += 1;
      else if (ahead === 1) out.dueTomorrow += 1;
    }
  }
  return out;
}

const plural = (n: number, one: string, many: string) => `${n === 1 ? 'one' : countWord(n)} ${n === 1 ? one : many}`;

/**
 * The welcome's words: hello with the count, what changed in one line, and
 * "nothing is on fire" only when that is true.
 */
export function welcomeWords(days: number, changes: AwayChanges): { title: string; changed: string } {
  const title = `Welcome back. It's been ${countWord(days)} days.`;
  const parts: string[] = [];
  if (changes.passed > 0) parts.push(`${plural(changes.passed, 'deadline', 'deadlines')} passed`);
  const soon = changes.dueToday > 0
    ? `${plural(changes.dueToday, 'is', 'are')} due today`
    : changes.dueTomorrow > 0 ? `${plural(changes.dueTomorrow, 'is', 'are')} due tomorrow` : '';
  if (soon) parts.push(soon);
  if (parts.length === 0) return { title, changed: 'Nothing moved while you were away. Nothing is on fire.' };
  const line = `While you were away, ${parts.join(' and ')}.`;
  return { title, changed: changes.dueToday > 0 ? line : `${line} Nothing is on fire.` };
}

/** Small enough to start again on: ten minutes, give or take. */
export const SMALL_TASK_MINUTES = 15;

/**
 * The one small task to offer: the best-ranked of the Dashboard's own
 * recommendations (the app's Score, never a second formula) that fits in a
 * quarter of an hour, else the best-ranked of all.
 */
export function smallestStart<T>(ranked: readonly T[], minutes: (task: T) => number): T | null {
  return ranked.find((t) => { const m = minutes(t); return m > 0 && m <= SMALL_TASK_MINUTES; }) ?? ranked[0] ?? null;
}
