/**
 * Hours worked against hours available (BIG-6, 29-1b) — pure: the logs, the
 * settings, the clock and the time zone are arguments.
 *
 * HIS CALLS, 2026-09-30
 * ---------------------
 * - **Available = a weekly default per weekday, plus a one-tap override for
 *   today** (until 29-5 reads his calendar). **12 hours on weekdays, 6 at the
 *   weekend** to start with.
 * - **It is ONE number with the work session** — Set Deadlines' and New
 *   Session's `sessionDuration`. `lib/dashboard/todayHours.ts` keeps the two in
 *   step; this file only answers what today's number is.
 * - **Worked = the focus timer's `focusLog` plus time logged by hand**, against
 *   a task, a project, or just a note. Hand-logged time counts on the
 *   Dashboard only — a task's own "time taken" (its card, a client's share
 *   link) stays timer-only, so it lives here and never in `focusLog`.
 * - **Time on something that doesn't count as worked is shown greyed**,
 *   outside the totals (`lib/workedTime.ts` decides which).
 *
 * A day is a `YYYY-MM-DD` string on his time zone's calendar. A stretch of
 * focus belongs to the day it started on: a session run across midnight is
 * the evening's work, which is how he would say it.
 */
import { dayOf } from '../stats';
import type { FocusLogEntry } from '../../store/useStore';
import type { WorkedJudge } from '../workedTime';

const HOUR = 3600;

/** Sunday first, as `Date.getDay()` counts. His numbers, 2026-09-30. */
export const DEFAULT_WEEKLY: readonly number[] = [6 * HOUR, 12 * HOUR, 12 * HOUR, 12 * HOUR, 12 * HOUR, 12 * HOUR, 6 * HOUR];

/** Longest day anyone can set: the whole of it. */
export const MAX_DAY_SECONDS = 24 * HOUR;

/** How long an override is kept, so a past day's bar is drawn against what he really had. */
const OVERRIDE_DAYS_KEPT = 21;

export interface HoursSettings {
  /** Seconds available on each weekday, Sunday first. */
  weekly: number[];
  /** A day's override, by `YYYY-MM-DD`. Today's is the one-tap override; older ones are history. */
  overrides: Record<string, number>;
}

export function defaultHours(): HoursSettings {
  return { weekly: [...DEFAULT_WEEKLY], overrides: {} };
}

/** Anything from the cloud or an old device, made safe to read. */
export function sanitizeHours(raw: unknown): HoursSettings {
  const h = (raw ?? {}) as Partial<HoursSettings>;
  const weekly = Array.isArray(h.weekly) && h.weekly.length === 7 && h.weekly.every((n) => Number.isFinite(n))
    ? h.weekly.map(clampDay)
    : [...DEFAULT_WEEKLY];
  const overrides: Record<string, number> = {};
  if (h.overrides && typeof h.overrides === 'object') {
    for (const [day, n] of Object.entries(h.overrides)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(n)) overrides[day] = clampDay(n);
    }
  }
  return { weekly, overrides };
}

export function clampDay(seconds: number): number {
  return Math.max(0, Math.min(MAX_DAY_SECONDS, Math.round(seconds)));
}

// ─── Days ───────────────────────────────────────────────────────────────────

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` day. */
export function weekdayOfDay(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** `day` moved by `n` calendar days. Noon UTC, so no zone or DST can tip it. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The seven days of `day`'s week, Monday first — an Indian calendar week. */
export function weekOf(day: string): string[] {
  const back = (weekdayOfDay(day) + 6) % 7;
  const monday = addDays(day, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

// ─── Available ──────────────────────────────────────────────────────────────

/** Seconds available on `day`: its override, else its weekday's default. */
export function availableOn(settings: HoursSettings, day: string): number {
  const o = settings.overrides[day];
  return o !== undefined ? o : settings.weekly[weekdayOfDay(day)] ?? 0;
}

/** Overrides older than three weeks go; nothing draws them any more. */
export function pruneOverrides(overrides: Record<string, number>, today: string): Record<string, number> {
  const oldest = addDays(today, -OVERRIDE_DAYS_KEPT);
  const out: Record<string, number> = {};
  for (const [day, n] of Object.entries(overrides)) if (day >= oldest) out[day] = n;
  return out;
}

// ─── Worked ─────────────────────────────────────────────────────────────────

/** Time he logged by hand: a task, a project, or just a note ("calls"). */
export interface HandLogEntry {
  id: string;
  /** The day it was worked, `YYYY-MM-DD`. */
  day: string;
  seconds: number;
  taskId?: string;
  projectId?: string;
  /** What he typed, or the task's or project's name when it was logged. */
  label: string;
  /** When it was logged, epoch ms. */
  at: number;
}

/** The focus run's open stretch, not yet in `focusLog`. */
export interface LiveStretch {
  taskId: string;
  listId?: string;
  startedAt: number;
  now: number;
}

export interface DayWork {
  day: string;
  /** Counted seconds from the focus timer. */
  timer: number;
  /** Counted seconds logged by hand. */
  hand: number;
  /** Seconds on something that doesn't count as worked — greyed, outside the total. */
  notCounted: number;
}

export const workedSeconds = (d: DayWork) => d.timer + d.hand;

export function workByDay(
  days: readonly string[],
  focusLog: readonly FocusLogEntry[],
  handLog: readonly HandLogEntry[],
  judge: WorkedJudge,
  timeZone: string,
  live?: LiveStretch | null,
): DayWork[] {
  const byDay = new Map(days.map((day) => [day, { day, timer: 0, hand: 0, notCounted: 0 }]));

  const addFocus = (taskId: string, listId: string | undefined, projectId: string | undefined, startedAt: number, seconds: number) => {
    const row = byDay.get(dayOf(startedAt, timeZone));
    if (!row || seconds <= 0) return;
    if (judge.taskReason(taskId, listId, projectId)) row.notCounted += seconds;
    else row.timer += seconds;
  };

  for (const e of focusLog) addFocus(e.taskId, e.listId, e.projectId, e.startedAt, e.seconds);
  if (live) addFocus(live.taskId, live.listId, undefined, live.startedAt, Math.max(0, Math.round((live.now - live.startedAt) / 1000)));

  for (const e of handLog) {
    const row = byDay.get(e.day);
    if (!row || e.seconds <= 0) continue;
    const reason = e.taskId ? judge.taskReason(e.taskId, undefined, e.projectId) : judge.projectReason(e.projectId);
    if (reason) row.notCounted += e.seconds;
    else row.hand += e.seconds;
  }
  return days.map((day) => byDay.get(day)!);
}

// ─── Smart Start ────────────────────────────────────────────────────────────

/**
 * What Smart Start's hours box opens at: the hours left today, to the quarter
 * hour. Half an hour at the least, so a day already spent still builds a queue
 * rather than an error — he can type more.
 */
export function smartStartHours(leftSeconds: number): string {
  const quarters = Math.round(Math.max(0, leftSeconds) / 900);
  const hours = Math.max(0.5, quarters / 4);
  return String(hours);
}
