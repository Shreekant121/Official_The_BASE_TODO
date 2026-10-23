/**
 * What a Dashboard block knows about the pane it is drawn in (29-1P12), handed
 * down by `DashboardGrid`'s frame. Its own file so the component files export
 * only components (fast refresh).
 *
 * - **Its look and colour** (ideas 81 and 147): a big number on a tinted block
 *   takes the block's colour; the giant glyph (86) is drawn in it.
 * - **Its mood** (idea 145, his call 2026-09-30): a block with nothing left
 *   for him says `quiet` and goes grey; one that still has something says
 *   `needs`, and gets a soft lime edge **only once another block has gone
 *   quiet** (`dashboard.css`, through `:has()`), as the ideas card showed —
 *   in the morning no edges, in the evening the eye goes to what is left.
 *
 * The mood is written straight onto the frame's element as `data-mood`, in a
 * layout effect, so the frame never re-renders for it and the first paint is
 * already right. A block drawn outside a frame (the lifted copy while
 * dragging, `/design`) has no frame to write to and says nothing.
 */
import { createContext, useContext, useLayoutEffect } from 'react';
import type { BlockLook, LookColour } from '../../lib/dashboard/layout';

/** `perfect` (29-1P14a, idea 111): the Hours block on a perfect day, a gold edge. */
export type BlockMood = 'quiet' | 'needs' | 'neutral' | 'perfect';

export interface BlockContextValue {
  /** Writes `data-mood` onto the frame; `null` takes it off. Absent outside a frame. */
  setMood: ((mood: BlockMood | null) => void) | null;
  look: BlockLook;
  colour: LookColour;
}

export const BlockContext = createContext<BlockContextValue>({ setMood: null, look: 'glass', colour: 'lime' });

export function useBlockLook(): BlockContextValue {
  return useContext(BlockContext);
}

export function useBlockMood(mood: BlockMood): void {
  const { setMood } = useContext(BlockContext);
  useLayoutEffect(() => {
    if (!setMood) return;
    setMood(mood);
    return () => setMood(null);
  }, [setMood, mood]);
}

/** The colour a block's big number is drawn in: its own on a tinted block. */
export function numberTone(look: BlockLook, colour: LookColour): string {
  return look === 'tint' ? `var(--job-${colour}-tag-fg)` : 'var(--fg-1)';
}
