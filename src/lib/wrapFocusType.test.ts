import { describe, expect, it } from 'vitest';
import { focusTypeOf, sittings, styleOf, type TypeStretch } from './wrapFocusType';

const TZ = 'Asia/Kolkata';
const ist = (s: string) => Date.parse(`${s}+05:30`);
const M = 60;
const stretch = (start: string, minutes: number): TypeStretch => {
  const startedAt = ist(start);
  return { startedAt, endedAt: startedAt + minutes * 60_000, seconds: minutes * M };
};

describe('sittings', () => {
  it('joins stretches ten minutes apart or less, across tasks', () => {
    expect(sittings([
      stretch('2026-09-01T09:00:00', 20),
      stretch('2026-09-01T09:25:00', 15), // 5 min later: same sitting
      stretch('2026-09-01T10:00:00', 30), // 20 min later: a new one
      stretch('2026-09-01T10:40:00', 10), // exactly 10: same
    ])).toEqual([35 * M, 40 * M]);
  });

  it('names the length: under 40 a Sprinter, under 90 a Runner, 90 and over a Deep Diver', () => {
    expect(styleOf(39 * M)).toBe('sprinter');
    expect(styleOf(40 * M)).toBe('runner');
    expect(styleOf(89 * M)).toBe('runner');
    expect(styleOf(90 * M)).toBe('diver');
  });
});

describe('the focus type', () => {
  const mornings = [
    stretch('2026-09-01T08:50:00', 25), // Tuesday
    stretch('2026-09-02T09:05:00', 30),
    stretch('2026-09-08T09:00:00', 25), // Tuesday
    stretch('2026-09-08T11:00:00', 30), // Tuesday, a second sitting
    stretch('2026-09-10T09:10:00', 20),
  ];

  it('is when (the middle of the sharpest hours, on the Dashboard\'s clock) and how long', () => {
    expect(focusTypeOf(mornings, { from: 8, to: 10 }, TZ)).toEqual({
      name: 'The Morning Sprinter', phase: 'morning', style: 'sprinter',
      facts: ['Starts around 9 am', 'Sittings of about 25 minutes', 'Tuesdays run longest'],
    });
  });

  it('follows the Dashboard\'s skies: afternoon from 12, evening from 17, Midnight from 21', () => {
    expect(focusTypeOf(mornings, { from: 11, to: 13 }, TZ)?.name).toBe('The Afternoon Sprinter');
    expect(focusTypeOf(mornings, { from: 16, to: 18 }, TZ)?.name).toBe('The Evening Sprinter');
    expect(focusTypeOf(mornings, { from: 21, to: 23 }, TZ)?.name).toBe('The Midnight Sprinter');
    expect(focusTypeOf(mornings, { from: 2, to: 4 }, TZ)?.name).toBe('The Midnight Sprinter');
  });

  it('needs the sharpest hours and four sittings', () => {
    expect(focusTypeOf(mornings, null, TZ)).toBeNull();
    expect(focusTypeOf(mornings.slice(0, 3), { from: 8, to: 10 }, TZ)).toBeNull();
  });

  it('says nothing about a weekday when only one weekday was worked', () => {
    const tuesdays = [0, 7, 14, 21].map((d) => stretch(`2026-09-${String(1 + d).padStart(2, '0')}T21:30:00`, 120));
    expect(focusTypeOf(tuesdays, { from: 21, to: 23 }, TZ)).toEqual({
      name: 'The Midnight Deep Diver', phase: 'night', style: 'diver',
      facts: ['Starts around 10 pm', 'Sittings of about 2h'],
    });
  });
});
