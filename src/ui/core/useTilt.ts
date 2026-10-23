/**
 * Cards that tilt (idea 25, 29-1P6c, BIG-15; Apple TV). Point the mouse at a
 * card and it leans toward you, the side under the pointer sinking away; take
 * the mouse off and it settles flat.
 *
 *   const ref = useRef<HTMLElement>(null);
 *   useTilt(ref, { enabled: !dragging });
 *
 * **Where (the queue):** Home's project cards and the Dashboard's blocks, on
 * the laptop only — a finger has no hover, so on a touch screen the hook
 * attaches nothing at all.
 *
 * WHAT IT WRITES, AND WHAT DRAWS IT
 *   The hook only writes custom properties on the element — `--tilt-rx` and
 *   `--tilt-ry`, the same lean as one turn `--tilt-axis`, and where the mouse
 *   is — and `data-tilt` while it leans. It never writes `transform` itself,
 *   because Framer owns `transform` on the cards this goes on. A Dashboard
 *   block draws it through `.ag-tilt[data-tilt]` (its `transform` is free
 *   outside edit mode); a project card, whose `transform` Framer holds for
 *   its arrival, through the separate `rotate` property, `.ag-card[data-tilt]`
 *   — both in `motionPieces.css`.
 *
 * THE ANGLE IS A DISTANCE, NOT A NUMBER OF DEGREES
 *   The idea page leaned a 220px card 9° each way. The same 9° on a Dashboard
 *   block four times as wide throws its far edge 70px toward you. So the angle
 *   is worked out from how far the edge should travel, `LIFT_PX`, whatever the
 *   card's size: a 316px project card leans about 4°, a wide block about 1.5°.
 *
 * SPEED (CLAUDE.md "Performance"): no listeners on a touch screen, nothing at
 * rest, at most one write a frame while the mouse moves, and the card's own
 * `transition` smooths between those writes. The flag comes off a beat after
 * the mouse leaves, so a still card holds no 3D transform and no layer.
 */
import { useEffect } from 'react';
import type { RefObject } from 'react';
import { prefersReducedMotion } from '../overlay/sheetMotion';

export interface TiltOptions {
  /** False holds the card flat: while it is dragged, edited, or its menu is open. */
  enabled?: boolean;
}

/** How far the card's edge travels toward you at the very corner, px. */
const LIFT_PX = 11;
/** Never more than this, however small the card, degrees. */
const MAX_DEG = 6;
/** How long the settle back to flat takes before the flag comes off, ms. */
const SETTLE_MS = 420;

const FINE_POINTER = '(hover: hover) and (pointer: fine)';
/** No turn at all, spelt so `rotate` accepts it (a zero axis is invalid). */
const FLAT_AXIS = '0 0 1 0deg';

export function useTilt(ref: RefObject<HTMLElement | null>, opts: TiltOptions = {}): void {
  const on = opts.enabled !== false;

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    if (typeof window === 'undefined' || !window.matchMedia?.(FINE_POINTER).matches) return;
    if (prefersReducedMotion()) return;

    let frame = 0;
    let settle = 0;
    let at: { x: number; y: number } | null = null;

    const write = () => {
      frame = 0;
      if (!at) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      /* -0.5 at one edge, +0.5 at the other. */
      const px = Math.min(0.5, Math.max(-0.5, (at.x - r.left) / r.width - 0.5));
      const py = Math.min(0.5, Math.max(-0.5, (at.y - r.top) / r.height - 0.5));
      const degFor = (half: number) => Math.min(MAX_DEG, (Math.atan(LIFT_PX / half) * 180) / Math.PI);
      /* Turning about the vertical axis lifts the left and right edges, so its
         size comes from the width; about the horizontal axis, the height. */
      const ry = px * 2 * degFor(r.width / 2);
      const rx = -py * 2 * degFor(r.height / 2);
      el.style.setProperty('--tilt-ry', `${ry.toFixed(2)}deg`);
      el.style.setProperty('--tilt-rx', `${rx.toFixed(2)}deg`);
      /* The same lean as one turn about one axis, for the `rotate` property
         on a card whose `transform` Framer owns (`.ag-card[data-tilt]`). */
      const turn = Math.hypot(rx, ry);
      el.style.setProperty('--tilt-axis', turn < 0.01 ? FLAT_AXIS : `${rx.toFixed(3)} ${ry.toFixed(3)} 0 ${turn.toFixed(2)}deg`);
      /* Where the light sits (`.ag-tilt-shine`), in the card's own pixels. */
      el.style.setProperty('--tilt-gx', `${Math.round(at.x - r.left)}px`);
      el.style.setProperty('--tilt-gy', `${Math.round(at.y - r.top)}px`);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      window.clearTimeout(settle);
      el.dataset.tilt = '';
      at = { x: e.clientX, y: e.clientY };
      if (!frame) frame = requestAnimationFrame(write);
    };
    const flat = () => {
      at = null;
      cancelAnimationFrame(frame);
      frame = 0;
      el.style.setProperty('--tilt-rx', '0deg');
      el.style.setProperty('--tilt-ry', '0deg');
      el.style.setProperty('--tilt-axis', FLAT_AXIS);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => { delete el.dataset.tilt; }, SETTLE_MS);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', flat);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', flat);
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      el.style.removeProperty('--tilt-rx');
      el.style.removeProperty('--tilt-ry');
      el.style.removeProperty('--tilt-axis');
      el.style.removeProperty('--tilt-gx');
      el.style.removeProperty('--tilt-gy');
      delete el.dataset.tilt;
    };
  }, [ref, on]);
}
