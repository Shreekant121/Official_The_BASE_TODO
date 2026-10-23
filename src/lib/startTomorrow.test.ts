import { describe, expect, it } from 'vitest';
import { tomorrowStart } from './startTomorrow';

describe('tomorrowStart', () => {
  it('is the start of the next day in his zone', () => {
    /* 22:00 in Kolkata is 16:30 UTC: tomorrow is the 13th there. */
    expect(tomorrowStart(new Date('2026-10-12T16:30:00Z'), 'Asia/Kolkata')).toBe('2026-10-13T00:00');
  });

  it('reads the day in his zone, not UTC', () => {
    /* 00:30 on the 13th in Kolkata is still the 12th in UTC. */
    expect(tomorrowStart(new Date('2026-10-12T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-14T00:00');
  });

  it('crosses a month and a year', () => {
    expect(tomorrowStart(new Date('2026-10-31T06:00:00Z'), 'Asia/Kolkata')).toBe('2026-11-01T00:00');
    expect(tomorrowStart(new Date('2026-12-31T06:00:00Z'), 'Asia/Kolkata')).toBe('2027-01-01T00:00');
  });

  it('crosses a DST change as a calendar day', () => {
    /* Europe/London springs forward on 29 March 2026. */
    expect(tomorrowStart(new Date('2026-03-28T12:00:00Z'), 'Europe/London')).toBe('2026-03-29T00:00');
  });
});
