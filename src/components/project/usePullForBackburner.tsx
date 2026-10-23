/**
 * Pull down for the Backburner (idea 91, 29-1P6c, BIG-15; Telegram's
 * archive). On a touch screen, pull a project's board or list down from its
 * very top: a pill above it fills with indigo as you pull, its arrow flips
 * when you have pulled far enough, and letting go then opens the project's
 * own Backburner at the top of the board (`lib/backburner.ts`). Pull again
 * with it open and it tucks away. Let go short of the mark and everything
 * settles back with nothing changed.
 *
 * **His calls (2026-10-12):** the project's OWN Backburner, not the shared
 * one; the pill fills **indigo**, rest's colour, not the idea page's violet
 * (violet is Atlas). On the laptop the same thing is "Show Backburner" in the
 * project's menu, since a mouse cannot pull.
 *
 * HOW, AND WHY THIS WAY — the same reading as `PullToSearch.tsx`, which the
 * Dashboard and Home use for their search:
 * - **Touch events, not pointer events.** Only a non-passive `touchmove` can
 *   stop the browser's own scroll and Brave's pull-to-refresh for the same
 *   finger. It is taken only once the finger has gone clearly *down* from
 *   the very top; a sideways start (a task's swipe) or an upward one (a
 *   scroll) is left alone.
 * - **A finger held still on a task first is a drag, not a pull**: a board
 *   row picks up on a 200 ms press (`SortableList`), so on a row a finger
 *   whose first move comes later than `HOLD_MS` is not ours. Anywhere else
 *   (the header, a gap) there is nothing to pick up and timing does not
 *   matter — measured: the browser holds a slow finger's first moves back
 *   until it is past its own slop, and a 180 ms cut-off everywhere turned
 *   every unhurried pull into nothing.
 * - **Nothing re-renders while the finger moves.** The page's `transform`
 *   and the pill's fill are written straight onto their elements once a
 *   frame; the pill's words change only as the mark is crossed.
 * - A finger inside something that scrolls on its own and is not at its top
 *   is that thing's.
 */
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cue } from '../../lib/sound';

/** Finger travel before the page starts to follow, px: a tap is not a pull. */
const DEAD = 10;
/** How far the page follows the finger: about half, like rubber. */
const FOLLOW = 0.55;
/** The page never moves further than this, px. */
const MAX_LIFT = 96;
/** The pill is full, and letting go opens or tucks, once the page has moved this far, px. */
const ARM_AT = 60;
/** On a task row, still for longer than this before moving: a press-and-drag, not a pull. */
const HOLD_MS = 180;

interface PullOptions {
  /** Off: no listeners at all (a mouse-only window still costs nothing, touch events never fire). */
  enabled: boolean;
  /** Whether the Backburner is showing now: the pill says "tuck away" instead. */
  open: boolean;
  /** A pull let go past the mark. */
  onPulled: () => void;
}

export function usePullForBackburner(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  { enabled, open, onPulled }: PullOptions,
): { pill: ReactNode } {
  const pill = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLElement>(null);
  const arrow = useRef<SVGSVGElement>(null);
  const words = useRef<HTMLSpanElement>(null);
  const latest = useRef({ open, onPulled });
  useEffect(() => { latest.current = { open, onPulled }; });

  useEffect(() => {
    const el = scroller.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; at: number; onRow: boolean } | null = null;
    let pulling = false;
    let lift = 0;
    let armed = false;
    let frame = 0;

    const say = () => {
      if (!words.current) return;
      words.current.textContent = armed
        ? 'Let go'
        : latest.current.open ? 'Pull to tuck it away' : 'Pull for Backburner';
    };

    const paint = (settle: boolean) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const ease = settle ? 'transform 0.5s var(--ease-springy)' : 'none';
        const page = content.current;
        if (page) {
          page.style.transition = ease;
          page.style.transform = lift > 0 ? `translateY(${lift.toFixed(1)}px)` : '';
        }
        const k = Math.min(1, lift / ARM_AT);
        if (pill.current) {
          pill.current.style.transition = settle ? 'opacity 0.3s var(--ease-glass)' : 'none';
          pill.current.style.opacity = String(Math.min(1, k * 1.6));
          pill.current.dataset.armed = armed ? 'true' : 'false';
        }
        /* The fill grows by `scale`, not `width`: no layout while the finger moves. */
        if (fill.current) {
          fill.current.style.transition = settle ? 'scale 0.3s var(--ease-glass)' : 'none';
          fill.current.style.scale = `${k.toFixed(3)} 1`;
        }
        if (arrow.current) arrow.current.style.rotate = armed ? '180deg' : '0deg';
      });
    };

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
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const onRow = !!(e.target as HTMLElement | null)?.closest?.('[data-drag-row]');
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: e.timeStamp, onRow };
    };
    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        /* Sideways or upward first: not ours. Clearly down: ours. */
        if (Math.abs(dx) > Math.abs(dy) || dy < 0) { start = null; return; }
        if (start.onRow && e.timeStamp - start.at > HOLD_MS) { start = null; return; }
        /* Claimed from the first downward move, inside the dead zone too:
           a finger creeps a few px per event, and a move left to the browser
           hands it the whole gesture — measured, every pull made in small
           steps settled straight back. At the very top there is nothing a
           downward move could scroll, so nothing is taken from him. */
        e.preventDefault();
        if (dy < DEAD) return;
        pulling = true;
        say();
      }
      e.preventDefault();
      lift = Math.min(MAX_LIFT, Math.max(0, (dy - DEAD) * FOLLOW));
      const nowArmed = lift >= ARM_AT;
      if (nowArmed !== armed) {
        armed = nowArmed;
        say();
        if (armed) cue('detent', { buzzToo: true });
      }
      paint(false);
    };
    const onEnd = () => {
      if (!pulling) { start = null; return; }
      const fire = armed;
      start = null;
      pulling = false;
      lift = 0;
      armed = false;
      paint(true);
      if (fire) latest.current.onPulled();
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
  }, [scroller, content, enabled]);

  /* Drawn always (it is one small element, invisible at rest) so the first
     pull has nothing to build. It sits in the scroller's top margin, above
     the page that moves down to uncover it. */
  const node = enabled ? (
    <div aria-hidden="true" style={{ position: 'relative', height: 0, zIndex: 6 }}>
      <div
        ref={pill}
        className="ag-pull-pill"
        data-armed="false"
        style={{ opacity: 0 }}
      >
        <i ref={fill} />
        <svg ref={arrow} width="14" height="14" viewBox="0 0 14 14">
          <path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span ref={words}>Pull for Backburner</span>
      </div>
    </div>
  ) : null;

  return { pill: node };
}
