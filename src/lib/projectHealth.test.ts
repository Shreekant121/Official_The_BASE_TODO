import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, doneByDay, lastDays, lastDoneAt } from './stats';
import { projectHealth } from './projectHealth';
import type { Task } from '../store/useStore';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = new Date('2026-03-12T04:30:00Z');
const DAY = 86_400_000;

type T = Pick<Task, 'title' | 'status' | 'deadline' | 'completedAt'>;
/** Finished `ago` days back, at ten in the morning. */
const done = (ago: number): T => ({ title: 'done', status: 'completed', completedAt: NOW.getTime() - ago * DAY });
const due = (deadline: string, title = 'open'): T => ({ title, status: 'needsAction', deadline });
const undated = (): T => ({ title: 'open', status: 'needsAction' });

describe('stats: tasks done per day (idea 151)', () => {
  it('is the last fourteen calendar days, today last', () => {
    const days = lastDays(NOW, TZ, 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-02-27');
    expect(days[13]).toBe('2026-03-12');
  });

  it('counts finished tasks on their day and nothing else', () => {
    const counts = doneByDay([
      done(0), done(3), done(3), done(20),
      { status: 'needsAction', completedAt: NOW.getTime() },
      { status: 'completed' },
    ], NOW, TZ);
    expect(counts.map((d) => d.count)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1]);
  });

  it('reads the day in his zone: 00:15 in Kolkata is today, though UTC says yesterday', () => {
    const justAfterMidnight = { status: 'completed' as const, completedAt: Date.parse('2026-03-11T18:45:00Z') };
    expect(doneByDay([justAfterMidnight], NOW, TZ).at(-1)!.count).toBe(1);
    expect(doneByDay([justAfterMidnight], NOW, 'UTC').at(-2)!.count).toBe(1);
  });

  it('counts calendar days, not 24-hour slices, and finds the last one done', () => {
    expect(calendarDaysBetween(new Date('2026-03-11T17:30:00Z'), new Date('2026-03-11T19:30:00Z'), TZ)).toBe(1);
    expect(lastDoneAt([done(5), done(2), undated()])).toBe(NOW.getTime() - 2 * DAY);
    expect(lastDoneAt([undated()])).toBeNull();
  });
});

describe('projectHealth (idea 152)', () => {
  it('has nothing to say about a finished project, or one with no dates that is moving', () => {
    expect(projectHealth([done(1)], NOW, TZ)).toBeNull();
    expect(projectHealth([done(2), undated()], NOW, TZ)).toBeNull();
  });

  it('is Quiet when nothing has a date and nothing was done this week', () => {
    expect(projectHealth([done(9), undated()], NOW, TZ)).toEqual({ state: 'quiet', word: 'Quiet', why: 'Nothing done in 9 days.' });
    expect(projectHealth([undated()], NOW, TZ)!.why).toBe('Nothing done this week.');
  });

  it('is Off track the moment something is late, naming the oldest', () => {
    const h = projectHealth([done(1), due('2026-03-11T18:00', 'Send the invoice'), due('2026-03-09', 'File GST'), due('2026-03-20')], NOW, TZ)!;
    expect(h.state).toBe('off-track');
    expect(h.why).toBe('“File GST” was due Mon 9 Mar, 3 days ago, and 1 more is late.');
    expect(projectHealth([due('2026-03-11T18:00', 'Call')], NOW, TZ)!.why).toBe('“Call” was due yesterday.');
    expect(projectHealth([due('2026-03-12T09:00', 'Call')], NOW, TZ)!.why).toBe('“Call” was due today.');
  });

  it('a bare date is due at the end of its day, so today is not late yet', () => {
    expect(projectHealth([due('2026-03-12')], NOW, TZ)!.state).not.toBe('off-track');
  });

  it('is At risk after a still week with something due in the next two weeks', () => {
    expect(projectHealth([done(9), due('2026-03-16'), due('2026-03-19')], NOW, TZ)).toEqual({
      state: 'at-risk', word: 'At risk', why: 'Nothing done in 9 days, and 2 are due by Thu 19 Mar.',
    });
  });

  it('is At risk when the pace will not make the dates', () => {
    /* Two done in a fortnight; three due Monday, five days of work away. */
    const h = projectHealth([done(2), done(10), due('2026-03-16'), due('2026-03-16'), due('2026-03-16')], NOW, TZ)!;
    expect(h).toEqual({ state: 'at-risk', word: 'At risk', why: '3 due by Mon 16 Mar, and only 2 done in the last two weeks.' });
    /* Eight done in a fortnight: about three in five days, and four are due. */
    const busy = [0, 1, 2, 3, 4, 5, 6, 8].map(done);
    expect(projectHealth([...busy, ...Array.from({ length: 4 }, () => due('2026-03-16'))], NOW, TZ)!.why)
      .toBe('4 due by Mon 16 Mar; at this pace, about 2 will be done.');
  });

  it('never calls one task at risk by pace alone', () => {
    expect(projectHealth([done(3), due('2026-03-13')], NOW, TZ)!.state).toBe('on-track');
  });

  it('is On track with the next date and the fortnight’s count', () => {
    const tasks = [done(0), done(1), done(3), done(5), done(6), due('2026-03-16'), due('2026-03-19')];
    expect(projectHealth(tasks, NOW, TZ)).toEqual({
      state: 'on-track', word: 'On track', why: 'Next due Mon 16 Mar. 5 done in the last two weeks.',
    });
  });

  it('a still week is not a risk when nothing is due for two weeks', () => {
    expect(projectHealth([done(9), due('2026-04-30')], NOW, TZ)).toEqual({
      state: 'on-track', word: 'On track', why: 'Next due Thu 30 Apr. 1 done in the last two weeks.',
    });
    expect(projectHealth([done(20), due('2026-04-30')], NOW, TZ)!.why).toBe('Next due Thu 30 Apr.');
  });
});
