import type { CSSProperties } from 'react';

/**
 * An event's colour on a calendar block (29-2e1): its job colour for the
 * edge, washed for the fill and lightened for the words. Mixed in oklab,
 * because oklch turns the hue on the way to transparent or white.
 */
export function eventColours(colour: string): CSSProperties {
  return {
    '--ev': `var(--job-${colour})`,
    '--ev-wash': `color-mix(in oklab, var(--job-${colour}) 18%, transparent)`,
    '--ev-text': `color-mix(in oklab, var(--job-${colour}) 62%, white)`,
  } as CSSProperties;
}
