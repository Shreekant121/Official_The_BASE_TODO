import { create } from 'zustand';

/**
 * The day picked on the Dashboard's week strip (29-1c3, idea 128) — in memory
 * only, like `useUIStore`: a way of looking, not his data. BASE opens on today.
 *
 * `null` means "today", whatever today is: picking today stores nothing, so a
 * Dashboard left open past midnight follows the clock instead of staying on
 * yesterday. The blocks that have a day (Today, the timeline, Hours, Focus
 * this week) read it through `useDashDayOr`; the rest never look.
 */
interface DashDayState {
  picked: string | null;
  pick: (day: string | null) => void;
}

export const useDashDay = create<DashDayState>()((set) => ({
  picked: null,
  pick: (picked) => set({ picked }),
}));

/** The day the Dashboard is showing: the picked one, else `today`. */
export function useDashDayOr(today: string): string {
  return useDashDay((s) => s.picked) ?? today;
}

/** Picks `day`; today is stored as `null`, so it keeps following the clock. */
export function pickDashDay(day: string, today: string): void {
  useDashDay.getState().pick(day === today ? null : day);
}
