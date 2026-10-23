/**
 * Completing a repeating task, through the real store.
 *
 * `recurrence.test.ts` already pins the arithmetic. What is left to prove is
 * the wiring, and the failure it guards against is not a wrong date — it is a
 * screen that forgets to ask. So these go through `useStore.updateBacklogTask`,
 * the single point every one of the four completion paths reaches (Focus Mode's
 * Done button, the status pills on the task card and on the needs-attention
 * page, the outsourced-work approval, and the agent's `complete_task`), rather
 * than calling the planner directly. A fifth path added later inherits all of
 * this for free; one that bypasses the store does not, and should not.
 *
 * Dates are written as wall clocks and converted with the same zone the store
 * will use, so the suite asserts exact values without caring which zone the
 * machine running it is in. Everything is set in mid-March at noon, well clear
 * of any daylight-saving boundary in any zone — the clock-change cases belong
 * to the engine's own suite, not to this one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { upgradeTaskRecurrence, useStore, type Task, type TaskList } from '../store/useStore';
import { resolveUserTimeZone, zonedTimeToInstant } from './agent/dates';

const ZONE = resolveUserTimeZone();

/** The instant at which this machine's zone reads a `YYYY-MM-DDTHH:mm` wall clock. */
function at(wall: string): Date {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedTimeToInstant({ year, month, day, hour, minute, second: 0 }, ZONE);
}

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
    estimatedTime: 15,
    subtasks: [{ id: 's1', title: 'Fill the can', status: 'needsAction' }],
    ...over,
  };
}

function seed(tasks: Task[], queue: Task[] = []) {
  useStore.setState({
    projects: [],
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(tasks),
    tasks: structuredClone(queue),
    focusLog: [],
  });
}

const backlog = () => useStore.getState().backlogTasks;
const setStatus = (id: string, status: Task['status']) =>
  useStore.getState().updateBacklogTask(id, { status });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at('2026-03-10T09:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Completing ──────────────────────────────────────────────────────────────

describe('completing a repeating task', () => {
  it('keeps the finished one and puts the next one right behind it', () => {
    seed([repeating(), { id: 't2', title: 'Something else', status: 'needsAction', listId: 'l1', order: 1 }]);

    setStatus('t1', 'completed');

    const [done, next, other] = backlog();
    expect(done.id).toBe('t1');
    expect(done.status).toBe('completed');
    expect(next.deadline).toBe('2026-03-11T12:00');
    expect(next.status).toBe('needsAction');
    // Directly behind its predecessor, not at the top of the list and not at
    // the end of it — where the finished copy was is where the new one goes.
    expect(other.id).toBe('t2');
  });

  it('ties the two rows into one series', () => {
    seed([repeating()]);

    setStatus('t1', 'completed');

    const [done, next] = backlog();
    expect(done.seriesId).toBeTruthy();
    expect(done.occurrence).toBe(1);
    expect(done.seriesAnchor).toBe('2026-03-10T12:00');
    expect(next.seriesId).toBe(done.seriesId);
    expect(next.occurrence).toBe(2);
    expect(next.seriesAnchor).toBe('2026-03-10T12:00');
    expect(next.id).not.toBe(done.id);
  });

  it('stamps when it was finished, even though the status pills never say', () => {
    seed([repeating()]);

    setStatus('t1', 'completed');

    expect(backlog()[0].completedAt).toBe(at('2026-03-10T09:00').getTime());
  });

  it('carries the work over and leaves the doing behind', () => {
    seed([repeating({ description: 'Rainwater only' })]);

    setStatus('t1', 'completed');

    const next = backlog()[1];
    expect(next.title).toBe('Water the plants');
    expect(next.description).toBe('Rainwater only');
    expect(next.listId).toBe('l1');
    expect(next.estimatedTime).toBe(15);
    expect(next.completedAt).toBeUndefined();
    expect(next.subtasks?.[0].status).toBe('needsAction');
    // Fresh ids: a subtask dragged into today's queue is matched by id alone.
    expect(next.subtasks?.[0].id).not.toBe('s1');
  });

  it('does nothing at all for a task that does not repeat', () => {
    seed([repeating({ recurrence: undefined })]);

    setStatus('t1', 'completed');

    expect(backlog()).toHaveLength(1);
    expect(backlog()[0].status).toBe('completed');
  });

  it('does not make a second copy when an already-finished task is saved again', () => {
    seed([repeating()]);
    setStatus('t1', 'completed');

    // What the task card sends on every save — the whole form, status included.
    useStore.getState().updateBacklogTask('t1', { status: 'completed', title: 'Water the plants well' });

    expect(backlog()).toHaveLength(2);
  });

  it('schedules from today when it was finished five days late, and only once', () => {
    seed([repeating()]);
    vi.setSystemTime(at('2026-03-15T13:00'));

    setStatus('t1', 'completed');

    expect(backlog()).toHaveLength(2);
    expect(backlog()[1].deadline).toBe('2026-03-16T12:00');
  });

  it("puts the copy in the backlog, never in today's queue", () => {
    const task = repeating();
    seed([task], [{ ...task, allocatedTime: 900 }]);

    setStatus('t1', 'completed');

    const queue = useStore.getState().tasks;
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('t1');
    expect(queue[0].status).toBe('completed');
  });

  it('stops when the series has run out of occurrences', () => {
    seed([
      repeating({
        recurrence: 'custom',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=1',
      }),
    ]);

    setStatus('t1', 'completed');

    expect(backlog()).toHaveLength(1);
    expect(backlog()[0].status).toBe('completed');
  });

  it('carries on the same series the second time round', () => {
    seed([repeating()]);
    setStatus('t1', 'completed');
    const second = backlog()[1];

    vi.setSystemTime(at('2026-03-11T13:00'));
    setStatus(second.id, 'completed');

    const third = backlog()[2];
    expect(third.seriesId).toBe(second.seriesId);
    expect(third.seriesAnchor).toBe('2026-03-10T12:00');
    expect(third.occurrence).toBe(3);
    expect(third.deadline).toBe('2026-03-12T12:00');
  });

  it("ignores a subtask ticked off through its proxy row in today's queue", () => {
    const task = repeating();
    seed([task], [{ id: 's1', title: 'Fill the can', status: 'needsAction', isSubtaskProxy: true }]);

    setStatus('s1', 'completed');

    expect(backlog()).toHaveLength(1);
    expect(backlog()[0].subtasks?.[0].status).toBe('completed');
  });
});

// ─── Un-completing ───────────────────────────────────────────────────────────

describe('reopening a repeating task', () => {
  beforeEach(() => {
    seed([repeating()]);
    setStatus('t1', 'completed');
  });

  it('takes back the copy nobody touched', () => {
    setStatus('t1', 'needsAction');

    expect(backlog()).toHaveLength(1);
    expect(backlog()[0].status).toBe('needsAction');
  });

  it('removes the finished stamp rather than blanking it', () => {
    setStatus('t1', 'needsAction');

    // A key left present but `undefined` is a hard write error in Firestore,
    // which would stop the whole document syncing from then on.
    expect('completedAt' in backlog()[0]).toBe(false);
  });

  it('leaves the copy alone once it has been edited', () => {
    useStore.getState().updateBacklogTask(backlog()[1].id, { title: 'Water the plants twice' });

    setStatus('t1', 'needsAction');

    expect(backlog()).toHaveLength(2);
  });

  it('leaves the copy alone once it has been finished itself', () => {
    vi.setSystemTime(at('2026-03-11T13:00'));
    setStatus(backlog()[1].id, 'completed');

    setStatus('t1', 'needsAction');

    // The copy, and the copy's own copy, both stay.
    expect(backlog()).toHaveLength(3);
  });

  it('leaves the copy alone once time has been logged against it', () => {
    useStore.getState().addFocusLog({
      taskId: backlog()[1].id,
      taskTitle: 'Water the plants',
      seconds: 600,
      startedAt: at('2026-03-11T10:00').getTime(),
      endedAt: at('2026-03-11T10:10').getTime(),
    });

    setStatus('t1', 'needsAction');

    expect(backlog()).toHaveLength(2);
  });

  it('leaves the copy alone once it has been picked for today', () => {
    useStore.getState().setTasks([{ ...backlog()[1] }]);

    setStatus('t1', 'needsAction');

    expect(backlog()).toHaveLength(2);
  });

  it('can be finished again afterwards, without restarting the count', () => {
    setStatus('t1', 'needsAction');
    vi.setSystemTime(at('2026-03-10T18:00'));

    setStatus('t1', 'completed');

    expect(backlog()).toHaveLength(2);
    expect(backlog()[1].occurrence).toBe(2);
    expect(backlog()[1].deadline).toBe('2026-03-11T12:00');
  });
});

describe('reopening a task that never spawned anything', () => {
  it('is just a status change', () => {
    seed([repeating({ status: 'completed', completedAt: 1 })]);

    setStatus('t1', 'needsAction');

    expect(backlog()).toHaveLength(1);
    expect(backlog()[0].status).toBe('needsAction');
  });
});

/**
 * The three end conditions, run through the store the long way rather than
 * asserted one step at a time. "Repeat 5 times" is the promise the picker
 * makes, and the only way to be sure the app keeps it is to finish the thing
 * five times and count what is left.
 */
describe('a repeat that stops', () => {
  /** Finish the newest occurrence, at 13:00 on the day it is due. */
  function tickOffTheLatest(): void {
    const open = backlog().find((t) => t.status !== 'completed');
    if (!open) return;
    vi.setSystemTime(at(`${open.deadline}`.replace('T12:00', 'T13:00')));
    setStatus(open.id, 'completed');
  }

  it('runs exactly five times when it is set to five', () => {
    seed([
      repeating({
        recurrence: 'custom',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=5',
      }),
    ]);

    for (let i = 0; i < 5; i++) tickOffTheLatest();

    expect(backlog()).toHaveLength(5);
    expect(backlog().map((t) => t.occurrence ?? 1)).toEqual([1, 2, 3, 4, 5]);
    expect(backlog().every((t) => t.status === 'completed')).toBe(true);
    expect(backlog().map((t) => t.deadline)).toEqual([
      '2026-03-10T12:00', '2026-03-11T12:00', '2026-03-12T12:00',
      '2026-03-13T12:00', '2026-03-14T12:00',
    ]);
  });

  it('stops on the day it was told to stop', () => {
    seed([
      repeating({
        recurrence: 'custom',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;UNTIL=20260312',
      }),
    ]);

    for (let i = 0; i < 5; i++) tickOffTheLatest();

    // The 12th itself is included — an end date is the last day an occurrence
    // may fall on, not the first day it may not.
    expect(backlog().map((t) => t.deadline)).toEqual([
      '2026-03-10T12:00', '2026-03-11T12:00', '2026-03-12T12:00',
    ]);
  });

  it('keeps going when it was never told to stop', () => {
    seed([repeating()]);

    for (let i = 0; i < 5; i++) tickOffTheLatest();

    expect(backlog()).toHaveLength(6);
    expect(backlog()[5].status).toBe('needsAction');
    expect(backlog()[5].deadline).toBe('2026-03-15T12:00');
  });

  it('stays finished when the last one is un-ticked and ticked again', () => {
    seed([
      repeating({
        recurrence: 'custom',
        recurrenceRule: 'FREQ=DAILY;INTERVAL=1;COUNT=2',
      }),
    ]);
    for (let i = 0; i < 2; i++) tickOffTheLatest();
    const last = backlog()[1];

    setStatus(last.id, 'needsAction');
    setStatus(last.id, 'completed');

    expect(backlog()).toHaveLength(2);
  });
});

/**
 * The patterns that only became expressible when the rule became an RRULE,
 * driven the way a person drives them: tick the box and see what turns up in
 * the backlog. `recurrence.test.ts` already pins the arithmetic — what is
 * being proved here is that the same arithmetic survives the store.
 */
describe('a repeat that only an RRULE can say', () => {
  it('spawns the last Friday of the next month, not a fixed date', () => {
    seed([
      repeating({
        deadline: '2026-03-27T12:00',
        seriesAnchor: '2026-03-27T12:00',
        recurrence: 'custom',
        recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR',
      }),
    ]);
    vi.setSystemTime(at('2026-03-27T13:00'));

    setStatus('t1', 'completed');

    const [, successor] = backlog();
    expect(successor.deadline).toBe('2026-04-24T12:00');
    expect(successor.recurrenceRule).toBe('FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR');
    expect(successor.occurrence).toBe(2);
  });

  it('skips the weekend on an every-weekday repeat', () => {
    seed([
      repeating({
        deadline: '2026-03-13T12:00',
        seriesAnchor: '2026-03-13T12:00',
        recurrence: 'custom',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR',
      }),
    ]);
    vi.setSystemTime(at('2026-03-13T13:00'));

    setStatus('t1', 'completed');

    expect(backlog()[1].deadline).toBe('2026-03-16T12:00');
  });

  it('reads a rule left behind by a client from before the string', () => {
    // Firestore holds the whole store as one unversioned document, so a
    // snapshot written by an older client lands in the store without ever
    // meeting the persist migration. It must still repeat.
    seed([
      repeating({
        recurrence: 'custom',
        customRecurrence: { freq: 'daily', interval: 2, endType: 'never' },
      }),
    ]);

    setStatus('t1', 'completed');

    expect(backlog()[1].deadline).toBe('2026-03-12T12:00');
  });
});

/**
 * The v8 persist migration, which is the half of "no repeating task changes
 * its schedule" that runs once, on load, before anything is drawn.
 */
describe('upgrading the rules already on disk', () => {
  const legacy = (): Task => repeating({
    recurrence: 'custom',
    customRecurrence: { freq: 'weekly', interval: 2, byWeekday: [1, 4], endType: 'afterCount', endCount: 8 },
  });

  it('rewrites the rule object as the string and takes the object away', () => {
    const [upgraded] = upgradeTaskRecurrence([legacy()]);
    expect(upgraded.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=8');
    expect('customRecurrence' in upgraded).toBe(false);
  });

  it('leaves the array alone when there is nothing to upgrade', () => {
    const tasks = [repeating(), repeating({ id: 't2', recurrence: 'none' })];
    expect(upgradeTaskRecurrence(tasks)).toBe(tasks);
  });

  it('does not touch a task that already carries the string', () => {
    const both = repeating({
      recurrence: 'custom',
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
      customRecurrence: { freq: 'weekly', interval: 2, endType: 'never' },
    });
    expect(upgradeTaskRecurrence([both])[0].recurrenceRule).toBe('FREQ=DAILY;INTERVAL=1');
  });

  it('spawns the same successor before and after the upgrade', () => {
    seed([legacy()]);
    setStatus('t1', 'completed');
    const fromLegacy = backlog()[1].deadline;

    seed(upgradeTaskRecurrence([legacy()]));
    setStatus('t1', 'completed');

    expect(backlog()[1].deadline).toBe(fromLegacy);
  });
});
