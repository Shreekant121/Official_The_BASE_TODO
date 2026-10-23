/**
 * The calendar in the app (29-2e1, BIG-6, idea 53) — pure: no React, no
 * store, no clock. The backlog, the events, `now` and the zone are arguments.
 *
 * HIS CALLS (2026-10-21)
 * ----------------------
 * - **Its own screen, in the nav**, sky (a date is sky's job), with Day, Week
 *   and Month; the month name on the Dashboard's week strip and Ctrl+K open it.
 * - **Idea 53, a month with coloured dots**: each day shows dots in the
 *   colours of what is on it, and today has an orange ring. A tap on a day
 *   opens its day view.
 * - Pinch between the three (127) is 29-2e2, and dragging a task onto the
 *   hours (125) is 29-2e3 — not here.
 *
 * THE SESSION'S CALLS
 * -------------------
 * - **What is on a day is his tasks and his BASE events.** Google's own events
 *   join with 29-5, habits with 29-3. A task is drawn as the timeline draws it,
 *   the block BASE writes into his Google Calendar (`timelineItems`); on the
 *   month it is a dot on its deadline's day.
 * - **A dot's colour is its job**: an event in its own colour; a task due in
 *   sky (a date), coral once overdue, lime once done. Events first, then late,
 *   open and done work, four at most and a count of the rest.
 * - **A month is always six weeks**, Monday first like every week in BASE, so
 *   a swipe to the next month lands on a grid of the same height.
 * - Ignored work is left out (BIG-3), as on the timeline.
 */
import { addDays, weekOf } from '../dashboard/hours';
import { parseStoredDate, toTaskDateString, toZonedDayString, zonedTimeToInstant } from '../agent/dates';
import { DEFAULT_EVENT_COLOUR, eventOccurrences, isAllDay, type BaseEvent, type EventColour } from '../events/events';
import type { ZoomDir } from '../pinchZoom';

export type CalendarView = 'day' | 'week' | 'month';
export const CALENDAR_VIEWS: readonly CalendarView[] = ['day', 'week', 'month'];

/** A view this build does not know (a hand edit, a newer device) opens as the month. */
export function calendarView(raw: unknown): CalendarView {
  return (CALENDAR_VIEWS as readonly unknown[]).includes(raw) ? (raw as CalendarView) : 'month';
}

const DAY_MIN = 24 * 60;
/** Six weeks of a daily event is 42; more from one event in one page is a rule gone wrong. */
const MAX_OCCURRENCES = 64;

// ─── Which days ────────────────────────────────────────────────────────────

/** `day` moved by whole months, the date clamped to the month's last (31 Jan + 1 = 28 Feb). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** The six weeks the month of `day` is drawn in, Monday first, starting with the week of its 1st. */
export function monthWeeks(day: string): string[][] {
  const monday = weekOf(`${day.slice(0, 8)}01`)[0];
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(monday, w * 7 + i)));
}

/** The day one page on in `view`: a day, a week, or a month (keeping the date where it can). */
export function stepDay(view: CalendarView, day: string, dir: number): string {
  if (view === 'day') return addDays(day, dir);
  if (view === 'week') return addDays(day, dir * 7);
  return addMonths(day, dir);
}

/** The days a page holds: page 0 holds `day`, page 1 the next day, week or month. */
export function pageDays(view: CalendarView, day: string, page: number): string[] {
  const at = stepDay(view, day, page);
  if (view === 'day') return [at];
  if (view === 'week') return weekOf(at);
  return monthWeeks(at).flat();
}

// ─── Pinching between them (29-2e2, idea 127) ──────────────────────────────

/** The view a zoom lands on — out: day → week → month; in: back — or null at either end. */
export function zoomedView(view: CalendarView, dir: ZoomDir): CalendarView | null {
  return CALENDAR_VIEWS[CALENDAR_VIEWS.indexOf(view) + (dir === 'out' ? 1 : -1)] ?? null;
}

/**
 * The day a zoom lands on. Diving in, the day under the fingers (pinch open
 * the 19th and the week of the 19th opens, on it); zooming out, the day it
 * was on, so the wider view holds it.
 */
export function zoomLanding(dir: ZoomDir, day: string, under: string | null): string {
  return dir === 'in' && under ? under : day;
}

// ─── What is on it ─────────────────────────────────────────────────────────

/** One occurrence of an event on one day of the page. */
export interface CalendarEventItem {
  eventId: string;
  title: string;
  colour: EventColour;
  /** `YYYY-MM-DD`, the column it is drawn in. */
  day: string;
  /** Minutes from that day's midnight, clipped to the day; 0 to 1440 when all day. */
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
  /** This occurrence's first instant, so a tap can say which one. */
  at: number;
}

function midnight(day: string, timeZone: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return zonedTimeToInstant({ year, month, day: date, hour: 0, minute: 0, second: 0 }, timeZone).getTime();
}

/**
 * Every occurrence of every event that touches one of `days` (consecutive),
 * one item per day it touches: a trip over three days is on all three, a
 * party past midnight on both. All-day ones run the whole day. Earliest first,
 * all-day ones leading their day.
 */
export function eventsOnDays(events: readonly BaseEvent[], days: readonly string[], timeZone: string): CalendarEventItem[] {
  if (days.length === 0) return [];
  const bounds = days.map((day) => ({ day, from: midnight(day, timeZone), to: midnight(addDays(day, 1), timeZone) }));
  const first = bounds[0].from;
  const last = bounds[bounds.length - 1].to;
  const items: CalendarEventItem[] = [];
  for (const event of events) {
    const allDay = isAllDay(event);
    for (const moment of eventOccurrences(event, first, last, timeZone, MAX_OCCURRENCES)) {
      const startMs = moment.start.getTime();
      const endMs = moment.end.getTime();
      for (const b of bounds) {
        if (endMs <= b.from || startMs >= b.to) continue;
        items.push({
          eventId: event.id,
          title: event.title,
          colour: event.colour ?? DEFAULT_EVENT_COLOUR,
          day: b.day,
          start: allDay ? 0 : Math.max(0, Math.round((startMs - b.from) / 60_000)),
          end: allDay ? DAY_MIN : Math.min(DAY_MIN, Math.round((endMs - b.from) / 60_000)),
          allDay,
          ...(event.location ? { location: event.location } : {}),
          at: startMs,
        });
      }
    }
  }
  return items.sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : Number(b.allDay) - Number(a.allDay) || a.start - b.start || a.title.localeCompare(b.title));
}

/** The few fields of a task the calendar reads. */
export interface CalendarTask {
  id: string;
  title: string;
  status: string;
  deadline?: string;
  parent?: string;
}

/** A task due on one of the days: on its deadline's day, in his zone. */
export interface DueItem {
  taskId: string;
  title: string;
  day: string;
  /** `HH:mm`, the deadline's time. */
  time: string;
  done: boolean;
  /** Open, and its deadline has passed. */
  late: boolean;
}

/** Every top-level task due on one of `days`, soonest first; ignored work left out (BIG-3). */
export function tasksDueOn<T extends CalendarTask>(
  backlog: readonly T[],
  days: readonly string[],
  timeZone: string,
  ignored: ReadonlySet<string>,
  now: Date,
): DueItem[] {
  const wanted = new Set(days);
  const out: { item: DueItem; ms: number }[] = [];
  for (const task of backlog) {
    if (task.parent || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (!at) continue;
    const day = toZonedDayString(at, timeZone);
    if (!wanted.has(day)) continue;
    const done = task.status === 'completed';
    out.push({
      item: {
        taskId: task.id,
        title: task.title,
        day,
        time: toTaskDateString(at, timeZone).slice(11, 16),
        done,
        late: !done && at.getTime() < now.getTime(),
      },
      ms: at.getTime(),
    });
  }
  return out.sort((a, b) => a.ms - b.ms || a.item.title.localeCompare(b.item.title)).map((o) => o.item);
}

// ─── Idea 53: the dots ─────────────────────────────────────────────────────

/** A dot's colour: an event's own, or a task's sky (due), coral (late) or lime (done). */
export type DotTone = EventColour | 'due' | 'late' | 'done';

export interface DayDots {
  /** Four at most. */
  tones: DotTone[];
  /** How many more are on the day than the dots show. */
  more: number;
  /** Everything on the day, for its label. */
  events: number;
  tasks: number;
}

export const MAX_DAY_DOTS = 4;

/** The dots under each day: events first, then late, open and done work. */
export function dayDots(events: readonly CalendarEventItem[], due: readonly DueItem[]): Map<string, DayDots> {
  const out = new Map<string, DayDots>();
  const get = (day: string) => {
    let entry = out.get(day);
    if (!entry) out.set(day, (entry = { tones: [], more: 0, events: 0, tasks: 0 }));
    return entry;
  };
  const all = new Map<string, DotTone[]>();
  const push = (day: string, tone: DotTone) => {
    const list = all.get(day);
    if (list) list.push(tone);
    else all.set(day, [tone]);
  };
  for (const e of events) {
    get(e.day).events += 1;
    push(e.day, e.colour);
  }
  const rank = (t: DueItem) => (t.late ? 0 : t.done ? 2 : 1);
  for (const t of [...due].sort((a, b) => rank(a) - rank(b))) {
    get(t.day).tasks += 1;
    push(t.day, t.late ? 'late' : t.done ? 'done' : 'due');
  }
  for (const [day, tones] of all) {
    const entry = get(day);
    entry.tones = tones.slice(0, MAX_DAY_DOTS);
    entry.more = Math.max(0, tones.length - MAX_DAY_DOTS);
  }
  return out;
}

// ─── Words ─────────────────────────────────────────────────────────────────

const dayName = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

/**
 * The page's title: "Wednesday 21 October", "19 – 25 October", "October" —
 * with the year when it is not this year's.
 */
export function calendarTitle(view: CalendarView, day: string, today: string): string {
  const year = (d: string) => (d.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' as const });
  if (view === 'day') return dayName(day, { weekday: 'long', day: 'numeric', month: 'long', ...year(day) });
  if (view === 'month') return dayName(day, { month: 'long', ...year(day) });
  const week = weekOf(day);
  const first = week[0];
  const last = week[6];
  if (first.slice(0, 7) === last.slice(0, 7)) {
    return `${dayName(first, { day: 'numeric' })} – ${dayName(last, { day: 'numeric', month: 'long', ...year(last) })}`;
  }
  const firstYear = first.slice(0, 4) !== last.slice(0, 4) ? { year: 'numeric' as const } : {};
  return `${dayName(first, { day: 'numeric', month: 'short', ...firstYear })} – ${dayName(last, { day: 'numeric', month: 'short', ...year(last) })}`;
}

/** The small word over the title: Today, Tomorrow, Yesterday, This week, This month… or nothing. */
export function calendarKicker(view: CalendarView, day: string, today: string): string | null {
  if (view === 'day') {
    if (day === today) return 'Today';
    if (day === addDays(today, 1)) return 'Tomorrow';
    if (day === addDays(today, -1)) return 'Yesterday';
    return null;
  }
  if (view === 'week') {
    const monday = weekOf(day)[0];
    const thisMonday = weekOf(today)[0];
    if (monday === thisMonday) return 'This week';
    if (monday === addDays(thisMonday, 7)) return 'Next week';
    if (monday === addDays(thisMonday, -7)) return 'Last week';
    return null;
  }
  const month = day.slice(0, 7);
  if (month === today.slice(0, 7)) return 'This month';
  if (month === addMonths(today, 1).slice(0, 7)) return 'Next month';
  if (month === addMonths(today, -1).slice(0, 7)) return 'Last month';
  return null;
}

/** Whether `day` is on the page `view` shows for `at` — so Today knows when it is needed. */
export function pageHolds(view: CalendarView, at: string, day: string): boolean {
  if (view === 'day') return at === day;
  if (view === 'week') return weekOf(at)[0] === weekOf(day)[0];
  return at.slice(0, 7) === day.slice(0, 7);
}

/** A day's label for a screen reader: "Thursday 22 October, 2 events, 3 tasks". */
export function dayLabel(day: string, dots: DayDots | undefined): string {
  const name = dayName(day, { weekday: 'long', day: 'numeric', month: 'long' });
  if (!dots) return `${name}, nothing on`;
  const parts = [
    dots.events > 0 ? `${dots.events} event${dots.events === 1 ? '' : 's'}` : '',
    dots.tasks > 0 ? `${dots.tasks} task${dots.tasks === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return `${name}, ${parts.join(', ')}`;
}

/** "9:30am", "6pm" — a time on a block or a row. */
export function clockWords(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}
