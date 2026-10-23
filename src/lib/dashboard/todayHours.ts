/**
 * Today's hours are ONE number (BIG-6, 29-1b) — his call, 2026-09-30: "hours
 * available today" on the Dashboard, the work session on Set Deadlines and New
 * Session (`sessionDuration`), and what Smart Start's hours box opens at are
 * the same thing.
 *
 * HOW IT STAYS ONE
 * ----------------
 * The Dashboard's settings (`useDashboardStore().hours`: a default per weekday
 * and a per-day override) are the source; **`sessionDuration` is a mirror of
 * today's answer**, kept in step by `useTodayHoursMirror`, mounted once in
 * `App.tsx`. It re-checks whenever either store changes, once a minute (the
 * day rolls over at midnight to that weekday's default), and when the tab
 * comes back into view.
 *
 * So there is exactly one way to change today's number, `setHoursToday`, and
 * every screen that edits it calls that. A one-way mirror is also what makes
 * it safe against the cloud: yesterday's `sessionDuration` arriving late in a
 * `data/main` snapshot is simply put back, never mistaken for a new choice.
 *
 * Smart Start's box opens at the hours LEFT today (`secondsLeftToday`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useFocusRun } from '../../store/useFocusRun';
import { resolveUserTimeZone, toZonedDayString } from '../agent/dates';
import { workedJudgeOf } from '../workedTime';
import { availableOn, clampDay, workByDay, workedSeconds, type DayWork, type LiveStretch } from './hours';
import { dayOf, doneCountsByDay, personalBests, type Bests } from '../stats';

export function todayOn(timeZone: string, now: number = Date.now()): string {
  return toZonedDayString(new Date(now), timeZone);
}

/** Puts `sessionDuration` back to today's answer, if it has drifted. */
function mirror(): void {
  const want = availableOn(useDashboardStore.getState().hours, todayOn(resolveUserTimeZone()));
  const app = useStore.getState();
  if (app.sessionDuration !== want) app.setSessionDuration(want);
}

/** Today's hours, from anywhere: the Dashboard, Set Deadlines, New Session. */
export function setHoursToday(seconds: number): void {
  useDashboardStore.getState().setOverride(todayOn(resolveUserTimeZone()), clampDay(seconds));
  mirror();
}

/** Back to today's weekday default. */
export function resetHoursToday(): void {
  useDashboardStore.getState().setOverride(todayOn(resolveUserTimeZone()), null);
  mirror();
}

export function useTodayHoursMirror(): void {
  useEffect(() => {
    mirror();
    const offDash = useDashboardStore.subscribe(mirror);
    const offApp = useStore.subscribe((s, prev) => { if (s.sessionDuration !== prev.sessionDuration) mirror(); });
    const timer = setInterval(mirror, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') mirror(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offDash();
      offApp();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

function liveStretch(now: number): LiveStretch | null {
  const run = useFocusRun.getState();
  return run.task && run.segmentStartedAt !== null
    ? { taskId: run.task.id, listId: run.task.listId, startedAt: run.segmentStartedAt, now }
    : null;
}

/** Seconds of today still unworked — what Smart Start's box opens at. Read once, not live. */
export function secondsLeftToday(now: number = Date.now()): number {
  const tz = resolveUserTimeZone();
  const today = todayOn(tz, now);
  const app = useStore.getState();
  const dash = useDashboardStore.getState();
  const judge = workedJudgeOf(app.backlogTasks, app.taskLists, app.projects);
  const [work] = workByDay([today], app.focusLog, dash.timeLog, judge, tz, liveStretch(now));
  return Math.max(0, availableOn(dash.hours, today) - workedSeconds(work));
}

/**
 * The clock, re-read on the minute: a running focus stretch counts up with it
 * and the day rolls over at midnight. One render a minute, no animation —
 * Performance rule 1 is about frames, and a kept screen's effects stop while
 * it is hidden. A pause needs no tick: it banks the stretch into `focusLog`,
 * which re-renders on its own.
 */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, 60_000 - (t % 60_000));
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
    return () => clearTimeout(timer);
  }, []);
  return now;
}

export interface WorkDays {
  today: string;
  /** The day asked about: today, or the one picked on the week strip. */
  day: string;
  timeZone: string;
  days: DayWork[];
  /** Seconds available on each of `days`. */
  available: number[];
}

/** What both hooks below read: the clock on the minute, the logs and the board. */
function useWorkInputs() {
  const timeZone = useMemo(() => resolveUserTimeZone(), []);
  const now = useMinute();
  const focusLog = useStore((s) => s.focusLog);
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const timeLog = useDashboardStore((s) => s.timeLog);
  const hours = useDashboardStore((s) => s.hours);
  const runTask = useFocusRun((s) => s.task);
  const segmentStartedAt = useFocusRun((s) => s.segmentStartedAt);
  return {
    timeZone, now, focusLog, backlog, lists, projects, timeLog, hours, runTask, segmentStartedAt,
    today: todayOn(timeZone, now),
  };
}

type WorkInputs = ReturnType<typeof useWorkInputs>;

function liveOf(i: WorkInputs): LiveStretch | null {
  return i.runTask && i.segmentStartedAt !== null
    ? { taskId: i.runTask.id, listId: i.runTask.listId, startedAt: i.segmentStartedAt, now: i.now }
    : null;
}

/**
 * Work and hours for `pick(day)` — a day alone, or its week. `day` is today,
 * or the day picked on the Dashboard's week strip (29-1c3) when one is given.
 */
export function useWorkDays(pick: (day: string) => string[], picked: string | null = null): WorkDays {
  const i = useWorkInputs();
  const { today, timeZone, now, focusLog, timeLog, hours, backlog, lists, projects, runTask, segmentStartedAt } = i;
  const day = picked ?? today;

  return useMemo(() => {
    const dayList = pick(day);
    const judge = workedJudgeOf(backlog, lists, projects);
    return {
      today,
      day,
      timeZone,
      days: workByDay(dayList, focusLog, timeLog, judge, timeZone, liveOf(i)),
      available: dayList.map((d) => availableOn(hours, d)),
    };
    // `pick` is a module-level function at every call site; `i` is read for the live stretch only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, day, timeZone, now, focusLog, timeLog, hours, backlog, lists, projects, runTask, segmentStartedAt]);
}

/**
 * His three bests as of now (29-1P14a, idea 108; the rules are `stats.ts`'s
 * `personalBests`): focus is the Hours block's worked seconds, the running
 * stretch included, and tasks the Today block's tally — over every day the
 * logs still hold. Days come from `dayOf`, remembered per instant, so a
 * minute's re-count is a walk over the logs, not 5,000 zone lookups.
 */
export function useBests(): Bests {
  const i = useWorkInputs();
  const { today, timeZone, now, focusLog, timeLog, backlog, lists, projects, runTask, segmentStartedAt } = i;

  return useMemo(() => {
    const days = new Set<string>([today]);
    for (const e of focusLog) days.add(dayOf(e.startedAt, timeZone));
    for (const e of timeLog) days.add(e.day);
    const dayList = [...days];
    const judge = workedJudgeOf(backlog, lists, projects);
    const work = workByDay(dayList, focusLog, timeLog, judge, timeZone, liveOf(i));
    const focus = new Map(work.map((d) => [d.day, workedSeconds(d)]));
    return personalBests(focus, doneCountsByDay(backlog, timeZone), today);
    // `i` is read for the live stretch only, whose parts are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, timeZone, now, focusLog, timeLog, backlog, lists, projects, runTask, segmentStartedAt]);
}
