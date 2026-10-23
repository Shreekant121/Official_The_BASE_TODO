/**
 * Hold, slide, let go (idea 75, 29-1P6a, BIG-15; iOS 26's menus). Press a
 * ▾ button and keep holding: its menu springs open under the finger, the row
 * under it lights, and letting go picks that row. One motion instead of two
 * taps. A plain tap still opens the menu the ordinary way, and a press that
 * slides off every row and lets go just closes it.
 *
 *   useHoldSlide(triggerRef, { isOpen, open, close, panel: () => panelRef.current });
 *
 * Every ▾ trigger in the app has it: `MorphMenu` for all its menus, and
 * `PortalDropdown` for every picker that passes it `onOpen`.
 *
 * HOW A PRESS IS READ
 *   - The MOUSE opens on the press itself, as a desktop menu does; the glide
 *     pad already follows a mouse over the rows (`useGlide.ts`).
 *   - A FINGER opens after HOLD_MS held still. Moving first is a scroll, and
 *     the menu never opens — a ⋯ on a row in a scrolling list must not pop
 *     open under a thumb that was only passing. Once open, the page is kept
 *     from scrolling under the finger for the rest of the press, and Android's
 *     long-press menu is refused. **The row under the finger lights where it
 *     is (`data-hold-hot`); no glow follows the finger** — his fix on the idea.
 *   - The click the browser sends at the end of a press that opened the menu
 *     is swallowed, or the trigger would toggle it straight shut again.
 *
 * Nothing runs at rest: the window listeners exist only while a press is on.
 */
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { cue } from '../../lib/sound';

export interface HoldSlideOptions {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** The open menu's box — rows are looked for inside it only. */
  panel: () => HTMLElement | null;
}

/** How long a finger holds still before the menu opens under it. */
const HOLD_MS = 260;
/** Travel that turns a press into a slide (or, before the hold, a scroll). */
const SLOP = 8;
const ROWS = 'button:not([disabled]), [role="menuitem"], [role="option"]';

export function useHoldSlide(trigger: RefObject<HTMLElement | null>, opts: HoldSlideOptions): void {
  const latest = useRef(opts);
  useEffect(() => { latest.current = opts; });

  useEffect(() => {
    const el = trigger.current;
    if (!el) return;
    let press: {
      id: number; touch: boolean; x: number; y: number;
      held: boolean; slid: boolean; hot: HTMLElement | null; timer: number;
    } | null = null;
    let swallow = false;

    const setHot = (row: HTMLElement | null) => {
      if (!press || press.hot === row) return;
      if (press.hot) delete press.hot.dataset.holdHot;
      press.hot = row;
      /* A mouse has the glide pad already; only a finger gets the lit row,
         and a slider's detent as it crosses onto one. */
      if (row && press.touch) {
        row.dataset.holdHot = '';
        cue('detent');
      }
    };
    const rowAt = (x: number, y: number): HTMLElement | null => {
      const panel = latest.current.panel();
      const hit = document.elementFromPoint(x, y);
      const row = hit instanceof Element ? hit.closest<HTMLElement>(ROWS) : null;
      return panel && row && panel.contains(row) ? row : null;
    };

    const openNow = () => {
      if (!press) return;
      press.held = true;
      swallow = true;
      latest.current.open();
      /* The lift a held card makes (`SortableList`'s), on the finger only. */
      if (press.touch) cue('pick');
    };
    const end = () => {
      if (!press) return;
      clearTimeout(press.timer);
      setHot(null);
      press = null;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('touchmove', noScroll, true);
      window.removeEventListener('contextmenu', noMenu, true);
      /* The click that follows this press (if any) has been dispatched by the
         time a task runs; after that a click is somebody's again. */
      setTimeout(() => { swallow = false; }, 0);
    };
    const onMove = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const far = Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP;
      if (!press.held) {
        if (far) end();
        return;
      }
      if (far) press.slid = true;
      if (press.slid) setHot(rowAt(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      if (!press || e.pointerId !== press.id) return;
      const { held, slid } = press;
      const row = held && slid ? rowAt(e.clientX, e.clientY) : null;
      end();
      if (!held || !slid) return;
      if (row) row.click();
      else latest.current.close();
    };
    const onCancel = () => end();
    const noScroll = (e: TouchEvent) => { if (press?.held && e.cancelable) e.preventDefault(); };
    const noMenu = (e: Event) => { if (press?.held) e.preventDefault(); };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || press || latest.current.isOpen) return;
      const touch = e.pointerType !== 'mouse';
      press = { id: e.pointerId, touch, x: e.clientX, y: e.clientY, held: false, slid: false, hot: null, timer: 0 };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onCancel, true);
      if (touch) {
        window.addEventListener('touchmove', noScroll, { capture: true, passive: false });
        window.addEventListener('contextmenu', noMenu, true);
        press.timer = window.setTimeout(openNow, HOLD_MS);
      } else {
        openNow();
      }
    };
    /* At the target, before React's own listener on the root hears it. */
    const onClick = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onClick, true);
    return () => {
      end();
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('click', onClick, true);
    };
  }, [trigger]);
}
