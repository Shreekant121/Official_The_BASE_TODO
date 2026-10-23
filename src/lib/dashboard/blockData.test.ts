import { describe, expect, it } from 'vitest';
import type { Project, Task, TaskList } from '../../store/useStore';
import {
  agoPhrase, busiestProject, daysWaiting, deadlineWarmth, finishedOn, finishedToday, formatMinutes, nextDeadline, outsourceShareIds,
  overdueHeat, overdueTasks, passedOnToday, projectProgress, recommendTasks, runwayDeadlines, tasksOnDay, todaysTasks, waitingOn,
} from './blockData';

/* Noon in Kolkata on 30 September 2026. Stored deadlines are wall-clock times there. */
const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-09-30T06:30:00Z');
const NONE: ReadonlySet<string> = new Set();

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', estimatedTime: 60, listId: 'l1', ...extra };
}

describe('recommendTasks', () => {
  const scores: Record<string, number> = { a: 5, b: 9, c: 7, d: 8 };
  const scoreOf = (t: Task) => scores[t.id] ?? 0;

  it('ranks by score, best first, three at most', () => {
    const got = recommendTasks([task('a'), task('b'), task('c'), task('d')], scoreOf, NONE, NONE, TZ);
    expect(got.map((t) => t.id)).toEqual(['b', 'd', 'c']);
  });

  it('never recommends a blocked task, finished work, a subtask row, ignored or passed-on work', () => {
    const backlog = [
      task('a'),
      task('b', { dependsOn: ['a'] }),
      task('c', { status: 'completed' }),
      task('d', { parent: 'a' }),
      task('e'),
      task('f'),
    ];
    const got = recommendTasks(backlog, scoreOf, new Set(['e']), new Set(['f']), TZ);
    expect(got.map((t) => t.id)).toEqual(['a']);
  });

  it('frees a task whose prerequisite is finished or gone', () => {
    const backlog = [task('a', { status: 'completed' }), task('b', { dependsOn: ['a', 'ghost'] })];
    expect(recommendTasks(backlog, scoreOf, NONE, NONE, TZ).map((t) => t.id)).toEqual(['b']);
  });

  it('breaks a tie on the earlier deadline', () => {
    const flat = () => 1;
    const backlog = [task('late', { deadline: '2026-10-05T10:00' }), task('soon', { deadline: '2026-10-01T10:00' }), task('none')];
    expect(recommendTasks(backlog, flat, NONE, NONE, TZ).map((t) => t.id)).toEqual(['soon', 'late', 'none']);
  });
});

describe('passedOnToday', () => {
  it('keeps only today\'s presses, on the local calendar', () => {
    const got = passedOnToday(
      [
        { taskId: 'today', at: new Date('2026-09-29T19:00:00Z').getTime() }, // 00:30 IST on the 30th
        { taskId: 'yesterday', at: new Date('2026-09-29T18:00:00Z').getTime() }, // 23:30 IST on the 29th
      ],
      NOW,
      TZ,
    );
    expect([...got]).toEqual(['today']);
  });
});

describe('todaysTasks', () => {
  it('is what is due today plus what was finished today, split done and open', () => {
    const backlog = [
      task('due-open', { deadline: '2026-09-30T18:00' }),
      task('due-done', { deadline: '2026-09-30T09:00', status: 'completed', completedAt: new Date('2026-09-29T12:00:00Z').getTime() }),
      task('done-today', { deadline: '2026-09-20T09:00', status: 'completed', completedAt: new Date('2026-09-30T05:00:00Z').getTime() }),
      task('overdue', { deadline: '2026-09-29T09:00' }),
      task('tomorrow', { deadline: '2026-10-01T09:00' }),
      task('ignored', { deadline: '2026-09-30T10:00' }),
    ];
    const { done, open } = todaysTasks(backlog, NOW, TZ, new Set(['ignored']));
    expect(open.map((t) => t.id)).toEqual(['due-open']);
    expect(done.map((t) => t.id).sort()).toEqual(['done-today', 'due-done']);
  });

  it('reads any day the same way, for the week strip\'s picked day (29-1c3)', () => {
    const backlog = [
      task('thu-late', { deadline: '2026-10-01T19:00' }),
      task('thu', { deadline: '2026-10-01T09:00' }),
      task('wed', { deadline: '2026-09-30T18:00' }),
      task('done-thu', { status: 'completed', completedAt: new Date('2026-10-01T05:00:00Z').getTime() }),
    ];
    const { done, open } = tasksOnDay(backlog, '2026-10-01', TZ, NONE);
    expect(open.map((t) => t.id)).toEqual(['thu', 'thu-late']);
    expect(done.map((t) => t.id)).toEqual(['done-thu']);
    expect(finishedOn(backlog, '2026-10-01', TZ)).toBe(1);
    expect(finishedOn(backlog, '2026-09-30', TZ)).toBe(0);
  });
});

describe('finishedToday', () => {
  it('counts tasks finished today on the local calendar, whatever they were due, never a subtask row', () => {
    const at = (iso: string) => new Date(iso).getTime();
    const backlog = [
      task('a', { status: 'completed', completedAt: at('2026-09-29T19:00:00Z') }), // 00:30 IST on the 30th
      task('b', { status: 'completed', completedAt: at('2026-09-30T05:00:00Z'), deadline: '2026-10-09T09:00' }),
      task('c', { status: 'completed', completedAt: at('2026-09-29T18:00:00Z') }), // 23:30 IST on the 29th
      task('d', { status: 'completed', completedAt: at('2026-09-30T05:00:00Z'), parent: 'b' }),
      task('e', { status: 'completed' }),
      task('f', { completedAt: at('2026-09-30T05:00:00Z') }),
    ];
    expect(finishedToday(backlog, NOW, TZ)).toBe(2);
  });
});

describe('nextDeadline and overdueTasks', () => {
  const backlog = [
    task('old', { deadline: '2026-09-20T09:00' }),
    task('older', { deadline: '2026-09-10T09:00' }),
    task('soon', { deadline: '2026-09-30T15:00' }),
    task('later', { deadline: '2026-10-02T09:00' }),
    task('finished', { deadline: '2026-09-30T13:00', status: 'completed' }),
    task('ignored', { deadline: '2026-09-30T12:30' }),
  ];
  const ignored = new Set(['ignored']);

  it('the next deadline is the soonest still ahead, open and not ignored', () => {
    expect(nextDeadline(backlog, NOW, TZ, ignored)?.task.id).toBe('soon');
    expect(nextDeadline([task('x')], NOW, TZ, NONE)).toBeNull();
  });

  it('the overdue pile is oldest first', () => {
    expect(overdueTasks(backlog, NOW, TZ, ignored).map((o) => o.task.id)).toEqual(['older', 'old']);
  });
});

describe('project progress', () => {
  const projects: Project[] = [
    { id: 'p1', name: 'Quiet', createdAt: 1, order: 0 },
    { id: 'p2', name: 'Busy', createdAt: 2, order: 1 },
    { id: 'p3', name: 'Inside busy', createdAt: 3, order: 0, parentId: 'p2' },
  ];
  const lists: TaskList[] = [
    { id: 'l1', title: 'One', projectId: 'p1' },
    { id: 'l2', title: 'Two', projectId: 'p2' },
    { id: 'l3', title: 'Three', projectId: 'p3' },
  ];
  const backlog = [
    task('q', { listId: 'l1' }),
    task('b1', { listId: 'l2', estimatedTime: 30, valueINR: 1000 }),
    task('b2', { listId: 'l2', status: 'completed', estimatedTime: 90, valueINR: 3000 }),
    task('i1', { listId: 'l3' }),
  ];

  it('picks the top-level project with the most open work, counting what is inside it', () => {
    expect(busiestProject(projects, lists, backlog)?.id).toBe('p2');
  });

  it('counts the subtree, in the chosen unit', () => {
    const tasks = projectProgress(projects[1], projects, lists, backlog, 'tasks');
    expect([tasks.done, tasks.total]).toEqual([1, 3]);
    expect([tasks.doneMinutes, tasks.totalMinutes]).toEqual([90, 180]);
    const money = projectProgress(projects[1], projects, lists, backlog, 'money');
    expect([money.done, money.total]).toEqual([3000, 4000]);
    const hours = projectProgress(projects[1], projects, lists, backlog, 'hours');
    expect([hours.done, hours.total]).toEqual([90, 180]);
  });
});

describe('words', () => {
  it('formatMinutes', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(180)).toBe('3h');
    expect(formatMinutes(150)).toBe('2h 30m');
  });
  it('agoPhrase', () => {
    expect(agoPhrase(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe('3 hours');
    expect(agoPhrase(new Date(NOW.getTime() - 26 * 3_600_000), NOW)).toBe('1 day');
    expect(agoPhrase(new Date(NOW.getTime() - 80 * 3_600_000), NOW)).toBe('3 days');
  });
  it('overdueHeat: a spark just past, a blaze at a week, never more', () => {
    const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
    expect(overdueHeat(ago(0), NOW)).toBe(0);
    expect(overdueHeat(ago(3.5 * 24), NOW)).toBeCloseTo(0.5);
    expect(overdueHeat(ago(7 * 24), NOW)).toBe(1);
    expect(overdueHeat(ago(40 * 24), NOW)).toBe(1);
  });
});

describe('runwayDeadlines (idea 138)', () => {
  /* Kolkata wall-clock: NOW is 12:00 on 30 September. */
  const backlog = [
    task('past', { deadline: '2026-09-29T10:00' }),
    task('soon', { deadline: '2026-09-30T18:00' }),
    task('near', { deadline: '2026-10-01T09:00' }),
    task('week', { deadline: '2026-10-07T12:00' }),
    task('far', { deadline: '2026-10-20T12:00' }),
    task('done', { deadline: '2026-10-02T12:00', status: 'completed' }),
    task('ign', { deadline: '2026-10-03T12:00' }),
  ];

  it('holds the next two weeks, soonest first, and counts what is already late', () => {
    const r = runwayDeadlines(backlog, NOW, TZ, new Set(['ign']), { lanes: 4, gapDays: 1 });
    expect(r.items.map((i) => i.task.id)).toEqual(['soon', 'near', 'week']);
    expect(r.overdue).toBe(1);
    expect(r.items[0].days).toBeCloseTo(0.25, 5);
    expect(r.items[2].days).toBeCloseTo(7, 5);
  });

  it('puts two close pills on different lanes, and counts what finds no lane', () => {
    const r = runwayDeadlines(backlog, NOW, TZ, NONE, { lanes: 2, gapDays: 1 });
    expect(r.items.map((i) => [i.task.id, i.lane])).toEqual([['soon', 0], ['near', 1], ['ign', 0], ['week', 0]]);
    const tight = runwayDeadlines(backlog, NOW, TZ, NONE, { lanes: 1, gapDays: 1 });
    expect(tight.items.map((i) => i.task.id)).toEqual(['soon', 'ign', 'week']);
    expect(tight.hidden).toBe(1);
  });

  it('warms from cold at two weeks to hot at now', () => {
    expect(deadlineWarmth(14)).toBe(0);
    expect(deadlineWarmth(30)).toBe(0);
    expect(deadlineWarmth(0)).toBe(1);
    expect(deadlineWarmth(7)).toBeCloseTo(0.25, 5);
  });
});

describe('waitingOn (idea 137)', () => {
  const ME = 'Abcdefghijklmnopqrstuvwxyz12';

  it('lists open work with someone else on it, the longest wait first', () => {
    const rows = waitingOn([
      task('mine', { assignee: ME }),
      task('priya', { assignee: ' Priya ', assignedAt: 3000 }),
      task('rahul', { assignee: 'Rahul (CA)', assignedAt: 1000 }),
      task('old', { assignee: 'Venue team' }),
      task('done', { assignee: 'Priya', status: 'completed' }),
      task('ign', { assignee: 'Priya' }),
      task('nobody', { assignee: '  ' }),
      task('acct', { assignee: 'Zyxwvutsrqponmlkjihgfedcba98', assignedAt: 2000 }),
    ], ME, new Set(['ign']));
    expect(rows.map((r) => [r.task.id, r.who, r.since])).toEqual([
      ['rahul', 'Rahul (CA)', 1000],
      ['acct', 'Another account', 2000],
      ['priya', 'Priya', 3000],
      ['old', 'Venue team', null],
    ]);
  });

  it('counts whole days', () => {
    expect(daysWaiting(0, 86_400_000 * 3.9)).toBe(3);
    expect(daysWaiting(5000, 1000)).toBe(0);
  });

  it('watches every outsourcing link, and only those', () => {
    const projects = [
      { id: 'p1', name: 'P', shareId: 's-p1', shareAllowContributions: true },
      { id: 'p2', name: 'Q', shareId: 's-p2' },
    ] as Project[];
    const lists = [{ id: 'l1', title: 'L', projectId: 'p1', shareId: 's-l1', shareAllowContributions: true }] as TaskList[];
    const backlog = [
      task('t1', { shareId: 's-t1', shareAllowContributions: true }),
      task('t2', { shareId: 's-p1', shareAllowContributions: true }),
      task('sub', { shareId: 's-sub', shareAllowContributions: true, parent: 't1' }),
    ];
    expect(outsourceShareIds(projects, lists, backlog)).toEqual(['s-l1', 's-p1', 's-t1']);
  });
});
