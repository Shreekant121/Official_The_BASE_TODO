import { describe, expect, it } from 'vitest';
import { eventDatesChanged, followMoves, linkedDeadline, tasksLinkedTo } from './eventLinks';
import type { BaseEvent } from './events';

const TZ = 'Asia/Kolkata';
/** A wall clock in Kolkata (+05:30, no daylight saving). */
const at = (local: string) => new Date(`${local}:00+05:30`);
const event = (over: Partial<BaseEvent>): BaseEvent => ({ id: 'run', title: 'Mumbai Marathon', start: '2026-11-12T06:00', createdAt: 0, ...over });

describe('linkedDeadline', () => {
  it('is the start of a timed event (his call)', () => {
    expect(linkedDeadline(event({}), at('2026-10-21T10:00'), TZ)).toBe('2026-11-12T06:00');
  });

  it('is 6pm the day before an all-day event, across a month end', () => {
    expect(linkedDeadline(event({ start: '2026-02-14' }), at('2026-01-01T10:00'), TZ)).toBe('2026-02-13T18:00');
    expect(linkedDeadline(event({ start: '2026-12-01', end: '2026-12-03' }), at('2026-10-21T10:00'), TZ)).toBe('2026-11-30T18:00');
  });

  it('takes the occurrence of a repeat that has not ended', () => {
    const birthday = event({ start: '1965-10-23', recurrence: 'yearly' });
    expect(linkedDeadline(birthday, at('2026-10-21T10:00'), TZ)).toBe('2026-10-22T18:00');
    /* On the day, the occurrence is today's: the task is already overdue. */
    expect(linkedDeadline(birthday, at('2026-10-23T10:00'), TZ)).toBe('2026-10-22T18:00');
    expect(linkedDeadline(birthday, at('2026-10-24T10:00'), TZ)).toBe('2027-10-22T18:00');
    const weekly = event({ start: '2026-10-06T19:00', recurrence: 'weekly' });
    expect(linkedDeadline(weekly, at('2026-10-21T10:00'), TZ)).toBe('2026-10-27T19:00');
  });

  it("keeps a passed one-off's own date", () => {
    expect(linkedDeadline(event({ start: '2026-10-01T06:00' }), at('2026-10-21T10:00'), TZ)).toBe('2026-10-01T06:00');
  });
});

describe('eventDatesChanged', () => {
  const base = event({});
  it('is only the date, the end and the repeat', () => {
    expect(eventDatesChanged(base, { ...base, title: 'Run' } as BaseEvent)).toBe(false);
    expect(eventDatesChanged(base, { ...base, start: '2026-11-13T06:00' })).toBe(true);
    expect(eventDatesChanged(base, { ...base, end: '2026-11-12T10:00' })).toBe(true);
    expect(eventDatesChanged(base, { ...base, recurrence: 'yearly' })).toBe(true);
    expect(eventDatesChanged({ ...base, recurrence: 'none' }, base)).toBe(false);
  });
});

describe('followMoves', () => {
  const tasks = [
    { id: 'shoes', status: 'needsAction', deadline: '2026-11-10T06:00', eventId: 'run' },
    { id: 'bib', status: 'completed', deadline: '2026-11-10T06:00', eventId: 'run' },
    { id: 'hotel', status: 'needsAction', deadline: '2026-11-12T06:00', eventId: 'run' },
    { id: 'other', status: 'needsAction', deadline: '2026-11-10T06:00', eventId: 'trip' },
    { id: 'free', status: 'needsAction', deadline: '2026-11-10T06:00' },
  ];

  it('moves open linked tasks that are off the date, never a finished one', () => {
    expect(followMoves(tasks, event({}), at('2026-10-21T10:00'), TZ)).toEqual([{ taskId: 'shoes', deadline: '2026-11-12T06:00' }]);
  });

  it('lists every linked task, finished ones included', () => {
    expect(tasksLinkedTo(tasks, 'run').map((t) => t.id)).toEqual(['shoes', 'bib', 'hotel']);
  });
});
