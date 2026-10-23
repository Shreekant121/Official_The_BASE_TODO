import { describe, expect, it } from 'vitest';
import { PEEK, placeNotices } from './noticePlaces';

describe('placeNotices', () => {
  it('places nothing when nothing shows', () => {
    const r = placeNotices([0, 0, 0, 0], false, 3, 12);
    expect(r.height).toBe(0);
    expect(r.count).toBe(0);
    expect(r.places.every((p) => p.hidden)).toBe(true);
  });

  it('leaves one notice alone, wherever it sits in the order', () => {
    const r = placeNotices([0, 0, 140, 0], false, 3, 12);
    expect(r.piled).toBe(false);
    expect(r.height).toBe(140);
    expect(r.places[2]).toMatchObject({ y: 0, scale: 1, clipTop: 0, hidden: false, inert: false });
  });

  it('piles two or three behind the first, each peeking 8px lower', () => {
    const r = placeNotices([140, 0, 100, 160], false, 3, 12);
    expect(r.piled).toBe(true);
    expect(r.height).toBe(140 + PEEK * 2);
    expect(r.places[0]).toMatchObject({ y: 0, inert: false, z: 3 });
    // Each one behind is lined up by its bottom edge, and all of it but the
    // strip below the front card is cut away, so nothing ghosts through.
    expect(r.places[2]).toMatchObject({ y: 140 + 8 - 100, scale: 0.95, inert: true, z: 2 });
    expect(r.places[2].clipTop).toBeCloseTo(100 - 8 / 0.95);
    expect(r.places[3]).toMatchObject({ y: 140 + 16 - 160, scale: 0.9, z: 1 });
    expect(r.places[3].clipTop).toBeCloseTo(160 - 16 / 0.9);
    // The bottom of each one behind is PEEK lower than the last.
    expect(r.places[2].y + 100).toBe(148);
    expect(r.places[3].y + 160).toBe(156);
  });

  it('fans out into a column with the gap between', () => {
    const r = placeNotices([140, 0, 100, 160], true, 3, 12);
    expect(r.piled).toBe(false);
    expect(r.places[0].y).toBe(0);
    expect(r.places[2].y).toBe(152);
    expect(r.places[3].y).toBe(264);
    expect(r.height).toBe(140 + 12 + 100 + 12 + 160);
    expect(r.places[3]).toMatchObject({ scale: 1, clipTop: 0, opacity: 1, inert: false });
  });

  it('keeps a fourth waiting, hidden, until one of the three goes', () => {
    const four = placeNotices([140, 120, 100, 90], false, 3, 12);
    expect(four.count).toBe(3);
    expect(four.places[3].hidden).toBe(true);
    const after = placeNotices([0, 120, 100, 90], false, 3, 12);
    expect(after.places[3].hidden).toBe(false);
    expect(after.places[1]).toMatchObject({ y: 0, inert: false });
  });
});
