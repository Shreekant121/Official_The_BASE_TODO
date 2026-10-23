/**
 * Hold to peek (idea 22, 29-1P6b, BIG-15; iPhone's Haptic Touch). Press and
 * hold a task in a list and its details rise over the page without opening
 * it; let go and they are gone. `components/PeekHost.tsx` draws the card.
 *
 * **Where:** the task rows of lists that are NOT sortable — the Dashboard's
 * blocks, Notifications' "Firing today", the Score screen's strip, and Ctrl+K's
 * results. On a board a long press is still a drag (`SortableList`'s 200 ms),
 * so a row inside a `[data-drag-row]` never peeks, even if it is marked. On
 * the Dashboard a long press on a BLOCK starts editing it; on a task in a block
 * it peeks instead (`DashboardGrid` steps aside for `[data-peek]`), and the
 * header's Edit still edits. A Dashboard being edited never peeks.
 *
 * A row opts in with `{...peekAttr(task.id)}` on the element you press. One
 * listener for the app (`installPeek`, from `PeekHost`), on the capture phase
 * like `sheetMotion`'s, so a new list peeks for the marker alone.
 *
 * HOW A PRESS IS READ
 *   - Held still for HOLD_MS — finger or mouse — and the card rises; a buzz
 *     with it. Moving first is a scroll (or a drag), and nothing opens.
 *   - Letting go closes it, and the click that release would make is
 *     swallowed: a peek is not a tap, so the row does not open its sheet too.
 *   - While it is up the page is held still under the finger and Android's
 *     long-press menu is refused.
 *   - A press on a control INSIDE the row (its ⋯, a tick) is that control's:
 *     the ⋯ has its own hold (`useHoldSlide`).
 *
 * Nothing runs at rest: the window listeners exist only while a press is on.
 */
import { create } from 'zustand';
import { cue } from './sound';

/** The idea page's hold. Longer than `SortableList`'s pick-up and the ⋯'s 260 ms on purpose: it is a slower, deliberate press. */
export const PEEK_HOLD_MS = 350;
/** Travel before a press is a scroll instead. */
const SLOP = 8;

const ATTR = 'data-peek';

/** The marker a peekable task row carries. Spread it on the element that is pressed. */
export function peekAttr(taskId: string): { 'data-peek': string } {
  return { [ATTR]: taskId } as { 'data-peek': string };
}

export interface PeekState {
  /** The task being peeked at, or null. */
  taskId: string | null;
  /** Where the row was, so the card can rise out of it. */
  from: DOMRect | null;
}

export const usePeekStore = create<PeekState>(() => ({ taskId: null, from: null }));

let installed = false;

/** Once, from `PeekHost`. Safe to call again. */
export function installPeek(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  let press: { id: number; x: number; y: number; row: HTMLElement; timer: number; open: boolean } | null = null;
  let swallowUntil = 0;

  const end = () => {
    if (!press) return;
    clearTimeout(press.timer);
    if (press.open) {
      usePeekStore.setState({ taskId: null, from: null });
      /* The click this release makes lands within a frame or two. */
      swallowUntil = performance.now() + 400;
    }
    press = null;
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    window.removeEventListener('touchmove', noScroll, true);
    window.removeEventListener('contextmenu', noMenu, true);
  };
  const open = () => {
    if (!press || !press.row.isConnected) { end(); return; }
    press.open = true;
    usePeekStore.setState({ taskId: press.row.getAttribute(ATTR), from: press.row.getBoundingClientRect() });
    cue('pick');
  };
  const onMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id || press.open) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > SLOP) end();
  };
  const onUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    end();
  };
  const noScroll = (e: TouchEvent) => { if (press?.open && e.cancelable) e.preventDefault(); };
  /* Android's own long-press menu (and its text selection) would arrive
     while the card is up, or just before it. */
  const noMenu = (e: Event) => { if (press) e.preventDefault(); };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || press || !e.isPrimary) return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    const row = t.closest<HTMLElement>(`[${ATTR}]`);
    /* A board row is a drag; a Dashboard being edited is moving blocks. */
    if (!row || row.closest('[data-drag-row], [data-editing]')) return;
    /* A control inside the row keeps its own press. The row itself may be a
       button (the Dashboard's are), and that is the row, not a control in it. */
    const control = t.closest('button, a, input, textarea, select, [role="button"], [role="menuitem"]');
    if (control && control !== row && row.contains(control)) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, row, timer: window.setTimeout(open, PEEK_HOLD_MS), open: false };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    window.addEventListener('touchmove', noScroll, { capture: true, passive: false });
    window.addEventListener('contextmenu', noMenu, true);
  };
  const onClick = (e: MouseEvent) => {
    if (performance.now() > swallowUntil) return;
    swallowUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  };

  document.addEventListener('pointerdown', onDown, true);
  document.addEventListener('click', onClick, true);
}
