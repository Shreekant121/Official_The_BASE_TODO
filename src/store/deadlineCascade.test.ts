/**
 * **The deadline rule, through the real store** (item 18).
 *
 * `lib/deadlineMath.test.ts` pins the arithmetic. What is left is the wiring,
 * and every one of the four things below is invisible in the pure module and
 * would look perfectly fine on screen while being wrong:
 *
 *   1. **The cascade is ONE store write.** Not one per moved task. The whole
 *      Google Calendar sync hangs off that: `firestoreSync` pushes after a
 *      write and `notificationSync` diffs the backlog two seconds later in a
 *      batch of fifty, so a cascade applied task by task would be N pushes and
 *      N reconcile passes over the same backlog.
 *   2. **`originalDeadline` is written once and then never again.** It is the
 *      anchor the Post-deadline Escalator measures from; an anchor that crept
 *      forward with every push would make a task pushed three times read as
 *      freshly overdue, which is the exact inversion the field exists to
 *      prevent.
 *   3. **The focus queue is mirrored.** It holds snapshot copies of today's
 *      tasks, so a task pushed while it is in the queue would otherwise run
 *      the rest of the session against a date it no longer has.
 *   4. **A quiet edit stays quiet.** Renaming a task must not run a graph walk
 *      or raise a banner, and "the banner did not appear" is only meaningful
 *      if a stale one from a previous cascade was not sitting there anyway.
 *
 * Dates are wall clocks converted with the store's own zone, the same rule
 * `emergency.test.ts` and `recurrenceCompletion.test.ts` follow, so nothing
 * here depends on which zone the machine running it is in.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Task, type TaskList } from './useStore';
import { useUIStore } from './useUIStore';

const LISTS: TaskList[] = [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 }];

function task(id: string, over: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', listId: 'l1', order: 0, ...over };
}

function seed(tasks: Task[], focusQueue: Task[] = []) {
  useStore.setState({
    projects: [],
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(tasks),
    tasks: structuredClone(focusQueue),
    focusLog: [],
  });
  useUIStore.setState({ deadlineShift: null });
}

const backlog = () => useStore.getState().backlogTasks;
const find = (id: string) => backlog().find((t) => t.id === id)!;
const shift = () => useUIStore.getState().deadlineShift;
const update = useStore.getState().updateBacklogTask;

/** The three-link chain every test below starts from: c waits on b waits on a. */
function chain(): Task[] {
  return [
    task('a', { title: 'Wireframes', deadline: '2026-03-10T17:00' }),
    task('b', { title: 'Design review', deadline: '2026-03-12T17:00', dependsOn: ['a'] }),
    task('c', { title: 'Build it', deadline: '2026-03-14T17:00', dependsOn: ['b'] }),
  ];
}

beforeEach(() => seed(chain()));

describe('delaying a prerequisite', () => {
  it('pushes everything downstream, in one write', () => {
    // Wireframes slips a fortnight. Both of the tasks behind it have to move,
    // and `c` has to move against `b`'s NEW date rather than its old one.
    update('a', { deadline: '2026-03-24T17:00' });
    expect(find('b').deadline).toBe('2026-03-25T17:00');
    expect(find('c').deadline).toBe('2026-03-26T17:00');
  });

  it('is a single store write, however long the chain', () => {
    /* The whole Google Calendar story rests on this. `firestoreSync` pushes
       the document after a store change and `notificationSync` then diffs the
       backlog once, in a batch — so a cascade applied one task at a time would
       be three pushes and three reconcile passes over the same data, which is
       the per-task API call CLAUDE.md says never to reintroduce. */
    let writes = 0;
    const stop = useStore.subscribe(() => { writes += 1; });
    update('a', { deadline: '2026-03-24T17:00' });
    stop();
    expect(writes).toBe(1);
    expect(find('b').deadline).toBe('2026-03-25T17:00');
    expect(find('c').deadline).toBe('2026-03-26T17:00');
  });

  it('leaves the slack you deliberately left', () => {
    // A day earlier than the chain already allows for. Nothing is impossible,
    // so nothing moves — and nothing is pulled in to close the gap either.
    update('a', { deadline: '2026-03-11T09:00' });
    expect(find('b').deadline).toBe('2026-03-12T17:00');
    expect(find('c').deadline).toBe('2026-03-14T17:00');
    expect(shift()).toBeNull();
  });

  it('reports every move to the banner, naming what moved and why', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    expect(shift()!.moves.map((m) => [m.taskId, m.to, m.because.taskId])).toEqual([
      ['b', '2026-03-25T17:00', 'a'],
      ['c', '2026-03-26T17:00', 'b'],
    ]);
    expect(shift()!.conflicts).toEqual([]);
  });

  it('runs when the prerequisites themselves change, not only the dates', () => {
    seed([
      task('a', { title: 'Wireframes', deadline: '2026-03-24T17:00' }),
      task('b', { title: 'Design review', deadline: '2026-03-12T17:00' }),
    ]);
    update('b', { dependsOn: ['a'] });
    expect(find('b').deadline).toBe('2026-03-25T17:00');
  });
});

describe('the anchor', () => {
  it('is written on the first push, holding the date the task was first given', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    expect(find('b').originalDeadline).toBe('2026-03-12T17:00');
    expect(find('c').originalDeadline).toBe('2026-03-14T17:00');
  });

  it('does not move again when the task is pushed a second time', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    update('a', { deadline: '2026-04-24T17:00' });
    expect(find('b').deadline).toBe('2026-04-25T17:00');
    // Still the date it held before the FIRST push, so the escalator reads it
    // as six weeks late rather than as freshly overdue.
    expect(find('b').originalDeadline).toBe('2026-03-12T17:00');
  });

  it('is not written on a task that was never pushed', () => {
    update('a', { deadline: '2026-03-11T09:00' });
    expect(find('b')).not.toHaveProperty('originalDeadline');
  });
});

describe('a fixed date', () => {
  beforeEach(() => {
    seed([
      task('a', { title: 'Wireframes', deadline: '2026-03-10T17:00' }),
      task('b', {
        title: 'Client presentation',
        deadline: '2026-03-12T17:00',
        deadlineIsFixed: true,
        dependsOn: ['a'],
      }),
      task('c', { title: 'Invoice', deadline: '2026-03-14T17:00', dependsOn: ['b'] }),
    ]);
  });

  it('refuses to move and is reported as a conflict instead', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    expect(find('b').deadline).toBe('2026-03-12T17:00');
    expect(shift()!.conflicts).toHaveLength(1);
    expect(shift()!.conflicts[0]).toMatchObject({
      taskId: 'b',
      required: '2026-03-25T17:00',
      because: { taskId: 'a' },
    });
  });

  it('does not drag what waits on it, because its own date has not moved', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    expect(find('c').deadline).toBe('2026-03-14T17:00');
    expect(shift()!.moves).toEqual([]);
  });
});

describe('the rest of the app', () => {
  it('mirrors a pushed date into today’s focus queue', () => {
    seed(chain(), [task('b', { title: 'Design review', deadline: '2026-03-12T17:00', dependsOn: ['a'] })]);
    update('a', { deadline: '2026-03-24T17:00' });
    expect(useStore.getState().tasks[0].deadline).toBe('2026-03-25T17:00');
  });

  it('does not run at all for an edit that leaves the graph where it was', () => {
    // A stale banner would make this assertion pass for the wrong reason, so
    // put one up first and check the rename does not merely fail to replace it.
    update('a', { deadline: '2026-03-24T17:00' });
    expect(shift()).not.toBeNull();
    useUIStore.getState().clearDeadlineShift();
    update('a', { title: 'Wireframes, v2' });
    expect(shift()).toBeNull();
    expect(find('b').deadline).toBe('2026-03-25T17:00');
  });

  it('is dismissible', () => {
    update('a', { deadline: '2026-03-24T17:00' });
    useUIStore.getState().clearDeadlineShift();
    expect(shift()).toBeNull();
    // Dismissing the telling never touches the dates that were written.
    expect(find('b').deadline).toBe('2026-03-25T17:00');
  });
});
