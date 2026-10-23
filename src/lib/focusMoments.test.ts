import { describe, expect, it } from 'vitest';
import {
  AWAY_MIN_MS, awayCardDue, awayKind, awayWords, halfwayLeft, HALFWAY_SHOW_SECONDS,
} from './focusMoments';

describe('halfway (idea 103)', () => {
  it('shows for ten seconds from the moment the task clock passes half', () => {
    expect(halfwayLeft(3600, 1801)).toBeNull();
    expect(halfwayLeft(3600, 1800)).toBe(1);
    expect(halfwayLeft(3600, 1795)).toBe(0.5);
    expect(halfwayLeft(3600, 1800 - HALFWAY_SHOW_SECONDS)).toBeNull();
  });

  it('never asks on a task under twenty minutes', () => {
    expect(halfwayLeft(1199, 599)).toBeNull();
    expect(halfwayLeft(1200, 600)).toBe(1);
  });
});

describe('away (idea 101)', () => {
  const t = 1_000_000;
  it('a touch just before leaving is an app switch; none is a lock', () => {
    expect(awayKind(t - 500, t)).toBe('switch');
    expect(awayKind(t - 2000, t)).toBe('switch');
    expect(awayKind(t - 2001, t)).toBe('lock');
    expect(awayKind(0, t)).toBe('lock');
  });

  it('an app switch shows the card from two minutes', () => {
    expect(awayCardDue('switch', AWAY_MIN_MS - 1, 3000)).toBe(false);
    expect(awayCardDue('switch', AWAY_MIN_MS, 3000)).toBe(true);
  });

  it('a lock shows it only past what the task had left', () => {
    expect(awayCardDue('lock', 20 * 60_000, 25 * 60)).toBe(false);
    expect(awayCardDue('lock', 26 * 60_000, 25 * 60)).toBe(true);
    /* Already past its time: never under two minutes. */
    expect(awayCardDue('lock', 60_000, -30)).toBe(false);
    expect(awayCardDue('lock', AWAY_MIN_MS, -30)).toBe(true);
  });

  it('says minutes, then hours', () => {
    expect(awayWords(4 * 60_000)).toBe('4 min');
    expect(awayWords(20_000)).toBe('1 min');
    expect(awayWords(60 * 60_000)).toBe('1 h');
    expect(awayWords(65 * 60_000)).toBe('1 h 5 min');
  });
});
