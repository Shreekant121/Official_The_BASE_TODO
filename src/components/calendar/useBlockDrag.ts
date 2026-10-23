/**
 * Snap into place (29-2e3a, idea 125): pick up a task's block on the hours
 * and move it; the quarter under it lights and pulls it in like a magnet, and
 * let go it clicks there, its deadline the block's new end. The maths is
 * `lib/calendar/snapDrag.ts` (pure, tested); this is the gesture.
 *
 * HOW A PRESS IS READ
 *   - **A finger holds still for `HOLD_MS`** and the block lifts (the board's
 *     pick-up, `SortableList`'s 200 ms): moving first is the hours' scroll or
 *     the day's swipe, untouched. Once lifted the page is held still under the
 *     finger (a `touchmove` refused, `lib/peek.ts`'s way) and the swipe never
 *     hears the moves, which are stopped on the window before React sees them.
 *   - **A mouse lifts it after `MOUSE_SLOP`** of travel; its press is the
 *     block's alone, so a mouse drag over a block never swipes the day (the
 *     arrows do that). A press that never travels is a click: the sheet opens.
 *   - **A block that cannot move** (finished, or following an event) gives a
 *     little shake where it would have lifted; `onRefuse` says why.
 *   - A second finger (a pinch), Escape or a cancelled pointer drops it back.
 *
 * Only the block's `translate` moves while it is held, written straight onto
 * it; React hears only a change of slot, to light the landing. The hours
 * scroll near their top and bottom edges by one animation frame at a time,
 * and only while a block is held (rule 1). Nothing listens at rest.
 *
 * THE TRAY (29-2e3b, `lib/calendar/tray.ts`)
 *   - **A tray row is held the same way** (`HeldBlock.day` null). It cannot
 *     travel itself, as its tray scrolls and clips it, so a copy of it lifts
 *     into a fixed layer and follows the finger; over the hours the quarter
 *     under it lights and pulls it in, and let go it flies to that slot and
 *     the task is due at its end, the same drop.
 *   - **A block from the hours goes back** onto the tray, or its button when
 *     the tray is shut (`out`): over it the block dims where it was, the
 *     target says `data-drop-hot`, and let go it is undated (`onUndate`). A
 *     repeating task's target says `data-drop-hot="refuse"` and it goes back.
 *
 * THE DASHBOARD (29-2e3c, `store/useTimelineDrop.ts`)
 *   - **The Timeline block's own blocks** move as the Calendar's do.
 *   - **A row of the Today block** is carried like a tray row: the Timeline
 *     hands its press to the store and the row presses into it. Over the
 *     hours its copy says `data-shaped`, to be drawn as the block it will
 *     become; a row that cannot move says why itself (`HeldBlock.onRefuse`),
 *     as its Timeline cannot point at it.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { flushSync } from 'react-dom';
import { useMotion } from '../../ui/core/motion';
import { cue } from '../../lib/sound';
import { Z } from '../../lib/zLayers';
import { columnAt, edgeScroll, magnetPull, snapStart, type DragRefusal } from '../../lib/calendar/snapDrag';
import type { UndateRefusal } from '../../lib/calendar/tray';

/** A finger's pick-up, the board's. */
const HOLD_MS = 200;
/** Travel before a finger's hold is a scroll instead. */
const TOUCH_SLOP = 8;
/** Travel before a mouse press is a drag rather than a click. */
const MOUSE_SLOP = 5;
/** The band at the top and bottom of the hours that scrolls them, and its fastest, in px a frame. */
const EDGE_BAND = 56;
const EDGE_MAX = 14;
/** The shortest a block is drawn (`CalendarHours`' own), for a tray row landing; `minPx` for another. */
const MIN_PX = 20;

const cubic = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;

/** What is under the held block: the day and the quarter it will land on. */
export interface Landing {
  taskId: string;
  day: string;
  start: number;
  minutes: number;
}

export interface HeldBlock {
  taskId: string;
  /** The column it is drawn in, and its top there, in minutes; `day` null for a row of the tray. */
  day: string | null;
  start: number;
  /** The task's length, the block's. */
  minutes: number;
  refusal: DragRefusal | null;
  /** Why it cannot go back onto the tray (a block on the hours only). */
  undate?: UndateRefusal | null;
  /** Says why it will not move, in place of the hook's `onRefuse`: a row away from the hours (the Dashboard's Today). */
  onRefuse?: (why: DragRefusal) => void;
}

type Box = { left: number; right: number; top: number; bottom: number };
const inside = (r: Box, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

/** A copy of a tray row in a fixed layer over everything, to be carried: no ids, no markers. */
function carryCopy(el: HTMLElement, r: DOMRect): HTMLElement {
  const ghost = el.cloneNode(true) as HTMLElement;
  for (const a of [...ghost.attributes]) if (a.name === 'id' || a.name.startsWith('data-')) ghost.removeAttribute(a.name);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.dataset.dragging = '';
  Object.assign(ghost.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    margin: '0', zIndex: String(Z.dragGhost), pointerEvents: 'none',
    transition: 'width 140ms ease-out, height 140ms ease-out',
  });
  (el.closest('[data-v3]') ?? document.body).append(ghost);
  return ghost;
}

export function useBlockDrag({ hourPx, minPx = MIN_PX, scroller, columns, days, onDrop, onRefuse, out, onUndate, onKeep }: {
  hourPx: number;
  /** The shortest a block is drawn on these hours. */
  minPx?: number;
  /** The hours' scroller. */
  scroller: { current: HTMLElement | null };
  /** The shown page's day columns, in order: `days`' elements. */
  columns: () => HTMLElement[];
  days: readonly string[];
  /** Let go on a new slot: `start` is the block's new top on `day`. */
  onDrop: (landing: Landing) => void;
  /** A press on a block that cannot move. */
  onRefuse: (taskId: string, why: DragRefusal) => void;
  /** Where a block from the hours is let go to lose its date: the tray, or its button. */
  out?: () => HTMLElement | null;
  /** Let go over `out`. */
  onUndate?: (taskId: string) => void;
  /** Let go over `out`, but it keeps its date (`HeldBlock.undate`). */
  onKeep?: (taskId: string, why: UndateRefusal) => void;
}) {
  const m = useMotion();
  const [landing, setLanding] = useState<Landing | null>(null);
  const live = useRef({ days, onDrop, onRefuse, hourPx, minPx, out, onUndate, onKeep });
  useEffect(() => { live.current = { days, onDrop, onRefuse, hourPx, minPx, out, onUndate, onKeep }; });
  /* The click a drag (or a refused press) ends in is not a tap on the block. */
  const swallowUntil = useRef(0);
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const press = (e: ReactPointerEvent<HTMLElement>, held: HeldBlock) => {
    if (stop.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const mouse = e.pointerType === 'mouse';
    /* A mouse's press is the block's: the swipe never starts under it. */
    if (mouse) e.stopPropagation();
    const el = e.currentTarget;
    const fromTray = held.day === null;
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let x = x0;
    let y = y0;
    let lifted = false;
    let moved = false;
    let raf = 0;
    let timer = 0;
    /* Read once, when it lifts (rule 6 is about a screen's way in, not a gesture). */
    let grabMin = 0;
    let fromCol = 0;
    let colWidth = 0;
    let colLeft = 0;
    let box: DOMRect | null = null;
    let hours: Box | null = null;
    let at: Landing | null = null;
    /* What moves: the block itself, or a tray row's carried copy. */
    let mover: HTMLElement = el;
    let origin: DOMRect | null = null;
    /* Where a block from the hours loses its date, and whether it is over it. */
    let target: HTMLElement | null = null;
    let targetBox: DOMRect | null = null;
    let hot = false;
    /* A carried row takes the block's shape over the hours, and its own off them. */
    let blockShaped = false;

    const px = (min: number) => (min / 60) * live.current.hourPx;
    const minuteAt = (clientY: number) => {
      const s = scroller.current;
      if (!s || !box) return 0;
      return ((clientY - box.top + s.scrollTop) / live.current.hourPx) * 60;
    };

    const setHot = (over: boolean) => {
      if (over === hot) return;
      hot = over;
      if (target) {
        if (over) target.dataset.dropHot = held.undate ? 'refuse' : '';
        else delete target.dataset.dropHot;
      }
      if (over) el.dataset.out = '';
      else delete el.dataset.out;
      if (over) cue('detent');
    };

    const place = () => {
      const s = scroller.current;
      if (!s || !box || !hours) return;
      setHot(!!targetBox && inside(targetBox, x, y));
      /* Off the hours: a carried row follows the finger, a block waits where it was. */
      if (hot || (fromTray && !inside(hours, x, y))) {
        if (fromTray && origin) {
          mover.style.translate = `${x - x0}px ${y - y0}px`;
          if (blockShaped) {
            blockShaped = false;
            delete mover.dataset.shaped;
            mover.style.width = `${origin.width}px`;
            mover.style.height = `${origin.height}px`;
          }
        }
        if (at) {
          at = null;
          setLanding(null);
        }
        return;
      }
      const raw = minuteAt(y) - grabMin;
      const slot = snapStart(raw);
      const count = live.current.days.length;
      const col = columnAt(x, colLeft, colWidth * count, count);
      const pulled = magnetPull(raw, slot);
      const day = live.current.days[col] ?? held.day ?? live.current.days[0];
      if (fromTray && origin) {
        /* In its column, at the pulled minute, the size it will be: the block it is about to become. */
        const r = slotRect({ taskId: held.taskId, day, start: pulled, minutes: held.minutes });
        mover.style.translate = `${r.left - origin.left}px ${r.top - origin.top}px`;
        if (!blockShaped) {
          blockShaped = true;
          mover.dataset.shaped = '';
          mover.style.width = `${r.width}px`;
          mover.style.height = `${r.height}px`;
        }
      } else {
        mover.style.translate = `${(col - fromCol) * colWidth}px ${px(pulled - held.start)}px`;
      }
      if (!at || at.day !== day || at.start !== slot) {
        at = { taskId: held.taskId, day, start: slot, minutes: held.minutes };
        setLanding(at);
        if (moved) cue('detent');
      }
    };

    const tick = () => {
      raf = 0;
      if (!lifted || !box || !hours) return;
      const s = scroller.current;
      /* A carried row scrolls the hours only from over them; a block, never from over the tray. */
      const scrolls = fromTray ? inside(hours, x, y) : !hot;
      const v = s && scrolls ? edgeScroll(y, box.top, box.bottom, EDGE_BAND, EDGE_MAX) : 0;
      if (s && v !== 0) {
        const before = s.scrollTop;
        s.scrollTop = before + v;
        if (s.scrollTop !== before) place();
      }
      if (v !== 0) raf = requestAnimationFrame(tick);
    };

    const lift = () => {
      timer = 0;
      if (!el.isConnected) { finish(false); return; }
      if (held.refusal) {
        el.animate([{ translate: '0 0' }, { translate: '-4px 0' }, { translate: '4px 0' }, { translate: '-3px 0' }, { translate: '2px 0' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
        cue('pass');
        if (held.onRefuse) held.onRefuse(held.refusal);
        else live.current.onRefuse(held.taskId, held.refusal);
        swallowUntil.current = performance.now() + 600;
        finish(false);
        return;
      }
      const s = scroller.current;
      const cols = columns();
      if (!s || cols.length === 0) { finish(false); return; }
      lifted = true;
      box = s.getBoundingClientRect();
      const first = cols[0].getBoundingClientRect();
      colWidth = first.width;
      colLeft = first.left;
      hours = { left: colLeft, right: colLeft + colWidth * live.current.days.length, top: box.top, bottom: box.bottom };
      if (fromTray) {
        origin = el.getBoundingClientRect();
        mover = carryCopy(el, origin);
        el.dataset.lifted = '';
        grabMin = ((y0 - origin.top) / live.current.hourPx) * 60;
      } else {
        fromCol = Math.max(0, live.current.days.indexOf(held.day ?? ''));
        grabMin = minuteAt(y0) - held.start;
        target = live.current.out?.() ?? null;
        targetBox = target?.getBoundingClientRect() ?? null;
        el.dataset.dragging = '';
      }
      try { el.setPointerCapture(id); } catch { /* a finger already gone */ }
      cue('pick');
      place();
    };

    /** Where `to` is on the screen, for a carried row to fly to: the slot's top-left and size. */
    const slotRect = (to: Landing) => {
      const s = scroller.current;
      const col = Math.max(0, live.current.days.indexOf(to.day));
      return {
        left: colLeft + col * colWidth + 2,
        top: (box?.top ?? 0) - (s?.scrollTop ?? 0) + px(to.start) + 1,
        width: colWidth - 4,
        height: Math.max(live.current.minPx, px(to.minutes) - 2),
      };
    };

    /** Put the block back where it was, into `to`, or off the hours (`undate`), then hand the drop over. */
    const settle = (to: Landing | null, undate: boolean) => {
      const from = mover.style.translate || '0px 0px';
      let frames: Keyframe[];
      if (undate) {
        frames = [{ translate: from, opacity: 1 }, { translate: from, opacity: 0, scale: 0.9 }];
      } else if (to && fromTray && origin) {
        const r = slotRect(to);
        frames = [
          { translate: from },
          { translate: `${r.left - origin.left}px ${r.top - origin.top}px`, width: `${r.width}px`, height: `${r.height}px` },
        ];
      } else {
        const dest = to
          ? `${(live.current.days.indexOf(to.day) - fromCol) * colWidth}px ${px(to.start - held.start)}px`
          : '0px 0px';
        frames = [{ translate: from }, { translate: dest }];
      }
      const anim = mover.animate(frames, {
        duration: m.dur.base * 1000, easing: cubic(to || undate ? m.ease.settle : m.ease.glide), fill: 'forwards',
      });
      anim.onfinish = () => {
        if (to) {
          flushSync(() => live.current.onDrop(to));
          cue('drop');
        } else if (undate) {
          flushSync(() => live.current.onUndate?.(held.taskId));
          cue('drop');
        }
        if (mover !== el) mover.remove();
        el.style.translate = '';
        delete el.dataset.dragging;
        delete el.dataset.lifted;
        delete el.dataset.out;
        anim.cancel();
        setLanding(null);
      };
    };

    const finish = (drop: boolean) => {
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('pointerdown', onOther, true);
      window.removeEventListener('touchmove', noScroll, true);
      window.removeEventListener('contextmenu', noMenu, true);
      window.removeEventListener('keydown', onKey, true);
      stop.current = null;
      const wasHot = hot;
      if (target) delete target.dataset.dropHot;
      hot = false;
      if (!lifted) return;
      lifted = false;
      swallowUntil.current = performance.now() + 600;
      if (drop && wasHot) {
        /* A repeating task keeps its date: it goes back, the target having said so. */
        if (held.undate) {
          cue('pass');
          live.current.onKeep?.(held.taskId, held.undate);
        }
        settle(null, !held.undate);
        return;
      }
      const moves = drop && moved && at && (at.day !== held.day || at.start !== held.start);
      settle(moves ? at : null, false);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      x = ev.clientX;
      y = ev.clientY;
      const travel = Math.hypot(x - x0, y - y0);
      if (!lifted) {
        if (mouse ? travel > MOUSE_SLOP : travel > TOUCH_SLOP) {
          if (mouse) lift();
          else finish(false);
        }
        return;
      }
      /* The swipe and the board under it never hear a held block's moves. */
      ev.stopPropagation();
      if (travel > TOUCH_SLOP) moved = true;
      place();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === id) finish(true); };
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === id) finish(false); };
    /* A second finger is the calendar's pinch (29-2e2): the block goes back. */
    const onOther = (ev: PointerEvent) => { if (ev.pointerId !== id) finish(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && lifted) { ev.stopPropagation(); finish(false); } };
    const noScroll = (ev: TouchEvent) => { if (lifted && ev.cancelable) ev.preventDefault(); };
    /* Android's own long-press menu would arrive while the finger holds. */
    const noMenu = (ev: Event) => ev.preventDefault();

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('pointerdown', onOther, true);
    window.addEventListener('touchmove', noScroll, { capture: true, passive: false });
    window.addEventListener('contextmenu', noMenu, true);
    window.addEventListener('keydown', onKey, true);
    if (!mouse) timer = window.setTimeout(lift, HOLD_MS);
    stop.current = () => finish(false);
  };

  /** On the block's click: false when that click ended a drag, and is no tap. */
  const isTap = () => performance.now() > swallowUntil.current;

  return { landing, press, isTap };
}
