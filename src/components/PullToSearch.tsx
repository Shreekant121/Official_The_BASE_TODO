/**
 * Pull down to search (idea 148, 29-1P13) — the Dashboard and Home, on a
 * touch screen.
 *
 * Pull the page down from its top and a search bar drops from above while the
 * page sinks back and dims, like pulling down on an iPhone's home screen. Let
 * go past the mark and the search opens: the command palette, the same one
 * Ctrl+K opens on the laptop (BUILD-9) — tasks, projects, or a question for
 * Atlas. Let go short of it and everything settles back.
 *
 * HOW, AND WHY THIS WAY
 * ---------------------
 * - **Touch events, not pointer events.** A pull must stop the browser's own
 *   handling of the same finger — scrolling, and Brave's pull-to-refresh at
 *   the top — and only a non-passive `touchmove` can `preventDefault` that.
 *   It is taken only once the finger has gone clearly *down* from the very
 *   top; a sideways or upward start is left to the browser, untouched.
 * - **Nothing re-renders while the finger moves.** The page's and the bar's
 *   transforms are written straight onto their elements, once a frame, and
 *   only `transform` and `opacity` move — the compositor's two cheap
 *   properties. The page dims under a plain dark layer's opacity rather than
 *   a moving filter.
 * - **The bar is built on the first pull** (rule 2), and kept.
 * - A finger that starts inside something that scrolls on its own and is not
 *   at its top (a Stack's later page, a long list) is that thing's.
 * - **A finger held still first is a drag, not a pull.** Home's cards pick up
 *   on a 200 ms press (`SortableList`); a pull starts moving at once, so one
 *   that waits longer than `HOLD_MS` before moving is left alone.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Icon, useV3, v3Attr } from '../ui';
import { useUIStore } from '../store/useUIStore';
import { Z } from '../lib/zLayers';

/** How far the finger travels for a full pull, px. */
const FULL = 120;
/** Let go past this share of a full pull and the search opens. */
const OPEN_AT = 0.6;
/** How far down a full pull carries the page, px. */
const LIFT = 40;
/** Still for longer than this before moving: a press-and-drag, not a pull. */
const HOLD_MS = 180;

export function usePullToSearch(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  enabled = true,
): { layer: React.ReactNode } {
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  const [built, setBuilt] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const v3 = useV3();

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; at: number } | null = null;
    let pulling = false;
    let k = 0;
    let frame = 0;

    const paint = (settle: boolean) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const ease = settle ? 'transform 0.45s var(--ease-springy), opacity 0.3s var(--ease-glass)' : 'none';
        const page = content.current;
        if (page) {
          page.style.transition = ease;
          page.style.transform = k > 0 ? `translateY(${(k * LIFT).toFixed(1)}px) scale(${(1 - k * 0.05).toFixed(4)})` : '';
          page.style.transformOrigin = '50% 0';
        }
        if (dim.current) {
          dim.current.style.transition = ease;
          dim.current.style.opacity = String(k * 0.55);
        }
        if (bar.current) {
          bar.current.style.transition = ease;
          bar.current.style.transform = `translate(-50%, ${(-72 + k * 72).toFixed(1)}px) scale(${(0.92 + k * 0.08).toFixed(3)})`;
          bar.current.style.opacity = String(Math.min(1, k * 1.4));
          bar.current.dataset.ready = k >= OPEN_AT ? 'true' : 'false';
        }
      });
    };

    /** Something between the finger and the page that scrolls on its own and is not at its top. */
    const innerScrolled = (target: EventTarget | null) => {
      for (let n = target as HTMLElement | null; n && n !== el; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      pulling = false;
      if (e.touches.length !== 1 || el.scrollTop > 0 || innerScrolled(e.target)) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-editing="true"], input, textarea, [contenteditable="true"]')) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: e.timeStamp };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        /* Sideways or upward first: the browser's. Clearly down: ours. */
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) { start = null; return; }
        if (dy < 10) return;
        if (e.timeStamp - start.at > HOLD_MS) { start = null; return; }
        pulling = true;
        setBuilt(true);
      }
      e.preventDefault();
      k = Math.min(1, Math.max(0, (dy - 10) / FULL));
      paint(false);
    };
    const onEnd = () => {
      if (!pulling) { start = null; return; }
      const open = k >= OPEN_AT;
      start = null;
      pulling = false;
      k = 0;
      paint(true);
      if (open) setPaletteOpen(true);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scroller, content, enabled, setPaletteOpen]);

  const layer = built
    ? createPortal(
        <div {...v3Attr(v3)} style={{ display: 'contents' }}>
          <div
            ref={dim}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, zIndex: Z.nav, pointerEvents: 'none', backgroundColor: 'oklch(0.06 0.01 260)', opacity: 0 }}
          />
          <div
            ref={bar}
            aria-hidden="true"
            style={{
              position: 'fixed', left: '50%', top: 'calc(var(--safe-t, 0px) + var(--sp-6))', zIndex: Z.nav,
              width: 'min(520px, calc(100vw - 32px))', height: 48, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: '0 var(--sp-6)',
              borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-fill-3)', backgroundColor: 'var(--void-2)',
              boxShadow: 'var(--glass-rim-2), 0 16px 34px -12px oklch(0 0 0 / 0.8)',
              color: 'var(--fg-3)', font: 'var(--type-body)', pointerEvents: 'none',
              opacity: 0, transform: 'translate(-50%, -72px)',
            }}
          >
            <Icon name="search" size={17} />
            <span>Search, or ask Atlas</span>
          </div>
        </div>,
        document.body,
      )
    : null;

  return { layer };
}
