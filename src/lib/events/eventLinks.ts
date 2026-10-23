/**
 * A task due before an event (29-2d1, BIG-6) — pure: no React, no store, no
 * clock. `now` and the zone are arguments.
 *
 * HIS CALLS (2026-10-15, 2026-10-21)
 * -----------------------------------
 * - **A task linked to an event takes the event's date as its deadline and
 *   follows it**: move the marathon and "Buy running shoes" moves with it.
 * - **Due at the event's start; an all-day event, 6pm the day before** —
 *   BASE's usual task time (`DEFAULT_DEADLINE_HOUR`), so "before the trip on
 *   14 Feb" is due the evening of the 13th.
 * - **A passed date stays, overdue.** A task linked to a yearly birthday that
 *   was not done keeps the birthday that went by: nothing here moves a date
 *   because the clock moved. A date only follows when the EVENT's date is
 *   changed (`eventDatesChanged`), and then it takes the occurrence that is
 *   coming (or happening) at that moment.
 *
 * THE LINK IS ONE FIELD, `Task.eventId`
 * -------------------------------------
 * The task holds it (in `data/main`); the event holds nothing, so a task and
 * its event can never disagree about being linked. While linked, the date is
 * the event's and nobody else's: item 18's deadline maths reads a linked task
 * as fixed (`deadlineMath.ts`), and a deadline written by anything else
 * breaks the link (`applyTaskUpdate`) — a date he sets by hand wins.
 */
import { DEFAULT_DEADLINE_HOUR, toTaskDateString } from '../agent/dates';
import { addDays, eventMoment, type BaseEvent } from './events';

/** What this module reads off a task. */
export interface LinkedTask {
  id: string;
  status?: string;
  deadline?: string;
  eventId?: string;
}

const hour = String(DEFAULT_DEADLINE_HOUR).padStart(2, '0');

/**
 * The deadline a task linked to `event` takes at `now`: the start of the
 * occurrence that has not ended (a passed one-off's own start), or 6pm the day
 * before when the event is all day. `null` only when its dates cannot be read.
 */
export function linkedDeadline(event: BaseEvent, now: Date, timeZone: string): string | null {
  const moment = eventMoment(event, now, timeZone);
  if (!moment) return null;
  if (event.start.length === 10) return `${addDays(moment.day, -1)}T${hour}:00`;
  return toTaskDateString(moment.start, timeZone);
}

/** The tasks linked to `eventId`, finished ones included. */
export function tasksLinkedTo<T extends LinkedTask>(tasks: readonly T[], eventId: string): T[] {
  return tasks.filter((t) => t.eventId === eventId);
}

/** Whether a change to an event moved when it is — the only change a linked task follows. */
export function eventDatesChanged(
  before: Pick<BaseEvent, 'start' | 'end' | 'recurrence' | 'recurrenceRule'>,
  after: Pick<BaseEvent, 'start' | 'end' | 'recurrence' | 'recurrenceRule'>,
): boolean {
  return before.start !== after.start
    || before.end !== after.end
    || (before.recurrence ?? 'none') !== (after.recurrence ?? 'none')
    || before.recurrenceRule !== after.recurrenceRule;
}

/**
 * What following `event` changes: each open linked task whose deadline is not
 * the event's. A finished task keeps the date it was done against, as item
 * 18's maths leaves a completed task alone.
 */
export function followMoves(
  tasks: readonly LinkedTask[],
  event: BaseEvent,
  now: Date,
  timeZone: string,
): { taskId: string; deadline: string }[] {
  const deadline = linkedDeadline(event, now, timeZone);
  if (!deadline) return [];
  return tasksLinkedTo(tasks, event.id)
    .filter((t) => t.status !== 'completed' && t.deadline !== deadline)
    .map((t) => ({ taskId: t.id, deadline }));
}
