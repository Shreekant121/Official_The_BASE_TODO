/**
 * The Ask Atlas bar's grow and shrink, as numbers (29-1P15c, idea 74).
 *
 * Pure: rectangles and corner radii in, Web Animation keyframes out, so the
 * shape of the move is pinned in `askBarMorph.test.ts` without a browser.
 * `ui/overlay/AskAtlasBar.tsx` is the half that measures and plays them.
 *
 * WHY A STAND-IN, NOT THE PANEL ITSELF
 * ------------------------------------
 * The panel is docked: it is a track of its host's grid, sized by the grid,
 * and on the laptop it sits beside the board rather than over where the bar
 * was. Growing the real panel out of the bar would mean animating that grid,
 * which re-lays the whole board every frame. So a plain glass box, the
 * panel's own surface, travels from the bar's rectangle to the panel's (and
 * back), alone and `position: fixed`, while the real panel waits invisible
 * underneath and fades in as the box lands. Only that one box is laid out
 * per frame, and only for the half second after a tap: nothing here loops.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Top-left, top-right, bottom-right, bottom-left, in pixels. */
export type Corners = readonly [number, number, number, number];

/**
 * A box worth growing from. A bar that is not drawn (display none, or not
 * laid out yet) measures 0 x 0, and growing from a point at the window's
 * corner is worse than not growing at all.
 */
export function usableBox(box: Box | null | undefined): Box | null {
  if (!box) return null;
  if (!(box.width > 1 && box.height > 1)) return null;
  if (![box.left, box.top, box.width, box.height].every(Number.isFinite)) return null;
  return { left: box.left, top: box.top, width: box.width, height: box.height };
}

/** `getComputedStyle`'s four radii (`"28px"`, `"0px"`, a pair like `"28px 28px"`) as numbers. */
export function readCorners(radii: readonly string[]): Corners {
  const px = (value: string | undefined) => {
    const n = Number.parseFloat(value ?? '');
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return [px(radii[0]), px(radii[1]), px(radii[2]), px(radii[3])];
}

/**
 * A pill's corners, which `9999px` would spell: half its height. Animated
 * from 9999px a corner stays fully round until the very last frame and then
 * snaps, so the bar's real radius is what the move starts from.
 */
export function pillCorners(box: Box): Corners {
  const r = box.height / 2;
  return [r, r, r, r];
}

/* A type, not an interface: a Web Animation keyframe needs the index
   signature only a type alias gives implicitly. */
export type MorphFrame = {
  left: string;
  top: string;
  width: string;
  height: string;
  borderTopLeftRadius: string;
  borderTopRightRadius: string;
  borderBottomRightRadius: string;
  borderBottomLeftRadius: string;
};

function frame(box: Box, corners: Corners): MorphFrame {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderTopLeftRadius: `${corners[0]}px`,
    borderTopRightRadius: `${corners[1]}px`,
    borderBottomRightRadius: `${corners[2]}px`,
    borderBottomLeftRadius: `${corners[3]}px`,
  };
}

/** The stand-in's two keyframes, from one shape to the other. Shrinking is the same call reversed. */
export function morphFrames(from: Box, fromCorners: Corners, to: Box, toCorners: Corners): [MorphFrame, MorphFrame] {
  return [frame(from, fromCorners), frame(to, toCorners)];
}
