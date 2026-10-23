/**
 * The lime wash a card with steps wears (29-1P7b, idea 160). `StepTrack.tsx`
 * has the whole story; this file holds the parts that are not a component, so
 * fast refresh keeps working on that one.
 */
import type { CSSProperties } from 'react';

/** Past this many steps the dots give way to "↳ 2/5". */
export const MAX_DOTS = 6;

/**
 * The wash as a background layer: `image` goes first in the card's
 * `backgroundImage` list, `size` first in its `backgroundSize` (the fill's
 * layers under it take `100% 100%`, never `auto`, so the list stays
 * interpolable and the width transitions). Longhands only — the `background` shorthand clears the
 * image on React's next render (memory: never the shorthand).
 *
 * The front line is the gradient's last two pixels, so it moves with the wash
 * rather than being a second thing to keep in step.
 */
export function stepWash(done: number, total: number): { image: string; size: string } | null {
  if (total <= 0) return null;
  const pct = Math.max(0, Math.min(100, (done / total) * 100));
  return {
    image:
      'linear-gradient(90deg, oklch(0.84 0.17 130 / 0.04), oklch(0.84 0.17 130 / 0.12) calc(100% - 2px), var(--job-lime-line) calc(100% - 2px))',
    size: `${pct}% 100%`,
  };
}

/**
 * The style a card spreads to wear the wash over its own fill. `fill` is
 * whatever the card would paint without steps (it changes on hover, on a drop,
 * when blocked), so the wash never has to know about those states.
 */
export function withStepWash(fill: string, done: number, total: number): CSSProperties {
  const wash = stepWash(done, total);
  if (!wash) return { backgroundImage: fill };
  return {
    backgroundImage: `${wash.image}, ${fill}`,
    /* One full size per layer the fill may hold, and spare. A fill token is
       itself a LIST (`--glass-fill-1` is a sheen over `--glass-floor-layer`),
       and a size list shorter than the image list repeats from the start —
       so "wash, 100%" gave the floor the wash's width, and the card's solid
       glass stopped where the wash did. Sizes past the last layer are
       ignored. */
    backgroundSize: `${wash.size}${', 100% 100%'.repeat(FILL_LAYERS)}`,
    backgroundRepeat: 'no-repeat',
  };
}

/** More layers than any fill token has (they have two). */
const FILL_LAYERS = 4;

/** The transition the card adds for the wash to grow. */
export const STEP_WASH_TRANSITION = 'background-size var(--dur-slow) var(--ease-glide)';
