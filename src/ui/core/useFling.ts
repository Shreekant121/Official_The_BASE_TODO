/**
 * Throw it away (idea 126, 29-1P6b, BIG-15; iOS notifications). Grab a notice
 * and flick it sideways: it flies off with the speed you gave it, tilting and
 * fading as it goes, slowing as it lands. A slow drag that lets go short of
 * the edge springs back. It feels like moving a card, not pressing an ✕.
 *
 *   const ref = useRef<HTMLDivElement>(null);
 *   useFling(ref, { onThrow: dismiss });
 *
 * **Where (his calls, 2026-10-12):** every `Toast` that can be dismissed, the
 * app-wide banners that have a Dismiss or Hide (`NotificationCard`'s
 * `onThrow`), the Notifications page's "Already fired" cards (thrown = its
 * Dismiss), and the Atlas tray — a card still waiting is DISCARDED by a throw
 * (nothing is sent), a receipt just goes.
 *
 * HOW A PRESS IS READ
 *   - Finger or mouse. Sideways past SLOP first and it is a throw; up or down
 *     first and it is a scroll, left to the browser. The element takes
 *     `touch-action: pan-y`, so a finger moving sideways reaches this hook and
 *     one moving up and down still scrolls the list it sits in.
 *   - Let go faster than FLICK px/ms, or past THROW_AT of its own width, and
 *     it goes; `onThrow` runs when the flight lands, so whatever removes the
 *     element removes it after he has seen it leave.
 *   - The click a drag ends on is swallowed: a card's head is a button.
 *   - If nothing took it away (a dismiss that failed), it drifts back in.
 *
 * SPEED (CLAUDE.md "Performance"): nothing runs at rest — the window has no
 * listeners until a press, and the motion is `translate`, `rotate` and
 * `opacity` only, which the compositor moves without painting. The individual
 * `translate`/`rotate` properties, not `transform`: a Framer parent or a CSS
 * arrival may own `transform` on the same element.
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { cue } from '../../lib/sound';
import { prefersReducedMotion } from '../overlay/sheetMotion';

export interface FlingOptions {
  /** Runs once the card has flown off. Absent or `enabled: false`, nothing can be thrown. */
  onThrow?: () => void;
  enabled?: boolean;
}

/** Travel before a press is a throw (or a scroll). */
const SLOP = 8;
/** Release speed that throws, px per ms — the idea page's. */
const FLICK = 0.5;
/** Or this much of its own width, dragged slowly. */
const THROW_AT = 0.4;
/** The tilt, degrees per px — the idea page's. */
const TILT = 0.03;
/** How long a thrown card waits for its owner to remove it before it comes back. */
const COME_BACK_MS = 6000;

export function useFling(ref: RefObject<HTMLElement | null>, opts: FlingOptions): void {
  const latest = useRef(opts);
  useEffect(() => { latest.current = opts; });
  const on = !!opts.onThrow && opts.enabled !== false;

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    el.style.touchAction = 'pan-y';

    let press: { id: number; x: number; y: number; dx: number; live: boolean; trail: [number, number][] } | null = null;
    let swallow = false;
    let flight: Animation | null = null;
    let back: ReturnType<typeof setTimeout> | null = null;

    const pose = (dx: number) => {
      el.style.translate = `${dx}px 0`;
      el.style.rotate = `${dx * TILT}deg`;
      el.style.opacity = String(1 - Math.min(0.5, Math.abs(dx) / 500));
    };
    const clear = () => {
      el.style.translate = '';
      el.style.rotate = '';
      el.style.opacity = '';
      el.style.userSelect = '';
    };
    const springBack = (from: number) => {
      clear();
      if (from === 0 || prefersReducedMotion()) return;
      el.animate(
        [
          { translate: `${from}px 0`, rotate: `${from * TILT}deg`, opacity: 1 - Math.min(0.5, Math.abs(from) / 500) },
          { translate: '0px 0', rotate: '0deg', opacity: 1 },
        ],
        { duration: 350, easing: 'cubic-bezier(.34,1.3,.64,1)' },
      );
    };

    const stop = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
    };
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const dx = e.clientX - press.x;
      const dy = e.clientY - press.y;
      if (!press.live) {
        if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) { press = null; stop(); return; }
        if (Math.abs(dx) <= SLOP) return;
        press.live = true;
        swallow = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* already gone */ }
        /* Its arrival (`--kf-condense`, fill both) would hold opacity over
           ours for good; it has long finished, so it can go. */
        for (const a of el.getAnimations()) if ('animationName' in a) a.cancel();
        el.style.userSelect = 'none';
        window.getSelection()?.removeAllRanges();
      }
      press.dx = dx;
      press.trail.push([e.clientX, e.timeStamp]);
      if (press.trail.length > 6) press.trail.shift();
      pose(dx);
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      stop();
      if (!p.live) return;
      /* The speed over the last few moves, not the whole drag. */
      const [a, b] = [p.trail[0], p.trail[p.trail.length - 1]];
      const vx = a && b && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
      const width = el.offsetWidth || 1;
      const goes = (Math.abs(vx) > FLICK && Math.sign(vx) === Math.sign(p.dx || vx)) || Math.abs(p.dx) > width * THROW_AT;
      if (!goes) { springBack(p.dx); return; }
      const dir = Math.sign(p.dx || vx) || 1;
      /* On past the edge of the card at the speed it was let go, slowing. */
      const to = p.dx + dir * Math.max(width * 0.6, Math.abs(vx) * 420);
      cue('toss');
      clear();
      el.style.userSelect = 'none';
      flight = el.animate(
        [
          { translate: `${p.dx}px 0`, rotate: `${p.dx * TILT}deg`, opacity: 1 - Math.min(0.5, Math.abs(p.dx) / 500) },
          { translate: `${to}px 0`, rotate: `${to * TILT}deg`, opacity: 0 },
        ],
        { duration: prefersReducedMotion() ? 1 : 420, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' },
      );
      flight.onfinish = () => {
        latest.current.onThrow?.();
        /* Still here long after: whatever was meant to take it away did not
           (a dismiss that failed). It comes back rather than hiding for good. */
        back = setTimeout(() => {
          if (!el.isConnected) return;
          flight?.cancel();
          flight = null;
          el.style.userSelect = '';
          el.animate([{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 300, easing: 'ease-out' });
        }, COME_BACK_MS);
      };
    };
    const onCancel = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const p = press;
      press = null;
      stop();
      if (p.live) springBack(p.dx);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || press || flight) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, live: false, trail: [[e.clientX, e.timeStamp]] };
      swallow = false;
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
    };
    /* At the element, before React's own listener on the root hears it. */
    const onClick = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick, true);
    return () => {
      stop();
      if (back) clearTimeout(back);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick, true);
      el.style.touchAction = '';
    };
  }, [ref, on]);
}
