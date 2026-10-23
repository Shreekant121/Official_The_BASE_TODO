import { describe, expect, it } from 'vitest';
import { readDue } from './dueDate';
import { SCORE_COLD, scoreWarmth, scoreWarmthColour } from './warmth';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = new Date('2026-03-12T04:30:00Z');

describe('readDue (ideas 165 and 66)', () => {
  it('reads the page in the zone, not the browser', () => {
    const r = readDue('2026-03-16T18:00', NOW, TZ)!;
    expect(r.month).toBe('MAR');
    expect(r.day).toBe(16);
    expect(r.dayKey).toBe('2026-03-16');
    expect(r.words).toBe('in 4 days');
    expect(r.urgent).toBe(false);
  });

  it('is coral all day on the day itself, not only in its last hours', () => {
    const today = readDue('2026-03-12T23:00', NOW, TZ)!;
    expect(today.warmth).toBe(1);
    expect(today.words).toBe('13h left');
    expect(today.urgent).toBe(true);
  });

  it('warms from cold at two weeks towards hot as the day nears', () => {
    const far = readDue('2026-04-30T18:00', NOW, TZ)!;
    const week = readDue('2026-03-19T10:00', NOW, TZ)!;
    const near = readDue('2026-03-14T10:00', NOW, TZ)!;
    expect(far.warmth).toBe(0);
    expect(week.warmth).toBeCloseTo(0.25, 5);
    expect(near.warmth).toBeGreaterThan(week.warmth);
    expect(near.warmth).toBeLessThan(1);
  });

  it('says tomorrow, weeks and months in plain words', () => {
    expect(readDue('2026-03-13T18:00', NOW, TZ)!.words).toBe('tomorrow');
    expect(readDue('2026-03-13T09:00', NOW, TZ)!.words).toBe('23h left');
    expect(readDue('2026-04-02T18:00', NOW, TZ)!.words).toBe('in 3 weeks');
    expect(readDue('2026-06-12T18:00', NOW, TZ)!.words).toBe('in 3 months');
  });

  it('says how late, and an hour-old miss is just overdue', () => {
    expect(readDue('2026-03-12T09:00', NOW, TZ)!.words).toBe('Overdue');
    expect(readDue('2026-03-11T18:00', NOW, TZ)!.words).toBe('1 day late');
    expect(readDue('2026-03-08T18:00', NOW, TZ)!.words).toBe('4 days late');
    expect(readDue('2026-03-08T18:00', NOW, TZ)!.warmth).toBe(1);
  });

  it('treats a bare day as due at its end, so today is not overdue', () => {
    const r = readDue('2026-03-12', NOW, TZ)!;
    expect(r.overdue).toBe(false);
    expect(r.warmth).toBe(1);
  });

  it('reads nothing from no date or a broken one', () => {
    expect(readDue(undefined, NOW, TZ)).toBeNull();
    expect(readDue('soon', NOW, TZ)).toBeNull();
  });
});

describe('scoreWarmth (idea 33)', () => {
  it('stays cold for ordinary work and warms toward the peak', () => {
    expect(scoreWarmth(0, 20)).toBe(0);
    expect(scoreWarmth(20 * SCORE_COLD, 20)).toBe(0);
    expect(scoreWarmth(20, 20)).toBe(1);
    expect(scoreWarmth(30, 20)).toBe(1);
    expect(scoreWarmth(5, 0)).toBe(0);
  });

  it('keeps the plain numeral at rest and never reaches coral', () => {
    expect(scoreWarmthColour(0)).toBeNull();
    expect(scoreWarmthColour(0.5)).toContain('--job-gold-tag-fg');
    expect(scoreWarmthColour(1)).toContain('--job-orange-tag-fg) 100%');
    expect(scoreWarmthColour(1)).not.toContain('coral');
  });
});
