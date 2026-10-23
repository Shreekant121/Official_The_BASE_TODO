import { create } from 'zustand';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { HeldBlock } from '../components/calendar/useBlockDrag';

/**
 * The Dashboard's Timeline as somewhere to drop a task (29-2e3c, idea 125) —
 * in memory only, like `usePlusDrop`: nothing here is his data.
 *
 * The Today block and the Timeline are two blocks that know nothing of each
 * other, so a Timeline on the Dashboard says it is there: it hands in its
 * own `useBlockDrag`'s press, and a row of Today held down is pressed into
 * that, as the Calendar's tray is (29-2e3b). The drag, the magnet and the
 * drop are the Timeline's; the row only starts it.
 */
export interface TimelineTarget {
  /** The Timeline's hours: whether it is on the screen, and which comes first. */
  hours: () => HTMLElement | null;
  press: (e: ReactPointerEvent<HTMLElement>, held: HeldBlock) => void;
  /** False when the click a row hears ended a drag. */
  isTap: () => boolean;
}

interface TimelineDropState {
  targets: readonly TimelineTarget[];
  add: (t: TimelineTarget) => void;
  remove: (t: TimelineTarget) => void;
}

export const useTimelineDrop = create<TimelineDropState>()((set, get) => ({
  targets: [],
  add: (t) => set({ targets: [...get().targets, t] }),
  remove: (t) => set({ targets: get().targets.filter((x) => x !== t) }),
}));

/**
 * The Timeline a row held now goes to: the first one on the screen, in the
 * Dashboard's order (two can be added). One that is not drawn or not live — a
 * Stack page out of view (`inert`), the Dashboard hidden behind another
 * screen — is skipped.
 */
export function shownTimeline(targets: readonly TimelineTarget[]): TimelineTarget | null {
  let best: TimelineTarget | null = null;
  let bestEl: HTMLElement | null = null;
  for (const t of targets) {
    const el = t.hours();
    if (!el?.isConnected || el.getClientRects().length === 0 || el.closest('[inert]')) continue;
    if (!bestEl || bestEl.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) {
      best = t;
      bestEl = el;
    }
  }
  return best;
}
