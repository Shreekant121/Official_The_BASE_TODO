/**
 * Where each notice in a `NoticeStack` goes (29-1P14d1, idea 26) — pure, so
 * `noticePlaces.test.ts` can hold the arithmetic. The component's header says
 * what the pile looks like and why.
 */

/** How far each card behind peeks out under the one in front (the idea page's 8px). */
export const PEEK = 8;
/** Room left round a clipped card for its shadow. */
export const SHADOW_ROOM = 48;

export interface SlotPlace {
  y: number;
  scale: number;
  /** px clipped off the top. */
  clipTop: number;
  opacity: number;
  z: number;
  /** Behind in a pile, or waiting: presses go past it. */
  inert: boolean;
  hidden: boolean;
}

/**
 * Where each slot goes, from the heights alone (`noticePlaces.test.ts`).
 * A slot of height 0 is a notice not showing.
 */
export function placeNotices(heights: number[], fanned: boolean, max: number, gap: number) {
  const live = heights.flatMap((h, i) => (h > 0.5 ? [i] : []));
  const shown = live.slice(0, max);
  const piled = shown.length > 1 && !fanned;
  const frontH = shown.length ? heights[shown[0]] : 0;
  const places: SlotPlace[] = heights.map(() => ({
    y: 0, scale: 1, clipTop: 0, opacity: 1, z: 0, inert: true, hidden: true,
  }));
  let y = 0;
  shown.forEach((i, k) => {
    const h = heights[i];
    if (piled && k > 0) {
      const scale = 1 - 0.05 * k;
      places[i] = {
        y: frontH + PEEK * k - h,
        scale,
        // Only what hangs below the front card is left: the glass is 92%
        // solid, so the rest would ghost through it, buttons and all.
        clipTop: Math.max(0, h - (PEEK * k) / scale),
        opacity: 1 - 0.15 * k,
        z: max - k,
        inert: true,
        hidden: false,
      };
    } else {
      places[i] = { y: piled ? 0 : y, scale: 1, clipTop: 0, opacity: 1, z: max - k, inert: false, hidden: false };
    }
    y += h + gap;
  });
  const height = !shown.length ? 0 : piled ? frontH + PEEK * (shown.length - 1) : y - gap;
  return { places, height, piled, count: shown.length };
}
