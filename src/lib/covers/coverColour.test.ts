import { describe, expect, it } from 'vitest';
import { GLOW_L, coverColours, mainColour, oklchCss, toOklab } from './coverColour';

/** A picture `n` pixels of each colour, in order. */
function picture(...parts: [rgb: [number, number, number], n: number, alpha?: number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [[r, g, b], n, a = 255] of parts) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
}

const hueOf = (rgb: [number, number, number]) => {
  const [, a, b] = toOklab(...rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

describe('toOklab', () => {
  it('matches known values', () => {
    expect(toOklab(255, 255, 255)[0]).toBeCloseTo(1, 3);
    expect(toOklab(0, 0, 0)[0]).toBeCloseTo(0, 3);
    /* sRGB red is oklch(0.628 0.258 29.2). */
    const [L, a, b] = toOklab(255, 0, 0);
    expect(L).toBeCloseTo(0.628, 2);
    expect(Math.hypot(a, b)).toBeCloseTo(0.258, 2);
    expect(hueOf([255, 0, 0])).toBeCloseTo(29.2, 0);
  });
});

describe('mainColour', () => {
  it('reads a plain colour as itself, at the glow lightness', () => {
    const c = mainColour(picture([[30, 120, 220], 64]))!;
    expect(c.l).toBe(GLOW_L);
    expect(Math.abs(c.h - hueOf([30, 120, 220]))).toBeLessThan(1);
  });

  it('calls a grey picture grey', () => {
    expect(mainColour(picture([[128, 128, 128], 50], [[30, 30, 30], 50]))).toBeNull();
    expect(mainColour(new Uint8ClampedArray(0))).toBeNull();
  });

  it('picks the colourful part over a larger grey one, not their average', () => {
    const c = mainColour(picture([[120, 120, 125], 80], [[220, 40, 40], 20]))!;
    expect(Math.abs(c.h - hueOf([220, 40, 40]))).toBeLessThan(3);
  });

  it('picks the heavier of two colours', () => {
    const c = mainColour(picture([[40, 160, 60], 70], [[200, 40, 160], 30]))!;
    expect(Math.abs(c.h - hueOf([40, 160, 60]))).toBeLessThan(3);
  });

  it('ignores see-through pixels', () => {
    const c = mainColour(picture([[230, 160, 20], 10], [[20, 60, 230], 90, 0]))!;
    expect(Math.abs(c.h - hueOf([230, 160, 20]))).toBeLessThan(3);
  });

  it('holds the chroma in its band, so neon does not shout and a dull photo still glows', () => {
    expect(mainColour(picture([[255, 0, 255], 10]))!.c).toBeLessThanOrEqual(0.17);
    expect(mainColour(picture([[120, 100, 90], 10]))!.c).toBeGreaterThanOrEqual(0.07);
  });

  it('writes CSS', () => {
    expect(oklchCss({ l: 0.68, c: 0.12, h: 240 })).toBe('oklch(0.68 0.12 240)');
  });
});

describe('coverColours', () => {
  it('gives the main colour first and the next one far enough round the wheel second', () => {
    const [a, b] = coverColours(picture([[40, 160, 60], 60], [[45, 150, 70], 10], [[200, 40, 160], 30]))!;
    expect(Math.abs(a.h - hueOf([40, 160, 60]))).toBeLessThan(6);
    expect(Math.abs(b.h - hueOf([200, 40, 160]))).toBeLessThan(3);
  });

  it('answers one colour twice for a photo with only one in it', () => {
    const [a, b] = coverColours(picture([[30, 120, 220], 64], [[128, 128, 128], 64]))!;
    expect(b).toEqual(a);
  });

  it('ignores a speck of a second colour', () => {
    const [a, b] = coverColours(picture([[30, 120, 220], 95], [[230, 160, 20], 5]))!;
    expect(b).toEqual(a);
  });

  it('agrees with mainColour on the first, and is null for grey', () => {
    const pic = picture([[220, 40, 40], 20], [[40, 160, 60], 15]);
    expect(coverColours(pic)![0]).toEqual(mainColour(pic));
    expect(coverColours(picture([[128, 128, 128], 50]))).toBeNull();
  });
});
