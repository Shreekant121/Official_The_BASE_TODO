import { describe, expect, it } from 'vitest';
import {
  bestDayShort, bestDayWords, buildMonthWrap, clockHour, coverWords, daysOfMonth, focusFigure, hasMonthToWrap, hoursCompareWords,
  hoursShort, hoursWords, monthName, ordinal, previousMonth, primeHours, primeShare, wrapMonthAt, wrapPages,
  bestDayInYear, bestMonth, daysOfPeriod, kindOf, periodName, previousPeriod, summaryStats, wrapYearAt,
} from './monthWrapped';
import { workedJudge } from './workedTime';
import { formatMinutes } from './dashboard/blockData';
import type { FocusLogEntry, Project, Task, TaskList } from '../store/useStore';
import type { HandLogEntry } from './dashboard/hours';

const TZ = 'Asia/Kolkata';
/** Wall-clock time in Kolkata (+05:30) as an instant. */
const ist = (s: string) => Date.parse(`${s}+05:30`);
const span = (seconds: number) => formatMinutes(seconds / 60);
const H = 3600;

const projects = [
  { id: 'studio', name: 'Studio Launch', createdAt: 0 },
  { id: 'exams', name: 'Mid-sem revision', createdAt: 0 },
  { id: 'chores', name: 'Chores', createdAt: 0, notWorked: true },
] as unknown as Project[];
const lists = [
  { id: 'l-studio', title: 'Build', projectId: 'studio' },
  { id: 'l-exams', title: 'Revise', projectId: 'exams' },
  { id: 'l-chores', title: 'House', projectId: 'chores' },
  { id: 'action', title: 'Action Steps' },
] as TaskList[];
const task = (id: string, listId: string, extra: Partial<Task> = {}) =>
  ({ id, title: id, listId, status: 'todo', createdAt: 0, ...extra }) as unknown as Task;
const backlog = [
  task('site', 'l-studio', { subtasks: [{ id: 'site-copy', title: 'Copy', completed: false }] as unknown as Task['subtasks'] }),
  task('maths', 'l-exams'),
  task('dishes', 'l-chores'),
  task('loose', 'action'),
  task('t1', 'l-studio', { status: 'completed', completedAt: ist('2026-09-02T18:00:00') }),
  task('t2', 'l-studio', { status: 'completed', completedAt: ist('2026-09-03T23:50:00') }),
  task('t3', 'l-exams', { status: 'completed', completedAt: ist('2026-10-01T00:10:00') }),
];
let n = 0;
const stretch = (taskId: string, start: string, seconds: number, extra: Partial<FocusLogEntry> = {}): FocusLogEntry => {
  const startedAt = ist(start);
  n += 1;
  return { id: `f${n}`, taskId, taskTitle: taskId, seconds, startedAt, endedAt: startedAt + seconds * 1000, ...extra };
};
const focusLog = [
  stretch('site', '2026-09-02T09:00:00', 2 * H),
  stretch('site-copy', '2026-09-03T10:30:00', 1 * H),
  stretch('maths', '2026-09-03T20:00:00', 1.5 * H),
  stretch('dishes', '2026-09-03T09:00:00', 3 * H), // doesn't count
  stretch('gone', '2026-09-04T09:15:00', 30 * 60, { projectId: 'exams' }), // task deleted since
  stretch('site', '2026-08-20T09:00:00', 1 * H), // August
  stretch('site', '2026-09-30T23:30:00', 1 * H), // across midnight into 1 October
];
const handLog: HandLogEntry[] = [
  { id: 'h1', day: '2026-09-05', seconds: 1.5 * H, projectId: 'exams', label: 'Exams', at: 0 },
  { id: 'h2', day: '2026-09-05', seconds: 1 * H, label: 'calls', at: 0 },
];
const wrap = () => buildMonthWrap({
  period: '2026-09', focusLog, handLog, backlog, lists, projects,
  judge: workedJudge(backlog, lists, projects), timeZone: TZ,
});

describe('months', () => {
  it('walks the calendar: the month before, every day in it, its name', () => {
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(previousMonth('2027-01')).toBe('2026-12');
    expect(daysOfMonth('2026-09')).toHaveLength(30);
    expect(daysOfMonth('2028-02')).toHaveLength(29);
    expect(daysOfMonth('2026-02').at(-1)).toBe('2026-02-28');
    expect(monthName('2026-09')).toBe('September');
  });

  it('offers last month from the 1st to the 7th on his clock, and nothing after (his call)', () => {
    expect(wrapMonthAt(new Date(ist('2026-10-01T00:05:00')), TZ)).toBe('2026-09');
    expect(wrapMonthAt(new Date(ist('2026-10-07T23:59:00')), TZ)).toBe('2026-09');
    expect(wrapMonthAt(new Date(ist('2026-10-08T00:00:00')), TZ)).toBeNull();
    expect(wrapMonthAt(new Date(ist('2027-01-03T10:00:00')), TZ)).toBe('2026-12');
    /* 30 September at 20:00 UTC is already 1 October in Kolkata. */
    expect(wrapMonthAt(new Date(Date.parse('2026-09-30T20:00:00Z')), TZ)).toBe('2026-09');
  });
});

describe('the wrap (idea 107)', () => {
  it('counts focus as the Hours block does: the timer and time by hand, less what does not count', () => {
    const w = wrap();
    /* 2 + 1 + 1.5 + 0.5 + 1 by timer (a stretch counts on the day it began), 2.5 by hand. */
    expect(w.focused).toBe(6 * H + 2.5 * H);
    expect(w.previousFocused).toBe(1 * H);
    expect(w.previousName).toBe('August');
    expect(w.days.find((d) => d.day === '2026-09-03')?.seconds).toBe(2.5 * H);
  });

  it('ranks projects by counted time, a subtask as its task, a gone task by what its log remembered', () => {
    const w = wrap();
    expect(w.projects).toEqual([
      { id: 'studio', name: 'Studio Launch', seconds: 4 * H },
      { id: 'exams', name: 'Mid-sem revision', seconds: 1.5 * H + 0.5 * H + 1.5 * H },
    ]);
  });

  it('reads when he focuses off the timer, spread across the hours a stretch ran through', () => {
    const w = wrap();
    expect(w.hours[9]).toBe(1 * H + 30 * 60);
    expect(w.hours[10]).toBe(1 * H + 30 * 60);
    expect(w.hours[11]).toBe(30 * 60);
    expect(w.hours[20]).toBe(1 * H);
    expect(w.hours[21]).toBe(30 * 60);
    expect(w.hours[23]).toBe(30 * 60);
    expect(w.hours[0]).toBe(30 * 60);
    expect(w.prime).toEqual({ from: 9, to: 11 });
  });

  it('finds the best day, the earliest of a tie, tasks done and the longest run inside the month', () => {
    const w = wrap();
    expect(w.best).toEqual({ day: '2026-09-03', seconds: 2.5 * H });
    expect(w.done).toBe(2);
    /* The 3rd and the 5th both hold 2h 30m; the 3rd came first. 2nd to 5th: focus or a tick on each. */
    expect(w.run).toBe(4);
  });

  it('says nothing about the hours on a thin month, and plays nothing on an empty one', () => {
    expect(primeHours(Array.from({ length: 24 }, (_, h) => (h === 9 ? 59 * 60 : 0)))).toBeNull();
    const empty = buildMonthWrap({
      period: '2026-06', focusLog, handLog, backlog, lists, projects,
      judge: workedJudge(backlog, lists, projects), timeZone: TZ,
    });
    expect(empty.best).toBeNull();
    expect(empty.prime).toBeNull();
    expect(empty.projects).toEqual([]);
    expect(hasMonthToWrap(empty)).toBe(false);
    expect(hasMonthToWrap({ focused: 0, done: 1 })).toBe(true);
  });
});

describe('words', () => {
  it('names the hours as he would say them', () => {
    expect(clockHour(0)).toBe('midnight');
    expect(clockHour(12)).toBe('noon');
    expect(clockHour(15)).toBe('3 pm');
    expect(hoursWords({ from: 9, to: 11 })).toBe('9 to 11 am');
    expect(hoursWords({ from: 11, to: 13 })).toBe('11 am to 1 pm');
    expect(hoursWords({ from: 10, to: 12 })).toBe('10 am to noon');
    expect(hoursWords({ from: 20, to: 22 })).toBe('8 to 10 pm');
    expect(hoursWords({ from: 22, to: 24 })).toBe('10 pm to midnight');
  });

  it('says the best day as a day of the week and a date', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(bestDayWords('2026-09-15')).toBe('Tuesday the 15th.');
    expect(bestDayShort('2026-09-22')).toBe('Tuesday 22nd');
  });

  it('compares with the month before, and a lighter month is never a scold', () => {
    const base = { previousName: 'August' };
    expect(hoursCompareWords({ ...base, focused: 42 * H, previousFocused: 36 * H }, span)).toBe('That\'s 2,520 minutes. 6h more than August.');
    expect(hoursCompareWords({ ...base, focused: 30 * H, previousFocused: 36 * H }, span)).toBe('That\'s 1,800 minutes. August had 6h more. Some months are lighter.');
    expect(hoursCompareWords({ ...base, focused: 36.5 * H, previousFocused: 36 * H }, span)).toBe('That\'s 2,190 minutes. About the same as August.');
    expect(hoursCompareWords({ ...base, focused: 5 * H, previousFocused: 0 }, span)).toBe('That\'s 300 minutes.');
    /* Under an hour the big number is the minutes already. */
    expect(hoursCompareWords({ ...base, focused: 40 * 60, previousFocused: 0 }, span)).toBe('');
    expect(hoursCompareWords({ ...base, focused: 40 * 60, previousFocused: 3 * H }, span)).toBe('August had 2h 20m more. Some months are lighter.');
  });

  it('gives the big number in hours, or minutes under one', () => {
    expect(focusFigure(42 * H + 20 * 60)).toEqual({ value: 42, unit: 'hours' });
    expect(focusFigure(1 * H)).toEqual({ value: 1, unit: 'hour' });
    expect(focusFigure(45 * 60)).toEqual({ value: 45, unit: 'minutes' });
  });

  it('names the cover and the short prime time', () => {
    expect(coverWords('2026-09')).toBe('Thirty days, one story. Let\'s look back.');
    expect(coverWords('2026-02')).toBe('Twenty-eight days, one story. Let\'s look back.');
    expect(hoursShort({ from: 9, to: 11 })).toBe('9–11 am');
    expect(hoursShort({ from: 11, to: 13 })).toBe('11 am–1 pm');
  });
});

describe('the story', () => {
  it('plays only the pages that have something true to say', () => {
    expect(wrapPages(wrap())).toEqual(['cover', 'hours', 'projects', 'when', 'best', 'type', 'summary']);
    expect(wrapPages({ kind: 'month', focused: 0, projects: [], prime: null, best: null, pushed: null, type: null })).toEqual(['cover', 'summary']);
  });

  it('says how much of the timer fell in the prime hours', () => {
    const w = wrap();
    /* 9 and 10 o'clock hold 3h of the timer's September hours. */
    const total = w.hours.reduce((a, b) => a + b, 0);
    expect(primeShare(w.hours, w.prime!)).toBe(Math.round((3 * H / total) * 100));
    expect(primeShare(Array.from({ length: 24 }, () => 0), { from: 9, to: 11 })).toBe(0);
  });
});

describe('29-1P14e2: the year, the type, the summary', () => {
  it('offers last year from the 1st to the 7th of January only (his call)', () => {
    expect(wrapYearAt(new Date(ist('2027-01-01T00:05:00')), TZ)).toBe('2026');
    expect(wrapYearAt(new Date(ist('2027-01-07T23:59:00')), TZ)).toBe('2026');
    expect(wrapYearAt(new Date(ist('2027-01-08T00:00:00')), TZ)).toBeNull();
    expect(wrapYearAt(new Date(ist('2026-10-01T10:00:00')), TZ)).toBeNull();
  });

  it('walks a year as it walks a month', () => {
    expect(kindOf('2026')).toBe('year');
    expect(kindOf('2026-09')).toBe('month');
    expect(daysOfPeriod('2026')).toHaveLength(365);
    expect(daysOfPeriod('2028')).toHaveLength(366);
    expect(previousPeriod('2026')).toBe('2025');
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(periodName('2026')).toBe('2026');
    expect(coverWords('2026')).toBe('Twelve months, one story. Let\'s look back.');
    expect(bestDayShort('2026-03-17', 'year')).toBe('17 March');
    expect(bestDayInYear('2026-03-17')).toBe('Tuesday 17 March');
  });

  it('counts a year: every month\'s focus, the year before, its months in place of a calendar', () => {
    const y = buildMonthWrap({
      period: '2026', focusLog, handLog, backlog, lists, projects,
      judge: workedJudge(backlog, lists, projects), timeZone: TZ,
    });
    expect(y.kind).toBe('year');
    expect(y.previousName).toBe('2025');
    expect(y.months).toHaveLength(12);
    const sept = y.months.find((m) => m.month === '2026-09')!;
    const aug = y.months.find((m) => m.month === '2026-08')!;
    expect(sept.seconds).toBe(wrap().focused);
    expect(aug.seconds).toBe(1 * H);
    /* The stretch across midnight on 30 September is September's, as the month counts it. */
    expect(y.focused).toBe(sept.seconds + aug.seconds);
    expect(bestMonth(y)).toEqual(sept);
    expect(wrapPages(y)).toEqual(['cover', 'hours', 'projects', 'when', 'months', 'type', 'summary']);
    expect(wrap().months).toEqual([]);
  });

  it('names the month\'s focus type from when and how long', () => {
    expect(wrap().type).toEqual({
      name: 'The Morning Runner', phase: 'morning', style: 'runner',
      facts: ['Starts around 10 am', 'Sittings of about 1h', 'Wednesdays run longest'],
    });
  });

  it('leaves the pushed page out until the stories are read, and with none pushed twice', () => {
    expect(wrap().pushed).toBeNull();
    const withStories = buildMonthWrap({
      period: '2026-09', focusLog, handLog, backlog, lists, projects,
      judge: workedJudge(backlog, lists, projects), timeZone: TZ,
      stories: new Map([['maths', [
        { at: ist('2026-09-01T10:00:00'), k: 'avoided', n: 1 },
        { at: ist('2026-09-04T10:00:00'), k: 'avoided', n: 2 },
      ]]]),
    });
    expect(withStories.pushed).toEqual({ id: 'maths', title: 'maths', pushes: 2, done: false, seconds: 1.5 * H });
    expect(wrapPages(withStories)).toContain('pushed');
  });

  it('lists the summary once, for the page and the picture alike', () => {
    const stats = summaryStats(wrap(), { studio: 'oklch(0.7 0.1 160)' }, span);
    expect(stats.map((s) => [s.label, s.value])).toEqual([
      ['Focused', span(wrap().focused)],
      ['Tasks done', '2'],
      ['Top project', 'Studio Launch'],
      ['Longest run', '4 days in a row'],
      ['Sharpest', '9–11 am'],
      ['Best day', 'Thursday 3rd'],
      ['Focus type', 'Morning Runner'],
    ]);
    expect(stats[2].colour).toBe('oklch(0.7 0.1 160)');
    expect(stats.at(-1)).toMatchObject({ wide: true, colour: 'var(--job-orange)' });
  });
});
