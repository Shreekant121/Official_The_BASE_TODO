import { create } from 'zustand';
import { calendarView, type CalendarView } from '../lib/calendar/calendar';

/**
 * The calendar screen's view and day (29-2e1), in memory: the day it shows
 * (`null` = today, so it follows midnight) and Day, Week or Month. The view
 * is remembered on this device (`base.calendar.view`), never synced — which
 * view suits is a matter of the screen it is read on.
 *
 * Its own day, not the Dashboard's (`useDashDay`): the week strip's month
 * name hands its day over when it opens the calendar, and nothing flows back.
 */
const VIEW_KEY = 'base.calendar.view';

function readView(): CalendarView {
  try {
    return calendarView(localStorage.getItem(VIEW_KEY));
  } catch {
    return 'month';
  }
}

interface CalendarViewState {
  view: CalendarView;
  day: string | null;
  setView: (view: CalendarView) => void;
  /** A day to show; `null` (or today itself) follows today. */
  pick: (day: string | null, today?: string) => void;
  /** Both at once: a tap on a day of the month opens its day view. */
  open: (view: CalendarView, day: string | null, today?: string) => void;
}

const remember = (view: CalendarView) => {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* A private window: the view is simply not remembered. */
  }
};

export const useCalendarView = create<CalendarViewState>()((set) => ({
  view: readView(),
  day: null,
  setView: (view) => {
    remember(view);
    set({ view });
  },
  pick: (day, today) => set({ day: day === today ? null : day }),
  open: (view, day, today) => {
    remember(view);
    set({ view, day: day === today ? null : day });
  },
}));
