import { describe, expect, it } from 'vitest';
import { COMBO_WINDOW_MS, NO_COMBO, comboColour, comboLabel, nextCombo } from './tickCheer';

describe('nextCombo', () => {
  it('counts ticks closer than eight seconds and starts again after a pause', () => {
    let c = nextCombo(NO_COMBO, 1_000);
    expect(c.n).toBe(1);
    c = nextCombo(c, 1_000 + COMBO_WINDOW_MS - 1);
    expect(c.n).toBe(2);
    c = nextCombo(c, c.last + 500);
    expect(c.n).toBe(3);
    c = nextCombo(c, c.last + COMBO_WINDOW_MS);
    expect(c.n).toBe(1);
  });

  it('starts at one after the chip slipped away, however soon the next tick comes', () => {
    expect(nextCombo({ n: 0, last: 5_000 }, 5_100).n).toBe(1);
  });
});

describe('the chip', () => {
  it('says the card\'s words and warms gold, amber, orange, coral', () => {
    expect(comboLabel(2)).toBe('2 in a row');
    expect(comboLabel(3)).toBe('3 in a row!');
    expect([2, 3, 4, 5, 9].map(comboColour)).toEqual([
      'var(--job-gold)',
      'color-mix(in oklch, var(--job-gold), var(--job-orange))',
      'var(--job-orange)',
      'var(--job-coral)',
      'var(--job-coral)',
    ]);
  });
});
