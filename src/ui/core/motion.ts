/**
 * The motion tokens, for the few animations CSS cannot drive (V3-1).
 *
 * Almost every animation in the app is CSS and reads `var(--ease-*)` and
 * `var(--dur-*)`, which `<V3Scope>` swaps on its own. Framer Motion cannot read
 * a custom property — it wants numbers — so a component animating in JS takes
 * them from `useMotion()`, which answers with whichever set its scope wears.
 * Keep the two tables below equal to `tokens/motion.css` (`LEGACY`) and
 * `tokens/v3.css` (`V3`); they are copies because JS cannot read the CSS.
 *
 * Durations are in seconds, Framer's unit.
 */
import { useV3 } from './v3Context';

type Bezier = readonly [number, number, number, number];

export interface MotionTokens {
  ease: { glass: Bezier; morph: Bezier; spring: Bezier; inOut: Bezier; exit: Bezier; settle: Bezier; silk: Bezier };
  dur: { instant: number; fast: number; base: number; slow: number; morph: number; sheet: number };
  /** Delay between list items. */
  stagger: number;
}

/* tokens/motion.css. It has no `--ease-settle` or `--ease-silk`; the nearest
   existing curve stands in so a caller never gets `undefined`. */
export const LEGACY: MotionTokens = {
  ease: {
    glass: [0.16, 1, 0.3, 1],
    morph: [0.32, 0.72, 0, 1],
    spring: [0.34, 1.56, 0.64, 1],
    inOut: [0.45, 0.05, 0.55, 0.95],
    exit: [0.4, 0, 1, 0.6],
    settle: [0.34, 1.56, 0.64, 1],
    silk: [0.45, 0.05, 0.55, 0.95],
  },
  dur: { instant: 0.09, fast: 0.16, base: 0.26, slow: 0.42, morph: 0.56, sheet: 0.68 },
  stagger: 0.044,
};

/* tokens/v3.css, from the v4 bundle's tokens/motion.css. Faster, and nothing
   overshoots except `settle`, the one soft landing a release gets. */
export const V3: MotionTokens = {
  ease: {
    glass: [0.22, 0.61, 0.36, 1],
    morph: [0.22, 0.61, 0.36, 1],
    spring: [0.25, 0.8, 0.3, 1],
    inOut: [0.45, 0.05, 0.55, 0.95],
    exit: [0.4, 0, 1, 1],
    settle: [0.34, 1.32, 0.64, 1],
    silk: [0.65, 0, 0.35, 1],
  },
  dur: { instant: 0.08, fast: 0.14, base: 0.2, slow: 0.28, morph: 0.24, sheet: 0.32 },
  stagger: 0.024,
};

export function useMotion(): MotionTokens {
  return useV3() ? V3 : LEGACY;
}
