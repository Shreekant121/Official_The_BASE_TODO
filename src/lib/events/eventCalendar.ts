/**
 * An event on the BASE Google calendar (29-2c1) — pure: no clock, no I/O, no
 * Firebase. `notificationSync.ts` is the network half and runs it inside the
 * one reconcile pass the task blocks already have: one read, a diff, one batch.
 *
 * HIS CALLS (2026-09-30, 2026-10-21)
 * -----------------------------------
 * - **Events go onto the BASE calendar**, the one the task blocks are on.
 * - **Alerts ring both ways**: Google's own reminder (here) and a tablet push
 *   (29-2c2). His menu is eight choices, a new event starts with "a day
 *   before", and an all-day event rings at 8am or a time he sets on it
 *   (`events.ts`, `googleReminderMinutes`).
 *
 * HOW IT DIFFERS FROM A TASK'S BLOCK
 * ----------------------------------
 * - **An id of its own kind**, `e1` + the event's id. The sweep deletes what
 *   no event claims under `e1` only, so it can never touch a task's `d1` or a
 *   quick reminder's `d4`, and theirs can never touch an event.
 * - **All day is a date**, as Google draws a birthday: `start.date` and an
 *   `end.date` the day after the last one (Google's end is exclusive).
 * - **The repeat is the event's own**, every occurrence drawn by Google from
 *   the anchor. There is no "next copy" as a task has, so the series is never
 *   handed on: it is on the event for as long as the event repeats.
 * - **Written whole (PUT), never patched.** An event can turn from timed to
 *   all day, and a patch would merge `start.date` into a `start.dateTime`
 *   Google still holds; a whole body says exactly what is there.
 * - Its place is Google's `location`, its notes the description, and its
 *   colour the nearest of Google's eleven.
 *
 * Changes made in Google are not read back yet: that is BIG-13 (step 29A),
 * which covers events. The description says so where he would edit it.
 */
import { calendarRRuleOf } from '../recurrence';
import { parseStoredDate } from '../agent/dates';
import { rruleLines, sameInstant, sameReminders, sameZone } from '../calendarDiff';
import { addDays, googleReminderMinutes, isAllDay, DEFAULT_EVENT_COLOUR, type BaseEvent, type EventColour } from './events';
import type { EventReminders, GoogleCalendarEvent } from '../googleCalendar';
import type { NotificationSettings } from '../notificationSettings';

/** The prefix every event's Google id carries. See the header. */
export const EVENT_CALENDAR_PREFIX = 'e1';

/** Google's event ids are `[a-v0-9]{5,1024}`, so the event's id is stripped to that. */
export function eventCalendarId(eventId: string): string {
  return `${EVENT_CALENDAR_PREFIX}${eventId.replace(/[^a-v0-9]/gi, '').toLowerCase()}`.slice(0, 500);
}

/**
 * Each of BASE's ten colours as the nearest of Google's eleven event colours
 * (1 Lavender, 2 Sage, 3 Grape, 4 Flamingo, 5 Banana, 6 Tangerine, 7 Peacock,
 * 8 Graphite, 9 Blueberry, 10 Basil, 11 Tomato). Sky and teal share Peacock:
 * Google has one blue-green.
 */
export const GOOGLE_COLOUR_IDS: Record<EventColour, string> = {
  orange: '6',
  emerald: '10',
  lime: '2',
  gold: '5',
  coral: '11',
  rose: '4',
  violet: '3',
  sky: '7',
  teal: '7',
  indigo: '9',
};

/** Under the notes, on every event: Google's copy is BASE's, until BIG-13 reads changes back. */
export const EVENT_NOTE = 'Made in BASE. Change it there: edits made here are overwritten.';

type EventTime = { date: string; timeZone?: string } | { dateTime: string; timeZone?: string };

/** The event as BASE wants Google to hold it. */
export interface EventCalendarBody {
  summary: string;
  description: string;
  location?: string;
  colorId: string;
  start: EventTime;
  end: EventTime;
  reminders: EventReminders;
  /** `[]` for a one-off; one `RRULE:` line for a repeat. */
  recurrence: string[];
}

/**
 * What one event should be on Google, or `null` when it should have no entry:
 * notifications switched off (the one switch for the whole calendar, as for
 * the task blocks), or dates that cannot be read. A passed event keeps its
 * entry — Google is a record of what happened, as a finished task's ✓ is.
 */
export function eventCalendarBody(
  event: BaseEvent,
  settings: Pick<NotificationSettings, 'enabled'>,
  timeZone: string,
): EventCalendarBody | null {
  if (!settings.enabled) return null;
  const allDay = isAllDay(event);
  const rule = calendarRRuleOf(event, timeZone, allDay);
  /* A timed repeat expands in a zone, which Google requires; a date repeats on
     its date in any zone, and a zone Google might not echo back on a date
     would read as a change and rewrite the event on every pass. */
  const zone = rule && !allDay ? { timeZone } : {};

  let start: EventTime;
  let end: EventTime;
  if (allDay) {
    const last = event.end && event.end.length === 10 && event.end >= event.start ? event.end : event.start;
    start = { date: event.start };
    end = { date: addDays(last, 1) };
  } else {
    const from = parseStoredDate(event.start, timeZone);
    if (!from) return null;
    const until = event.end ? parseStoredDate(event.end, timeZone) : null;
    const to = until && until > from ? until : new Date(from.getTime() + 3_600_000);
    start = { dateTime: from.toISOString(), ...zone };
    end = { dateTime: to.toISOString(), ...zone };
  }

  return {
    summary: event.title,
    description: event.notes ? `${event.notes}\n\n${EVENT_NOTE}` : EVENT_NOTE,
    ...(event.location ? { location: event.location } : {}),
    colorId: GOOGLE_COLOUR_IDS[event.colour ?? DEFAULT_EVENT_COLOUR] ?? GOOGLE_COLOUR_IDS[DEFAULT_EVENT_COLOUR],
    start,
    end,
    /* Always explicit: an event with no alerts must not ring Google's own default. */
    reminders: {
      useDefault: false,
      overrides: googleReminderMinutes(event)
        .sort((a, b) => a - b)
        .map((minutes) => ({ method: 'popup' as const, minutes })),
    },
    recurrence: rule ? [rule] : [],
  };
}

function sameTime(existing: GoogleCalendarEvent['start'] | undefined, desired: EventTime): boolean {
  if ('date' in desired) return existing?.date === desired.date && !existing.dateTime;
  return sameInstant(existing?.dateTime, desired.dateTime) && sameZone(existing?.timeZone, desired.timeZone);
}

/**
 * Whether Google already holds this, so a quiet pass writes nothing. A
 * `cancelled` entry never matches: it has to be revived.
 */
export function eventCalendarMatches(existing: GoogleCalendarEvent, desired: EventCalendarBody): boolean {
  return (
    existing.status !== 'cancelled' &&
    existing.summary === desired.summary &&
    (existing.description ?? '') === desired.description &&
    (existing.location ?? '') === (desired.location ?? '') &&
    existing.colorId === desired.colorId &&
    sameTime(existing.start, desired.start) &&
    sameTime(existing.end, desired.end) &&
    sameReminders(existing.reminders, desired.reminders) &&
    rruleLines(existing.recurrence) === rruleLines(desired.recurrence)
  );
}

/**
 * The body as it is sent: a one-off leaves `recurrence` out, which a whole
 * write (PUT) reads as "no repeat" — the reason events are never patched.
 */
export function eventWriteBody(body: EventCalendarBody): Record<string, unknown> {
  const { recurrence, ...rest } = body;
  return recurrence.length > 0 ? { ...rest, recurrence } : rest;
}
