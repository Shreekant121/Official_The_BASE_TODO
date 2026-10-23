import { describe, expect, it } from 'vitest';
import { defaultHours } from './hours';
import { dayLoads, dayPhrase, daysBetween, dayWord, loadDots, weekMonths, weekPhrase, type LoadTask } from './weekStrip';

const TZ = 'Asia/Kolkata';
/** Thursday 12 March 2026, the fixture's frozen day. */
const TODAY = '2026-03-12';

const task = (id: string, deadline: string | undefined, extra: Partial<LoadTask> = {}): LoadTask => ({
  id, status: 'needsAction', deadline, ...extra,
});
const hour = () => 60;

describe('loadDots', () => {
  it('gives a quarter of the day a dot, at least one for any work', () => {
    expect(loadDots(0, 720)).toEqual({ dots: 0, over: false });
    expect(loadDots(10, 720)).toEqual({ dots: 1, over: false });
    expect(loadDots(180, 720)).toEqual({ dots: 1, over: false });
    expect(loadDots(181, 720)).toEqual({ dots: 2, over: false });
    expect(loadDots(720, 720)).toEqual({ dots: 4, over: false });
  });

  it('goes coral past the day, and on a day with no hours', () => {
    expect(loadDots(721, 720)).toEqual({ dots: 4, over: true });
    expect(loadDots(30, 0)).toEqual({ dots: 4, over: true });
    expect(loadDots(0, 0)).toEqual({ dots: 0, over: false });
  });
});

describe('dayLoads', () => {
  it('sums the open work due each day against its weekday hours', () => {
    const backlog = [
      task('a', '2026-03-12T10:00'),
      task('b', '2026-03-12T19:00'),
      task('c', '2026-03-14T18:00'),
      task('d', '2026-03-20T18:00'),
    ];
    const loads = dayLoads(backlog, ['2026-03-12', '2026-03-13', '2026-03-14'], TZ, new Set(), defaultHours(), () => 90);
    expect(loads.map((l) => l.dueMinutes)).toEqual([180, 0, 90]);
    /* Thursday has 12 hours, Saturday 6. */
    expect(loads.map((l) => l.availableMinutes)).toEqual([720, 720, 360]);
    expect(loads.map((l) => l.dots)).toEqual([1, 0, 1]);
  });

  it('leaves out finished, ignored and nested work, and undated tasks', () => {
    const backlog = [
      task('done', '2026-03-12T10:00', { status: 'completed' }),
      task('ignored', '2026-03-12T10:00'),
      task('sub', '2026-03-12T10:00', { parent: 'x' }),
      task('undated', undefined),
      task('counted', '2026-03-12T10:00'),
    ];
    const [load] = dayLoads(backlog, [TODAY], TZ, new Set(['ignored']), defaultHours(), hour);
    expect(load.dueMinutes).toBe(60);
  });

  it('reads a day override as that day\'s hours', () => {
    const hours = { ...defaultHours(), overrides: { [TODAY]: 3600 } };
    const [load] = dayLoads([task('a', '2026-03-12T10:00'), task('b', '2026-03-12T12:00')], [TODAY], TZ, new Set(), hours, hour);
    expect(load).toMatchObject({ availableMinutes: 60, dueMinutes: 120, dots: 4, over: true });
  });
});

describe('words', () => {
  it('names a day by how near it is', () => {
    expect(dayWord(TODAY, TODAY)).toBe('Today');
    expect(dayWord('2026-03-13', TODAY)).toBe('Tomorrow');
    expect(dayWord('2026-03-11', TODAY)).toBe('Yesterday');
    expect(dayWord('2026-03-16', TODAY)).toBe('Mon 16 Mar');
    expect(dayPhrase('2026-03-13', TODAY)).toBe('tomorrow');
    expect(dayPhrase('2026-03-16', TODAY)).toBe('on Mon 16 Mar');
  });

  it('counts whole days across a month and a clock change', () => {
    expect(daysBetween('2026-03-28', '2026-04-02')).toBe(5);
    expect(daysBetween(TODAY, '2026-03-09')).toBe(-3);
  });

  it('names the week, Monday first', () => {
    expect(weekPhrase('2026-03-15', TODAY)).toBe('this week');
    expect(weekPhrase('2026-03-16', TODAY)).toBe('next week');
    expect(weekPhrase('2026-03-08', TODAY)).toBe('last week');
    expect(weekPhrase('2026-03-26', TODAY)).toBe('in the week of 23 Mar');
  });

  it('heads the strip with its month, both across a turn, the year when it is not this one', () => {
    expect(weekMonths(['2026-03-09', '2026-03-15'], TODAY)).toBe('March');
    expect(weekMonths(['2026-03-30', '2026-04-05'], TODAY)).toBe('Mar – Apr');
    expect(weekMonths(['2026-12-28', '2027-01-03'], TODAY)).toBe('Dec – Jan 2027');
    expect(weekMonths(['2027-01-04', '2027-01-10'], TODAY)).toBe('January 2027');
  });
});
