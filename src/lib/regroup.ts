/**
 * Regroup the list view (29-1P9a, idea 158, BIG-15; Linear's grouping).
 *
 * The project's list view shows its tasks by list, as it always did, or — his
 * call, 2026-10-14 — by due date or by Score. "By priority" on the idea page
 * is the Score here: `Task.priority` is a field nothing shows any more, and
 * BASE's priority is the score.
 *
 * Pure: no clock, no store, no DOM. The caller hands in the clock and the
 * zone (the score's minute tick, so a row crosses from Today to Overdue when
 * the rest of the screen does), and for Score the four facts it reads off
 * `usePriorityScores` — the same ones the row's own badges read, so a row in
 * "Red Alert" always wears the Red Alert badge.
 *
 * Done tasks always go last, in Done, whatever the grouping: a finished task
 * has no deadline to keep and no score to speak of.
 */
import { calendarDaysBetween } from './stats';
import { parseStoredDate } from './agent/dates';
import { scoreWarmth } from './warmth';

export type GroupBy = 'list' | 'due' | 'score';

export const GROUP_BYS: readonly GroupBy[] = ['list', 'due', 'score'];

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';
export type ScoreGroup = 'alert' | 'emergency' | 'hot' | 'warm' | 'rest' | 'done';

export interface GroupSpec<K extends string> {
  key: K;
  label: string;
  /** The heading's dot, a colour by its job; `null` draws none. */
  ink: string | null;
}

/**
 * The due-date groups in the order they are drawn. A date is sky (its job),
 * today lime (today's), overdue coral (about to be — already — missed); what
 * is far off or undated is a quiet grey.
 */
export const DUE_GROUPS: readonly GroupSpec<DueGroup>[] = [
  { key: 'overdue', label: 'Overdue', ink: 'var(--job-coral)' },
  { key: 'today', label: 'Today', ink: 'var(--job-lime)' },
  { key: 'tomorrow', label: 'Tomorrow', ink: 'var(--job-sky)' },
  { key: 'week', label: 'This week', ink: 'var(--job-sky)' },
  { key: 'later', label: 'Later', ink: 'var(--fg-4)' },
  { key: 'none', label: 'No date', ink: 'var(--fg-4)' },
  { key: 'done', label: 'Done', ink: 'var(--fg-4)' },
];

/**
 * The Score groups in the order they are drawn. Red Alert and an Emergency
 * are coral, as their badges are; Hot and Warm are the top and the middle of
 * P7a's warm score ramp (orange, gold), so a heading is the colour its
 * rows' score chips already are.
 */
export const SCORE_GROUPS: readonly GroupSpec<ScoreGroup>[] = [
  { key: 'alert', label: 'Red Alert', ink: 'var(--job-coral)' },
  { key: 'emergency', label: 'Emergency', ink: 'var(--job-coral)' },
  { key: 'hot', label: 'Hot', ink: 'var(--job-orange)' },
  { key: 'warm', label: 'Warm', ink: 'var(--job-gold)' },
  { key: 'rest', label: 'Everything else', ink: 'var(--fg-4)' },
  { key: 'done', label: 'Done', ink: 'var(--fg-4)' },
];

/** "This week" is the next seven days: due in 2 to 6 calendar days. */
const WEEK_DAYS = 6;

/**
 * Which due-date group a task is in. Overdue is a deadline already gone by,
 * to the minute — a task due at 9 this morning is overdue at noon, which is
 * what its row's coral words already say; Today is the rest of today.
 */
export function dueGroupOf(
  task: { status: string; deadline?: string },
  now: Date,
  timeZone: string,
): DueGroup {
  if (task.status === 'completed') return 'done';
  const at = parseStoredDate(task.deadline, timeZone);
  if (!at) return 'none';
  if (at.getTime() < now.getTime()) return 'overdue';
  const days = calendarDaysBetween(now, at, timeZone);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= WEEK_DAYS) return 'week';
  return 'later';
}

export interface ScoreFacts {
  done: boolean;
  /** `reading.redAlert`: inside its danger zone. */
  redAlert: boolean;
  /** `reading.variables.emergency > 0`: an Emergency still shouting (a lapsed one is not). */
  emergency: boolean;
  score: number;
  /** `usePriorityScores().peak`, what every score chip is drawn against. */
  peak: number;
}

/**
 * Which Score group a task is in. Hot is the top half of the warm ramp and
 * Warm the bottom half, against the highest score he has (`scoreWarmth`); the
 * bottom third of that is "Everything else", as it is the plain numeral on
 * the chip.
 */
export function scoreGroupOf(f: ScoreFacts): ScoreGroup {
  if (f.done) return 'done';
  if (f.redAlert) return 'alert';
  if (f.emergency) return 'emergency';
  const w = scoreWarmth(f.score, f.peak);
  if (w > 0.5) return 'hot';
  if (w > 0) return 'warm';
  return 'rest';
}

/**
 * Sorts tasks into the groups of `specs`, in their order, dropping the empty
 * ones. Inside a group the order is `compare`'s; the caller decides it (by
 * score, or by date then score) so this stays free of the score engine.
 */
export function groupInto<K extends string, T>(
  specs: readonly GroupSpec<K>[],
  tasks: readonly T[],
  keyOf: (task: T) => K,
  compare: (a: T, b: T) => number,
): { spec: GroupSpec<K>; tasks: T[] }[] {
  const buckets = new Map<K, T[]>();
  for (const t of tasks) {
    const k = keyOf(t);
    const b = buckets.get(k);
    if (b) b.push(t);
    else buckets.set(k, [t]);
  }
  return specs
    .filter((s) => (buckets.get(s.key)?.length ?? 0) > 0)
    .map((s) => ({ spec: s, tasks: buckets.get(s.key)!.slice().sort(compare) }));
}

/** A remembered value read back from storage, or the default when it is not one of the three. */
export function asGroupBy(value: unknown): GroupBy {
  return (GROUP_BYS as readonly unknown[]).includes(value) ? (value as GroupBy) : 'list';
}
