/**
 * Swipe a task (idea 17, 29-1P6b, BIG-15; iOS Mail). On the tablet, drag a
 * task's row sideways: the colour that opens up behind it says what letting go
 * will do, it clicks when it would happen, and the row springs back home.
 *
 *   <SwipeRow radius="var(--r-xs)" right={doneSide} left={tomorrowSide}>
 *     <motion.div …the row… />
 *   </SwipeRow>
 *
 * **His calls (2026-10-12):** right is Done, **left starts it tomorrow** (sets
 * its start date; it stays in its list). On a project's Board and List rows
 * and New Session's rows, not the Dashboard. The verbs are the caller's: this
 * file only knows which way and how far. `components/task-fields/swipeSides.ts` holds the two looks.
 *
 * HOW A PRESS IS READ
 *   - **A finger only.** A mouse drags a board row (and selects text); a
 *     sideways drag with one would fight both.
 *   - **Quick, or it is a pick-up.** A board row is also a drag handle: a
 *     finger held still for `SortableList`'s 200ms picks it up. A swipe has to
 *     have moved before then — and moving first is exactly what cancels the
 *     pick-up (its 6px tolerance), so the two never both happen.
 *   - Sideways first and it is a swipe; up or down first and it is a scroll.
 *     The row is `touch-action: pan-y` (the list still scrolls under it), and
 *     once a swipe has begun the page is held still for the rest of the press.
 *   - Past ARM of the row's width (or flicked that way) it arms — a detent —
 *     and letting go runs it. A side with no `run` (a locked task's Done) only
 *     gives a little and never arms.
 *
 * SPEED (CLAUDE.md "Performance"): nothing per row at rest but a React
 * `onPointerDown` (delegated by React to the root, so no listener per row) and
 * a wrapper; the coloured layer behind is built only while a finger is on it,
 * and the row moves by `translate`, which the compositor runs without paint.
 * `translate` on a wrapper of its own, never the row: the row is a Framer
 * `motion.div` that owns its `transform`, and a `SortableRow` wrapper outside
 * owns another.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { cue } from '../../lib/sound';
import { prefersReducedMotion } from '../overlay/sheetMotion';

export interface SwipeSide {
  label: string;
  icon: IconName;
  /** The colour of what it does — a `--job-*` token. */
  colour: string;
  /** What letting go does, handed the row itself. Absent: shown, never armed (a locked task's Done). */
  run?: (row: HTMLElement) => void;
}

/** Travel before a press is a swipe (or a scroll). */
const SLOP = 10;
/** `SortableList`'s long press: a finger that has not moved by then is picking the row up. */
const PICK_UP_MS = 200;
/** Arms past this much of the row's width, but never needs more than ARM_MAX px. */
const ARM = 0.3;
const ARM_MAX = 120;
/** A flick this fast (px/ms) the same way arms from ARM_FLICK_MIN px. */
const FLICK = 0.6;
const ARM_FLICK_MIN = 40;

export function SwipeRow({ right, left, radius, children, style }: {
  /** Finger moves right. Null: that way does nothing. */
  right?: SwipeSide | null;
  /** Finger moves left. */
  left?: SwipeSide | null;
  /** The row's corner, so the colour behind it has the same shape. */
  radius: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const face = useRef<HTMLDivElement>(null);
  const under = useRef<HTMLDivElement>(null);
  /* Which side is showing behind the row: one React render as a swipe begins
     and one as it ends, never per move. */
  const [showing, setShowing] = useState<0 | 1 | -1>(0);
  const sides = useRef({ right, left });
  useEffect(() => { sides.current = { right, left }; });
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || stopRef.current) return;
    if (!sides.current.right && !sides.current.left) return;
    const t = e.target;
    if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    const el = face.current;
    if (!el) return;

    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const downAt = e.timeStamp;
    let live = false;
    let dx = 0;
    let armed = false;
    let trail: [number, number][] = [[x0, downAt]];

    const sideOf = (d: number) => (d > 0 ? sides.current.right : d < 0 ? sides.current.left : null) ?? null;
    const shown = (d: number) => {
      const side = sideOf(d);
      /* A way that does nothing, or a side that cannot run, only gives. */
      if (!side) return Math.sign(d) * Math.min(Math.abs(d) * 0.15, 16);
      if (!side.run) return Math.sign(d) * Math.min(Math.abs(d) * 0.3, 44);
      return d;
    };
    const armAt = () => Math.min(ARM_MAX, (el.offsetWidth || 300) * ARM);
    const velocity = () => {
      const a = trail[0];
      const b = trail[trail.length - 1];
      return a && b && b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;
    };
    const setArmed = (next: boolean) => {
      if (next === armed) return;
      armed = next;
      if (under.current) under.current.dataset.armed = next ? 'true' : 'false';
      cue('detent');
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const mx = ev.clientX - x0;
      const my = ev.clientY - y0;
      if (!live) {
        const far = Math.hypot(mx, my);
        if (far <= SLOP) return;
        /* Down or up first is a scroll; sideways after the pick-up's 200ms is
           a row being carried. Either way, not ours. */
        if (Math.abs(my) * 1.2 >= Math.abs(mx) || ev.timeStamp - downAt > PICK_UP_MS) { stop(); return; }
        live = true;
        el.style.willChange = 'translate';
        setShowing(mx > 0 ? 1 : -1);
      }
      dx = mx;
      trail.push([ev.clientX, ev.timeStamp]);
      if (trail.length > 6) trail = trail.slice(-6);
      const d = shown(dx);
      el.style.translate = `${d}px 0`;
      setShowing(dx > 0 ? 1 : dx < 0 ? -1 : 0);
      const side = sideOf(dx);
      setArmed(!!side?.run && (Math.abs(dx) > armAt() || (Math.abs(dx) > ARM_FLICK_MIN && Math.sign(velocity()) === Math.sign(dx) && Math.abs(velocity()) > FLICK)));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const wasLive = live;
      const from = shown(dx);
      const side = armed ? sideOf(dx) : null;
      stop();
      if (!wasLive) return;
      /* The run first, so the row is already done (or dated) as it comes home. */
      side?.run?.(el);
      home(from);
    };
    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const wasLive = live;
      const from = shown(dx);
      stop();
      if (wasLive) home(from);
    };
    /* Once a swipe has begun, the page stays where it is under the finger. */
    const noScroll = (ev: TouchEvent) => { if (live && ev.cancelable) ev.preventDefault(); };
    const noClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };

    const home = (from: number) => {
      el.style.translate = '';
      /* The click a swipe ends on (if the browser sends one) is not a tap. */
      window.addEventListener('click', noClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', noClick, { capture: true }), 0);
      const done = () => { el.style.willChange = ''; setShowing(0); };
      if (prefersReducedMotion() || from === 0) { done(); return; }
      const run = el.animate(
        [{ translate: `${from}px 0` }, { translate: '0px 0' }],
        { duration: 380, easing: 'cubic-bezier(.34,1.3,.64,1)' },
      );
      run.onfinish = done;
      run.oncancel = done;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('touchmove', noScroll, true);
      stopRef.current = null;
    };

    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('touchmove', noScroll, { capture: true, passive: false });
    stopRef.current = stop;
  };

  const side = showing > 0 ? right : showing < 0 ? left : null;

  return (
    <div onPointerDown={onPointerDown} style={{ position: 'relative', ...style }}>
      {side && (
        <div
          ref={under}
          aria-hidden="true"
          className="ag-swipe-under"
          data-armed="false"
          data-side={showing > 0 ? 'right' : 'left'}
          style={{
            position: 'absolute', inset: 0, borderRadius: radius,
            display: 'flex', alignItems: 'center',
            justifyContent: showing > 0 ? 'flex-start' : 'flex-end',
            padding: '0 var(--sp-7)', gap: 'var(--sp-3)',
            ['--swipe-colour' as string]: side.colour,
            font: 'var(--type-label)', fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {showing < 0 && <span>{side.label}</span>}
          <Icon name={side.icon} size={18} className="ag-swipe-under__icon" />
          {showing > 0 && <span>{side.label}</span>}
        </div>
      )}
      {/* `touch-action: pan-y` — a finger moving sideways reaches the hook,
          one moving up and down still scrolls the list. */}
      <div ref={face} style={{ position: 'relative', touchAction: 'pan-y' }}>
        {children}
      </div>
    </div>
  );
}
