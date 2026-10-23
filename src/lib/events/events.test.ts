import { describe, expect, it } from 'vitest';
import {
  cleanEventDraft, countdownFace, countdownReading, countdownText, describeWhen, eventMoment, flapGroups, isEventDate, journeySpan,
  nextShape, passedEvents, shortDay, upcomingEvents,
  type BaseEvent,
} from './events';

const TZ = 'Asia/Kolkata';
/** A wall clock in Kolkata (+05:30, no daylight saving). */
const at = (local: string) => new Date(`${local}:00+05:30`);

let n = 0;
const event = (over: Partial<BaseEvent>): BaseEvent => ({ id: `e${++n}`, title: 'Event', start: '2026-11-12', createdAt: 0, ...over });

describe('cleanEventDraft', () => {
  it('needs a title and a real start', () => {
    expect(cleanEventDraft({ title: '  ', start: '2026-11-12' })).toBeNull();
    expect(cleanEventDraft({ title: 'Run', start: '2026-02-30' })).toBeNull();
    expect(cleanEventDraft({ title: 'Run', start: '12 Nov' })).toBeNull();
  });

  it('leaves empty words and defaults out rather than storing them', () => {
    expect(cleanEventDraft({
      title: '  Mumbai   Marathon ', start: '2026-11-12T06:00', location: ' ', notes: '', colour: 'sky',
      countdown: 'days-hours', recurrence: 'none',
    })).toEqual({ title: 'Mumbai Marathon', start: '2026-11-12T06:00' });
  });

  it('drops an end in the other shape, or before the start', () => {
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12T06:00', end: '2026-11-13' })?.end).toBeUndefined();
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12T06:00', end: '2026-11-12T05:00' })?.end).toBeUndefined();
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', end: '2026-11-14' })?.end).toBe('2026-11-14');
  });

  it('keeps a custom repeat only with its rule', () => {
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', recurrence: 'custom' })?.recurrence).toBeUndefined();
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', recurrence: 'custom', recurrenceRule: 'FREQ=YEARLY;INTERVAL=1' }))
      .toMatchObject({ recurrence: 'custom', recurrenceRule: 'FREQ=YEARLY;INTERVAL=1' });
  });

  it('knows a real date and time', () => {
    expect(isEventDate('2026-11-12T23:59')).toBe(true);
    expect(isEventDate('2026-11-12T24:00')).toBe(false);
    expect(isEventDate('2027-02-29')).toBe(false);
  });
});

describe('eventMoment', () => {
  it('a one-off is coming, then now, then passed', () => {
    const race = event({ start: '2026-11-12T06:00', end: '2026-11-12T10:00' });
    expect(eventMoment(race, at('2026-11-11T09:00'), TZ)?.kind).toBe('coming');
    expect(eventMoment(race, at('2026-11-12T08:00'), TZ)?.kind).toBe('now');
    expect(eventMoment(race, at('2026-11-12T10:00'), TZ)?.kind).toBe('passed');
  });

  it('a timed event with no end is an hour long', () => {
    const call = event({ start: '2026-11-12T06:00' });
    expect(eventMoment(call, at('2026-11-12T06:59'), TZ)?.kind).toBe('now');
    expect(eventMoment(call, at('2026-11-12T07:00'), TZ)?.kind).toBe('passed');
  });

  it('an all-day event lasts all of its day, and all of its last day', () => {
    const trip = event({ start: '2026-11-12', end: '2026-11-14' });
    expect(eventMoment(trip, at('2026-11-12T00:00'), TZ)?.kind).toBe('now');
    expect(eventMoment(trip, at('2026-11-14T23:59'), TZ)?.kind).toBe('now');
    expect(eventMoment(trip, at('2026-11-15T00:00'), TZ)?.kind).toBe('passed');
  });

  it('a yearly birthday is today all day, then rolls on to next year', () => {
    const birthday = event({ start: '2000-03-09', recurrence: 'yearly' });
    const today = eventMoment(birthday, at('2026-03-09T22:00'), TZ);
    expect(today).toMatchObject({ kind: 'now', day: '2026-03-09', occurrence: 27 });
    expect(eventMoment(birthday, at('2026-03-10T00:00'), TZ)).toMatchObject({ kind: 'coming', day: '2027-03-09' });
  });

  it('a 29 February birthday lands on the 28th in a short year, as a task would', () => {
    const leap = event({ start: '2024-02-29', recurrence: 'yearly' });
    expect(eventMoment(leap, at('2026-01-01T09:00'), TZ)?.day).toBe('2026-02-28');
    expect(eventMoment(leap, at('2027-12-01T09:00'), TZ)?.day).toBe('2028-02-29');
  });

  it('a weekly class is now while it runs, and next week once it ends', () => {
    const cls = event({ start: '2026-10-19T18:00', end: '2026-10-19T19:30', recurrence: 'weekly' });
    expect(eventMoment(cls, at('2026-10-26T19:00'), TZ)).toMatchObject({ kind: 'now', day: '2026-10-26' });
    expect(eventMoment(cls, at('2026-10-26T19:30'), TZ)).toMatchObject({ kind: 'coming', day: '2026-11-02' });
  });

  it('a custom repeat follows its rule: the last Friday of the month', () => {
    const review = event({ start: '2026-10-30T17:00', recurrence: 'custom', recurrenceRule: 'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR' });
    expect(eventMoment(review, at('2026-10-31T09:00'), TZ)?.day).toBe('2026-11-27');
  });

  it('a series that has run out is passed', () => {
    const course = event({ start: '2026-10-01T09:00', recurrence: 'custom', recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=2' });
    expect(eventMoment(course, at('2026-10-08T09:30'), TZ)?.kind).toBe('now');
    expect(eventMoment(course, at('2026-10-20T09:00'), TZ)).toMatchObject({ kind: 'passed', ended: true });
  });

  it('keeps the wall clock across a change of the clocks', () => {
    const standup = event({ start: '2026-10-20T09:00', recurrence: 'weekly' });
    const london = eventMoment(standup, new Date('2026-10-28T12:00:00Z'), 'Europe/London');
    expect(london && new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(london.start)).toBe('09:00');
  });
});

describe('upcoming and passed', () => {
  it('splits the list: soonest first, and the archive newest first', () => {
    const a = event({ title: 'Later', start: '2026-12-01' });
    const b = event({ title: 'Sooner', start: '2026-11-01' });
    const c = event({ title: 'Long ago', start: '2026-01-01' });
    const d = event({ title: 'Lately', start: '2026-10-01' });
    const now = at('2026-10-21T09:00');
    expect(upcomingEvents([a, b, c, d], now, TZ).map((x) => x.event.title)).toEqual(['Sooner', 'Later']);
    expect(passedEvents([a, b, c, d], now, TZ).map((x) => x.event.title)).toEqual(['Lately', 'Long ago']);
  });
});

describe('countdownReading', () => {
  const read = (e: BaseEvent, now: Date, style?: BaseEvent['countdown']) =>
    countdownText(countdownReading(eventMoment(e, now, TZ)!, now, style, e.start.length === 10, TZ));

  it('days and hours by default, then hours, then minutes', () => {
    const race = event({ start: '2026-11-12T06:00' });
    expect(read(race, at('2026-10-20T00:00'))).toBe('23 days 6 hours');
    expect(read(race, at('2026-11-11T04:00'))).toBe('1 day 2 hours');
    expect(read(race, at('2026-11-12T03:30'))).toBe('2 hours 30 min');
    expect(read(race, at('2026-11-12T05:59'))).toBe('1 minute');
  });

  it('days are calendar days: the evening before is one day', () => {
    const party = event({ start: '2026-11-12T20:00' });
    expect(read(party, at('2026-11-11T23:00'), 'days')).toBe('1 day');
    expect(read(party, at('2026-11-12T09:00'), 'days')).toBe('11 hours');
  });

  it('weeks and the days over', () => {
    expect(read(event({ start: '2026-11-12' }), at('2026-10-21T09:00'), 'weeks')).toBe('3 weeks 1 day');
    expect(read(event({ start: '2026-10-25' }), at('2026-10-21T09:00'), 'weeks')).toBe('4 days');
  });

  it('hours all the way', () => {
    expect(read(event({ start: '2026-10-23T09:00' }), at('2026-10-21T09:00'), 'hours')).toBe('48 hours');
  });

  it('an all-day event counts to its midnight, and is Today on the day', () => {
    const birthday = event({ start: '2026-10-22' });
    expect(read(birthday, at('2026-10-21T18:00'))).toBe('6 hours');
    expect(read(birthday, at('2026-10-22T18:00'))).toBe('Today');
  });

  it('a timed event that started is Now; a gone one is Passed', () => {
    const race = event({ start: '2026-11-12T06:00', end: '2026-11-12T10:00' });
    expect(read(race, at('2026-11-12T07:00'))).toBe('Now');
    expect(read(race, at('2026-11-12T11:00'))).toBe('Passed');
  });
});

describe('describeWhen', () => {
  const when = (e: BaseEvent, now: Date) => describeWhen(eventMoment(e, now, TZ)!, e.start.length === 10, now, TZ);
  const now = at('2026-10-21T09:00');

  it('a day, a time, a span; the year only when it is not this one', () => {
    expect(when(event({ start: '2026-11-12' }), now)).toBe('Thu 12 Nov');
    expect(when(event({ start: '2026-11-12T06:00' }), now)).toBe('Thu 12 Nov, 06:00');
    expect(when(event({ start: '2026-11-12', end: '2026-11-14' }), now)).toBe('Thu 12 Nov – Sat 14 Nov');
    expect(when(event({ start: '2027-01-05' }), now)).toBe('Tue 5 Jan 2027');
  });
});

describe('29-2b: the picture, the shape and the journey', () => {
  it('keeps a cover pointer, an inline picture for the sync to lift, and a shape; drops a web address and the default shape', () => {
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', imageUrl: 'cover:abc', shape: 'burst' }))
      .toMatchObject({ imageUrl: 'cover:abc', shape: 'burst' });
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', imageUrl: 'data:image/png;base64,xx' })?.imageUrl)
      .toBe('data:image/png;base64,xx');
    const plain = cleanEventDraft({ title: 'A', start: '2026-11-12', imageUrl: 'https://example.com/a.png', shape: 'circle' });
    expect(plain?.imageUrl).toBeUndefined();
    expect(plain?.shape).toBeUndefined();
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', shape: 'star' as never })?.shape).toBeUndefined();
  });

  it('turns to the next shape, round again', () => {
    expect(nextShape(undefined)).toBe('squircle');
    expect(nextShape('arch')).toBe('burst');
    expect(nextShape('burst')).toBe('circle');
  });

  it('reads a stored face safely', () => {
    expect(countdownFace('flap')).toBe('flap');
    expect(countdownFace(undefined)).toBe('minimal');
    expect(countdownFace('ring')).toBe('minimal');
  });

  it('puts the count on split-flap tiles, keeping the second run at zero', () => {
    const count = (value: string, unit: string) => ({ kind: 'count' as const, value, unit });
    expect(flapGroups(count('23', 'days 6 hours'), undefined)).toEqual([{ text: '23', label: 'days' }, { text: '06', label: 'hours' }]);
    expect(flapGroups(count('23', 'days'), undefined)).toEqual([{ text: '23', label: 'days' }, { text: '00', label: 'hours' }]);
    expect(flapGroups(count('142', 'days'), 'days')).toEqual([{ text: '142', label: 'days' }]);
    expect(flapGroups(count('3', 'weeks'), 'weeks')).toEqual([{ text: '03', label: 'weeks' }, { text: '00', label: 'days' }]);
    expect(flapGroups(count('5', 'days'), 'weeks')).toEqual([{ text: '05', label: 'days' }]);
    expect(flapGroups(count('4', 'hours 5 min'), 'hours')).toEqual([{ text: '04', label: 'hours' }, { text: '05', label: 'min' }]);
    expect(flapGroups(count('12', 'minutes'), undefined)).toEqual([{ text: '12', label: 'minutes' }]);
    expect(flapGroups({ kind: 'word', word: 'Today' }, undefined)).toEqual([{ text: 'TODAY' }]);
  });

  it('names the ends of the journey, the year only when it is not this one', () => {
    const now = at('2026-10-22T18:00');
    expect(shortDay(at('2026-08-03T09:00'), now, TZ)).toBe('3 Aug');
    expect(shortDay(at('2027-03-09T00:00'), now, TZ)).toBe('9 Mar 2027');
  });

  it('a one-off travels from the day it was set to the day itself', () => {
    const race = event({ start: '2026-11-12T06:00', createdAt: at('2026-10-02T06:00').getTime() });
    const now = at('2026-10-22T18:00');
    const span = journeySpan(race, eventMoment(race, now, TZ)!, now, TZ);
    expect(span?.repeat).toBe(false);
    expect(span?.fraction).toBeCloseTo(0.5, 5);
  });

  it('a repeat travels from its last occurrence', () => {
    const birthday = event({ start: '2000-03-09', recurrence: 'yearly', createdAt: 0 });
    const now = at('2026-09-07T00:00');
    const span = journeySpan(birthday, eventMoment(birthday, now, TZ)!, now, TZ);
    expect(span?.repeat).toBe(true);
    expect(span?.from.toISOString()).toBe(at('2026-03-09T00:00').toISOString());
    expect(span?.to.toISOString()).toBe(at('2027-03-09T00:00').toISOString());
    expect(span?.fraction).toBeCloseTo(182 / 365, 2);
  });

  it('has no journey once it has started', () => {
    const race = event({ start: '2026-11-12T06:00', end: '2026-11-12T10:00' });
    const now = at('2026-11-12T07:00');
    expect(journeySpan(race, eventMoment(race, now, TZ)!, now, TZ)).toBeNull();
  });
});
