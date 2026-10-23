import { describe, expect, it } from 'vitest';
import { aimBefore, isDrag, type AimRow } from './plusAim';

/* Three 40px rows with 8px between them: 0-40, 48-88, 96-136. */
const rows = (gapBefore?: number, gap = 0): AimRow[] =>
  ['a', 'b', 'c'].map((id, i) => {
    const afterGap = gapBefore !== undefined && i >= gapBefore;
    return { id, top: i * 48 + (afterGap ? gap : 0), height: 40, afterGap };
  });

describe('aimBefore', () => {
  it('goes in front of the row whose upper half the finger is over', () => {
    expect(aimBefore(rows(), 0, 5)).toBe('a');
    expect(aimBefore(rows(), 0, 25)).toBe('b');
    expect(aimBefore(rows(), 0, 70)).toBe('c');
  });

  it('goes at the end below the last row’s middle, and in an empty list', () => {
    expect(aimBefore(rows(), 0, 120)).toBeNull();
    expect(aimBefore([], 0, 10)).toBeNull();
  });

  it('holds still once the gap has opened and pushed the rows down', () => {
    /* Aimed in front of b, a 44px gap opens there: b is drawn at 92. The
       finger has not moved, so the aim must not move either. */
    expect(aimBefore(rows(1, 44), 44, 25)).toBe('b');
    /* Still in front of b just above where b's middle was. */
    expect(aimBefore(rows(1, 44), 44, 67)).toBe('b');
    expect(aimBefore(rows(1, 44), 44, 69)).toBe('c');
  });

  it('is exact while the gap is still opening', () => {
    expect(aimBefore(rows(1, 20), 20, 67)).toBe('b');
    expect(aimBefore(rows(1, 20), 20, 69)).toBe('c');
  });
});

describe('isDrag', () => {
  it('a press that barely moves is a tap', () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(5, 5)).toBe(true);
  });
});
