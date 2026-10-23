/**
 * One-off motion on the Dashboard (29-1P12) that plays once and never again
 * on the way back. Its own file so the component files export only
 * components (fast refresh).
 *
 * WHY SCRIPT AND NOT A CSS KEYFRAME
 * ---------------------------------
 * The Dashboard is a kept screen (`App.tsx`'s `KEPT_SCREENS`): leaving it
 * hides it with `display: none` and coming back shows it again. That restarts
 * every CSS animation inside it, so a keyframe "pour" would pour again on
 * every tab switch — and idea 56 says the blocks arrive on the first open
 * only. An animation started with `el.animate` belongs to the script, not the
 * style, and a hidden screen does not restart it. Layout effects DO re-run
 * when the screen is shown, so the hook remembers the value it last played
 * for, in a ref that survives the hiding.
 *
 * A layout effect, not a plain one, so the first frame is already the
 * animation's first frame (no flash of the end state). `el.animate` reads no
 * layout (Performance rule 6).
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useReducedMotion } from 'framer-motion';

type Bezier = readonly [number, number, number, number];

export const cubic = (b: Bezier) => `cubic-bezier(${b.join(', ')})`;

/**
 * Calls `play(element, first)` after the render where `value` first appears,
 * and again whenever it changes — never for a value it has already played,
 * and never under reduced motion.
 */
export function usePlayOnChange<T extends Element>(
  ref: RefObject<T | null>,
  value: string | number | boolean,
  play: (el: T, first: boolean) => void,
): void {
  const seen = useRef<{ value: string | number | boolean } | null>(null);
  const reduced = useReducedMotion();
  /* No dependency list: `play` is a new closure every render. The guard makes
     every run but the one that matters a comparison and a return. */
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (seen.current && seen.current.value === value) return;
    const first = seen.current === null;
    seen.current = { value };
    if (!reduced) play(el, first);
  });
}
