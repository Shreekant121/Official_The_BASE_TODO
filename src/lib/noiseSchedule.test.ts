/**
 * **When the noise plays** (BUILD-1).
 *
 * The one part of the feature that can be wrong rather than merely inaudible.
 * "Follows the task" has no clock in it and is one assertion; the focus/break
 * cycle has three ways to be quietly wrong, and each of them sounds fine for
 * the first half hour:
 *
 *   1. **The boundary is the moment sound stops**, so an off-by-one at the
 *      edge is thirty minutes of noise through a break.
 *   2. **It repeats**, which a naive `elapsed < focus` does not — that plays
 *      the first block and then goes silent for ever.
 *   3. **`until` is what the app sets its one timer to.** Too early is a
 *      wasted wake-up; too late is a break that runs on past its end.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOISE_PREFS, type NoisePrefs } from './brownNoise';
import { noisePhaseAt } from './noiseSchedule';

const START = new Date('2026-09-15T09:00:00Z').getTime();
const MIN = 60_000;

function prefs(over: Partial<NoisePrefs> = {}): NoisePrefs {
  return { ...DEFAULT_NOISE_PREFS, mode: 'pomodoro', focusMinutes: 25, breakMinutes: 5, ...over };
}

describe('follows the task', () => {
  it('is simply on, with nothing to wait for', () => {
    expect(noisePhaseAt(prefs({ mode: 'task' }), START, START + 99 * MIN))
      .toEqual({ on: true, until: null });
  });
});

describe('the focus / break cycle', () => {
  it('starts in the focus block and names its end', () => {
    expect(noisePhaseAt(prefs(), START, START)).toEqual({ on: true, until: START + 25 * MIN });
  });

  it('is still on one second before the boundary and off at it', () => {
    expect(noisePhaseAt(prefs(), START, START + 25 * MIN - 1000).on).toBe(true);
    expect(noisePhaseAt(prefs(), START, START + 25 * MIN).on).toBe(false);
  });

  it('names the end of the break, not the end of the cycle it is in', () => {
    const at = START + 27 * MIN;
    expect(noisePhaseAt(prefs(), START, at)).toEqual({ on: false, until: START + 30 * MIN });
  });

  it('repeats — the second block is sound again', () => {
    expect(noisePhaseAt(prefs(), START, START + 31 * MIN).on).toBe(true);
    expect(noisePhaseAt(prefs(), START, START + 56 * MIN).on).toBe(false);
  });

  it('is right after four hours away, because it is derived and not advanced', () => {
    /* The tablet was asleep for the whole of this. 240 minutes is eight whole
       cycles, which lands exactly back at the start of a focus block. */
    expect(noisePhaseAt(prefs(), START, START + 240 * MIN))
      .toEqual({ on: true, until: START + 265 * MIN });
  });

  it('treats a clock that went backwards as the start of the session', () => {
    /* An NTP correction on a device whose date was wrong. A negative modulus
       would otherwise open the session in the middle of a break. */
    expect(noisePhaseAt(prefs(), START, START - 10 * MIN).on).toBe(true);
  });
});
