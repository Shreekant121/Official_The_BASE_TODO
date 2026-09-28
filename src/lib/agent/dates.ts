/**
 * Date handling for the agent tool layer.
 *
 * Two rules drive everything here (decision D14):
 *
 * 1. Every resolution happens against the turn's `now` and IANA `timezone`,
 *    never `Date.now()` and never the host's zone. A serverless proxy, a
 *    browser and a test runner all sit in different zones; the user's does not
 *    change just because the code moved.
 * 2. What gets *stored* is `YYYY-MM-DDTHH:mm` — the app's existing de-facto
 *    deadline format, produced by the `<input type="datetime-local">` fields in
 *    `TaskDetailPanel` and friends. Writing a fuller ISO string with a `Z` or a
 *    `+05:30` offset would round-trip fine through `new Date(...)` but would be
 *    rejected by those inputs, which silently render empty for a value they
 *    cannot parse. So: interpret input in the user's zone, store the wall clock.
 */

/** A bare date ("2026-08-12", "tomorrow") lands here, local to the turn's timezone. */
export const DEFAULT_DEADLINE_HOUR = 18;

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser's IANA zone, falling back to UTC if the host reports something
 * unusable.
 *
 * It lives here rather than beside the agent's live bindings because it is no
 * longer only the agent that needs it: the store asks the same question every
 * time a repeating task is completed (`lib/recurrenceCompletion.ts`), and
 * reaching into `liveContext` for it from there would make the store import
 * the module that imports the store.
 */
export function resolveUserTimeZone(): string {
  const reported = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return reported && isValidTimeZone(reported) ? reported : 'UTC';
}

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** The wall-clock fields an instant shows in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** Minutes `timeZone` is ahead of UTC at `instant` (+330 for Asia/Kolkata). */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000;
}

/**
 * The instant at which `timeZone` reads these wall-clock fields. Offsets are
 * looked up twice because the first lookup uses the wrong instant whenever the
 * guess and the answer straddle a DST transition.
 */
export function zonedTimeToInstant(parts: ZonedParts, timeZone: string): Date {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const firstOffset = zoneOffsetMinutes(new Date(utcGuess), timeZone);
  const candidate = new Date(utcGuess - firstOffset * 60_000);
  const secondOffset = zoneOffsetMinutes(candidate, timeZone);
  return secondOffset === firstOffset ? candidate : new Date(utcGuess - secondOffset * 60_000);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `YYYY-MM-DDTHH:mm` in `timeZone` — the format the app stores and its date inputs accept. */
export function toTaskDateString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** `YYYY-MM-DD` in `timeZone`. */
export function toZonedDayString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * A full ISO 8601 timestamp carrying the user's offset, e.g.
 * `2026-08-07T15:12:00+05:30`. This is the one place an offset is *wanted*:
 * it goes into the system prompt (D14), never onto a task, where the app's
 * date inputs would reject it.
 */
export function toOffsetISOString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const offset = zoneOffsetMinutes(instant, timeZone);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const wall = `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
  return `${wall}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Weekday name in `timeZone`, e.g. `Friday`. */
export function weekdayName(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' }).format(instant);
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const NAKED_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;
const ZONED_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i;

/** Day offsets from "today" in the turn's timezone. Deliberately tiny — the model is told to send ISO. */
const RELATIVE_DAYS: Record<string, number> = {
  today: 0,
  tomorrow: 1,
  yesterday: -1,
};

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

export type DateResolution =
  | { ok: true; value: string; instant: Date }
  | { ok: false; error: string };

const FORMAT_HELP =
  'Use "YYYY-MM-DD", "YYYY-MM-DDTHH:mm", a full ISO string with an offset, or one of today / tomorrow / yesterday.';

/**
 * Turns whatever the model sent into the stored `YYYY-MM-DDTHH:mm` form.
 * A bare day gets `DEFAULT_DEADLINE_HOUR`; a naked date-time is read as the
 * user's wall clock; an offset-bearing ISO string names an absolute instant and
 * is re-rendered in the user's zone.
 */
export function resolveDateInput(raw: string, now: Date, timeZone: string): DateResolution {
  const input = raw.trim();
  if (input === '') return { ok: false, error: `Empty date. ${FORMAT_HELP}` };

  const relativeDays = RELATIVE_DAYS[input.toLowerCase()];
  if (relativeDays !== undefined) {
    const today = zonedParts(now, timeZone);
    const shifted = new Date(Date.UTC(today.year, today.month - 1, today.day + relativeDays));
    const instant = zonedTimeToInstant(
      {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: DEFAULT_DEADLINE_HOUR,
        minute: 0,
        second: 0,
      },
      timeZone,
    );
    return { ok: true, value: toTaskDateString(instant, timeZone), instant };
  }

  const zoned = ZONED_DATETIME.exec(input);
  if (zoned) {
    const instant = new Date(input.replace(' ', 'T'));
    if (Number.isNaN(instant.getTime())) return { ok: false, error: `"${raw}" is not a real date. ${FORMAT_HELP}` };
    return { ok: true, value: toTaskDateString(instant, timeZone), instant };
  }

  const naked = NAKED_DATETIME.exec(input);
  if (naked) {
    const [, y, mo, d, h, mi, s] = naked;
    if (!isRealDate(Number(y), Number(mo), Number(d)) || Number(h) > 23 || Number(mi) > 59) {
      return { ok: false, error: `"${raw}" is not a real date. ${FORMAT_HELP}` };
    }
    const instant = zonedTimeToInstant(
      { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi), second: Number(s ?? 0) },
      timeZone,
    );
    return { ok: true, value: toTaskDateString(instant, timeZone), instant };
  }

  const dateOnly = DATE_ONLY.exec(input);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    if (!isRealDate(Number(y), Number(mo), Number(d))) {
      return { ok: false, error: `"${raw}" is not a real date. ${FORMAT_HELP}` };
    }
    const instant = zonedTimeToInstant(
      { year: Number(y), month: Number(mo), day: Number(d), hour: DEFAULT_DEADLINE_HOUR, minute: 0, second: 0 },
      timeZone,
    );
    return { ok: true, value: toTaskDateString(instant, timeZone), instant };
  }

  return { ok: false, error: `Could not read "${raw}" as a date. ${FORMAT_HELP}` };
}

/**
 * Reads a date already stored on a task. Bare days are treated as ending at
 * 23:59 so a task "due today" is not reported overdue from one minute past
 * midnight — the opposite of the write-side default, and deliberately so.
 */
export function parseStoredDate(value: string | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const input = value.trim();

  const zoned = ZONED_DATETIME.exec(input);
  if (zoned) {
    const instant = new Date(input.replace(' ', 'T'));
    return Number.isNaN(instant.getTime()) ? null : instant;
  }

  const naked = NAKED_DATETIME.exec(input);
  if (naked) {
    const [, y, mo, d, h, mi, s] = naked;
    return zonedTimeToInstant(
      { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi), second: Number(s ?? 0) },
      timeZone,
    );
  }

  const dateOnly = DATE_ONLY.exec(input);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return zonedTimeToInstant(
      { year: Number(y), month: Number(mo), day: Number(d), hour: 23, minute: 59, second: 59 },
      timeZone,
    );
  }

  const fallback = new Date(input);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function isOverdue(deadline: string | undefined, now: Date, timeZone: string): boolean {
  const instant = parseStoredDate(deadline, timeZone);
  return instant !== null && instant.getTime() < now.getTime();
}

/** Human phrasing for tool summaries, e.g. `Mon, 10 Aug 2026, 18:00`. */
export function describeDate(value: string | undefined, timeZone: string): string {
  const instant = parseStoredDate(value, timeZone);
  if (!instant) return 'no date';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
}
