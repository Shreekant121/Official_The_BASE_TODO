/**
 * When an event's alerts ring today (29-2c2) — pure: no clock, no I/O, no
 * Firebase. What `firingToday` is for a task, this is for an event, and the
 * sender (`server/pushRun.ts`, through `pushPlan.ts`) and the Notifications
 * screen both ask it, so the push and the row are one instant.
 *
 * HIS CALLS (2026-10-21)
 * ----------------------
 * - **Alerts ring both ways**: Google's own reminder (`eventCalendar.ts`) and
 *   a BASE push on the tablet (this).
 * - **The instant is the occurrence's start minus the alert's minutes**, for
 *   every occurrence of a repeat. A timed event counts real minutes back from
 *   its start, as Google does. An all-day event's start is its day at
 *   `alertTime` (8am unless he set one), and its alerts are whole days, so
 *   "a day before" rings at that time on the day before — on the wall clock,
 *   whatever a clock change does in between.
 * - **"On the day" on an all-day event rings here only.** Google counts from
 *   the day's midnight and cannot take it (`googleReminderMinutes`).
 *
 * A multi-day all-day event rings for its first day only: that is when it
 * starts. A passed one-off rings nothing, because nothing about it is ahead.
 */
import { toZonedDayString, zonedTimeToInstant } from '../agent/dates';
import { addDays, alertClockMinutes, cleanAlerts, eventOccurrences, isAllDay, type BaseEvent, type EventMoment } from './events';
import type { FiringRow, FiringState } from '../firingToday';
import type { PushLogEntry } from '../pushPlan';

const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
/** More rings than this from one alert in one day is a rule gone wrong, not a calendar. */
const MAX_RINGS_PER_ALERT = 48;

export interface EventAlertRow {
  event: BaseEvent;
  /** When it rings. */
  at: number;
  /** The alert it is: minutes before, one of `ALERT_CHOICES`. */
  minutes: number;
  allDay: boolean;
  /** The occurrence it rings for — its start, end and day, as `eventMoment` gives them. */
  occurrence: EventMoment;
  /** As a task row's: `next`, `queued`, `missed` or `sent` (an event alert has no snooze). */
  state: FiringState;
  /** What the sender logged for it, once `withEventDelivery` has been applied. */
  delivery?: PushLogEntry;
}

/** The push log's subject for an event: its key is `event:<id>@<at>`, beside a task's `<id>@<at>`. */
export function eventLogSubject(eventId: string): string {
  return `event:${eventId}`;
}

function midnight(day: string, timeZone: string): Date {
  const [year, month, d] = day.split('-').map(Number);
  return zonedTimeToInstant({ year, month, day: d, hour: 0, minute: 0, second: 0 }, timeZone);
}

/**
 * The occurrences of `event` that start at `fromMs` or later and before
 * `beforeMs`, in order: `eventOccurrences` (the one walk, shared with the
 * calendar) less the one already under way at `fromMs`. A one-off is its own
 * single occurrence, and passed once its end is behind the probe.
 */
function occurrencesFrom(event: BaseEvent, fromMs: number, beforeMs: number, timeZone: string): EventMoment[] {
  return eventOccurrences(event, fromMs, beforeMs, timeZone, MAX_RINGS_PER_ALERT).filter((m) => m.start.getTime() >= fromMs);
}

/**
 * Every alert of every event that rings on the day `now` falls on, in his
 * zone, soonest first. `state` is provisional, from the clock alone: past is
 * `missed`, the first one still to come `next`. `withEventDelivery` puts what
 * the sender actually did on top.
 *
 * **Notifications switched off is not a filter here**, for `firingToday`'s
 * reason: the screen dims the rows rather than emptying them, and the sender
 * checks the switch before it asks.
 */
export function eventAlertsToday(events: readonly BaseEvent[], timeZone: string, now: number): EventAlertRow[] {
  const today = toZonedDayString(new Date(now), timeZone);
  const dayStart = midnight(today, timeZone).getTime();
  const dayEnd = midnight(addDays(today, 1), timeZone).getTime();
  const rows: EventAlertRow[] = [];

  for (const event of events) {
    const allDay = isAllDay(event);
    const alerts = cleanAlerts(event.alerts, allDay);
    if (alerts.length === 0) continue;

    if (allDay) {
      /* Whole days: the occurrence `n` days on from today rings today at the ring time. */
      const clock = alertClockMinutes(event);
      const [year, month, d] = today.split('-').map(Number);
      const at = zonedTimeToInstant({ year, month, day: d, hour: Math.floor(clock / 60), minute: clock % 60, second: 0 }, timeZone).getTime();
      for (const minutes of alerts) {
        const day = addDays(today, minutes / DAY_MINUTES);
        const from = midnight(day, timeZone).getTime();
        const to = midnight(addDays(day, 1), timeZone).getTime();
        for (const occurrence of occurrencesFrom(event, from, to, timeZone)) {
          rows.push({ event, at, minutes, allDay, occurrence, state: 'queued' });
        }
      }
      continue;
    }

    for (const minutes of alerts) {
      const back = minutes * MINUTE_MS;
      for (const occurrence of occurrencesFrom(event, dayStart + back, dayEnd + back, timeZone)) {
        rows.push({ event, at: occurrence.start.getTime() - back, minutes, allDay, occurrence, state: 'queued' });
      }
    }
  }

  rows.sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id) || b.minutes - a.minutes);
  for (const row of rows) if (row.at < now) row.state = 'missed';
  const next = rows.find((r) => r.state !== 'missed');
  if (next) next.state = 'next';
  return rows;
}

/** The log key of one ring. */
export function eventAlertKey(row: Pick<EventAlertRow, 'event' | 'at'>): string {
  return `${eventLogSubject(row.event.id)}@${row.at}`;
}

/**
 * The sender's log over these rows, as `withDelivery` does for tasks: a past
 * row is `sent` or `missed` as it actually was; one not yet seen by a knock but
 * inside the late limit is still to come. With no log the rows are untouched.
 */
export function withEventDelivery(rows: EventAlertRow[], log: { entries: Record<string, PushLogEntry> } | null, now: number, lateLimitMs: number): EventAlertRow[] {
  if (!log) return rows;
  return rows.map((row) => {
    const entry = log.entries[eventAlertKey(row)];
    if (!entry) {
      if (row.at <= now && now - row.at <= lateLimitMs) return { ...row, state: 'queued' as const };
      return row;
    }
    return { ...row, state: entry.outcome === 'missed' ? ('missed' as const) : ('sent' as const), delivery: entry };
  });
}

/** One line of the Notifications screen's timeline: a task's alert or an event's. */
export type TimelineRow = { kind: 'task'; at: number; row: FiringRow } | { kind: 'event'; at: number; row: EventAlertRow };

const stateOf = (r: TimelineRow): FiringState => r.row.state;

/**
 * Tasks and events on one clock, soonest first, with ONE `next` between them —
 * the soonest row still to come — so the screen has one row with a countdown.
 */
export function todaysTimeline(tasks: readonly FiringRow[], events: readonly EventAlertRow[]): TimelineRow[] {
  const all: TimelineRow[] = [
    ...tasks.map((row) => ({ kind: 'task' as const, at: row.at, row })),
    ...events.map((row) => ({ kind: 'event' as const, at: row.at, row })),
  ];
  all.sort((a, b) => a.at - b.at || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1));
  const nextIndex = all.findIndex((r) => stateOf(r) === 'next' || stateOf(r) === 'queued');
  return all.map((r, i) => {
    const state = stateOf(r);
    if (state !== 'next' && state !== 'queued') return r;
    const want: FiringState = i === nextIndex ? 'next' : 'queued';
    if (want === state) return r;
    return r.kind === 'task' ? { ...r, row: { ...r.row, state: want } } : { ...r, row: { ...r.row, state: want } };
  });
}

/** "Tomorrow", "In 1 week", "Now" — when the event is, from the moment the alert rings. */
export function alertWhenWords(minutes: number, allDay: boolean): string {
  if (minutes === 0) return allDay ? 'Today' : 'Now';
  if (minutes === DAY_MINUTES) return 'Tomorrow';
  if (minutes < 60) return `In ${minutes} min`;
  if (minutes < DAY_MINUTES) return `In ${minutes / 60} h`;
  if (minutes % 10080 === 0) return `In ${minutes / 10080} week${minutes === 10080 ? '' : 's'}`;
  return `In ${minutes / DAY_MINUTES} days`;
}
