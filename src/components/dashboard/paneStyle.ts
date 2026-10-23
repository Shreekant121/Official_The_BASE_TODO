/**
 * A Dashboard block's pane, in the look he gave it in its ⚙ (29-1P12). Its
 * own file so the grid and `/design` draw the same four, and the component
 * files export only components (fast refresh).
 *
 * - **glass** — the app's near-solid glass. The one-thing card is nearly all
 *   hero, and always glass.
 * - **lamp** (idea 81) — near-black, its colour glowing down from the top
 *   (the glow is `.dash-lamp::before`). Opaque, so it needs no blur.
 * - **tint** (147) — the glass with a wash of its colour, a coloured edge,
 *   and its big number in the colour (`blockContext.numberTone`).
 * - **full** (147) — the whole block in its colour, for the one he wants to
 *   shout. Everything inside reads the app's text and lime tokens, so those
 *   are pointed at the colour's ink here rather than taught a new case each.
 *
 * `edge` is the look's own rim, added to the frame's shadow.
 */
import type { CSSProperties } from 'react';
import { blockLook, type DashboardBlock } from '../../lib/dashboard/layout';

export interface PaneStyle {
  style: CSSProperties;
  edge: string | null;
  /** Wants the `dash-lamp` class, which draws the glow. */
  lamp: boolean;
}

export function paneStyle(block: Pick<DashboardBlock, 'kind' | 'settings'>): PaneStyle {
  const { look, colour } = blockLook(block);
  const job = `--job-${colour}`;
  const base: CSSProperties = {
    boxSizing: 'border-box',
    /* A stack's pages pad themselves, each as its own block would be. */
    padding: block.kind === 'stack' ? 0 : block.kind === 'one-thing' ? 'var(--sp-3)' : 'var(--sp-7)',
    borderRadius: 'var(--r-xl)',
  };
  const glass: CSSProperties = { WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)' };
  if (look === 'lamp') {
    return {
      style: { ...base, backgroundColor: 'color-mix(in oklch, var(--void-1), black 35%)', ['--lamp' as string]: `var(${job})` },
      edge: 'inset 0 1px 0 oklch(1 0 0 / 0.1), inset 0 0 0 1px oklch(1 0 0 / 0.05)',
      lamp: true,
    };
  }
  if (look === 'tint') {
    return {
      style: {
        ...base, ...glass,
        backgroundImage: `linear-gradient(160deg, color-mix(in oklch, var(${job}) 24%, transparent), color-mix(in oklch, var(${job}) 7%, transparent) 70%), var(--glass-fill-2)`,
      },
      edge: `inset 0 0 0 1px color-mix(in oklch, var(${job}) 38%, transparent)`,
      lamp: false,
    };
  }
  if (look === 'full') {
    const ink = `var(${job}-ink)`;
    return {
      style: {
        ...base,
        backgroundImage: `var(${job}-gel)`,
        ['--fg-1' as string]: ink,
        ['--fg-2' as string]: `color-mix(in oklch, ${ink} 84%, transparent)`,
        ['--fg-3' as string]: `color-mix(in oklch, ${ink} 66%, transparent)`,
        ['--fg-4' as string]: `color-mix(in oklch, ${ink} 50%, transparent)`,
        ['--hue-lime' as string]: ink,
        /* 29-1P2c2: over time and overdue are coral, which would vanish on a
           coral or orange gel; on a full-colour block they take its ink. */
        ['--status-overrun' as string]: ink,
        ['--status-deadline' as string]: ink,
        ['--soft-fill' as string]: 'linear-gradient(145deg, oklch(1 0 0 / 0.2), oklch(1 0 0 / 0.06))',
        ['--soft-raised' as string]: 'inset 0 1px 0 oklch(1 0 0 / 0.3), 0 4px 12px -4px oklch(0 0 0 / 0.35)',
        ['--soft-pressed' as string]: 'inset 0 2px 6px oklch(0 0 0 / 0.28)',
      },
      edge: `var(${job}-rim)`,
      lamp: false,
    };
  }
  return { style: { ...base, ...glass, backgroundImage: 'var(--glass-fill-2)' }, edge: null, lamp: false };
}
