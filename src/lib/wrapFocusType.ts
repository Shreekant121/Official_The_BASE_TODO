/**
 * The focus type (29-1P14e2, idea 107's "your focus type" page): a name for
 * how he focused over the month or the year, and three true facts under it.
 * Pure: the stretches, the zone and the prime hours are arguments
 * (`wrapFocusType.test.ts`).
 *
 * His call (2026-10-20): **when + how long**, about twelve types.
 *   - **When** is the sky of the middle of his two sharpest hours, on the
 *     Dashboard's own clock (`phaseOfHour`: morning from 5, afternoon from
 *     12, evening from 17, night from 21) — so "The Morning…" never
 *     disagrees with the greeting he sees at that hour. Night is "Midnight".
 *   - **How long** is his typical sitting: the median, where a sitting is the
 *     timer's stretches with no more than `SITTING_GAP_MS` between them (a
 *     pause, a switch of task). Under 40 minutes a Sprinter, under 90 a
 *     Runner, 90 and over a Deep Diver — 90 because BASE already treats a
 *     Start that long as a commitment (`lib/focusCommitment.ts`).
 * Only the timer is read: time logged by hand has no clock time and no
 * sittings. A period with no prime hours, or under `MIN_SITTINGS`, has no type.
 */
import { phaseOfHour, type HourPhase } from './screenLight';
import { zonedParts } from './agent/dates';
import { dayOf } from './stats';
import { weekdayOfDay, WEEKDAY_NAMES } from './dashboard/hours';
import { clockHour } from './monthWrapped';

/** Stretches closer than this are one sitting. */
export const SITTING_GAP_MS = 10 * 60_000;
/** Fewer sittings than this say nothing about a type. */
export const MIN_SITTINGS = 4;

export type FocusStyle = 'sprinter' | 'runner' | 'diver';

export interface FocusType {
  /** "The Morning Sprinter". */
  name: string;
  phase: HourPhase;
  style: FocusStyle;
  /** Three short true facts, at most. */
  facts: string[];
}

export interface TypeStretch {
  startedAt: number;
  endedAt: number;
  seconds: number;
}

/**
 * Each sky's colour, as the Dashboard's light paints that hour (morning
 * orange, afternoon sky, evening rose, night indigo): the type's page and its
 * line on the summary.
 */
export const PHASE_COLOUR: Record<HourPhase, string> = {
  morning: 'var(--job-orange)', afternoon: 'var(--job-sky)', evening: 'var(--job-rose)', night: 'var(--job-indigo)',
};

const WHEN: Record<HourPhase, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Midnight' };
const STYLE: Record<FocusStyle, string> = { sprinter: 'Sprinter', runner: 'Runner', diver: 'Deep Diver' };

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The timer's stretches joined into sittings, each its seconds focused. */
export function sittings(stretches: readonly TypeStretch[]): number[] {
  const sorted = [...stretches].filter((s) => s.seconds > 0).sort((a, b) => a.startedAt - b.startedAt);
  const out: number[] = [];
  let end = -Infinity;
  for (const s of sorted) {
    if (out.length > 0 && s.startedAt - end <= SITTING_GAP_MS) out[out.length - 1] += s.seconds;
    else out.push(s.seconds);
    end = Math.max(end, s.endedAt);
  }
  return out;
}

export function styleOf(sittingSeconds: number): FocusStyle {
  const minutes = sittingSeconds / 60;
  if (minutes < 40) return 'sprinter';
  if (minutes < 90) return 'runner';
  return 'diver';
}

/** "about 35 minutes", "about 1h 40m". */
function sittingWords(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `about ${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `about ${m ? `${h}h ${m}m` : `${h}h`}`;
}

export function focusTypeOf(
  stretches: readonly TypeStretch[],
  prime: { from: number; to: number } | null,
  timeZone: string,
): FocusType | null {
  if (!prime) return null;
  const sits = sittings(stretches);
  if (sits.length < MIN_SITTINGS) return null;
  const phase = phaseOfHour((prime.from + 1) % 24);
  const typical = median(sits);
  const style = styleOf(typical);

  const facts: string[] = [];
  /* When a day's first stretch usually starts, to the nearest hour. */
  const firstOfDay = new Map<string, number>();
  for (const s of stretches) {
    if (s.seconds <= 0) continue;
    const day = dayOf(s.startedAt, timeZone);
    const first = firstOfDay.get(day);
    if (first === undefined || s.startedAt < first) firstOfDay.set(day, s.startedAt);
  }
  const startMinutes = [...firstOfDay.values()].map((at) => {
    const p = zonedParts(new Date(at), timeZone);
    return p.hour * 60 + p.minute;
  });
  facts.push(`Starts around ${clockHour(Math.round(median(startMinutes) / 60))}`);
  facts.push(`Sittings of ${sittingWords(typical)}`);
  /* The weekday with the most on the timer, when there is more than one to compare. */
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const s of stretches) if (s.seconds > 0) byWeekday[weekdayOfDay(dayOf(s.startedAt, timeZone))] += s.seconds;
  if (byWeekday.filter((x) => x > 0).length > 1) {
    const top = byWeekday.indexOf(Math.max(...byWeekday));
    facts.push(`${WEEKDAY_NAMES[top]}s run longest`);
  }

  return { name: `The ${WHEN[phase]} ${STYLE[style]}`, phase, style, facts };
}
