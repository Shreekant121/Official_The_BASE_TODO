/**
 * The copies a repeating task spawns reach Google Calendar.
 *
 * There is no recurrence-aware code in the Calendar sync and there should not
 * be: `reconcileAllNotifications` walks the whole backlog on every write and
 * gives every eligible task an event under an id derived from the task's own,
 * so a successor is picked up because it is a backlog task with a deadline,
 * not because anything went looking for it. That is a good design and an easy
 * one to break from a distance — a spawn that put the successor somewhere
 * other than `backlogTasks`, or that dropped `reminderMinutes`, would take
 * the alert with it and nothing would say so.
 *
 * So these drive the real store, exactly as `recurrenceCompletion.test.ts`
 * does, and then ask `deadlineBlockFor` — the predicate the reconcile pass
 * itself uses — what it would do with what came out. What cannot be asserted
 * here is the network call; what can be, and is what actually breaks, is
 * whether the right rows are put in front of it.
 *
 * Item 3 split the one question this used to ask into two. **A block** is
 * drawn for every dated task, the finished predecessor included — that is the
 * calendar keeping a record of the afternoon's work. **A ping** is a separate
 * thing, and it is the ping that moves from the finished occurrence to the
 * copy. `deadlineReminder.test.ts` holds the rule itself; these hold what
 * recurrence hands it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type Task, type TaskList } from '../store/useStore';
import { resolveUserTimeZone, zonedTimeToInstant } from './agent/dates';
import { deadlineBlockFor, deadlineEventId } from './deadlineReminder';
import type { NotificationSettings } from './notifications';

const ZONE = resolveUserTimeZone();

/** The instant at which this machine's zone reads a `YYYY-MM-DDTHH:mm` wall clock. */
function at(wall: string): Date {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedTimeToInstant({ year, month, day, hour, minute, second: 0 }, ZONE);
}

const SETTINGS: NotificationSettings = { enabled: true, defaultDeadlineOffsetMinutes: 30 };
const LISTS: TaskList[] = [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 }];

function repeating(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Water the plants',
    status: 'needsAction',
    listId: 'l1',
    listName: 'Build',
    order: 0,
    deadline: '2026-03-10T12:00',
    recurrence: 'daily',
    reminderMinutes: 45,
    ...over,
  };
}

function seed(tasks: Task[]) {
  useStore.setState({
    projects: [],
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(tasks),
    tasks: [],
    focusLog: [],
  });
}

const backlog = () => useStore.getState().backlogTasks;
/** Every task the reconcile pass would draw a block for — finished ones included. */
const withBlocks = () => backlog().filter((t) => deadlineBlockFor(t, SETTINGS, ZONE).eligible);
/** Every task that would actually ping, which is the half a completed task gives up. */
const withPings = () => backlog().filter((t) => deadlineBlockFor(t, SETTINGS, ZONE).reminds);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at('2026-03-10T13:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a spawned copy and Google Calendar', () => {
  it('hands the ping over from the finished one to the copy', () => {
    seed([repeating()]);
    expect(withPings().map((t) => t.id)).toEqual(['t1']);

    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const [predecessor, clone] = backlog();
    expect(deadlineBlockFor(predecessor, SETTINGS, ZONE).reminds).toBe(false);
    expect(withPings().map((t) => t.id)).toEqual([clone.id]);
  });

  it('leaves the finished occurrence on the calendar, ticked', () => {
    // The record of what was actually done. Deleting it would make the work
    // vanish the moment the box is ticked, which is item 3's whole argument.
    seed([repeating()]);
    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const [predecessor, clone] = backlog();
    expect(withBlocks().map((t) => t.id)).toEqual(['t1', clone.id]);
    expect(deadlineBlockFor(predecessor, SETTINGS, ZONE).summary).toBe('✓ Deadline: Water the plants');
  });

  it('gives the copy its own event, not the finished one’s', () => {
    seed([repeating()]);
    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const clone = backlog()[1];
    expect(deadlineEventId(clone.id)).not.toBe(deadlineEventId('t1'));
    expect(deadlineEventId(clone.id)).toMatch(/^d1[a-v0-9]{5,}$/);
  });

  it('fires the copy’s alert at the copy’s deadline, keeping the task’s own offset', () => {
    seed([repeating()]);
    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const clone = backlog()[1];
    const block = deadlineBlockFor(clone, SETTINGS, ZONE);
    expect(clone.deadline).toBe('2026-03-11T12:00');
    expect(block.offsetMinutes).toBe(45);
    expect(block.deadlineMs).toBe(Date.parse('2026-03-11T12:00'));
  });

  it('leaves nothing pinging once the series has run out', () => {
    seed([
      repeating({
        recurrence: 'custom',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=1',
      }),
    ]);

    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    expect(backlog()).toHaveLength(1);
    expect(withPings()).toEqual([]);
    // The last occurrence still shows what was done on the day it was done.
    expect(withBlocks().map((t) => t.id)).toEqual(['t1']);
  });

  it('takes the copy’s ping back with the copy when the tick is undone', () => {
    seed([repeating()]);
    useStore.getState().updateBacklogTask('t1', { status: 'completed' });
    const cloneId = backlog()[1].id;

    useStore.getState().updateBacklogTask('t1', { status: 'needsAction' });

    expect(backlog().map((t) => t.id)).toEqual(['t1']);
    expect(withPings().map((t) => t.id)).toEqual(['t1']);
    expect(backlog().some((t) => t.id === cloneId)).toBe(false);
  });

  it('gives the last Friday of next month its own event, at its own deadline', () => {
    // The pattern that only became expressible when the rule became an RRULE.
    // Nothing in the Calendar sync knows about recurrence — the successor gets
    // its event because it is a backlog task with a deadline, and this is the
    // assertion that stays true only while that remains so.
    seed([
      repeating({
        deadline: '2026-03-27T12:00',
        seriesAnchor: '2026-03-27T12:00',
        recurrence: 'custom',
        recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR',
      }),
    ]);
    vi.setSystemTime(at('2026-03-27T13:00'));

    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const clone = backlog()[1];
    expect(withPings().map((t) => t.id)).toEqual([clone.id]);
    expect(deadlineBlockFor(clone, SETTINGS, ZONE).deadlineMs).toBe(Date.parse('2026-04-24T12:00'));
  });


  it('draws every future last Friday, and moves the series onto the copy', () => {
    // Item 4's "done when", end to end. The rule reaches Google on the event
    // of whichever occurrence is open, and exactly one is open at a time —
    // the finished one hands the series over as it hands over the ping, or
    // Google would be drawing two of them.
    seed([
      repeating({
        deadline: '2026-03-27T12:00',
        seriesAnchor: '2026-03-27T12:00',
        recurrence: 'custom',
        recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR',
      }),
    ]);
    vi.setSystemTime(at('2026-03-27T13:00'));
    expect(deadlineBlockFor(backlog()[0], SETTINGS, ZONE).recurrence)
      .toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');

    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    const [predecessor, clone] = backlog();
    expect(backlog()).toHaveLength(2);
    expect(deadlineBlockFor(predecessor, SETTINGS, ZONE).recurrence).toBeNull();
    expect(deadlineBlockFor(clone, SETTINGS, ZONE).recurrence)
      .toBe('RRULE:FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');
    // …expanded from the copy's own deadline, which is the next last Friday.
    expect(clone.deadline).toBe('2026-04-24T12:00');
  });

  it('shortens a counted series as it goes, so Google never draws past the end', () => {
    // The stored COUNT is measured from occurrence 1 and Google expands from
    // whichever occurrence the event carries, so the copy asks for two rather
    // than three — and the last one asks for no series at all.
    seed([repeating({ recurrence: 'custom', recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=3' })]);
    expect(deadlineBlockFor(backlog()[0], SETTINGS, ZONE).recurrence)
      .toBe('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=3');

    useStore.getState().updateBacklogTask('t1', { status: 'completed' });
    const second = backlog()[1];
    expect(deadlineBlockFor(second, SETTINGS, ZONE).recurrence)
      .toBe('RRULE:FREQ=DAILY;INTERVAL=1;COUNT=2');

    useStore.getState().updateBacklogTask(second.id, { status: 'completed' });
    const third = backlog()[2];
    expect(third.occurrence).toBe(3);
    expect(deadlineBlockFor(third, SETTINGS, ZONE).recurrence).toBeNull();
  });

  it('draws nothing for an undated repeat, which has no hour to draw in', () => {
    seed([repeating({ deadline: undefined })]);
    useStore.getState().updateBacklogTask('t1', { status: 'completed' });

    expect(backlog()).toHaveLength(2);
    expect(withBlocks()).toEqual([]);
    expect(withPings()).toEqual([]);
  });
});
