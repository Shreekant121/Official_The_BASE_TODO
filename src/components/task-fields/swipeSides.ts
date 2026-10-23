/**
 * The two looks of a swiped task row (idea 17, 29-1P6b; `ui/core/SwipeRow`).
 * One file so the board card, the list view and New Session cannot drift:
 * right is Done in lime (done's colour), left is "start it tomorrow" in sky
 * (a date's colour), his calls 2026-10-12.
 */
import type { SwipeSide } from '../../ui/core/SwipeRow';

/** Right: Done — or, on a finished task, back to not done; a locked task only gives. */
export function doneSide(done: boolean, locked: boolean, run: (row: HTMLElement) => void): SwipeSide {
  if (locked && !done) return { label: 'Locked', icon: 'lock', colour: 'var(--fg-4)' };
  return done
    ? { label: 'Not done', icon: 'undo-2', colour: 'var(--fg-3)', run }
    : { label: 'Done', icon: 'check', colour: 'var(--job-lime)', run };
}

/** Left: start it tomorrow. Absent on a finished task — there is nothing to start. */
export function tomorrowSide(done: boolean, run: (row: HTMLElement) => void): SwipeSide | null {
  return done ? null : { label: 'Tomorrow', icon: 'calendar-plus', colour: 'var(--job-sky)', run };
}
