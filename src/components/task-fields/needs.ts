/**
 * What a task is still missing, as a list rather than as four booleans (UI-26).
 *
 * The four things are `taskNeedsAttention()`'s four, arriving as
 * `useTaskDraft`'s `missing`. The source's own list is five — it splits the
 * score across two inputs — but this app has one importance dial and
 * `isTaskScored` reads that one field, and the nav badge counts by it. A fifth
 * entry would put a number on the sheet that the badge disagrees with, which
 * is the one thing UI-9's rule forbids. (Item 7 merged the two inputs the
 * source still splits, which makes this divergence smaller, not larger.)
 *
 * Separate from `NeedsPills.tsx` only because a file that exports both a
 * component and a constant loses fast refresh.
 */
import type { TaskDraftMissing } from './useTaskDraft';

/** Which field a Needs pill points at. Matches `TaskDraftMissing`'s keys. */
export type NeedId = keyof TaskDraftMissing;

/** In the order the sheet's columns present them. */
export const NEED_LABELS: ReadonlyArray<readonly [NeedId, string]> = [
  ['score', 'Score'],
  ['deadline', 'Deadline'],
  ['estimate', 'Estimate'],
  ['description', 'Description'],
];

export function countNeeds(missing: TaskDraftMissing): number {
  return NEED_LABELS.reduce((n, [id]) => n + (missing[id] ? 1 : 0), 0);
}
