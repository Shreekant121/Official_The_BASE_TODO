/**
 * A highlight that glides (idea 59, 29-1P5c, BIG-15; Vercel, Linear). One
 * soft pad per list slides from row to row under the mouse, instead of each
 * row lighting up on its own: `MorphMenu`'s items, the command palette's
 * results and the rail.
 *
 *   const { pad, hostProps } = useGlide();
 *   <div style={{ position: 'relative' }} {...hostProps}>
 *     <span ref={pad} className="ag-glide" aria-hidden="true" />
 *     <button data-glide style={{ position: 'relative', zIndex: 1 }}>…</button>
 *
 * A row opts in with `data-glide` (`data-glide="danger"` for a coral pad).
 * The host must be the pad's positioned parent; if it scrolls, the pad is in
 * its content and scrolls with it.
 *
 * The mouse only: a finger has no hover, and a tap would leave a pad behind.
 * A list whose highlight is a SELECTION rather than a hover (the palette,
 * which the arrow keys move) calls `moveTo` itself.
 *
 * Cost: nothing at rest and no React render on a move — the pad is written
 * directly. It measures the row it is going to, on the pointer event that
 * sent it there; never on a screen's way in (Performance rule 6).
 */
import { useCallback, useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export interface Glide {
  /** The pad's ref callback. */
  pad: (el: HTMLSpanElement | null) => void;
  /** Slide the pad to this row (`snap`: put it there with no glide); `null` hides it. */
  moveTo: (row: HTMLElement | null, opts?: { snap?: boolean }) => void;
  /** For the host: the pad follows the mouse over its `[data-glide]` rows. */
  hostProps: {
    onPointerOver: (e: ReactPointerEvent<HTMLElement>) => void;
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
  };
}

export function useGlide(): Glide {
  const padRef = useRef<HTMLSpanElement | null>(null);
  const atRef = useRef<HTMLElement | null>(null);
  const pad = useCallback((el: HTMLSpanElement | null) => { padRef.current = el; }, []);

  const moveTo = useCallback((row: HTMLElement | null, opts?: { snap?: boolean }) => {
    const pad = padRef.current;
    if (!pad) return;
    if (!row) {
      delete pad.dataset.on;
      atRef.current = null;
      return;
    }
    const shown = pad.dataset.on !== undefined;
    if (row === atRef.current && shown && !opts?.snap) return;
    const host = (pad.offsetParent as HTMLElement | null) ?? pad.parentElement;
    if (!host) return;
    const h = host.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    /* A pad that was hidden appears where it is going: gliding in from the
       last row it left would draw a streak across the list. */
    const snap = !!opts?.snap || !shown;
    if (snap) pad.dataset.snap = '';
    pad.style.translate = `${r.left - h.left - host.clientLeft + host.scrollLeft}px ${r.top - h.top - host.clientTop + host.scrollTop}px`;
    pad.style.width = `${r.width}px`;
    pad.style.height = `${r.height}px`;
    if (row.dataset.glide === 'danger') pad.dataset.tone = 'danger';
    else delete pad.dataset.tone;
    if (snap) {
      void pad.offsetWidth; // commit the jump before the glide comes back on
      delete pad.dataset.snap;
    }
    pad.dataset.on = '';
    atRef.current = row;
  }, []);

  const hostProps = useMemo(() => ({
    onPointerOver: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      const row = (e.target as Element).closest<HTMLElement>('[data-glide]');
      /* Between two rows (the gap) the pad stays where it was. */
      if (row && e.currentTarget.contains(row)) moveTo(row);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') moveTo(null);
    },
  }), [moveTo]);

  return { pad, moveTo, hostProps };
}
