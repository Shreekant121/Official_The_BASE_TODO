import { describe, expect, it } from 'vitest';
import {
  addMonths, calendarKicker, calendarTitle, calendarView, clockWords, dayDots, dayLabel, eventsOnDays, monthWeeks,
  pageDays, pageHolds, stepDay, tasksDueOn, zoomLanding, zoomedView, type CalendarTask, type DueItem,
} from './calendar';
import type { BaseEvent } from '../events/events';

const TZ = 'Asia/Kolkata';
/** Thursday 12 March 2026, 09:30 in Kolkata — the fixture's frozen clock. */
const NOW = new Date('2026-03-12T09:30:00+05:30');
const TODAY = '2026-03-12';

const event = (id: string, start: string, extra: Partial<BaseEvent> = {}): BaseEvent => ({
  id, title: id, start, createdAt: 0, ...extra,
});
const task = (id: string, deadline: string | undefined, extra: Partial<CalendarTask> = {}): CalendarTask => ({
  id, title: id, status: 'todo', deadline, ...extra,
});

describe('the days on a page', () => {
  it('reads an unknown view as the month', () => {
    expect(calendarView('year')).toBe('month');
    expect(calendarView(undefined)).toBe('month');
    expect(calendarView('day')).toBe('day');
  });

  it('moves a month keeping the date, clamped to a shorter month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-12', -3)).toBe('2025-12-12');
    expect(addMonths('2026-12-05', 1)).toBe('2027-01-05');
  });

  it('draws a month as six Monday weeks from the week of its 1st', () => {
    const weeks = monthWeeks(TODAY);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    /* 1 March 2026 is a Sunday, so its week starts on Monday 23 February. */
    expect(weeks[0][0]).toBe('2026-02-23');
    expect(weeks[0][6]).toBe('2026-03-01');
    expect(weeks[5][6]).toBe('2026-04-05');
  });

  it('turns a day, a week or a month a page', () => {
    expect(stepDay('day', TODAY, 1)).toBe('2026-03-13');
    expect(stepDay('week', TODAY, -1)).toBe('2026-03-05');
    expect(stepDay('month', TODAY, 1)).toBe('2026-04-12');
    expect(pageDays('day', TODAY, -1)).toEqual(['2026-03-11']);
    expect(pageDays('week', TODAY, 0)[0]).toBe('2026-03-09');
    expect(pageDays('month', TODAY, 1)).toHaveLength(42);
    expect(pageDays('month', TODAY, 1)[0]).toBe('2026-03-30');
  });

  it('knows when the page already holds a day', () => {
    expect(pageHolds('day', TODAY, TODAY)).toBe(true);
    expect(pageHolds('week', '2026-03-15', TODAY)).toBe(true);
    expect(pageHolds('week', '2026-03-16', TODAY)).toBe(false);
    expect(pageHolds('month', '2026-03-31', TODAY)).toBe(true);
  });
});

describe('eventsOnDays', () => {
  it('places a timed event in its minutes, an hour long without an end', () => {
    const [item] = eventsOnDays([event('class', '2026-03-12T10:00', { colour: 'rose', location: 'Hall' })], [TODAY], TZ);
    expect(item).toMatchObject({ eventId: 'class', day: TODAY, start: 600, end: 660, allDay: false, colour: 'rose', location: 'Hall' });
  });

  it('runs an all-day event the whole of each of its days, sky by default', () => {
    const items = eventsOnDays([event('trip', '2026-03-12', { end: '2026-03-14' })], ['2026-03-11', TODAY, '2026-03-13', '2026-03-14', '2026-03-15'], TZ);
    expect(items.map((i) => i.day)).toEqual([TODAY, '2026-03-13', '2026-03-14']);
    expect(items.every((i) => i.allDay && i.start === 0 && i.end === 1440 && i.colour === 'sky')).toBe(true);
  });

  it('draws a night past midnight on both days, clipped', () => {
    const items = eventsOnDays([event('party', '2026-03-12T22:00', { end: '2026-03-13T02:00' })], [TODAY, '2026-03-13'], TZ);
    expect(items.map((i) => [i.day, i.start, i.end])).toEqual([[TODAY, 1320, 1440], ['2026-03-13', 0, 120]]);
  });

  it('finds every occurrence of a repeat on the page, and nothing before its start', () => {
    const weekly = event('gym', '2026-03-03T07:00', { recurrence: 'weekly' });
    const days = pageDays('month', TODAY, 0);
    const items = eventsOnDays([weekly], days, TZ);
    expect(items.map((i) => i.day)).toEqual(['2026-03-03', '2026-03-10', '2026-03-17', '2026-03-24', '2026-03-31']);
    expect(items.every((i) => i.start === 420)).toBe(true);
  });

  it('keeps a yearly birthday on its day of each year', () => {
    const birthday = event('bday', '2020-03-12', { recurrence: 'yearly' });
    expect(eventsOnDays([birthday], pageDays('week', TODAY, 0), TZ).map((i) => i.day)).toEqual([TODAY]);
    expect(eventsOnDays([birthday], pageDays('week', TODAY, 1), TZ)).toEqual([]);
  });

  it('puts all-day events first on their day', () => {
    const items = eventsOnDays([event('early', '2026-03-12T06:00'), event('allday', TODAY)], [TODAY], TZ);
    expect(items.map((i) => i.eventId)).toEqual(['allday', 'early']);
  });
});

describe('tasksDueOn', () => {
  it('lists top-level work due on the days, in his zone, soonest first', () => {
    const due = tasksDueOn(
      [
        task('late', '2026-03-12T08:00'),
        task('open', '2026-03-12T17:30'),
        task('done', '2026-03-12T07:00', { status: 'completed' }),
        task('sub', '2026-03-12T10:00', { parent: 'open' }),
        task('ignored', '2026-03-12T11:00'),
        task('tomorrow', '2026-03-13T09:00'),
        task('undated', undefined),
      ],
      [TODAY],
      TZ,
      new Set(['ignored']),
      NOW,
    );
    expect(due.map((d) => [d.taskId, d.time, d.late, d.done])).toEqual([
      ['done', '07:00', false, true],
      ['late', '08:00', true, false],
      ['open', '17:30', false, false],
    ]);
  });
});

describe('dayDots (idea 53)', () => {
  const due = (taskId: string, extra: Partial<DueItem>): DueItem => ({
    taskId, title: taskId, day: TODAY, time: '18:00', done: false, late: false, ...extra,
  });

  it('colours events by their own colour first, then late, due and done work', () => {
    const events = eventsOnDays([event('class', '2026-03-12T10:00', { colour: 'rose' })], [TODAY], TZ);
    const dots = dayDots(events, [due('d', { done: true }), due('o', {}), due('l', { late: true })]).get(TODAY)!;
    expect(dots.tones).toEqual(['rose', 'late', 'due', 'done']);
    expect(dots).toMatchObject({ more: 0, events: 1, tasks: 3 });
  });

  it('shows four at most and counts the rest', () => {
    const dots = dayDots([], ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => due(id, {}))).get(TODAY)!;
    expect(dots.tones).toHaveLength(4);
    expect(dots.more).toBe(2);
  });

  it('has no entry for an empty day', () => {
    expect(dayDots([], []).get(TODAY)).toBeUndefined();
  });
});

describe('words', () => {
  it('titles each view, with the year only when it is not this one', () => {
    expect(calendarTitle('day', TODAY, TODAY)).toBe('Thursday 12 March');
    expect(calendarTitle('month', TODAY, TODAY)).toBe('March');
    expect(calendarTitle('month', '2027-01-04', TODAY)).toBe('January 2027');
    expect(calendarTitle('week', TODAY, TODAY)).toBe('9 – 15 March');
    expect(calendarTitle('week', '2026-03-31', TODAY)).toBe('30 Mar – 5 Apr');
    expect(calendarTitle('week', '2026-12-31', TODAY)).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('says Today, This week or This month where it applies', () => {
    expect(calendarKicker('day', TODAY, TODAY)).toBe('Today');
    expect(calendarKicker('day', '2026-03-13', TODAY)).toBe('Tomorrow');
    expect(calendarKicker('day', '2026-03-20', TODAY)).toBeNull();
    expect(calendarKicker('week', '2026-03-16', TODAY)).toBe('Next week');
    expect(calendarKicker('month', '2026-02-02', TODAY)).toBe('Last month');
    expect(calendarKicker('month', '2026-07-02', TODAY)).toBeNull();
  });

  it('labels a day for a screen reader', () => {
    expect(dayLabel(TODAY, undefined)).toBe('Thursday 12 March, nothing on');
    expect(dayLabel(TODAY, { tones: ['sky'], more: 0, events: 1, tasks: 2 })).toBe('Thursday 12 March, 1 event, 2 tasks');
  });

  it('writes a clock the short way', () => {
    expect(clockWords(570)).toBe('9:30am');
    expect(clockWords(1080)).toBe('6pm');
    expect(clockWords(0)).toBe('12am');
  });
});

describe('pinching between the views', () => {
  it('zooms out day, week, month and back in, and no further either way', () => {
    expect(zoomedView('day', 'out')).toBe('week');
    expect(zoomedView('week', 'out')).toBe('month');
    expect(zoomedView('month', 'out')).toBeNull();
    expect(zoomedView('month', 'in')).toBe('week');
    expect(zoomedView('week', 'in')).toBe('day');
    expect(zoomedView('day', 'in')).toBeNull();
  });

  it('dives into the day under the fingers, and zooms out holding the day it was on', () => {
    expect(zoomLanding('in', TODAY, '2026-03-19')).toBe('2026-03-19');
    expect(pageDays('week', zoomLanding('in', TODAY, '2026-03-19'), 0)).toContain('2026-03-19');
    expect(zoomLanding('in', TODAY, null)).toBe(TODAY);
    expect(zoomLanding('out', TODAY, '2026-03-19')).toBe(TODAY);
  });
});
