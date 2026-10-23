/**
 * The floating + for quick capture (29-1P2, BIG-15): Android's floating action
 * button, opening the same Capture sheet Focus and Set Deadlines have always
 * had (`CaptureModal`). His call, 2026-10-06: on the tablet, on the screens
 * where he plans work — the Dashboard, Home and the project boards. Focus and
 * Set Deadlines draw their own, where their + already was.
 *
 * A screen renders it only where its nav is the floating bottom bar (not
 * `wide`); on the laptop the rail is beside the work and nothing floats.
 * Below 560px the bar spans nearly the whole width, so the + rises above it
 * rather than sitting on its last cell.
 *
 * The sheet is built on the first press, not with the screen (Performance
 * rule 2), and stays built after, so it closes with its own exit.
 *
 * DRAG IT TO WHERE IT GOES (29-1c1, idea 37: Things 3's Magic Plus). Held and
 * moved, the + lifts off and follows the finger; over a list on a board a gap
 * opens where it points, and letting go there opens that list's add field in
 * the gap, so the new task lands exactly there. A tap is still the sheet. Let
 * go anywhere else and nothing happens. His call: it drops onto a list **or a
 * day**. The drag only starts where there is a list or a day to drop into (a
 * board, the Dashboard); elsewhere a press is just a tap. Where it would land
 * is `lib/plusAim.ts`; the lists hear it through `usePlusDrop`.
 *
 * A DAY (29-1c3): over a day of the Dashboard's week strip (`data-plus-day`)
 * that day lights, and letting go there opens Capture with the day set, his
 * pick: he names it and picks its list as usual.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { FloatingAddButton, Icon, useMedia } from '../ui';
import { gelVars } from '../ui/core/colourJobs';
import { useV3, v3Attr } from '../ui/core/v3Context';
import { aimBefore, isDrag, type AimRow } from '../lib/plusAim';
import { usePlusDrop, type PlusSpot } from '../store/usePlusDrop';
import { cue } from '../lib/sound';
import { Z } from '../lib/zLayers';
import CaptureModal from './CaptureModal';

const UNDER_THE_BAR = '(max-width: 559px)';
const GHOST_PX = 52;

/** The list under the finger, and the row in it the new task would go in front of. */
function aimAt(x: number, y: number): PlusSpot | null {
  const list = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-plus-list]');
  const listId = list?.dataset.plusList;
  const box = list?.querySelector<HTMLElement>('[data-plus-rows]');
  if (!list || !listId || !box) return null;
  const gap = box.querySelector<HTMLElement>(':scope > [data-plus-gap]');
  const gapHeight = gap ? gap.getBoundingClientRect().height : 0;
  const rows: AimRow[] = [];
  for (const el of box.querySelectorAll<HTMLElement>(':scope > [data-drag-row]')) {
    const id = el.querySelector<HTMLElement>('[data-dust^="task:"]')?.dataset.dust?.slice('task:'.length);
    if (!id) continue;
    const r = el.getBoundingClientRect();
    rows.push({
      id, top: r.top, height: r.height,
      afterGap: !!gap && !!(gap.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    });
  }
  return { listId, beforeTaskId: aimBefore(rows, gapHeight, y) };
}

/** The week strip's day under the finger. */
function dayAt(x: number, y: number): string | null {
  return document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-plus-day]')?.dataset.plusDay ?? null;
}

export default function QuickCaptureFab() {
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(false);
  /** The day the + was dropped on: Capture opens with it set. */
  const [day, setDay] = useState<string | null>(null);
  const raised = useMedia(UNDER_THE_BAR);
  const v3 = useV3();

  const press = useRef<{ x: number; y: number; id: number; lifted: boolean } | null>(null);
  /** The press just ended as a drag: the click that follows is not a tap. */
  const dragged = useRef(false);
  const ghost = useRef<HTMLDivElement | null>(null);
  const [carrying, setCarrying] = useState(false);

  const place = (x: number, y: number) => {
    const el = ghost.current;
    if (el) el.style.translate = `${x - GHOST_PX / 2}px ${y - GHOST_PX / 2}px`;
  };

  const end = (drop: boolean) => {
    const p = press.current;
    press.current = null;
    if (!p?.lifted) return;
    setCarrying(false);
    const { aim, land, setAim, dayAim, setDayAim } = usePlusDrop.getState();
    setDayAim(null);
    if (drop && dayAim) {
      cue('drop');
      setDay(dayAim);
      setBuilt(true);
      setOpen(true);
    } else if (drop && aim) { land(aim); cue('drop'); } else setAim(null);
  };
  /* Leaving the screen mid-drag drops nothing. */
  useEffect(() => () => {
    if (!press.current?.lifted) return;
    usePlusDrop.getState().setAim(null);
    usePlusDrop.getState().setDayAim(null);
  }, []);

  const dragHandlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      dragged.current = false;
      if (e.button !== 0 || open || !document.querySelector('[data-plus-list], [data-plus-day]')) return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, lifted: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (!p.lifted) {
        if (!isDrag(e.clientX - p.x, e.clientY - p.y)) return;
        p.lifted = true;
        dragged.current = true;
        setCarrying(true);
        cue('pick');
      }
      place(e.clientX, e.clientY);
      const overDay = dayAt(e.clientX, e.clientY);
      usePlusDrop.getState().setDayAim(overDay);
      usePlusDrop.getState().setAim(overDay ? null : aimAt(e.clientX, e.clientY));
    },
    onPointerUp: () => end(true),
    onPointerCancel: () => end(false),
  };

  return (
    <>
      <FloatingAddButton
        floating
        /* 29-1P5c: the + turns into an ✕ while Capture is open, and closes it. */
        open={open}
        label={open ? 'Close capture' : 'Capture an idea or task'}
        onClick={() => {
          if (dragged.current) { dragged.current = false; return; }
          setBuilt(true);
          if (!open) setDay(null);
          setOpen(!open);
        }}
        {...dragHandlers}
        style={{
          ...(raised ? { bottom: 'calc(var(--sp-6) + var(--safe-b) + 84px)' } : null),
          /* A finger on the + moves the +, never the page under it. */
          touchAction: 'none',
          opacity: carrying ? 0.35 : undefined,
        }}
      />
      {carrying && createPortal(
        <div {...v3Attr(v3)}>
          <div
            ref={(el) => {
              ghost.current = el;
              const p = press.current;
              if (el && p) place(p.x, p.y);
            }}
            aria-hidden="true"
            className="ds-gel"
            style={{
              ...gelVars('lime'),
              position: 'fixed', left: 0, top: 0, zIndex: Z.modal + 1, pointerEvents: 'none',
              width: GHOST_PX, height: GHOST_PX, padding: 0, borderRadius: 'var(--r-md)',
              display: 'grid', placeItems: 'center', scale: '1.08',
            }}
          >
            <Icon name="plus" size={26} />
          </div>
        </div>,
        document.body,
      )}
      {built && <CaptureModal isOpen={open} day={day} onClose={() => setOpen(false)} />}
    </>
  );
}
