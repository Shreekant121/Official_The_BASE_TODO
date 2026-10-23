import { describe, expect, it } from 'vitest';
import {
  DIWALI, awayChanges, cleanBirthday, daysAway, focusSpans, hasDayToRecap, isRecapTime, lastActivityAt,
  recapHeadline, smallestStart, specialDayOf, specialWords, welcomeWords,
} from './dayMoments';
import type { FocusLogEntry } from '../store/useStore';
import type { WorkedJudge } from './workedTime';

const TZ = 'Asia/Kolkata';
/** Wall-clock time in Kolkata (+05:30) as an instant. */
const ist = (s: string) => Date.parse(`${s}+05:30`);
const counts: WorkedJudge = {
  taskReason: (taskId: string | undefined) => (taskId === 'chores' ? 'task' : undefined),
  listReason: () => undefined,
  projectReason: () => undefined,
  aboveTask: () => undefined,
} as unknown as WorkedJudge;

describe('special days (idea 109)', () => {
  it('keeps a birthday as MM-DD, from either spelling, and refuses a day that does not exist', () => {
    expect(cleanBirthday('1996-07-04')).toBe('07-04');
    expect(cleanBirthday('07-04')).toBe('07-04');
    expect(cleanBirthday('02-29')).toBe('02-29');
    expect(cleanBirthday('02-30')).toBeNull();
    expect(cleanBirthday('13-01')).toBeNull();
    expect(cleanBirthday('')).toBeNull();
    expect(cleanBirthday(42)).toBeNull();
  });

  it('knows his birthday, Diwali from the table, 1 January and BASE\'s birthday', () => {
    expect(specialDayOf('2027-07-04', '07-04')).toEqual({ kind: 'birthday' });
    expect(specialDayOf('2026-11-08', null)).toEqual({ kind: 'diwali' });
    expect(specialDayOf('2027-10-29', null)).toEqual({ kind: 'diwali' });
    expect(specialDayOf('2027-01-01', null)).toEqual({ kind: 'new-year', year: 2027 });
    expect(specialDayOf('2027-09-11', null)).toEqual({ kind: 'base', years: 1 });
    expect(specialDayOf('2029-09-11', null)).toEqual({ kind: 'base', years: 3 });
  });

  it('is no day at all on an ordinary date, on 2 January, or on BASE\'s own first day', () => {
    expect(specialDayOf('2026-10-15', '07-04')).toBeNull();
    expect(specialDayOf('2027-01-02', null)).toBeNull();
    expect(specialDayOf('2026-09-11', null)).toBeNull();
    /* Diwali's date in one year is not Diwali the next. */
    expect(specialDayOf('2027-11-08', null)).toBeNull();
  });

  it('puts his birthday first when two days fall together', () => {
    expect(specialDayOf('2027-01-01', '01-01')).toEqual({ kind: 'birthday' });
    expect(specialDayOf('2026-11-08', '11-08')).toEqual({ kind: 'birthday' });
  });

  it('keeps a 29 February birthday on the 28th in other years', () => {
    expect(specialDayOf('2027-02-28', '02-29')).toEqual({ kind: 'birthday' });
    expect(specialDayOf('2028-02-28', '02-29')).toBeNull();
    expect(specialDayOf('2028-02-29', '02-29')).toEqual({ kind: 'birthday' });
  });

  it('has a Diwali for every year to 2035, each in late October or November', () => {
    for (let year = 2026; year <= 2035; year++) {
      const day = DIWALI[year];
      expect(day.slice(0, 4)).toBe(String(year));
      expect(['10', '11']).toContain(day.slice(5, 7));
    }
  });

  it('words each day, with or without his name', () => {
    expect(specialWords({ kind: 'birthday' }, 'Shreekant', 0)).toEqual({ kicker: 'Your birthday', line: 'Happy birthday, Shreekant. Go easy today.' });
    expect(specialWords({ kind: 'diwali' }, undefined, 0).line).toBe('Happy Diwali. The light is on.');
    expect(specialWords({ kind: 'new-year', year: 2027 }, 'S', 0)).toEqual({ kicker: '1 January 2027', line: '2027 starts today.' });
    expect(specialWords({ kind: 'base', years: 1 }, 'S', 2140)).toEqual({ kicker: 'BASE turns one', line: 'A year together. 2,140 tasks done.' });
    expect(specialWords({ kind: 'base', years: 2 }, 'S', 0).line).toBe('Two years together.');
  });
});

describe('your day, recapped (idea 19)', () => {
  it('is recap time from 8pm on his clock, not the browser\'s', () => {
    expect(isRecapTime(new Date(ist('2026-03-12T19:59:00')), TZ)).toBe(false);
    expect(isRecapTime(new Date(ist('2026-03-12T20:00:00')), TZ)).toBe(true);
    expect(isRecapTime(new Date(ist('2026-03-12T23:59:00')), TZ)).toBe(true);
    expect(isRecapTime(new Date(ist('2026-03-13T00:10:00')), TZ)).toBe(false);
  });

  it('says one kind line for the day, perfect first', () => {
    const day = { worked: 0, available: 6 * 3600, done: 0, perfect: false, newBests: 0 };
    expect(recapHeadline({ ...day, perfect: true, newBests: 2 })).toBe('A perfect day.');
    expect(recapHeadline({ ...day, newBests: 1 })).toBe('A record day.');
    expect(recapHeadline({ ...day, worked: 3 * 3600 })).toBe('A good day.');
    expect(recapHeadline({ ...day, done: 3 })).toBe('A good day.');
    expect(recapHeadline({ ...day, worked: 600 })).toBe('A steady day.');
  });

  it('shows nothing for a day that held nothing', () => {
    expect(hasDayToRecap(0, 0)).toBe(false);
    expect(hasDayToRecap(60, 0)).toBe(true);
    expect(hasDayToRecap(0, 1)).toBe(true);
  });

  it('draws today\'s counted stretches in minutes after midnight, the running one too', () => {
    const entry = (id: string, taskId: string, start: string, seconds: number): FocusLogEntry => ({
      id, taskId, taskTitle: id, seconds, startedAt: ist(start), endedAt: ist(start) + seconds * 1000,
    });
    const spans = focusSpans([
      entry('b', 'write', '2026-03-12T14:00:00', 1800),
      entry('a', 'write', '2026-03-12T09:30:00', 3600),
      entry('y', 'write', '2026-03-11T22:00:00', 3600),
      entry('c', 'chores', '2026-03-12T11:00:00', 900),
      entry('late', 'write', '2026-03-12T23:30:00', 3600),
    ], '2026-03-12', TZ, counts, { taskId: 'write', startedAt: ist('2026-03-12T20:00:00'), now: ist('2026-03-12T20:15:00') });
    expect(spans).toEqual([
      { from: 570, to: 630 },
      { from: 840, to: 870 },
      { from: 1200, to: 1215 },
      { from: 1410, to: 1440 },
    ]);
  });
});

describe('welcome back (idea 110)', () => {
  const now = new Date(ist('2026-03-12T10:00:00'));

  it('counts calendar days from the later of this device and the data', () => {
    expect(daysAway(ist('2026-03-08T21:00:00'), null, now, TZ)).toBe(4);
    /* He was on the tablet yesterday: not away. */
    expect(daysAway(ist('2026-03-08T21:00:00'), ist('2026-03-11T18:00:00'), now, TZ)).toBe(1);
    expect(daysAway(null, ist('2026-03-09T23:59:00'), now, TZ)).toBe(3);
    expect(daysAway(null, null, now, TZ)).toBeNull();
  });

  it('finds the last sign of him: a tick, a new task, a stretch, time by hand', () => {
    expect(lastActivityAt([{ completedAt: 5 }, { createdAt: 9 }], [{ endedAt: 7 }], [{ at: 3 }])).toBe(9);
    expect(lastActivityAt([], [{ endedAt: 7 }], [{ at: 11 }])).toBe(11);
    expect(lastActivityAt([{}], [], [])).toBeNull();
  });

  it('counts deadlines passed while away and what is due today and tomorrow, open top-level only', () => {
    const away = ist('2026-03-08T21:00:00');
    const changes = awayChanges([
      { status: 'needsAction', deadline: '2026-03-10T09:00' },
      { status: 'needsAction', deadline: '2026-03-11T18:00' },
      { status: 'completed', deadline: '2026-03-10T09:00' },
      { status: 'needsAction', parent: 'p', deadline: '2026-03-10T09:00' },
      { status: 'needsAction', deadline: '2026-03-01T09:00' },
      { status: 'needsAction', deadline: '2026-03-13T12:00' },
      { status: 'needsAction', deadline: '2026-03-20T12:00' },
      { status: 'needsAction' },
    ], away, now, TZ);
    expect(changes).toEqual({ passed: 2, dueToday: 0, dueTomorrow: 1 });
    expect(awayChanges([{ status: 'needsAction', deadline: '2026-03-12T17:00' }], away, now, TZ).dueToday).toBe(1);
  });

  it('says what changed in one line, and "nothing is on fire" only when nothing is due today', () => {
    expect(welcomeWords(4, { passed: 2, dueToday: 0, dueTomorrow: 1 })).toEqual({
      title: "Welcome back. It's been four days.",
      changed: 'While you were away, two deadlines passed and one is due tomorrow. Nothing is on fire.',
    });
    expect(welcomeWords(3, { passed: 0, dueToday: 2, dueTomorrow: 1 }).changed).toBe('While you were away, two are due today.');
    expect(welcomeWords(12, { passed: 0, dueToday: 0, dueTomorrow: 0 })).toEqual({
      title: "Welcome back. It's been 12 days.",
      changed: 'Nothing moved while you were away. Nothing is on fire.',
    });
  });

  it('offers the best-ranked task that fits in a quarter hour, else the best', () => {
    const mins = (t: { m: number }) => t.m;
    expect(smallestStart([{ m: 60 }, { m: 10 }, { m: 5 }], mins)).toEqual({ m: 10 });
    expect(smallestStart([{ m: 60 }, { m: 45 }], mins)).toEqual({ m: 60 });
    expect(smallestStart([], mins)).toBeNull();
  });
});
