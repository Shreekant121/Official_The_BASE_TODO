/**
 * Events and their countdowns (29-2a, BIG-6) — pure: no React, no store, no
 * clock. `now` and the zone are arguments.
 *
 * HIS CALLS (2026-09-30, 2026-10-15)
 * -----------------------------------
 * - **An event is not a task.** It has Google Calendar's details: a title, a
 *   date with a time or all day, an end, a repeat (a yearly birthday),
 *   a place, notes and a colour.
 * - **Repeats run on the tasks' own engine** (`lib/recurrence.ts`, anchored,
 *   "the same smart repeat logic tasks have") — never a second one. The event
 *   carries the same `recurrence` / `recurrenceRule` pair a task does, so the
 *   task sheet's repeat picker edits it unchanged.
 * - **A repeating event rolls on to its next date; only a one-off is
 *   "passed"**, and a passed one goes to the archive inside the countdown
 *   widget. Passed is worked out from the dates every time, never stored: an
 *   event moved to next year is simply coming again, with nothing to undo.
 * - **Each countdown picks how it counts, days and hours by default.**
 *
 * DATES ARE THE APP'S OWN SHAPE
 * -----------------------------
 * `start` and `end` are `YYYY-MM-DD` (all day) or `YYYY-MM-DDTHH:mm` (a wall
 * clock in his zone), the same strings a task's deadline is, read through
 * `agent/dates.ts`. All day is the shape of `start`, not a second field that
 * could disagree with it. An all-day event runs from the start of its first
 * day to the end of its last; a timed one with no end is an hour long, as
 * Google makes a new one.
 */
import type { TaskRecurrence } from '../../store/useStore';
import { seriesOccurrenceAfter, seriesOccurrenceInstant } from '../recurrence';
import { isCoverRef, isInlineCover } from '../covers/coverRef';
import { parseStoredDate, toZonedDayString, zonedParts, zonedTimeToInstant } from '../agent/dates';
import { LOOK_COLOURS, type LookColour } from '../dashboard/layout';

/** How a countdown counts, his pick per event. Absent = days and hours. */
export type CountdownStyle = 'days-hours' | 'days' | 'weeks' | 'hours';
export const COUNTDOWN_STYLES: readonly CountdownStyle[] = ['days-hours', 'days', 'weeks', 'hours'];

export const COUNTDOWN_STYLE_LABELS: Record<CountdownStyle, string> = {
  'days-hours': 'Days & hours',
  days: 'Days',
  weeks: 'Weeks',
  hours: 'Hours',
};

/**
 * 29-2b, idea 140: the One UI shape its countdown sits in on the Shape look.
 * Absent = a circle. Tapping the shape on the widget turns to the next one.
 */
export type EventShape = 'circle' | 'squircle' | 'arch' | 'burst';
export const EVENT_SHAPES: readonly EventShape[] = ['circle', 'squircle', 'arch', 'burst'];
export const DEFAULT_EVENT_SHAPE: EventShape = 'circle';

export const EVENT_SHAPE_LABELS: Record<EventShape, string> = {
  circle: 'Circle',
  squircle: 'Squircle',
  arch: 'Arch',
  burst: 'Burst',
};

/** The shape after `shape`, round again — what a tap on the Shape look does. */
export function nextShape(shape: EventShape | undefined): EventShape {
  const i = EVENT_SHAPES.indexOf(shape ?? DEFAULT_EVENT_SHAPE);
  return EVENT_SHAPES[(i + 1) % EVENT_SHAPES.length];
}

/**
 * 29-2b: how a Countdown widget draws its event, picked in the widget's ⚙
 * (`BlockSettings.face`) — idea 140's four looks plus idea 27's split-flap
 * board as the fifth. Absent = minimal, the look 29-2a built. The look is the
 * widget's; the picture and the shape it draws are the event's, so two
 * widgets can show one event two ways.
 */
export type CountdownFace = 'minimal' | 'cover' | 'shape' | 'journey' | 'flap';
export const COUNTDOWN_FACES: readonly CountdownFace[] = ['minimal', 'cover', 'shape', 'journey', 'flap'];

export const COUNTDOWN_FACE_LABELS: Record<CountdownFace, string> = {
  minimal: 'Minimal',
  cover: 'Cover',
  shape: 'Shape',
  journey: 'Journey',
  flap: 'Airport',
};

/** A stored face read safely: anything unknown is minimal. */
export function countdownFace(value: unknown): CountdownFace {
  return (COUNTDOWN_FACES as readonly unknown[]).includes(value) ? (value as CountdownFace) : 'minimal';
}

/** An event's colour is one of BASE's ten. Absent = sky, the colour of dates. */
export const EVENT_COLOURS = LOOK_COLOURS;
export type EventColour = LookColour;
export const DEFAULT_EVENT_COLOUR: EventColour = 'sky';

export interface BaseEvent {
  id: string;
  title: string;
  /** `YYYY-MM-DD` for all day, `YYYY-MM-DDTHH:mm` for a time. */
  start: string;
  /** The same shape as `start`, never before it. Absent: an hour, or the one day. */
  end?: string;
  /** The task's own repeat fields, so `resolveRule` reads an event as it reads a task. */
  recurrence?: TaskRecurrence;
  recurrenceRule?: string;
  location?: string;
  notes?: string;
  colour?: EventColour;
  countdown?: CountdownStyle;
  /**
   * 29-2b: its cover picture — a `cover:<id>` pointer (`lib/covers/`), or,
   * signed out, the picture inline until `useCoverSync` lifts it out, as a
   * project's is. Drawn through `useCoverSrc`, never as the string.
   */
  imageUrl?: string;
  shape?: EventShape;
  /**
   * 29-2c1: when it rings, as minutes before it — the menu's choices
   * (`ALERT_CHOICES`), soonest last, five at most (Google's limit). On an
   * all-day event they are whole days before the day, counted from
   * `alertTime` on it. Absent = no alerts; a new one starts with a day before.
   */
  alerts?: number[];
  /** All day only: the time its alerts ring, `HH:mm`. Absent = 08:00, his call. */
  alertTime?: string;
  createdAt: number;
}

/** What a sheet or a tool hands in: everything but the id and the stamp. */
export type EventDraft = Omit<BaseEvent, 'id' | 'createdAt'>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** A start or end in one of the two shapes, and a real date. */
export function isEventDate(value: unknown): value is string {
  if (typeof value !== 'string' || !(DAY.test(value) || DAY_TIME.test(value))) return false;
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return false;
  if (value.length === 10) return true;
  const [hh, mm] = value.slice(11).split(':').map(Number);
  return hh <= 23 && mm <= 59;
}

export const isAllDay = (event: Pick<BaseEvent, 'start'>): boolean => event.start.length === 10;

/** The calendar day `n` days after `day`, both `YYYY-MM-DD`. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function startOfDay(day: string, timeZone: string): Date {
  const [year, month, d] = day.split('-').map(Number);
  return zonedTimeToInstant({ year, month, day: d, hour: 0, minute: 0, second: 0 }, timeZone);
}

/**
 * A draft tidied into what is stored: the title trimmed, empty words left out
 * rather than kept as `''` or `undefined` (Firestore refuses the second), an
 * end in the other shape or before the start dropped, an end equal to an
 * all-day start dropped (one day is the default), and a repeat of "none" or a
 * custom repeat with no rule left out. `null` when there is no title or no
 * usable start — nothing to keep.
 */
export function cleanEventDraft(draft: Partial<EventDraft>): EventDraft | null {
  const title = (draft.title ?? '').trim().replace(/\s+/g, ' ');
  if (!title || !isEventDate(draft.start)) return null;
  const out: EventDraft = { title, start: draft.start };

  const end = draft.end;
  if (isEventDate(end) && end.length === out.start.length && end > out.start) out.end = end;

  if (draft.recurrence && draft.recurrence !== 'none') {
    if (draft.recurrence !== 'custom') out.recurrence = draft.recurrence;
    else if (draft.recurrenceRule) {
      out.recurrence = 'custom';
      out.recurrenceRule = draft.recurrenceRule;
    }
  }
  const location = draft.location?.trim();
  if (location) out.location = location;
  const notes = draft.notes?.trim();
  if (notes) out.notes = notes;
  if (draft.colour && (EVENT_COLOURS as readonly string[]).includes(draft.colour) && draft.colour !== DEFAULT_EVENT_COLOUR) {
    out.colour = draft.colour;
  }
  if (draft.countdown && COUNTDOWN_STYLES.includes(draft.countdown) && draft.countdown !== 'days-hours') {
    out.countdown = draft.countdown;
  }
  /* A pointer, or a picture the cover sync will lift out: never a web address or text. */
  if (isCoverRef(draft.imageUrl) || isInlineCover(draft.imageUrl)) out.imageUrl = draft.imageUrl;
  if (draft.shape && EVENT_SHAPES.includes(draft.shape) && draft.shape !== DEFAULT_EVENT_SHAPE) out.shape = draft.shape;
  const allDay = out.start.length === 10;
  const alerts = cleanAlerts(draft.alerts, allDay);
  if (alerts.length > 0) out.alerts = alerts;
  if (allDay && alerts.length > 0 && isClock(draft.alertTime) && draft.alertTime !== DEFAULT_ALERT_TIME) out.alertTime = draft.alertTime;
  return out;
}

// ─── Alerts (29-2c1) ────────────────────────────────────────────────────────

/**
 * His menu (2026-10-21, "Eight choices"): minutes before the event. Four weeks
 * is as far back as Google will ring.
 */
export const ALERT_CHOICES: readonly number[] = [0, 10, 30, 60, 1440, 2880, 10080, 40320];
/** An all-day event has no hour to count minutes from: whole days only. */
export const ALL_DAY_ALERT_CHOICES: readonly number[] = ALERT_CHOICES.filter((m) => m % 1440 === 0);
/** Google keeps five reminders on an event, so the sheet stops there. */
export const MAX_ALERTS = 5;
/** His call: a new event starts with one alert, a day before. */
export const DEFAULT_EVENT_ALERTS: readonly number[] = [1440];
/** His call: an all-day event rings at 8am, or a time he sets on it. */
export const DEFAULT_ALERT_TIME = '08:00';

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const isClock = (value: unknown): value is string => typeof value === 'string' && CLOCK.test(value);

/** "At the time", "30 min before", "1 week before"; for all day, "On the day", "1 day before". */
export function alertLabel(minutes: number, allDay: boolean): string {
  if (minutes === 0) return allDay ? 'On the day' : 'At the time';
  if (minutes < 60) return `${minutes} min before`;
  if (minutes < 1440) return `${minutes / 60} hour${minutes === 60 ? '' : 's'} before`;
  if (minutes % 10080 === 0) return `${minutes / 10080} week${minutes === 10080 ? '' : 's'} before`;
  return `${minutes / 1440} day${minutes === 1440 ? '' : 's'} before`;
}

/**
 * Alerts tidied: only the menu's choices (whole days on an all-day event, so
 * an event turned all day keeps its "a day before" and drops "10 min"), once
 * each, furthest first, five at most.
 */
export function cleanAlerts(raw: unknown, allDay: boolean): number[] {
  if (!Array.isArray(raw)) return [];
  const allowed = allDay ? ALL_DAY_ALERT_CHOICES : ALERT_CHOICES;
  const kept = [...new Set(raw.filter((m): m is number => allowed.includes(m)))];
  return kept.sort((a, b) => b - a).slice(0, MAX_ALERTS);
}

/** The time an all-day event's alerts ring, as minutes after midnight. */
export function alertClockMinutes(event: Pick<BaseEvent, 'alertTime'>): number {
  const [h, m] = (isClock(event.alertTime) ? event.alertTime : DEFAULT_ALERT_TIME).split(':').map(Number);
  return h * 60 + m;
}

/**
 * The event's alerts as Google Calendar reminders: minutes before the start,
 * which on an all-day event is midnight. "A day before at 8am" is 16 hours
 * before that midnight. **"On the day" on an all-day event has no Google
 * reminder**: it rings after the midnight Google counts from, and Google takes
 * only 0 to 40320 minutes before. Ringing it is BASE's push (29-2c2).
 */
export function googleReminderMinutes(event: Pick<BaseEvent, 'start' | 'alerts' | 'alertTime'>): number[] {
  const allDay = isAllDay(event);
  const alerts = cleanAlerts(event.alerts, allDay);
  if (!allDay) return alerts;
  const clock = alertClockMinutes(event);
  return alerts.map((m) => m - clock).filter((m) => m >= 0 && m <= 40320);
}

/** A record from the cloud or a device, shaped well enough to keep. */
export function isBaseEvent(value: unknown): value is BaseEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as BaseEvent;
  return typeof e.id === 'string' && typeof e.title === 'string' && isEventDate(e.start) && Number.isFinite(e.createdAt);
}

// ─── Where an event stands ──────────────────────────────────────────────────

export interface EventMoment {
  /** Coming, happening now, or over for good. */
  kind: 'coming' | 'now' | 'passed';
  /** This occurrence's first instant: midnight of its first day when all day. */
  start: Date;
  end: Date;
  /** The calendar day it starts on, in his zone. */
  day: string;
  /** Which occurrence of a repeating event (1 = the first); 1 for a one-off. */
  occurrence: number;
  /** A repeating event whose series is over. */
  ended?: boolean;
}

/** The event's own first occurrence, as instants. */
function firstSpan(event: Pick<BaseEvent, 'start' | 'end'>, timeZone: string): { start: Date; end: Date } | null {
  if (isAllDay(event)) {
    const last = event.end && event.end.length === 10 && event.end >= event.start ? event.end : event.start;
    return { start: startOfDay(event.start, timeZone), end: startOfDay(addDays(last, 1), timeZone) };
  }
  const start = parseStoredDate(event.start, timeZone);
  if (!start) return null;
  const end = event.end ? parseStoredDate(event.end, timeZone) : null;
  return { start, end: end && end > start ? end : new Date(start.getTime() + HOUR_MS) };
}

/**
 * Where the event stands at `now`. A repeating event is on its first
 * occurrence that has not yet ended — so a birthday is "now" all through its
 * day and rolls on to next year at midnight, and a weekly class is "now"
 * while it runs. A one-off, or a series that has run out, is passed once it
 * ends. `null` only for dates that cannot be read.
 */
export function eventMoment(event: BaseEvent, now: Date, timeZone: string): EventMoment | null {
  const first = firstSpan(event, timeZone);
  if (!first) return null;
  const allDay = isAllDay(event);
  const at = (start: Date, end: Date, occurrence: number, ended?: boolean): EventMoment => {
    const kind = end.getTime() <= now.getTime() ? 'passed' : start.getTime() <= now.getTime() ? 'now' : 'coming';
    return { kind, start, end, day: toZonedDayString(start, timeZone), occurrence, ...(ended ? { ended } : {}) };
  };

  if (allDay) {
    /* The anchor reads as the END of its day, so "lands after" means "its day is not over". */
    const days = daysBetween(event.start, toZonedDayString(new Date(first.end.getTime() - 1), timeZone)) + 1;
    const series = seriesOccurrenceAfter(event, event.start, new Date(now.getTime() - (days - 1) * DAY_MS), timeZone);
    if (series.kind === 'none') return at(first.start, first.end, 1);
    if (series.kind === 'ended') return { ...at(first.start, first.end, 1, true), kind: 'passed' };
    const day = toZonedDayString(series.at, timeZone);
    return at(startOfDay(day, timeZone), startOfDay(addDays(day, days), timeZone), series.occurrence);
  }

  const length = first.end.getTime() - first.start.getTime();
  const series = seriesOccurrenceAfter(event, event.start, new Date(now.getTime() - length), timeZone);
  if (series.kind === 'none') return at(first.start, first.end, 1);
  if (series.kind === 'ended') return { ...at(first.start, first.end, 1, true), kind: 'passed' };
  return at(series.at, new Date(series.at.getTime() + length), series.occurrence);
}

export interface EventWithMoment {
  event: BaseEvent;
  moment: EventMoment;
}

/** Coming and happening now, soonest first — what a countdown widget counts to. */
export function upcomingEvents(events: readonly BaseEvent[], now: Date, timeZone: string): EventWithMoment[] {
  const out: EventWithMoment[] = [];
  for (const event of events) {
    const moment = eventMoment(event, now, timeZone);
    if (moment && moment.kind !== 'passed') out.push({ event, moment });
  }
  return out.sort((a, b) => a.moment.start.getTime() - b.moment.start.getTime() || a.event.title.localeCompare(b.event.title));
}

/**
 * The occurrences of `event` that overlap `fromMs` to `toMs`, in order, at
 * most `cap` — read through `eventMoment`, so a repeat is found by the tasks'
 * own engine and never a second one. `eventMoment` at an instant finds the
 * occurrence not yet ended there; probing again at each one's end finds the
 * one after it. The alerts (29-2c2) and the calendar (29-2e1) both ask it.
 */
export function eventOccurrences(event: BaseEvent, fromMs: number, toMs: number, timeZone: string, cap: number): EventMoment[] {
  const out: EventMoment[] = [];
  let probe = fromMs - 1;
  for (let i = 0; i < cap; i++) {
    const moment = eventMoment(event, new Date(probe), timeZone);
    if (!moment || moment.kind === 'passed') break;
    if (moment.start.getTime() >= toMs) break;
    if (moment.end.getTime() > fromMs) out.push(moment);
    probe = Math.max(moment.end.getTime(), probe + 1);
  }
  return out;
}

/** The archive: passed for good, most recent first. */
export function passedEvents(events: readonly BaseEvent[], now: Date, timeZone: string): EventWithMoment[] {
  const out: EventWithMoment[] = [];
  for (const event of events) {
    const moment = eventMoment(event, now, timeZone);
    if (moment?.kind === 'passed') out.push({ event, moment });
  }
  return out.sort((a, b) => b.moment.end.getTime() - a.moment.end.getTime());
}

/**
 * 29-2b, idea 140's Journey: the stretch the countdown has travelled, from the
 * day he set it (or, for a repeat, the occurrence before this one) to this
 * occurrence's start. `fraction` is 0 at the start of the stretch, 1 at the
 * event. `null` when there is no stretch: it has started or passed.
 */
export function journeySpan(
  event: BaseEvent,
  moment: EventMoment,
  now: Date,
  timeZone: string,
): { from: Date; to: Date; fraction: number; repeat: boolean } | null {
  if (moment.kind !== 'coming') return null;
  const to = moment.start;
  let from = new Date(Math.min(event.createdAt, to.getTime()));
  let repeat = false;
  if (moment.occurrence > 1) {
    const prev = seriesOccurrenceInstant(event, event.start, moment.occurrence - 1, timeZone);
    if (prev) {
      /* An all-day anchor reads as its day's end; the stretch starts on that day. */
      from = isAllDay(event) ? startOfDay(toZonedDayString(prev, timeZone), timeZone) : prev;
      repeat = true;
    }
  }
  const span = to.getTime() - from.getTime();
  const fraction = span <= 0 ? 1 : Math.max(0, Math.min(1, (now.getTime() - from.getTime()) / span));
  return { from, to, fraction, repeat };
}

// ─── The countdown ──────────────────────────────────────────────────────────

/**
 * What a countdown says. Either a number with its unit — `23` and
 * `days 6 hours` — drawn big and small, or one word when the count is over:
 * Today, Now, Passed.
 */
export type CountdownReading =
  | { kind: 'count'; value: string; unit: string }
  /* Done and Overdue are a task's (29-2d2, `lib/dashboard/countdownTarget.ts`). */
  | { kind: 'word'; word: 'Today' | 'Now' | 'Passed' | 'Done' | 'Overdue' };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "6 hours" / "1 hour", or nothing for zero. */
const part = (n: number, one: string, many: string) => (n > 0 ? ` ${n} ${plural(n, one, many)}` : '');

/** Under an hour: minutes, never "0". */
function minutesLeft(ms: number): CountdownReading {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return { kind: 'count', value: String(m), unit: plural(m, 'minute', 'minutes') };
}

function hoursLeft(ms: number): CountdownReading {
  const h = Math.floor(ms / HOUR_MS);
  if (h < 1) return minutesLeft(ms);
  const m = Math.floor((ms % HOUR_MS) / 60_000);
  return { kind: 'count', value: String(h), unit: `${plural(h, 'hour', 'hours')}${part(m, 'min', 'min')}` };
}

/**
 * The countdown to `moment` at `now`, counted the way `style` says.
 *
 * Days and hours is time to the start, so it reaches the next unit down as
 * the start nears. **Days and weeks are calendar days**, which is what a
 * person means by "my birthday is in 3 days": at 11pm the day before it says
 * one day, not zero. An all-day event counts to midnight of its day, and on
 * the day itself it is Today; a timed one that has started is Now.
 */
export function countdownReading(
  moment: EventMoment,
  now: Date,
  style: CountdownStyle | undefined,
  allDay: boolean,
  timeZone: string,
): CountdownReading {
  if (moment.kind === 'passed') return { kind: 'word', word: 'Passed' };
  if (moment.kind === 'now') return { kind: 'word', word: allDay ? 'Today' : 'Now' };

  const ms = moment.start.getTime() - now.getTime();
  const days = daysBetween(toZonedDayString(now, timeZone), moment.day);
  if (allDay && days <= 0) return { kind: 'word', word: 'Today' };

  switch (style ?? 'days-hours') {
    case 'days':
      if (days < 1) return hoursLeft(ms);
      return { kind: 'count', value: String(days), unit: plural(days, 'day', 'days') };
    case 'weeks': {
      if (days < 1) return hoursLeft(ms);
      const w = Math.floor(days / 7);
      if (w < 1) return { kind: 'count', value: String(days), unit: plural(days, 'day', 'days') };
      return { kind: 'count', value: String(w), unit: `${plural(w, 'week', 'weeks')}${part(days % 7, 'day', 'days')}` };
    }
    case 'hours':
      return hoursLeft(ms);
    default: {
      const d = Math.floor(ms / DAY_MS);
      if (d < 1) return hoursLeft(ms);
      const h = Math.floor((ms % DAY_MS) / HOUR_MS);
      return { kind: 'count', value: String(d), unit: `${plural(d, 'day', 'days')}${part(h, 'hour', 'hours')}` };
    }
  }
}

/** The reading as one line, for Atlas and the archive: "23 days 6 hours", "Today". */
export function countdownText(reading: CountdownReading): string {
  return reading.kind === 'word' ? reading.word : `${reading.value} ${reading.unit}`;
}

/** One run of tiles on the split-flap board, and the word printed under it. */
export interface FlapGroup {
  text: string;
  label?: string;
}

/** The unit a two-part count shows second, so the board keeps its tiles at zero. */
const SECOND_UNIT: Record<string, string> = { days: 'hours', day: 'hours', weeks: 'days', week: 'days', hours: 'min', hour: 'min' };

/**
 * Idea 27: the reading as split-flap tiles. "23 days 6 hours" is `23` over
 * DAYS and `06` over HOURS; a word is its letters. A count whose second part
 * is zero keeps its `00` tiles, so the board does not lose two tiles on the
 * hour and gain them back an hour later — except where the count has only
 * one part by its style (Days) or by its size (under an hour).
 */
export function flapGroups(reading: CountdownReading, style: CountdownStyle | undefined): FlapGroup[] {
  if (reading.kind === 'word') return [{ text: reading.word.toUpperCase() }];
  const [label, second, secondLabel] = reading.unit.split(' ');
  const first: FlapGroup = { text: reading.value.padStart(2, '0'), label };
  if (second !== undefined) return [first, { text: second.padStart(2, '0'), label: secondLabel }];
  const twoPart = style !== 'days' && SECOND_UNIT[label] !== undefined && !(style === 'weeks' && label.startsWith('day'));
  return twoPart ? [first, { text: '00', label: SECOND_UNIT[label] }] : [first];
}

/** "3 Aug", or "3 Aug 2025" in another year: the two ends of the Journey line. */
export function shortDay(at: Date, now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(at);
  const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = zonedParts(at, timeZone).year;
  return `${of('day')} ${of('month')}${year !== zonedParts(now, timeZone).year ? ` ${year}` : ''}`;
}

/**
 * When it is, in a few words: "Sun 12 Nov, 07:00", "Sun 12 Nov", or a span
 * "Fri 12 – Sun 14 Nov". The year only when it is not this one.
 */
export function describeWhen(moment: EventMoment, allDay: boolean, now: Date, timeZone: string): string {
  const thisYear = zonedParts(now, timeZone).year;
  /* By parts: with a year in it Intl puts a comma after the weekday. */
  const dayLabel = (instant: Date) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .formatToParts(instant);
    const of = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const year = zonedParts(instant, timeZone).year;
    return `${of('weekday')} ${of('day')} ${of('month')}${year !== thisYear ? ` ${year}` : ''}`;
  };
  const time = (instant: Date) =>
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

  if (allDay) {
    const lastDay = new Date(moment.end.getTime() - 1);
    if (toZonedDayString(lastDay, timeZone) === moment.day) return dayLabel(moment.start);
    return `${dayLabel(moment.start)} – ${dayLabel(lastDay)}`;
  }
  /* Ending at midnight is still the same day: a party until 00:00. */
  if (toZonedDayString(new Date(moment.end.getTime() - 1), timeZone) === moment.day) return `${dayLabel(moment.start)}, ${time(moment.start)}`;
  return `${dayLabel(moment.start)}, ${time(moment.start)} – ${dayLabel(moment.end)}, ${time(moment.end)}`;
}
