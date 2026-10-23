import { create } from 'zustand';

/**
 * The floating + on its way into a list (29-1c1, idea 37) — in memory only,
 * like `useUIStore`: nothing here is his data.
 *
 * `QuickCaptureFab` owns the drag and writes `aim` as the finger moves; the
 * list it names opens a gap there. On release it writes `landed`, and that
 * list opens its add field in the gap and clears it. A list is a place and a
 * row to go in front of (`null` = the end), the same pair `moveTaskToList`
 * takes, so the new task lands exactly where the gap was.
 *
 * Since 29-1c3 the + also drops onto a day of the Dashboard's week strip:
 * `dayAim` is the day under the finger, which that day lights; the drop
 * itself is the +'s own (it opens Capture with the day set), so no list hears it.
 */
export interface PlusSpot {
  listId: string;
  beforeTaskId: string | null;
}

interface PlusDropState {
  aim: PlusSpot | null;
  landed: PlusSpot | null;
  /** The week strip's day under the finger, `YYYY-MM-DD`. */
  dayAim: string | null;
  setAim: (aim: PlusSpot | null) => void;
  land: (spot: PlusSpot) => void;
  clearLanded: () => void;
  setDayAim: (day: string | null) => void;
}

const same = (a: PlusSpot | null, b: PlusSpot | null) =>
  a === b || (!!a && !!b && a.listId === b.listId && a.beforeTaskId === b.beforeTaskId);

export const usePlusDrop = create<PlusDropState>()((set, get) => ({
  aim: null,
  landed: null,
  dayAim: null,
  /* A pointer move that aims where it already aimed writes nothing, so the
     lists re-render only when the gap moves. */
  setAim: (aim) => { if (!same(get().aim, aim)) set({ aim }); },
  land: (spot) => set({ aim: null, landed: spot }),
  clearLanded: () => set({ landed: null }),
  setDayAim: (dayAim) => { if (get().dayAim !== dayAim) set({ dayAim }); },
}));
