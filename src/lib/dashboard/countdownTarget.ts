/**
 * What a Countdown widget counts to (29-2d2, BIG-6) — pure: no React, no
 * store, no clock. `now` and the zone are arguments.
 *
 * HIS CALLS (2026-10-21)
 * ----------------------
 * - **The date tracker lives inside the Countdown widget**, no new widget: its
 *   ⚙ "Counts down to" offers an event (29-2a), **a task** (to its deadline),
 *   or **just a date** he picks, **with a name he types** ("Exams"; no name
 *   and the widget shows the date).
 * - **A switch shows what is due before it** underneath, in place of the next
 *   events: **every open task due before that moment, overdue ones too**, the
 *   ones tied to it first — an event's linked tasks (`tasksLinkedTo`, 29-2d1),
 *   or what a task waits on (`dependsOn`). A tap opens the task.
 *
 * ONE SHAPE FOR ALL THREE
 * -----------------------
 * A task and a date are handed to the widget as a `BaseEvent` made on the spot
 * (`taskAsEvent`, `dateAsEvent`) and never stored, so the five faces, the
 * reading, the Journey line and "when" all work on them unchanged. The task's
 * own words are two more: **Done** once it is ticked, **Overdue** once its
 * deadline has gone by open (`targetReading`). Everything lives on the block's
 * settings (`BlockSettings`, the Dashboard document), never `data/main`.
 *
 * Which one: a `taskId` wins, then a `date`, then the event (`eventId`, or the
 * soonest coming one). A task gone (deleted, archived) or without a deadline
 * counts to the soonest event again, as a deleted event does.
 */
import { parseStoredDate, toTaskDateString } from '../agent/dates';
import {
  countdownReading, describeWhen, eventMoment, isAllDay, isEventDate, upcomingEvents,
  type BaseEvent, type CountdownReading, type EventMoment,
} from '../events/events';
import { tasksLinkedTo } from '../events/eventLinks';
import type { BlockSettings } from './layout';

export type CountdownTargetKind = 'event' | 'task' | 'date';

/** What this module reads off a task. */
export interface TargetTask {
  id: string;
  title: string;
  status?: string;
  deadline?: string;
  createdAt?: number;
  imageUrl?: string;
  dependsOn?: string[];
  eventId?: string;
  /** A subtask's parent: subtasks are not listed, as on every Dashboard block. */
  parent?: unknown;
}

/** The kind the ⚙ shows as chosen. */
export function countdownKind(settings: BlockSettings | undefined): CountdownTargetKind {
  if (settings?.taskId) return 'task';
  if (settings?.date) return 'date';
  return 'event';
}

/** Ids of the made-up events, so the widget never mistakes one for a stored event. */
export const TASK_EVENT_PREFIX = 'task:';
export const DATE_EVENT_ID = 'date';

/** A task's deadline as an event's start, or `null` when it has none that reads. */
function deadlineStart(deadline: string | undefined, timeZone: string): string | null {
  if (isEventDate(deadline)) return deadline;
  const at = parseStoredDate(deadline, timeZone);
  return at ? toTaskDateString(at, timeZone) : null;
}

/** A task as an event at its deadline, sky (dates' colour). `null` with no deadline. */
export function taskAsEvent(task: TargetTask, now: Date, timeZone: string): BaseEvent | null {
  const start = deadlineStart(task.deadline, timeZone);
  if (!start) return null;
  return {
    id: `${TASK_EVENT_PREFIX}${task.id}`,
    title: task.title,
    start,
    colour: 'sky',
    ...(task.imageUrl ? { imageUrl: task.imageUrl } : {}),
    createdAt: Math.min(task.createdAt ?? now.getTime(), now.getTime()),
  };
}

/**
 * The date he picked as an all-day event, named what he typed — or, with no
 * name, the date itself ("Fri 14 Nov"). `since` is when he picked it, where the
 * Journey line starts. `null` for a date that does not read.
 */
export function dateAsEvent(
  date: string | undefined,
  name: string | undefined,
  since: number | undefined,
  now: Date,
  timeZone: string,
): BaseEvent | null {
  if (!date || date.length !== 10 || !isEventDate(date)) return null;
  const event: BaseEvent = { id: DATE_EVENT_ID, title: '', start: date, colour: 'sky', createdAt: Math.min(since ?? now.getTime(), now.getTime()) };
  const moment = eventMoment(event, now, timeZone);
  const title = name?.trim() || (moment ? describeWhen(moment, true, now, timeZone) : date);
  return { ...event, title };
}

export interface CountdownTarget<T extends TargetTask = TargetTask> {
  kind: CountdownTargetKind;
  event: BaseEvent;
  moment: EventMoment;
  /** The task, when it counts to one. */
  task?: T;
}

/**
 * What the widget counts to at `now`: the picked task, the picked date, the
 * picked event wherever it stands, or the soonest coming event. `null` when
 * there is nothing at all.
 */
export function resolveCountdownTarget<T extends TargetTask>(
  settings: BlockSettings | undefined,
  events: readonly BaseEvent[],
  tasks: readonly T[],
  now: Date,
  timeZone: string,
): CountdownTarget<T> | null {
  const withMoment = (kind: CountdownTargetKind, event: BaseEvent | null | undefined, task?: T): CountdownTarget<T> | null => {
    if (!event) return null;
    const moment = eventMoment(event, now, timeZone);
    return moment ? { kind, event, moment, ...(task ? { task } : {}) } : null;
  };

  if (settings?.taskId) {
    const task = tasks.find((t) => t.id === settings.taskId);
    const made = task ? withMoment('task', taskAsEvent(task, now, timeZone), task) : null;
    if (made) return made;
  } else if (settings?.date) {
    const made = withMoment('date', dateAsEvent(settings.date, settings.dateName, settings.dateSince, now, timeZone));
    if (made) return made;
  } else if (settings?.eventId) {
    const made = withMoment('event', events.find((e) => e.id === settings.eventId));
    if (made) return made;
  }
  const soonest = upcomingEvents(events, now, timeZone)[0];
  return soonest ? { kind: 'event', event: soonest.event, moment: soonest.moment } : null;
}

/**
 * What the widget says: the event's own count — or, for a task, Done once it
 * is ticked and Overdue once its deadline has passed with it open (never
 * "Now", which is an event's while it runs).
 */
export function targetReading(target: CountdownTarget, now: Date, timeZone: string): CountdownReading {
  if (target.kind === 'task') {
    if (target.task?.status === 'completed') return { kind: 'word', word: 'Done' };
    if (target.moment.start.getTime() <= now.getTime()) return { kind: 'word', word: 'Overdue' };
  }
  return countdownReading(target.moment, now, target.event.countdown, isAllDay(target.event), timeZone);
}

/** One row of "what is due before it". */
export interface DueBeforeRow<T extends TargetTask = TargetTask> {
  task: T;
  /** An event's linked task, or one the task waits on: listed first. */
  tied: boolean;
  /** Its deadline has gone by. */
  overdue: boolean;
}

/**
 * Every open task due before the target, overdue ones included (his call),
 * the tied ones first, each part soonest first. "Before" is the moment the
 * count runs to: an event's (or a date's) start — midnight of an all-day one —
 * or a task's deadline. A tied task is listed whatever its date: an event's
 * linked task is due at its start, not before it, and a prerequisite may have
 * no date at all. Subtasks, finished work, ignored work and the target task
 * itself are left out.
 */
export function dueBefore<T extends TargetTask>(
  tasks: readonly T[],
  target: CountdownTarget,
  now: Date,
  timeZone: string,
  ignored: ReadonlySet<string>,
): DueBeforeRow<T>[] {
  const cutoff = target.moment.start.getTime();
  const counts = (t: T) => !t.parent && t.status !== 'completed' && !ignored.has(t.id) && t.id !== target.task?.id;

  let tied: T[] = [];
  if (target.kind === 'event') tied = tasksLinkedTo(tasks, target.event.id);
  else if (target.kind === 'task' && target.task?.dependsOn?.length) {
    const waits = new Set(target.task.dependsOn);
    tied = tasks.filter((t) => waits.has(t.id));
  }
  tied = tied.filter(counts);
  const tiedIds = new Set(tied.map((t) => t.id));

  const due = (t: T) => parseStoredDate(t.deadline, timeZone)?.getTime() ?? Infinity;
  const bySoonest = (a: T, b: T) => due(a) - due(b) || a.title.localeCompare(b.title);
  const rest = tasks.filter((t) => counts(t) && !tiedIds.has(t.id) && due(t) < cutoff);

  const row = (task: T, isTied: boolean): DueBeforeRow<T> => ({ task, tied: isTied, overdue: due(task) <= now.getTime() });
  return [...[...tied].sort(bySoonest).map((t) => row(t, true)), ...rest.sort(bySoonest).map((t) => row(t, false))];
}
