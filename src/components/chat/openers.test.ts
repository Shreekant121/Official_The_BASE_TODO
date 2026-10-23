import { describe, expect, it } from 'vitest';
import { HANDS_FREE_OPENERS, OPENERS, SHOWN, pickOpeners, type Opener } from './openers';

const texts = (openers: Opener[]) => openers.map((opener) => opener.text);
const sameSet = (a: Opener[], b: Opener[]) => a.length === b.length && a.every((one) => b.includes(one));

describe.each([
  ['with hands', OPENERS],
  ['hands-free', HANDS_FREE_OPENERS],
])('the openers pool (%s)', (_name, pool) => {
  it('shows the original three on a device\'s first visit', () => {
    expect(texts(pickOpeners(pool, 0))).toEqual(texts(pool.slice(0, SHOWN)));
  });

  it('always shows three different ones', () => {
    for (let visit = 0; visit < 300; visit++) {
      const shown = pickOpeners(pool, visit);
      expect(shown).toHaveLength(SHOWN);
      expect(new Set(shown).size).toBe(SHOWN);
    }
  });

  it('never shows the same three twice in a row', () => {
    for (let visit = 1; visit < 300; visit++) {
      expect(sameSet(pickOpeners(pool, visit), pickOpeners(pool, visit - 1))).toBe(false);
    }
  });

  it('brings every opener round in the first pass', () => {
    const seen = new Set<Opener>();
    for (let visit = 0; visit < Math.ceil(pool.length / SHOWN); visit++) {
      for (const opener of pickOpeners(pool, visit)) seen.add(opener);
    }
    expect(seen.size).toBe(pool.length);
  });

  it('does not repeat one order pass after pass', () => {
    const visitsPerPass = pool.length / SHOWN;
    const second = texts(pickOpeners(pool, Math.ceil(visitsPerPass)));
    const third = texts(pickOpeners(pool, Math.ceil(visitsPerPass * 2)));
    expect(second).not.toEqual(texts(pool.slice(0, SHOWN)));
    expect(third).not.toEqual(second);
  });
});
