/**
 * Swipe to the next page (idea 128) — the one gesture the week strip, the
 * timeline (29-1c3, 29-1c2) and the calendar (29-2e1) share. Each had its own
 * copy until 29-2e1; it is one piece now.
 *
 * The caller draws a track of three pages (last, this, next) resting at
 * `translate: -100% 0`, inside a viewport that clips. The page under the
 * finger moves with it and its neighbour peeks in; a quarter of the width or
 * a quick flick turns the page, anything less springs back. `turn` does the
 * same for a mouse's arrows. The neighbours are the caller's to build on the
 * first touch (`onFirstTouch`), never at load (rule 2).
 *
 * The viewport says `touch-action: pan-y`, so the browser keeps the vertical
 * scroll and hands the sideways drag here; a drag that goes up or down first
 * is never a swipe, nor is one a second finger joins. `onTurn` runs inside `flushSync`, so the new page is
 * drawn before the slide is let go and the middle slot never shows the old one.
 */
import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useMotion } from './motion';
import { cue } from '../../lib/sound';

/** How far a finger moves before it is a swipe (sideways) or a scroll (up and down). */
const SLOP = 10;

const cubic = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;

export interface SwipePages {
  /** The arrows: slide to the page `dir` away and turn it. */
  turn: (dir: -1 | 1) => void;
  /** Spread on the viewport (the element `viewport` points at). */
  handlers: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: (e: ReactPointerEvent) => void;
  };
  /** On anything a tap inside could press: a swipe that ends over it is not a tap. */
  onClickCapture: (e: ReactMouseEvent) => void;
}

export function useSwipePages({ tracks, viewport, peeking, onFirstTouch, onTurn }: {
  /** The tracks to slide — one, or a head and a body moved by the same numbers. */
  tracks: () => HTMLElement[];
  viewport: { current: HTMLElement | null };
  /** Whether the neighbours are built yet. */
  peeking: boolean;
  /** Build them: called on the first touch, and flushed before the first arrow. */
  onFirstTouch: () => void;
  /** Move to the page `dir` away. */
  onTurn: (dir: -1 | 1) => void;
}): SwipePages {
  const m = useMotion();
  const busy = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; t: number; dx: number; swiping: boolean; dead: boolean } | null>(null);
  const swiped = useRef(false);

  const moveTracks = (dx: number) => {
    for (const el of tracks()) el.style.translate = `calc(-100% + ${dx}px) 0`;
  };

  const settle = (dx: number, dir: -1 | 0 | 1) => {
    const els = tracks();
    if (els.length === 0) return;
    busy.current = true;
    const to = dir === 0 ? '-100%' : dir === 1 ? '-200%' : '0%';
    const from = `calc(-100% + ${dx}px)`;
    const anims = els.map((el) =>
      el.animate([{ translate: `${from} 0` }, { translate: `${to} 0` }], {
        duration: m.dur.base * 1000, easing: cubic(dir === 0 ? m.ease.settle : m.ease.glide), fill: 'forwards',
      }),
    );
    anims[0].onfinish = () => {
      if (dir !== 0) {
        flushSync(() => onTurn(dir));
        cue('detent');
      }
      moveTracks(0);
      anims.forEach((a) => a.cancel());
      busy.current = false;
    };
  };

  const turn = (dir: -1 | 1) => {
    if (busy.current) return;
    if (!peeking) flushSync(onFirstTouch);
    moveTracks(0);
    settle(0, dir);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (busy.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    /* A second finger is a pinch (29-2e2, `usePinchZoom`), never a swipe: the
       page goes back and the click it might end in is swallowed. */
    const first = gesture.current;
    if (first && first.id !== e.pointerId) {
      gesture.current = null;
      swiped.current = true;
      if (first.swiping) settle(first.dx, 0);
      return;
    }
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, swiping: false, dead: false };
    swiped.current = false;
    if (!peeking) onFirstTouch();
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const g = gesture.current;
    if (!g || g.dead || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.swiping) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) { g.dead = true; return; }
      if (Math.abs(dx) <= SLOP) return;
      g.swiping = true;
      swiped.current = true;
      viewport.current?.setPointerCapture(e.pointerId);
    }
    g.dx = dx;
    moveTracks(dx);
  };
  const onPointerEnd = (e: ReactPointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !g.swiping || g.id !== e.pointerId) return;
    const width = viewport.current?.clientWidth ?? 1;
    const v = g.dx / Math.max(1, performance.now() - g.t);
    const dir = g.dx < -width / 4 || v < -0.45 ? 1 : g.dx > width / 4 || v > 0.45 ? -1 : 0;
    settle(g.dx, dir);
  };

  const onClickCapture = (e: ReactMouseEvent) => {
    if (swiped.current) { e.stopPropagation(); e.preventDefault(); swiped.current = false; }
  };

  return {
    turn,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd },
    onClickCapture,
  };
}
