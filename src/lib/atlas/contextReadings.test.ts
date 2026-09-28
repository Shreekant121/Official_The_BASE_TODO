import { describe, expect, it } from 'vitest';
import {
  CONTEXT_STEPS_K,
  DEFAULT_CONTEXT_K,
  contextReadingFor,
  contextStepsFor,
  describeContextCost,
  measuredStepsFor,
} from './contextReadings';
import { relativeWhen } from './relativeWhen';

/**
 * The context slider's numbers (item 10, DESIGN.md §4.1).
 *
 * **The test that matters is the one about the numbers that do not exist.**
 * `atlas.html` carries a cost for every model at every stop — twenty-two
 * readings, of which DESIGN.md records eight — and the failure this file
 * exists to prevent is a later session filling the other fourteen in because
 * the gaps look like an oversight. A number nobody measured, printed in the
 * same type as one somebody did, is indistinguishable from a fact.
 */

describe('the stops', () => {
  it('stops at what the model declares', () => {
    // gemma4:e4b declares 131072; qwen3.5:4b declares 262144 (§2.4).
    expect(contextStepsFor('gemma4:e4b')).toEqual([8, 16, 32, 64, 96, 131]);
    expect(contextStepsFor('qwen3.5:4b')).toEqual([...CONTEXT_STEPS_K]);
  });

  it('gives an unbenchmarked model the safe range rather than guessing its ceiling', () => {
    const steps = contextStepsFor('something-pulled-yesterday');
    expect(steps[steps.length - 1]).toBe(DEFAULT_CONTEXT_K);
  });

  it('defaults to 64K, which is §4.1’s number', () => {
    expect(DEFAULT_CONTEXT_K).toBe(64);
    expect(CONTEXT_STEPS_K).toContain(64);
  });
});

describe('the readings', () => {
  it('holds only what DESIGN.md §2 actually records', () => {
    // Eight measurements, not the mockup's twenty-two. If this ever grows, it
    // is because item 14 re-ran the benchmark — not because a gap was filled.
    expect(measuredStepsFor('gemma4:e4b')).toEqual([8, 64, 131]);
    expect(measuredStepsFor('qwen3.5:4b')).toEqual([8, 32, 64]);
    expect(measuredStepsFor('qwen3.5:9b')).toEqual([8]);
  });

  it('has nothing at a stop nobody measured', () => {
    expect(contextReadingFor('gemma4:e4b', 96)).toBeNull();
    expect(contextReadingFor('qwen3.5:9b', 64)).toBeNull();
  });

  it('reports §2.5’s two headline numbers, which is the sentence §4.1 asks for', () => {
    const free = describeContextCost('gemma4:e4b', 64);
    expect(free.measured).toBe(true);
    expect(free.headline).toBe('3.29 GB · 100% on the card');
    expect(free.detail).toContain('All of it on the graphics card');

    const expensive = describeContextCost('gemma4:e4b', 131);
    expect(expensive.measured).toBe(true);
    expect(expensive.headline).toBe('9.71 GB · 34% on the card');
    // 9.71 × 66% ≈ 6.4 GB, which is §2.5's "6.4 GB of 15.3 GB system RAM held
    // by one conversation" — the real cost, and the reason the default is 64K.
    expect(expensive.detail).toContain('6.4 GB sits in system memory, out of 15.3 GB');
  });

  it('says a stop was not measured instead of interpolating one', () => {
    const gap = describeContextCost('gemma4:e4b', 96);
    expect(gap.measured).toBe(false);
    expect(gap.headline).toBe('Not measured at this size');
    // And it names what IS known, so the gap reads as a fact about the
    // benchmark rather than as a control that is broken.
    expect(gap.detail).toContain('8K, 64K, 131K');
  });

  it('says so for a model nobody has benchmarked at all', () => {
    const unknown = describeContextCost('something-pulled-yesterday', 64);
    expect(unknown.measured).toBe(false);
    expect(unknown.detail).toContain('Nothing has been measured');
    expect(unknown.detail).toContain('clamps it to what the model declares');
  });
});

describe('relativeWhen', () => {
  const now = Date.parse('2026-03-12T04:00:00.000Z');

  it('reads the four scales the list column uses', () => {
    expect(relativeWhen('2026-03-12T03:59:00.000Z', now)).toBe('now');
    expect(relativeWhen('2026-03-12T03:20:00.000Z', now)).toBe('40m');
    expect(relativeWhen('2026-03-12T02:00:00.000Z', now)).toBe('2h');
    // Inside a week it is the weekday; past that, a date.
    expect(relativeWhen('2026-03-09T04:00:00.000Z', now)).toMatch(/^[A-Z][a-z]{2}$/);
    expect(relativeWhen('2026-02-27T04:00:00.000Z', now)).toMatch(/\d/);
  });

  it('calls the last two minutes "now", not "1m"', () => {
    // A row saying `1m` the instant after a turn finishes reads as staleness,
    // and the chat at the top of the list is almost always the one just used.
    expect(relativeWhen('2026-03-12T03:59:30.000Z', now)).toBe('now');
  });

  it('returns nothing for a timestamp it cannot read', () => {
    expect(relativeWhen('not a date', now)).toBe('');
  });
});
