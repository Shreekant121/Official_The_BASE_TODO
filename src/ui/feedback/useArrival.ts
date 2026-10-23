/**
 * The real rows fading in over the placeholders (29-1P14d2, idea 116).
 *
 * Call it in the screen that draws a `SkeletonRows` while it waits, with a
 * ref on whatever replaces it. Once `ready` turns true after a render where
 * it was false, that element's children fade in one after another — no jump
 * from grey to text. A screen that had its data at once (a fixture, a cache)
 * never waited, so nothing moves.
 *
 * `el.animate` from a layout effect, never a CSS keyframe: the screens that
 * wait are kept screens, and `display: none` restarts every keyframe in them
 * on each return (`motionOnce.ts` says more). A layout effect, so the first
 * frame of the rows is already the animation's first frame. It reads no
 * layout (Performance rule 6).
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';

/* The idea page's numbers: 350ms each, 50ms apart. Past a dozen rows the
   rest arrive with the twelfth; a long list should not take a second. */
const FADE_MS = 350;
const STEP_MS = 50;
const STAGGERED = 12;

export function useArrival(ref: RefObject<HTMLElement | null>, ready: boolean): void {
  const waited = useRef(false);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (!ready) {
      waited.current = true;
      return;
    }
    if (!waited.current) return;
    waited.current = false;
    const el = ref.current;
    if (!el || reduced) return;
    Array.from(el.children).forEach((child, i) => {
      child.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FADE_MS,
        delay: Math.min(i, STAGGERED) * STEP_MS,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
        fill: 'backwards',
      });
    });
  }, [ready, reduced, ref]);
}
