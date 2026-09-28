/**
 * Which alerts the Notifications screen says will fire today.
 *
 * DESIGN-2's "done when" is a claim about times — *every row's time is derived
 * from the real store through `taskEstimatedMinutes`* — and about states —
 * *the three states render from real task state*. Both are questions about
 * `firingToday`, which is pure, so both are answered here rather than by
 * looking at a screenshot and believing it.
 *
 * The one thing worth stating twice: the fire time must be the *same instant*
 * as the calendar block's start, not a number this module worked out for
 * itself. The first test pins exactly that, against `deadlineBlockFor`.
 */
import { describe, expect, it } from 'vitest';
import type { Project, Task, TaskList } from '../store/useStore';
import { resolveUserTimeZone } from './agent/dates';
import { deadlineBlockFor } from './deadlineReminder';
import { firingToday, stillToFire } from './firingToday';
import type { NotificationSettings } from './notifications';

const SETTINGS: NotificationSettings = { enabled: true, defaultDeadlineOffsetMinutes: 30 };
const ZONE = resolveUserTimeZone();

const at = (wall: string) => Date.parse(wall);

const PROJECTS: Project[] = [
  { id: 'p-empire', name: 'Shreekant Empire', color: '#8b5cf6', createdAt: 0, order: 0 },
];

const LISTS: TaskList[] = [
  { id: 'l-ops', title: 'Operations', projectId: 'p-empire', order: 0 },
  { id: 'l-bare', title: 'Action Steps' },
];

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'File the incorporation paperwork',
    status: 'needsAction',
    listId: 'l-ops',
    listName: 'Operations',
    order: 0,
    deadline: '2026-03-12T18:00',
    estimatedTime: 45,
    ...over,
  };
}

function run(tasks: Task[], now: string, settings: NotificationSettings = SETTINGS) {
  return firingToday({
    tasks,
    taskLists: LISTS,
    projects: PROJECTS,
    settings,
    timeZone: ZONE,
    now: at(now),
  });
}

describe('the time on the row', () => {
  it('is deadline − estimate', () => {
    const [row] = run([task({ deadline: '2026-03-12T18:00', estimatedTime: 45 })], '2026-03-12T09:30');

    expect(row.at).toBe(at('2026-03-12T17:15'));
    expect(row.dueAt).toBe(at('2026-03-12T18:00'));
    expect(row.estimateMinutes).toBe(45);
  });

  it('is the same instant as the calendar block starts — not a second opinion', () => {
    // The whole point of the screen. If these two ever disagree, the row is
    // advertising a time nothing happens at, which is what the old screen did.
    const t = task({ deadline: '2026-03-12T18:00', allocatedTime: 7200, estimatedTime: 15 });
    const [row] = run([t], '2026-03-12T09:30');

    expect(row.at).toBe(deadlineBlockFor(t, SETTINGS, ZONE).startMs);
  });

  it('takes the allocation over the estimate, because the block does', () => {
    const [row] = run(
      [task({ deadline: '2026-03-12T18:00', estimatedTime: 15, allocatedTime: 7200 })],
      '2026-03-12T09:30',
    );

    expect(row.estimateMinutes).toBe(120);
    expect(row.at).toBe(at('2026-03-12T16:00'));
  });

  it('charges an unestimated task the app-wide default rather than inventing one', () => {
    const [row] = run([task({ deadline: '2026-03-12T18:00', estimatedTime: undefined })], '2026-03-12T09:30');

    expect(row.estimateMinutes).toBe(30);
    expect(row.at).toBe(at('2026-03-12T17:30'));
  });
});

describe('which tasks appear', () => {
  it('is today by the fire time, not by the deadline', () => {
    // Due at 00:30 tomorrow with a two-hour estimate: the work has to start
    // tonight, so the alert is today's even though the deadline is not.
    const rows = run(
      [task({ id: 'tonight', deadline: '2026-03-13T00:30', estimatedTime: 120 })],
      '2026-03-12T09:30',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].at).toBe(at('2026-03-12T22:30'));
  });

  it('leaves out a task whose work starts tomorrow', () => {
    expect(run([task({ deadline: '2026-03-13T18:00' })], '2026-03-12T09:30')).toHaveLength(0);
  });

  it('leaves out a task with no deadline at all', () => {
    expect(run([task({ deadline: undefined })], '2026-03-12T09:30')).toHaveLength(0);
  });

  it('leaves out a completed task', () => {
    expect(run([task({ status: 'completed' })], '2026-03-12T09:30')).toHaveLength(0);
  });

  it('leaves out a task opted out with a zero reminder — "Do not fire today"', () => {
    // The same field `handleDismiss` writes. One answer to "does this ping",
    // not two.
    expect(run([task({ reminderMinutes: 0 })], '2026-03-12T09:30')).toHaveLength(0);
  });

  it('still lists everything while notifications are paused', () => {
    // Paused is a thing the screen says, not a thing that empties it — the
    // page dims these rows rather than dropping them.
    const rows = run([task()], '2026-03-12T09:30', { ...SETTINGS, enabled: false });

    expect(rows).toHaveLength(1);
  });
});

describe('the three states', () => {
  const day = [
    task({ id: 'a', title: 'Draft the pitch outline', deadline: '2026-03-12T14:15', estimatedTime: 60 }),
    task({ id: 'b', title: 'Draft the incorporation filing', deadline: '2026-03-12T18:00', estimatedTime: 45 }),
    task({ id: 'c', title: 'Sign the lease', deadline: '2026-03-12T21:00', estimatedTime: 30 }),
  ];

  it('orders by the clock and marks the soonest one still to come as next', () => {
    const rows = run(day, '2026-03-12T16:40');

    expect(rows.map((r) => r.task.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.state)).toEqual(['missed', 'next', 'queued']);
  });

  it('marks everything past as missed, and has no next once the day is done', () => {
    const rows = run(day, '2026-03-12T23:00');

    expect(rows.every((r) => r.state === 'missed')).toBe(true);
    expect(stillToFire(rows)).toHaveLength(0);
  });

  it('gives exactly one next, however many are still to come', () => {
    const rows = run(day, '2026-03-12T06:00');

    expect(rows.filter((r) => r.state === 'next')).toHaveLength(1);
    expect(stillToFire(rows)).toHaveLength(3);
  });

  it('breaks a tie on id, so an unrelated edit cannot reshuffle the list', () => {
    const rows = run(
      [
        task({ id: 'zzz', deadline: '2026-03-12T18:00', estimatedTime: 45 }),
        task({ id: 'aaa', deadline: '2026-03-12T18:00', estimatedTime: 45 }),
      ],
      '2026-03-12T09:30',
    );

    expect(rows.map((r) => r.task.id)).toEqual(['aaa', 'zzz']);
  });
});

describe('what the row is labelled with', () => {
  it('resolves the project and the list live, not from the stored snapshot', () => {
    const [row] = run([task({ listName: 'A stale name from before the rename' })], '2026-03-12T09:30');

    expect(row.projectName).toBe('Shreekant Empire');
    expect(row.listName).toBe('Operations');
  });

  it('has no project for a task in a bare list', () => {
    const [row] = run([task({ listId: 'l-bare', listName: 'Action Steps' })], '2026-03-12T09:30');

    expect(row.projectName).toBeUndefined();
    expect(row.listName).toBe('Action Steps');
  });
});
