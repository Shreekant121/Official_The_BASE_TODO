/**
 * A due date, read the one way every row draws it (29-1P7a, ideas 165 and 66).
 *
 * The card, the list view, the task sheet, Set Deadlines and the peek each had
 * their own little phrase function ("2d left", "Due in 2d", "Due Fri 12 Oct"),
 * and they disagreed at the edges. A tiny calendar page now carries the date
 * itself, so the words beside it only have to say how far away it is, and one
 * reader says it for all of them.
 *
 * Pure: the clock and the time zone are arguments. A stored deadline is
 * wall-clock time in the user's zone (`lib/agent/dates.ts`), so the page's
 * month and day are read in that zone, never the browser's.
 */
import { parseStoredDate, zonedParts } from './agent/dates';
import { deadlineWarmth } from './warmth';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export interface DueReading {
  at: Date;
  /** Three capitals, the strip at the top of the page. */
  month: string;
  /** The day of the month, the big number on the page. */
  day: number;
  /** `YYYY-MM-DD` in the zone: what the page flips on when it changes. */
  dayKey: string;
  /** How far away, in plain words: "in 5 days", "tomorrow", "5h left", "Overdue". */
  words: string;
  /** Under a day away, or past: the words go coral (29-1P2c2's rule). */
  urgent: boolean;
  overdue: boolean;
  /** 0 (two weeks off or more) to 1: the page's strip, sky to coral. 1 on the day itself, his call. */
  warmth: number;
}

export function readDue(deadline: string | undefined, now: Date, timeZone: string): DueReading | null {
  const at = parseStoredDate(deadline, timeZone);
  if (!at) return null;

  const p = zonedParts(at, timeZone);
  const n = zonedParts(now, timeZone);
  /* Calendar days between the two dates in the zone, whatever the hour. */
  const calDays = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(n.year, n.month - 1, n.day)) / DAY);
  const ms = at.getTime() - now.getTime();
  const overdue = ms < 0;

  return {
    at,
    month: MONTHS[p.month - 1] ?? '',
    day: p.day,
    dayKey: `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    words: dueWords(ms, calDays),
    urgent: ms < DAY,
    overdue,
    /* Coral on the day, not only in its last hours (his call, 2026-10-13):
       a deadline today is about to be missed whatever the clock says. */
    warmth: overdue || calDays <= 0 ? 1 : deadlineWarmth(ms / DAY),
  };
}

const fullFormats = new Map<string, Intl.DateTimeFormat>();

/**
 * The whole date for a page's tooltip, "Mon, 16 Mar 2026, 18:00" —
 * `describeDate`'s wording, with its formatter built once per zone: a board
 * draws one of these per card, and a new `Intl.DateTimeFormat` each time is
 * the costly part of a row.
 */
export function fullDueDate(at: Date, timeZone: string): string {
  let f = fullFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    fullFormats.set(timeZone, f);
  }
  return f.format(at);
}

function dueWords(ms: number, calDays: number): string {
  if (ms < 0) {
    const late = -calDays;
    return late <= 0 ? 'Overdue' : `${late} day${late === 1 ? '' : 's'} late`;
  }
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))}m left`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h left`;
  if (calDays <= 1) return 'tomorrow';
  if (calDays <= 13) return `in ${calDays} days`;
  if (calDays <= 60) return `in ${Math.round(calDays / 7)} weeks`;
  const months = Math.round(calDays / 30);
  return `in ${months} month${months === 1 ? '' : 's'}`;
}
