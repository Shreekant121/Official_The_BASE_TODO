/**
 * Project board — the readings a card, a column header and a table row all
 * have to agree about (UI-29).
 *
 * `screens/project.html` defines `mins`, `totalAlloc`, `doneCount` and
 * `byScore` once at the top of the file and every one of its three surfaces
 * calls them. These are those, plus the two the app has and the prototype
 * does not — a real deadline is an ISO string rather than the literal `"1d
 * left"`, and a repeat is a rule rather than the literal `"Fortnightly ·
 * Mon, Thu · 1 of 8"`.
 *
 * Split out of the components rather than left inside one of them because
 * three files need them and none of the three is the obvious owner.
 */
import {
  countSubtasksRecursive,
  type FocusLogEntry, type Task,
} from '../../store/useStore';
import type { PriorityScores } from '../../store/usePriorityScores';
import { describeRecurrenceRule, describeSeriesStatus, resolveRule, seriesStatus } from '../../lib/recurrence';

/** `mins()`. Pre-formatted with its unit — `TaskRow.prompt.md`: "A bare
 *  number in a row is unreadable." */
export function minutesLabel(minutes: number): string {
  return `${minutes} min`;
}

/** `totalAlloc()` — the estimate still outstanding across a set of tasks. */
export function workLeftMinutes(tasks: Task[]): number {
  return tasks.reduce((n, t) => (t.status === 'completed' ? n : n + (t.estimatedTime ?? 0)), 0);
}

export function doneCount(tasks: Task[]): number {
  return tasks.filter((t) => t.status === 'completed').length;
}

/**
 * `byScore` — the order every one of the mockup's task stacks is sorted in.
 *
 * It takes the pass rather than reading a score off each task, because since
 * item 16 there is no score on a task to read: Bottleneck walks everything
 * downstream and Conductivity needs the final score of what is being blocked,
 * so scoring inside a comparator would re-walk the same subgraphs on every
 * comparison. `usePriorityScores()` has already done the walk once.
 */
export function byScoreDesc(scores: PriorityScores) {
  return (a: Task, b: Task): number => scores.scoreOf(b) - scores.scoreOf(a);
}

/**
 * Minutes actually logged against a task, from the focus log. This is the
 * mockup's `t.elapsed`, which it hardcodes; the app has the real thing and
 * has never shown it outside the session screens.
 */
export function elapsedMinutes(focusLog: FocusLogEntry[], taskId: string): number {
  let seconds = 0;
  for (const entry of focusLog) if (entry.taskId === taskId) seconds += entry.seconds;
  return Math.round(seconds / 60);
}

/* `deadlineLabel` lived here until 29-1P7a: a due date is `readDue`
   (`lib/dueDate.ts`) drawn by `task-fields/DueDate.tsx` now, one reader for
   every row. */

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly',
};

/**
 * One string for the whole repeat — the rule and where this occurrence sits
 * in it. The mockup writes `'Fortnightly · Mon, Thu · 1 of 8'` and
 * `'Monthly · last of 3'` as single `Fact`s, which is what retired the app's
 * separate series `StatusPill`: a repeat and its position are one fact about
 * one series, and splitting them put two chips on the row for it.
 */
export function repeatLabel(task: Task, now: Date, timeZone: string): string | null {
  if (!task.recurrence || task.recurrence === 'none') return null;
  const custom = task.recurrence === 'custom' ? resolveRule(task) : null;
  const rule = custom ? describeRecurrenceRule(custom) : RECURRENCE_LABELS[task.recurrence];
  if (!rule) return null;
  const note = describeSeriesStatus(seriesStatus(task, now, timeZone));
  return note ? `${rule} · ${note}` : rule;
}

/** `t.sub` — `[done, total]`, or null when a task has no subtasks. */
export function subtaskCount(task: Task): { done: number; total: number } {
  return countSubtasksRecursive(task.subtasks ?? []);
}

/**
 * When a task was finished, as the card says it (FIX-9). `completedAt` has been
 * stamped on every completion since item 19A and was never shown. Relative,
 * because "done 2 days ago" is what he reads a column of finished work for;
 * the card puts the absolute time in its tooltip. Past two months a count of
 * weeks stops meaning anything, so it becomes a date.
 */
export function doneLabel(completedAt: number, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - completedAt) / 60_000));
  if (mins < 1) return 'done just now';
  if (mins < 60) return `done ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `done ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'done yesterday';
  if (days < 14) return `done ${days} days ago`;
  if (days < 60) return `done ${Math.floor(days / 7)} weeks ago`;
  return `done ${new Date(completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

/**
 * Finished occurrences of one repeat, folded into a single row (FIX-9): "Oil
 * Hair ×14" instead of fourteen struck-through cards burying the open one.
 *
 * Grouped by **`seriesId`, never by title** — two unrelated tasks can share a
 * name, and a renamed occurrence is still the same series. Only completed
 * occurrences fold; the open one, which owns the series' future, is never
 * hidden. The row that stands for the group is the most recently finished one
 * (Shreekant's call: tapping it opens that one), and it keeps its own place in
 * the order it was handed. `count` is 1 for everything that did not fold.
 */
export function foldFinishedRepeats(tasks: Task[]): { task: Task; count: number }[] {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.seriesId) continue;
    const g = groups.get(t.seriesId);
    if (g) g.push(t); else groups.set(t.seriesId, [t]);
  }
  const latest = new Map<string, Task>();
  for (const [id, g] of groups) {
    latest.set(id, g.reduce((a, b) => (
      (b.completedAt ?? 0) > (a.completedAt ?? 0)
        || ((b.completedAt ?? 0) === (a.completedAt ?? 0) && (b.occurrence ?? 0) > (a.occurrence ?? 0))
        ? b : a
    )));
  }
  const out: { task: Task; count: number }[] = [];
  for (const t of tasks) {
    if (t.status !== 'completed' || !t.seriesId) { out.push({ task: t, count: 1 }); continue; }
    if (latest.get(t.seriesId) === t) out.push({ task: t, count: groups.get(t.seriesId)!.length });
  }
  return out;
}
