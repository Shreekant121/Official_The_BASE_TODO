import { describe, expect, it } from 'vitest';
import {
  addDays, daysFrom, finishPhrase, forecastDoneBy, projectForecast, projectMilestones, shortDay, validDay,
  HISTORY_DAYS,
} from './projectForecast';
import type { Task } from '../store/useStore';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = new Date('2026-03-12T04:30:00Z');
const TODAY = '2026-03-12';
const DAY = 86_400_000;

type T = Pick<Task, 'status' | 'completedAt'>;
const done = (ago: number): T => ({ status: 'completed', completedAt: NOW.getTime() - ago * DAY });
const open = (): T => ({ status: 'needsAction' });
const many = (n: number, f: () => T) => Array.from({ length: n }, f);

describe('projectForecast: when it will be done (idea 156)', () => {
  it('walks the done count back over four weeks, today last', () => {
    const f = projectForecast([done(0), done(2), done(2), done(40), { status: 'completed' }, open(), open()], NOW, TZ);
    expect(f.history).toHaveLength(HISTORY_DAYS);
    expect(f.history[HISTORY_DAYS - 1]).toEqual({ day: TODAY, done: 5 });
    expect(f.history[HISTORY_DAYS - 2].done).toBe(4); // yesterday: before today's
    expect(f.history[HISTORY_DAYS - 3].done).toBe(4); // two days ago: both of that day's counted
    expect(f.history[HISTORY_DAYS - 4].done).toBe(2); // the old one and the unstamped one
    expect(f.history[0].done).toBe(2);
  });

  it('carries on at the last two weeks\' pace, today the first day of work', () => {
    /* 7 done in 14 days: one every two days. 3 left: 6 days of work,
       today the first, so the 17th. */
    const tasks = [...[0, 2, 4, 6, 8, 10, 12].map(done), ...many(3, open)];
    const f = projectForecast(tasks, NOW, TZ);
    expect(f.pace).toBe(0.5);
    expect(f.state).toBe('forecast');
    expect(f.daysLeft).toBe(5);
    expect(f.finishDay).toBe('2026-03-17');
    expect(forecastDoneBy(f, TODAY, '2026-03-17')).toBe(10);
    expect(forecastDoneBy(f, TODAY, '2026-03-16')).toBeLessThan(10);
  });

  it('lands today when today\'s pace finishes it', () => {
    const f = projectForecast([...many(14, () => done(1)), open()], NOW, TZ);
    expect(f.finishDay).toBe(TODAY);
    expect(finishPhrase(f, TODAY)?.text).toBe('Done today');
  });

  it('says late, early or on the day against Finish by', () => {
    const tasks = [...[0, 2, 4, 6, 8, 10, 12].map(done), ...many(3, open)];
    expect(projectForecast(tasks, NOW, TZ, '2026-03-14').lateBy).toBe(3);
    expect(finishPhrase(projectForecast(tasks, NOW, TZ, '2026-03-14'), TODAY))
      .toEqual({ text: 'Done 17 Mar', detail: '3 days late', tone: 'late' });
    expect(finishPhrase(projectForecast(tasks, NOW, TZ, '2026-03-18'), TODAY))
      .toEqual({ text: 'Done 17 Mar', detail: '1 day early', tone: 'early' });
    expect(finishPhrase(projectForecast(tasks, NOW, TZ, '2026-03-17'), TODAY)?.tone).toBe('on');
    expect(finishPhrase(projectForecast(tasks, NOW, TZ), TODAY))
      .toEqual({ text: 'Done 17 Mar', detail: null, tone: 'plain' });
  });

  it('ignores a Finish by that is not a real day', () => {
    expect(projectForecast([done(1), open()], NOW, TZ, '2026-02-30').finishBy).toBeNull();
    expect(projectForecast([done(1), open()], NOW, TZ, 'soon').finishBy).toBeNull();
  });

  it('has no date with no pace, past a year, done, or empty', () => {
    expect(projectForecast([done(20), open()], NOW, TZ).state).toBe('no-pace');
    expect(finishPhrase(projectForecast([done(20), open()], NOW, TZ), TODAY)?.text).toBe('No pace yet');
    expect(projectForecast([done(1), ...many(40, open)], NOW, TZ).state).toBe('slow');
    expect(projectForecast([done(1)], NOW, TZ).state).toBe('done');
    expect(finishPhrase(projectForecast([done(1)], NOW, TZ), TODAY)).toBeNull();
    expect(projectForecast([], NOW, TZ).state).toBe('empty');
  });

  it('counts a day by his zone, not the browser\'s', () => {
    /* 23:50 on the 11th in Kolkata is 18:20 UTC: still the 11th there. */
    const late = { status: 'completed' as const, completedAt: Date.parse('2026-03-11T18:20:00Z') };
    const f = projectForecast([late, open()], NOW, TZ);
    expect(f.history.find((d) => d.day === '2026-03-11')?.done).toBe(1);
    expect(f.history.find((d) => d.day === '2026-03-10')?.done).toBe(0);
  });
});

describe('day helpers', () => {
  it('adds and counts calendar days across a month end', () => {
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(daysFrom('2026-02-27', '2026-03-02')).toBe(3);
    expect(validDay('2026-02-28')).toBe('2026-02-28');
    expect(validDay('2026-13-01')).toBeNull();
    expect(shortDay('2026-11-12', TODAY)).toBe('12 Nov');
    expect(shortDay('2027-01-05', TODAY)).toBe('5 Jan 2027');
  });
});

type M = Pick<Task, 'id' | 'status' | 'deadline' | 'milestone' | 'dependsOn' | 'order' | 'createdAt'>;

describe('projectMilestones (idea 155)', () => {
  const backlog: M[] = [
    { id: 'a', status: 'completed' },
    { id: 'b', status: 'needsAction' },
    { id: 'c', status: 'completed' },
    { id: 'm-late', status: 'needsAction', milestone: true, deadline: '2026-04-01T18:00', dependsOn: ['b', 'gone'] },
    { id: 'm-first', status: 'completed', milestone: true, deadline: '2026-03-01T18:00', dependsOn: ['a'] },
    { id: 'm-next', status: 'needsAction', milestone: true, deadline: '2026-03-20T18:00', dependsOn: ['c', 'b'] },
    { id: 'm-undated', status: 'needsAction', milestone: true },
    { id: 'plain', status: 'needsAction', deadline: '2026-03-02T18:00' },
  ];

  it('puts them in date order, undated last, and marks the one he is on', () => {
    const ms = projectMilestones(backlog, backlog, TZ);
    expect(ms.map((m) => [m.task.id, m.state])).toEqual([
      ['m-first', 'done'], ['m-next', 'now'], ['m-late', 'ahead'], ['m-undated', 'ahead'],
    ]);
  });

  it('waits on its own "Waits on", looked up in the whole backlog', () => {
    const tree = backlog.filter((t) => t.id.startsWith('m-'));
    const ms = projectMilestones(tree, backlog, TZ);
    const next = ms.find((m) => m.task.id === 'm-next')!;
    expect(next.waitsOn.map((t) => t.id)).toEqual(['c', 'b']);
    expect(next.waitsDone).toBe(1);
    /* A link to a task that is gone is dropped, not drawn. */
    expect(ms.find((m) => m.task.id === 'm-late')!.waitsOn.map((t) => t.id)).toEqual(['b']);
  });
});
