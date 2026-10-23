import { describe, expect, it } from 'vitest';
import { STANDBY_IDLE_MS, standByNight, standByShown, type StandByFacts } from './standBy';

const T = 1_000_000;
const ready: StandByFacts = {
  tablet: true, landscape: true, running: true, busy: false, now: T, lastTouch: T - STANDBY_IDLE_MS,
};

describe('standByShown', () => {
  it('shows a minute after the last touch, sideways, with the clock running', () => {
    expect(standByShown(ready)).toBe(true);
    expect(standByShown({ ...ready, lastTouch: T - STANDBY_IDLE_MS + 1 })).toBe(false);
  });

  it('never on the laptop, upright, paused, or over something he opened', () => {
    expect(standByShown({ ...ready, tablet: false })).toBe(false);
    expect(standByShown({ ...ready, landscape: false })).toBe(false);
    expect(standByShown({ ...ready, running: false })).toBe(false);
    expect(standByShown({ ...ready, busy: true })).toBe(false);
  });

  it('a touch a moment ago keeps the full screen', () => {
    expect(standByShown({ ...ready, lastTouch: T - 1000 })).toBe(false);
    /* `now` is the clock's last tick, so a touch can read as just after it. */
    expect(standByShown({ ...ready, lastTouch: T + 500 })).toBe(false);
  });
});

describe('standByNight', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 15, h, m).getTime();
  it("is the Dashboard greeting's night: nine at night to five in the morning", () => {
    expect(standByNight(at(20, 59))).toBe(false);
    expect(standByNight(at(21))).toBe(true);
    expect(standByNight(at(2))).toBe(true);
    expect(standByNight(at(4, 59))).toBe(true);
    expect(standByNight(at(5))).toBe(false);
    expect(standByNight(at(13))).toBe(false);
  });
});
