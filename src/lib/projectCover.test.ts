import { describe, expect, it } from 'vitest';
import {
  COVER_HUES, COVER_PATTERNS, castLight, coverInks, coverLight, coverWord, dotGrid, hashId, ink, meshSpots, resolveCover, shuffleSeed,
  stripeSpec, wavePaths,
} from './projectCover';

describe('resolveCover', () => {
  it('gives a project that never chose a pattern cover, the same one every time', () => {
    const a = resolveCover('proj-1', undefined);
    expect(a).toEqual(resolveCover('proj-1', undefined));
    expect(a.kind).toBe('pattern');
    expect(a.colours).toBe('shuffle');
    expect(a.seed).toBe(hashId('proj-1'));
    expect(a.patternFixed).toBe(false);
  });

  it('gives different projects different covers', () => {
    const seeds = new Set(['a', 'b', 'c', 'd', 'e'].map((id) => resolveCover(id, undefined).seed));
    expect(seeds.size).toBe(5);
  });

  it('keeps what he chose, and lets the seed pick the pattern under "Mixed"', () => {
    const fixed = resolveCover('x', { kind: 'pattern', pattern: 'dots', colours: 'grey', seed: 9 });
    expect(fixed).toMatchObject({ kind: 'pattern', pattern: 'dots', patternFixed: true, colours: 'grey', seed: 9 });
    const mixed = resolveCover('x', { seed: 9 });
    expect(mixed.pattern).toBe(COVER_PATTERNS[9 % 4]);
    expect(mixed.patternFixed).toBe(false);
  });

  it('reads a damaged record as the default rather than failing', () => {
    const r = resolveCover('x', { kind: 'poster' as never, pattern: 'plaid' as never, colours: 'red' as never, seed: Number.NaN });
    expect(r).toMatchObject({ kind: 'pattern', colours: 'shuffle', seed: hashId('x'), patternFixed: false });
  });
});

describe('shuffleSeed', () => {
  it('never hands back the seed it replaces', () => {
    expect(shuffleSeed(5, () => 5 / 0x7fffffff)).not.toBe(5);
    expect(shuffleSeed(0, () => 0.5)).toBe(Math.floor(0.5 * 0x7fffffff));
  });
});

describe('coverInks', () => {
  it('rolls two different job hues for "Any colour"', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { h1, h2 } = coverInks(seed, 'shuffle');
      expect(h1).not.toBe(h2);
      expect(COVER_HUES).toContain(Number(h1));
      expect(COVER_HUES).toContain(Number(h2));
    }
  });

  it('reads his tint from CSS, so a change of tint needs no render', () => {
    const t = coverInks(3, 'tint');
    expect(t.h1).toBe('var(--cover-tint-h)');
    expect(ink(t, 0.5, 0.5)).toBe('oklch(0.5 calc(var(--cover-tint-c) * 0.5) var(--cover-tint-h))');
  });

  it('is grey for greys', () => {
    expect(ink(coverInks(3, 'grey'), 0.4, 1, true, 0.5)).toBe('oklch(0.4 0.006 260 / 0.5)');
  });
});

describe('geometry', () => {
  it('is the same for the same seed and different for another', () => {
    expect(meshSpots(7)).toEqual(meshSpots(7));
    expect(wavePaths(7)).toEqual(wavePaths(7));
    expect(wavePaths(7)).not.toEqual(wavePaths(8));
    expect(stripeSpec(7)).toEqual(stripeSpec(7));
  });

  it('draws five closed wave bands', () => {
    const paths = wavePaths(1);
    expect(paths).toHaveLength(5);
    for (const d of paths) expect(d.endsWith('Z')).toBe(true);
  });

  it('keeps the halftone small, so a wall of cards stays light', () => {
    for (let seed = 0; seed < 50; seed++) expect(dotGrid(seed).length).toBeLessThanOrEqual(23 * 14);
  });
});

describe('coverWord', () => {
  it('takes the last word of the name', () => {
    expect(coverWord('Studio Launch')).toBe('Launch');
    expect(coverWord('  Personal ')).toBe('Personal');
    expect(coverWord('')).toBe('');
  });
});

describe('coverLight', () => {
  it('is the two hues of the cover at the glow lightness, the second a touch quieter', () => {
    const inks = coverInks(7, 'shuffle');
    expect(coverLight(inks)).toEqual([`oklch(0.68 0.16 ${inks.h1})`, `oklch(0.68 calc(0.16 * 0.9) ${inks.h2})`]);
  });

  it('follows his tint through its variables, and stays grey for Greys', () => {
    expect(coverLight(coverInks(3, 'tint'))[0]).toBe('oklch(0.68 var(--cover-tint-c) var(--cover-tint-h))');
    expect(coverLight(coverInks(3, 'grey'))[1]).toBe('oklch(0.68 calc(0.006 * 0.9) 260)');
  });
});

describe('castLight', () => {
  it('casts the main colour round the card and to one side, the second to the other, mixed in oklab', () => {
    const shadow = castLight(['oklch(0.68 0.16 45)', 'oklch(0.68 0.14 240)']);
    expect(shadow.split('), ').length).toBe(3);
    expect(shadow.match(/oklch\(0\.68 0\.16 45\)/g)).toHaveLength(2);
    expect(shadow.match(/oklch\(0\.68 0\.14 240\)/g)).toHaveLength(1);
    expect(shadow).not.toContain('in oklch');
  });
});
