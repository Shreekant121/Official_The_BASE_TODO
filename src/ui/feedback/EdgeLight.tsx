/**
 * Atlas lights the edges (29-1P15a, idea 67, from Apple Intelligence): while
 * Atlas is working, the edges of what it is working in glow violet, the colour
 * travelling round them; the moment it is not, the light fades out.
 *
 *   <EdgeLight on={busy} />          — fills its positioned parent, takes its corners
 *   <EdgeLight on={busy} fixed />    — the window's edges (the chat page)
 *
 * The look and why it is cheap are in `atlasAtWork.css`: four small strips
 * slid by `translate` on the compositor, a mask for the glow, no blur and no
 * repaint. Off, the loop is paused, so at rest it costs nothing (Performance
 * rule 1). It is always in the tree, so turning on is a fade, never a mount.
 * Nothing in it can be pressed or read.
 */
import type { CSSProperties } from 'react';

export interface EdgeLightProps {
  /** Atlas is working right now. */
  on: boolean;
  /** Pinned to the window rather than filling the parent. */
  fixed?: boolean;
  /** For a `fixed` light, the rung it sits on (`lib/zLayers.ts`). */
  zIndex?: number;
  style?: CSSProperties;
}

export function EdgeLight({ on, fixed = false, zIndex, style }: EdgeLightProps) {
  return (
    <span
      aria-hidden="true"
      className="ag-edge-light"
      data-on={on ? '' : undefined}
      data-fixed={fixed ? '' : undefined}
      data-edge-light=""
      style={zIndex === undefined ? style : { zIndex, ...style }}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
