import { describe, expect, it } from 'vitest';
import {
  eveningDeadline, eveningPatch, hourLabel, isEvening, nowMinutes, placeLanes, rangeDays, rangeTitle,
  timelineItems, timelineRange, type TimelineItem, type TimelineTask,
} from './timeline';

const TZ = 'Asia/Kolkata';
/** Thursday 12 March 2026, 09:30 in Kolkata — the fixture's frozen clock. */
const NOW = new Date('2026-03-12T09:30:00+05:30');
const TODAY = '2026-03-12';

const task = (id: string, deadline: string | undefined, extra: Partial<TimelineTask> = {}): TimelineTask => ({
  id, title: id, status: 'todo', deadline, ...extra,
});
const hour = () => 60;

describe('rangeDays', () => {
  it('moves a whole range per page', () => {
    expect(rangeDays('day', TODAY, 0)).toEqual(['2026-03-12']);
    expect(rangeDays('day', TODAY, -1)).toEqual(['2026-03-11']);
    expect(rangeDays('three', TODAY, 1)).toEqual(['2026-03-15', '2026-03-16', '2026-03-17']);
  });

  it('takes the calendar week, Monday first', () => {
    expect(rangeDays('week', TODAY, 0)).toEqual([
      '2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15',
    ]);
    expect(rangeDays('week', TODAY, 1)[0]).toBe('2026-03-16');
  });

  it('reads an unknown range as today', () => {
    expect(timelineRange('month')).toBe('day');
    expect(timelineRange(undefined)).toBe('day');
    expect(timelineRange('week')).toBe('week');
  });
});

describe('timelineItems', () => {
  it('draws a task as a block ending at its deadline, its length long', () => {
    const [item] = timelineItems([task('a', '2026-03-12T17:00')], [TODAY], TZ, new Set(), NOW, () => 90);
    expect(item).toMatchObject({ taskId: 'a', day: TODAY, start: 15 * 60 + 30, end: 17 * 60, done: false, late: false });
  });

  it('splits a block that crosses midnight between the two days', () => {
    const items = timelineItems([task('a', '2026-03-13T00:30')], ['2026-03-12', '2026-03-13'], TZ, new Set(), NOW, hour);
    expect(items.map((i) => [i.day, i.start, i.end])).toEqual([
      ['2026-03-12', 23 * 60 + 30, 24 * 60],
      ['2026-03-13', 0, 30],
    ]);
  });

  it('keeps finished work with its tick, and leaves out subtasks, ignored work and undated tasks', () => {
    const items = timelineItems(
      [
        task('done', '2026-03-12T11:00', { status: 'completed' }),
        task('sub', '2026-03-12T12:00', { parent: 'x' }),
        task('ignored', '2026-03-12T13:00'),
        task('undated', undefined),
        task('other day', '2026-03-14T13:00'),
      ],
      [TODAY], TZ, new Set(['ignored']), NOW, hour,
    );
    expect(items.map((i) => [i.taskId, i.done])).toEqual([['done', true]]);
  });

  it('marks an open block whose deadline has passed as late', () => {
    const [item] = timelineItems([task('a', '2026-03-12T09:00')], [TODAY], TZ, new Set(), NOW, hour);
    expect(item.late).toBe(true);
  });
});

describe('placeLanes', () => {
  const item = (id: string, start: number, end: number, day = TODAY): TimelineItem =>
    ({ taskId: id, title: id, day, start, end, done: false, late: false });

  it('puts overlapping blocks side by side and gives the run one width', () => {
    const placed = placeLanes([item('a', 600, 720), item('b', 660, 690), item('c', 700, 760), item('d', 800, 830)]);
    const of = (id: string) => placed.find((p) => p.taskId === id)!;
    expect([of('a').lane, of('b').lane, of('c').lane]).toEqual([0, 1, 1]);
    expect([of('a').lanes, of('b').lanes, of('c').lanes]).toEqual([2, 2, 2]);
    expect([of('d').lane, of('d').lanes]).toEqual([0, 1]);
  });

  it('counts a short block as tall as it is drawn', () => {
    const placed = placeLanes([item('a', 600, 605), item('b', 610, 640)], 20);
    expect(placed.map((p) => p.lanes)).toEqual([2, 2]);
  });

  it('lays out each day on its own', () => {
    const placed = placeLanes([item('a', 600, 700), item('b', 600, 700, '2026-03-13')]);
    expect(placed.map((p) => p.lanes)).toEqual([1, 1]);
  });
});

describe('this evening', () => {
  it('starts after 6pm: due at 6pm is a day task, and so is a bare date', () => {
    expect(isEvening('2026-03-12T18:00')).toBe(false);
    expect(isEvening('2026-03-12T18:01')).toBe(true);
    expect(isEvening('2026-03-12')).toBe(false);
    expect(isEvening(undefined)).toBe(false);
  });

  it('lands at 9pm, or the end of the day within an hour of it', () => {
    expect(eveningDeadline(NOW, TZ)).toBe('2026-03-12T21:00');
    expect(eveningDeadline(new Date('2026-03-12T19:59:00+05:30'), TZ)).toBe('2026-03-12T21:00');
    expect(eveningDeadline(new Date('2026-03-12T20:00:00+05:30'), TZ)).toBe('2026-03-12T23:59');
  });

  it('remembers the time it had, and puts it back', () => {
    const sent = eveningPatch({ deadline: '2026-03-12T14:00' }, NOW, TZ);
    expect(sent).toEqual({ deadline: '2026-03-12T21:00', beforeEvening: { was: '2026-03-12T14:00', to: '2026-03-12T21:00' } });
    const back = eveningPatch({ deadline: sent.deadline, beforeEvening: sent.beforeEvening }, NOW, TZ);
    expect(back).toEqual({ deadline: '2026-03-12T14:00', beforeEvening: undefined });
  });

  it('comes back to 6pm when the deadline was changed in between', () => {
    const back = eveningPatch(
      { deadline: '2026-03-12T22:30', beforeEvening: { was: '2026-03-12T14:00', to: '2026-03-12T21:00' } }, NOW, TZ,
    );
    expect(back).toEqual({ deadline: '2026-03-12T18:00', beforeEvening: undefined });
  });

  it('sends an overdue task from yesterday to tonight, and back to yesterday', () => {
    const sent = eveningPatch({ deadline: '2026-03-11T15:00' }, NOW, TZ);
    expect(sent.deadline).toBe('2026-03-12T21:00');
    expect(eveningPatch({ ...sent }, NOW, TZ).deadline).toBe('2026-03-11T15:00');
  });

  it('brings an undated task back to undated', () => {
    const sent = eveningPatch({}, NOW, TZ);
    expect(sent.beforeEvening).toEqual({ to: '2026-03-12T21:00' });
    expect(eveningPatch({ ...sent }, NOW, TZ)).toEqual({ deadline: undefined, beforeEvening: undefined });
  });
});

describe('words', () => {
  it('names a page', () => {
    expect(rangeTitle('day', [TODAY], TODAY)).toBe('Today');
    expect(rangeTitle('day', ['2026-03-13'], TODAY)).toBe('Tomorrow');
    expect(rangeTitle('day', ['2026-03-16'], TODAY)).toBe('Mon 16 Mar');
    expect(rangeTitle('three', rangeDays('three', TODAY, 0), TODAY)).toBe('Next 3 days');
    expect(rangeTitle('three', rangeDays('three', TODAY, 1), TODAY)).toBe('15–17 Mar');
    expect(rangeTitle('week', rangeDays('week', TODAY, 0), TODAY)).toBe('This week');
    expect(rangeTitle('week', rangeDays('week', TODAY, 1), TODAY)).toBe('Next week');
    expect(rangeTitle('week', rangeDays('week', TODAY, 3), TODAY)).toBe('30 Mar – 5 Apr');
  });

  it('marks the hours', () => {
    expect([0, 9, 12, 18, 23].map(hourLabel)).toEqual(['12 am', '9 am', '12 pm', '6 pm', '11 pm']);
  });

  it('puts the now line only in today', () => {
    expect(nowMinutes(TODAY, NOW, TZ)).toBe(9 * 60 + 30);
    expect(nowMinutes('2026-03-13', NOW, TZ)).toBeNull();
  });
});
