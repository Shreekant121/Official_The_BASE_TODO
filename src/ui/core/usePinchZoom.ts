/**
 * Pinch between views (29-2e2, idea 127): two fingers on `target`, or a
 * trackpad's pinch (Ctrl + wheel), scale it about the point between them;
 * let go past a turn and `onZoom` swaps the view, which then grows or shrinks
 * in from that same point, the way Photos zooms. `zoom` does the same for a
 * button. The numbers are `lib/pinchZoom.ts` (pure, tested).
 *
 * It sits beside `useSwipePages`, not inside it: a second finger ends a swipe
 * there, and a pinch is only ever two. Nothing is drawn per frame but
 * `scale` and `opacity` on the target, compositor-only, and nothing is left
 * on it after (`data-pinching` is there only while it moves). The target's
 * box is read once when a pinch starts, never on the way in (rule 6).
 *
 * `onZoom` runs inside `flushSync`, so the new view is on the page before it
 * grows in; it is handed the point in the window, still on the old view, so
 * it can ask what was under the fingers.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { useMotion, type MotionTokens } from './motion';
import { cue } from '../../lib/sound';
import { ENTER_FROM, liveFade, liveScale, pinchVerdict, wheelScale, type ZoomDir } from '../../lib/pinchZoom';

/** A trackpad pinch has no "fingers up": this long without a wheel event is one. */
const WHEEL_IDLE_MS = 160;

const cubic = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;

export interface Point { x: number; y: number }

export function usePinchZoom({ target, can, onZoom }: {
  target: { current: HTMLElement | null };
  /** Whether there is a view that way. */
  can: (dir: ZoomDir) => boolean;
  /** Swap the view; `at` is where the fingers were, in the window. */
  onZoom: (dir: ZoomDir, at: Point) => void;
}): { zoom: (dir: ZoomDir, at?: Point) => void } {
  const m = useMotion();
  const latest = useRef({ can, onZoom, m });
  useLayoutEffect(() => {
    latest.current = { can, onZoom, m };
  });
  const api = useRef<{ zoom: (dir: ZoomDir, at?: Point) => void }>({ zoom: () => {} });

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    let busy = false;
    let pinch: { dist0: number; raw: number; x: number; y: number } | null = null;
    let wheelTimer = 0;
    const ways = () => ({ out: latest.current.can('out'), in: latest.current.can('in') });
    const motion = (): MotionTokens => latest.current.m;

    const begin = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      el.style.transformOrigin = `${x - r.left}px ${y - r.top}px`;
      el.dataset.pinching = '';
    };
    const tidy = () => {
      el.style.scale = '';
      el.style.opacity = '';
      el.style.transformOrigin = '';
      delete el.dataset.pinching;
      busy = false;
    };
    const draw = (raw: number) => {
      const s = liveScale(raw, ways());
      el.style.scale = String(s);
      el.style.opacity = String(liveFade(s));
    };
    const commit = (dir: ZoomDir, at: Point) => {
      busy = true;
      el.dataset.pinching = '';
      flushSync(() => latest.current.onZoom(dir, at));
      cue('detent');
      el.style.scale = '';
      el.style.opacity = '';
      const a = el.animate(
        [{ scale: ENTER_FROM[dir], opacity: 0.35 }, { scale: 1, opacity: 1 }],
        { duration: motion().dur.slow * 1000, easing: cubic(motion().ease.glide) },
      );
      a.onfinish = tidy;
      a.oncancel = tidy;
    };
    const release = (p: { raw: number; x: number; y: number }) => {
      const dir = pinchVerdict(p.raw, ways());
      if (dir) return commit(dir, { x: p.x, y: p.y });
      /* Not far enough: spring back from where it was drawn. */
      busy = true;
      const s = liveScale(p.raw, ways());
      el.style.scale = '';
      el.style.opacity = '';
      const a = el.animate(
        [{ scale: s, opacity: liveFade(s) }, { scale: 1, opacity: 1 }],
        { duration: motion().dur.base * 1000, easing: cubic(motion().ease.settle) },
      );
      a.onfinish = tidy;
      a.oncancel = tidy;
    };

    const gap = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (busy || pinch || e.touches.length !== 2) return;
      const x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      pinch = { dist0: Math.max(1, gap(e.touches)), raw: 1, x, y };
      begin(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      /* Two fingers are a pinch, never a scroll or the page's own zoom. */
      if (e.cancelable) e.preventDefault();
      pinch.raw = gap(e.touches) / pinch.dist0;
      draw(pinch.raw);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!pinch || e.touches.length >= 2) return;
      const p = pinch;
      pinch = null;
      release(p);
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      /* Ctrl + wheel would zoom the whole page; here it zooms the calendar. */
      e.preventDefault();
      if (busy) return;
      if (!pinch) {
        pinch = { dist0: 1, raw: 1, x: e.clientX, y: e.clientY };
        begin(e.clientX, e.clientY);
      }
      pinch.raw = wheelScale(pinch.raw, e.deltaY, e.deltaMode);
      draw(pinch.raw);
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        const p = pinch;
        pinch = null;
        if (p) release(p);
      }, WHEEL_IDLE_MS);
    };

    api.current.zoom = (dir, at) => {
      if (busy || pinch || !latest.current.can(dir)) return;
      const r = el.getBoundingClientRect();
      const p = at ?? { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      begin(p.x, p.y);
      commit(dir, p);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.clearTimeout(wheelTimer);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
      el.getAnimations().forEach((a) => a.cancel());
      tidy();
    };
  }, [target]);

  return { zoom: (dir, at) => api.current.zoom(dir, at) };
}
