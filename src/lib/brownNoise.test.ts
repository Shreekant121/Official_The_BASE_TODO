/**
 * The noise generator's two claims that nothing on screen can show you.
 *
 * A loop seam that clicks and a "brown" noise that is actually white both look
 * completely healthy in the UI — the switch is on, the waveform moves, the
 * level meter reads. You find out an hour into a work session, which is the
 * worst possible place for this to be discovered. Hence a test.
 *
 * Only `fillNoise` is exercised, deliberately: it is the pure half, and the
 * rest of `brownNoise.ts` is an `AudioContext` graph that does not exist in
 * Node and would have to be faked into something that proves nothing.
 */
import { describe, expect, it } from 'vitest';
import { fillNoise, type NoiseVariant } from './brownNoise';

/** Short enough to stay fast; long enough that the random walk really drifts. */
const N = 48_000;

function generate(variant: NoiseVariant): Float32Array {
  const buf = new Float32Array(N);
  fillNoise(buf, variant);
  return buf;
}

/**
 * Mean absolute difference between neighbouring samples.
 *
 * A cheap stand-in for spectral slope: white noise jumps the full range every
 * sample, brown noise walks. The ordering of this number across the three
 * variants IS the −6 / −3 / 0 dB-per-octave claim the Settings screen prints
 * next to each one.
 */
function roughness(d: Float32Array): number {
  let sum = 0;
  for (let i = 1; i < d.length; i++) sum += Math.abs(d[i] - d[i - 1]);
  return sum / (d.length - 1);
}

describe('fillNoise', () => {
  const variants: NoiseVariant[] = ['brown', 'pink', 'white'];

  it.each(variants)('lands both ends of a %s buffer on zero, so the loop seam is silent', (variant) => {
    const d = generate(variant);
    /* The detrend is what makes `source.loop = true` usable. Without it the
       walk ends at some arbitrary offset and every lap jumps back to zero —
       a click, for ever. */
    expect(Math.abs(d[0])).toBeLessThan(1e-4);
    expect(Math.abs(d[d.length - 1])).toBeLessThan(1e-4);
  });

  it.each(variants)('normalises %s below clipping', (variant) => {
    const d = generate(variant);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeGreaterThan(0.5); // it did something
    expect(peak).toBeLessThanOrEqual(0.92 + 1e-6); // and it cannot clip
  });

  it('orders the three variants by roughness, which is what their labels claim', () => {
    /* brown (−6 dB/oct) is the smoothest, white (0) the harshest, pink between.
       If this ever inverts, the Settings cards are lying about the sound. */
    const brown = roughness(generate('brown'));
    const pink = roughness(generate('pink'));
    const white = roughness(generate('white'));

    expect(brown).toBeLessThan(pink);
    expect(pink).toBeLessThan(white);
  });

  it('produces a different buffer each time, so nothing can cache a "the" noise', () => {
    const a = generate('brown');
    const b = generate('brown');
    expect(a).not.toEqual(b);
  });
});
