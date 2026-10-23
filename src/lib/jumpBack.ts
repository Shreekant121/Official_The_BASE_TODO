/**
 * Jump back in (29-1P8c, idea 154): the last few projects he had open, and
 * where he was in each.
 *
 * Pure — no store, no clock, no storage — so `jumpBack.test.ts` holds it.
 * `store/useJumpBackStore.ts` keeps the list on this device (his call: the
 * laptop and the tablet each remember their own, like a board's view and
 * density), the project page writes to it, and Home's row and Ctrl+K's empty
 * box read it.
 *
 * HIS CALLS, 2026-10-13 (`docs/design/home-shape.html`, option D): small
 * cards with their covers, four of them, and the same four at the top of
 * Ctrl+K before anything is typed. What counts as "open" is any project page,
 * either board of two side by side; "where" is the list and the task he last
 * opened or ticked there, and how far down he had scrolled; a tap lands
 * there and the task glows once.
 *
 * More are kept than are shown, so a project deleted or archived (it leaves
 * the store outright, BUILD-11) drops out of the row without leaving it short.
 */
import { calendarDaysBetween } from './stats';

export interface JumpSpot {
  projectId: string;
  /** When he was last there, ms. */
  at: number;
  /** The list of the task below, or a list he was in. */
  listId?: string;
  /** The task he last opened or ticked there. */
  taskId?: string;
  /** How far down the board's scroller was, px. */
  scrollTop?: number;
}

/** How many are remembered — more than are shown, so deletions do not shorten the row. */
export const JUMP_KEEP = 12;
/** How many Home and Ctrl+K show (his call). */
export const JUMP_SHOWN = 4;

/** He opened `projectId`: it moves to the front, keeping where he was in it. */
export function visit(spots: readonly JumpSpot[], projectId: string, now: number): JumpSpot[] {
  const old = spots.find((s) => s.projectId === projectId);
  const next: JumpSpot = { ...old, projectId, at: now };
  return [next, ...spots.filter((s) => s.projectId !== projectId)].slice(0, JUMP_KEEP);
}

/** He opened or ticked a task there: that is where he is now. */
export function noteTask(
  spots: readonly JumpSpot[], projectId: string, task: { id: string; listId?: string }, now: number,
): JumpSpot[] {
  const old = spots.find((s) => s.projectId === projectId);
  const next: JumpSpot = { ...old, projectId, at: now, taskId: task.id, listId: task.listId };
  return [next, ...spots.filter((s) => s.projectId !== projectId)].slice(0, JUMP_KEEP);
}

/**
 * He scrolled. Neither the order nor the time moves — scrolling a board is
 * not a visit — and a project not in the list is left out (it gets in by
 * `visit`, which the page calls first).
 */
export function noteScroll(spots: readonly JumpSpot[], projectId: string, scrollTop: number): JumpSpot[] {
  const top = Math.max(0, Math.round(scrollTop));
  if (!spots.some((s) => s.projectId === projectId && s.scrollTop !== top)) return spots as JumpSpot[];
  return spots.map((s) => (s.projectId === projectId ? { ...s, scrollTop: top } : s));
}

/** The ones to show: still in the store, newest first, at most `n`. */
export function shownSpots(spots: readonly JumpSpot[], liveProjectIds: ReadonlySet<string>, n = JUMP_SHOWN): JumpSpot[] {
  return spots.filter((s) => liveProjectIds.has(s.projectId)).slice(0, n);
}

/**
 * Where he was, in words: "Build list · at “Rewrite the copy”", the list
 * alone when the task is gone, nothing when neither is known. A list title
 * that already ends in "list" is not given a second one.
 */
export function whereLine(listTitle: string | undefined, taskTitle: string | undefined): string {
  const list = listTitle?.trim();
  const named = list ? (/\blist$/i.test(list) ? list : `${list} list`) : '';
  const task = taskTitle?.trim();
  if (named && task) return `${named} · at “${task}”`;
  if (task) return `at “${task}”`;
  return named;
}

/**
 * When, coarser the further back: "just now", "12 min ago", "3 h ago",
 * "yesterday", the weekday inside a week, then "9 Oct". Days are calendar
 * days in his zone (`calendarDaysBetween`), so 11pm to 1am is "yesterday".
 */
export function whenLabel(at: number, now: number, timeZone: string): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 2) return 'just now';
  const days = calendarDaysBetween(new Date(at), new Date(now), timeZone);
  if (days <= 0) {
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)} h ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 7) return new Date(at).toLocaleDateString('en-GB', { weekday: 'short', timeZone });
  return new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
}
