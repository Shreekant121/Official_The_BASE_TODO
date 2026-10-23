import { describe, expect, it } from 'vitest';
import { ENTER_FROM, PINCH_IN_AT, PINCH_OUT_AT, liveFade, liveScale, pinchVerdict, wheelScale } from './pinchZoom';

const BOTH = { out: true, in: true };

describe('a released pinch', () => {
  it('zooms out past a fifth smaller, in past a quarter bigger, else springs back', () => {
    expect(pinchVerdict(0.7, BOTH)).toBe('out');
    expect(pinchVerdict(PINCH_OUT_AT, BOTH)).toBe('out');
    expect(pinchVerdict(0.85, BOTH)).toBeNull();
    expect(pinchVerdict(1.2, BOTH)).toBeNull();
    expect(pinchVerdict(PINCH_IN_AT, BOTH)).toBe('in');
    expect(pinchVerdict(1.5, BOTH)).toBe('in');
  });

  it('does nothing towards a view that is not there', () => {
    expect(pinchVerdict(0.5, { out: false, in: true })).toBeNull();
    expect(pinchVerdict(1.6, { out: true, in: false })).toBeNull();
  });
});

describe('the view under the fingers', () => {
  it('follows them, within its bounds', () => {
    expect(liveScale(0.9, BOTH)).toBe(0.9);
    expect(liveScale(1.3, BOTH)).toBe(1.3);
    expect(liveScale(0.2, BOTH)).toBe(0.55);
    expect(liveScale(4, BOTH)).toBe(1.6);
  });

  it('only gives a little where there is no view that way', () => {
    expect(liveScale(0.5, { out: false, in: true })).toBeCloseTo(0.9);
    expect(liveScale(1.5, { out: true, in: false })).toBeCloseTo(1.1);
    expect(liveScale(0.2, { out: false, in: true })).toBeCloseTo(0.88);
    /* The blocked way never reaches a turn, so letting go never turns. */
    expect(liveScale(0.1, { out: false, in: true })).toBeGreaterThan(PINCH_OUT_AT);
    expect(liveScale(3, { out: true, in: false })).toBeLessThan(PINCH_IN_AT);
  });

  it('fades towards a turn and no further', () => {
    expect(liveFade(1)).toBe(1);
    expect(liveFade(0.9)).toBeCloseTo(0.825);
    expect(liveFade(PINCH_OUT_AT)).toBeCloseTo(0.65);
    expect(liveFade(0.55)).toBeCloseTo(0.65);
    expect(liveFade(PINCH_IN_AT)).toBeCloseTo(0.65);
  });

  it('comes in from the side it zoomed to', () => {
    expect(ENTER_FROM.out).toBeGreaterThan(1);
    expect(ENTER_FROM.in).toBeLessThan(1);
  });
});

describe('a trackpad pinch', () => {
  it('grows with fingers apart (negative delta) and shrinks with them together', () => {
    expect(wheelScale(1, -10)).toBeGreaterThan(1);
    expect(wheelScale(1, 10)).toBeLessThan(1);
    expect(wheelScale(wheelScale(1, 10), -10)).toBeCloseTo(1);
  });

  it('turns on one notch of Ctrl + a mouse wheel', () => {
    expect(pinchVerdict(wheelScale(1, 100), BOTH)).toBe('out');
    expect(pinchVerdict(wheelScale(1, -100), BOTH)).toBe('in');
    /* In lines, three to a notch. */
    expect(pinchVerdict(wheelScale(1, 3, 1), BOTH)).toBe('out');
  });

  it('is bounded however long the fingers keep going', () => {
    let s = 1;
    for (let i = 0; i < 500; i += 1) s = wheelScale(s, 20);
    expect(s).toBe(0.3);
    for (let i = 0; i < 500; i += 1) s = wheelScale(s, -20);
    expect(s).toBe(3);
  });
});
