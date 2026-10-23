import { describe, expect, it } from 'vitest';
import { BUDGET, LIFE_MS, PER_ITEM, drift, dustAttr, particleStep } from './dust';

describe('dust', () => {
  it('marks a thing by kind and id', () => {
    expect(dustAttr('task', 't1')).toEqual({ 'data-dust': 'task:t1' });
    expect(dustAttr('trash', 'e9')).toEqual({ 'data-dust': 'trash:e9' });
  });

  it('keeps a row under its budget, never finer than 2 px nor coarser than 8', () => {
    /* A board card, 300 x 64. */
    const step = particleStep(300 * 64, PER_ITEM);
    expect(step).toBe(2);
    expect((300 / step) * (64 / step)).toBeLessThanOrEqual(PER_ITEM);
    /* A tiny chip still dusts at 2 px, not 1. */
    expect(particleStep(40 * 20, PER_ITEM)).toBe(2);
    /* Thirty rows at once share one press's budget and come out coarser. */
    expect(particleStep(300 * 64, Math.floor(BUDGET / 30))).toBeGreaterThan(step);
    /* A whole column is capped at 8 px squares. */
    expect(particleStep(400 * 4000, 100)).toBe(8);
  });

  it('holds still until it lets go, then rises, drifts right and fades out', () => {
    expect(drift(0.1, -0.05, -20)).toEqual({ dx: 0, dy: 0, alpha: 1 });
    const mid = drift(0.1, -0.05, LIFE_MS / 2);
    expect(mid.dx).toBeGreaterThan(0);
    expect(mid.dy).toBeLessThan(0);
    expect(mid.alpha).toBeCloseTo(0.5);
    expect(drift(0.1, -0.05, LIFE_MS).alpha).toBe(0);
  });
});
