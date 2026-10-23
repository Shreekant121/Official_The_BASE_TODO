/**
 * Pinching between views (29-2e2, idea 127): the numbers behind the gesture,
 * pure. Photos' zoom: fingers together zoom OUT to a wider view (the day to
 * the week to the month), fingers apart dive back IN. While the fingers move
 * the view follows them; let go past a fifth smaller or a quarter bigger and
 * it turns into the next view, anything less springs back. Where there is no
 * view that way (no year past the month, nothing finer than the day) it gives
 * a little and comes back, so the end of the road is felt, not hidden.
 *
 * `ui/core/usePinchZoom.ts` is the gesture that reads these; a trackpad's
 * pinch arrives as Ctrl + wheel and is turned into the same scale.
 */

/** `out` is fingers together (a wider view), `in` fingers apart. */
export type ZoomDir = 'out' | 'in';

/** Let go below this and it zooms out. */
export const PINCH_OUT_AT = 0.8;
/** Let go above this and it zooms in. */
export const PINCH_IN_AT = 1.25;
/** How far the view follows the fingers, either way. */
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.6;
/** Where no view lies that way, the view gives this share of the pinch. */
const BLOCKED_GIVE = 0.2;
/** ...and never more than this, however far the fingers go. */
const BLOCKED_MAX = 0.12;

export interface ZoomWays {
  out: boolean;
  in: boolean;
}

/** What a released pinch does: zoom out, zoom in, or nothing (spring back). */
export function pinchVerdict(scale: number, ways: ZoomWays): ZoomDir | null {
  if (scale <= PINCH_OUT_AT && ways.out) return 'out';
  if (scale >= PINCH_IN_AT && ways.in) return 'in';
  return null;
}

/** The scale the view is drawn at for the fingers' `raw` scale. */
export function liveScale(raw: number, ways: ZoomWays): number {
  let s = raw;
  if (s < 1 && !ways.out) s = 1 - Math.min(BLOCKED_MAX, (1 - s) * BLOCKED_GIVE);
  if (s > 1 && !ways.in) s = 1 + Math.min(BLOCKED_MAX, (s - 1) * BLOCKED_GIVE);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

/** The view fades a little as it nears a turn, so the turn is expected. */
export function liveFade(scale: number): number {
  const toTurn = scale < 1 ? (1 - scale) / (1 - PINCH_OUT_AT) : (scale - 1) / (PINCH_IN_AT - 1);
  return 1 - Math.min(1, toTurn) * 0.35;
}

/**
 * A trackpad pinch (Ctrl + wheel in Chromium): each event's `deltaY` is a
 * small step, negative for fingers apart. One notch of Ctrl + a mouse wheel
 * (100) is past a turn on its own, which is what a deliberate notch means.
 * `deltaMode` 1 is lines, about 16px each.
 */
export function wheelScale(scale: number, deltaY: number, deltaMode = 0): number {
  const dy = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.min(3, Math.max(0.3, scale * Math.exp(-dy * 0.01)));
}

/** The scale the new view grows or shrinks from: out comes in from bigger, in from smaller. */
export const ENTER_FROM: Record<ZoomDir, number> = { out: 1.18, in: 0.84 };
