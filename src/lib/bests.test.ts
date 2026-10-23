import { describe, expect, it } from 'vitest';
import { bestWords, dayOf, doneCountsByDay, isPerfectDay, newBests, personalBests } from './stats';
import { bigFinish } from './bigFinish';
import type { Project, Task, TaskList } from '../store/useStore';

const TZ = 'Asia/Kolkata';
const TODAY = '2026-03-12';
const m = (entries: Record<string, number>) => new Map(Object.entries(entries));
const span = (s: number) => `${Math.round(s / 60)}m`;

describe('stats: a timestamp\'s day (dayOf)', () => {
  it('is the day in his zone, the same on a second ask', () => {
    /* 23:50 in Kolkata on the 11th is 18:20 UTC. */
    const at = Date.parse('2026-03-11T18:20:00Z');
    expect(dayOf(at, TZ)).toBe('2026-03-11');
    expect(dayOf(at, TZ)).toBe('2026-03-11');
    expect(dayOf(at, 'UTC')).toBe('2026-03-11');
    /* 00:10 on the 12th in Kolkata. */
    expect(dayOf(Date.parse('2026-03-11T18:40:00Z'), TZ)).toBe('2026-03-12');
  });
});

describe('stats: tasks done per day, all history', () => {
  it('counts top-level finished tasks with a completedAt, by day', () => {
    const at = Date.parse('2026-03-10T05:00:00Z');
    const counts = doneCountsByDay([
      { status: 'completed', completedAt: at },
      { status: 'completed', completedAt: at + 60_000 },
      { status: 'completed', completedAt: at, parent: 'p' },
      { status: 'needsAction', completedAt: at },
      { status: 'completed' },
    ], TZ);
    expect([...counts]).toEqual([['2026-03-10', 2]]);
  });
});

describe('stats: personal bests (idea 108)', () => {
  it('is new when today beats the best before today, with the day it was set', () => {
    const b = personalBests(m({ '2026-03-01': 3600, '2026-03-05': 7200, '2026-03-08': 7200, [TODAY]: 7500 }), m({}), TODAY);
    expect(b.focus).toEqual({ kind: 'focus', today: 7500, record: 7200, recordDay: '2026-03-05', isNew: true });
    expect(bestWords(b.focus, span)).toEqual({ headline: '125m focused today', beat: 'Beat 5 Mar by 5m' });
  });

  it('a tie is not a new best', () => {
    const b = personalBests(m({}), m({ '2026-03-05': 4, [TODAY]: 4 }), TODAY);
    expect(b.done.isNew).toBe(false);
    expect(b.done.record).toBe(4);
  });

  it('the first day ever counted is not a record', () => {
    const b = personalBests(m({ [TODAY]: 9000 }), m({ [TODAY]: 6 }), TODAY);
    expect(newBests(b)).toEqual([]);
    expect(b.focus.record).toBe(0);
    expect(b.focus.recordDay).toBeNull();
  });

  it('a day after today (another device\'s clock) is not a record to beat', () => {
    const b = personalBests(m({ '2026-03-13': 99_999, '2026-03-02': 60, [TODAY]: 120 }), m({}), TODAY);
    expect(b.focus.record).toBe(60);
    expect(b.focus.isNew).toBe(true);
  });

  it('words a tasks best in tasks', () => {
    const b = personalBests(m({}), m({ '2026-03-05': 4, [TODAY]: 5 }), TODAY);
    expect(bestWords(b.done, span)).toEqual({ headline: '5 tasks done today', beat: 'Beat 5 Mar by 1 task' });
  });
});

describe('stats: the longest run of days (idea 108)', () => {
  it('counts days in a row ending today, against the longest run before it', () => {
    /* An old run of 2 (1st-2nd), then 3 in a row ending today. */
    const b = personalBests(
      m({ '2026-03-01': 60, '2026-03-02': 60, '2026-03-10': 60 }),
      m({ '2026-03-11': 1, [TODAY]: 1 }),
      TODAY,
    );
    expect(b.run).toEqual({ kind: 'run', today: 3, record: 2, recordDay: '2026-03-02', isNew: true });
    expect(bestWords(b.run, span).headline).toBe('3 days in a row');
  });

  it('is 0 and never new until today counts', () => {
    const b = personalBests(m({ '2026-03-01': 60, '2026-03-10': 60, '2026-03-11': 60 }), m({}), TODAY);
    expect(b.run.today).toBe(0);
    expect(b.run.isNew).toBe(false);
  });

  it('a single day after a gap is never a new best run', () => {
    const b = personalBests(m({ '2026-03-01': 60, [TODAY]: 60 }), m({}), TODAY);
    expect(b.run.today).toBe(1);
    expect(b.run.isNew).toBe(false);
  });

  it('crosses a month end', () => {
    const b = personalBests(m({ '2026-01-10': 60, '2026-02-27': 60, '2026-02-28': 60, '2026-03-01': 60 }), m({}), '2026-03-01');
    expect(b.run.today).toBe(3);
    expect(b.run.record).toBe(1);
    expect(b.run.isNew).toBe(true);
  });
});

describe('stats: a perfect day (idea 111)', () => {
  it('is the hours met, never on a day with no hours', () => {
    expect(isPerfectDay(3600, 3600)).toBe(true);
    expect(isPerfectDay(3599, 3600)).toBe(false);
    expect(isPerfectDay(5000, 0)).toBe(false);
  });
});

// ─── Confetti's two presses (idea 2) ──────────────────────────────────────────

const project = (id: string, parentId?: string): Project => ({ id, name: id, createdAt: 0, order: 0, parentId });
const list = (id: string, projectId: string): TaskList => ({ id, title: id, projectId } as TaskList);
const task = (id: string, listId: string, done = false, extra: Partial<Task> = {}): Task =>
  ({ id, title: id, listId, status: done ? 'completed' : 'needsAction', ...extra } as Task);
const tick = (tasks: Task[], id: string) => tasks.map((t) => (t.id === id ? { ...t, status: 'completed' as const } : t));

describe('bigFinish: what earns confetti', () => {
  const projects = [project('outer'), project('inner', 'outer'), project('other')];
  const lists = [list('L1', 'inner'), list('L2', 'outer'), list('L3', 'other')];

  it('an ordinary tick earns nothing', () => {
    const before = [task('a', 'L3'), task('b', 'L3')];
    expect(bigFinish(before, tick(before, 'a'), projects, lists)).toBeNull();
  });

  it('a milestone finished earns it', () => {
    const before = [task('a', 'L3', false, { milestone: true }), task('b', 'L3')];
    expect(bigFinish(before, tick(before, 'a'), projects, lists)).toBe('milestone');
  });

  it('the last open task of a project finishes the project', () => {
    const before = [task('a', 'L3', true), task('b', 'L3')];
    expect(bigFinish(before, tick(before, 'b'), projects, lists)).toBe('project');
  });

  it('finishing an inner project with the outer still open is the inner one', () => {
    const before = [task('a', 'L1'), task('b', 'L2')];
    expect(bigFinish(before, tick(before, 'a'), projects, lists)).toBe('project');
  });

  it('the outer project finishes when its last task anywhere inside is ticked', () => {
    const before = [task('a', 'L1', true), task('b', 'L2')];
    expect(bigFinish(before, tick(before, 'b'), projects, lists)).toBe('project');
  });

  it('a task restored already finished finishes nothing', () => {
    const before = [task('b', 'L3', true)];
    const after = [...before, task('a', 'L3', true)];
    expect(bigFinish(before, after, projects, lists)).toBeNull();
  });

  it('a repeating task\'s open next copy keeps the project open', () => {
    const before = [task('a', 'L3')];
    const after = [...tick(before, 'a'), task('a2', 'L3')];
    expect(bigFinish(before, after, projects, lists)).toBeNull();
  });

  it('a task in no project can still be a milestone', () => {
    const before = [task('a', 'nowhere', false, { milestone: true })];
    expect(bigFinish(before, tick(before, 'a'), projects, lists)).toBe('milestone');
  });
});
