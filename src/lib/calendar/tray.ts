/**
 * The tray of undated tasks (29-2e3b, idea 125) — pure: no React, no store.
 * Beside the Calendar's hours, his tasks with no deadline, the best first;
 * dragged onto the hours one gets a time, with 29-2e3a's magnet and drop
 * (`snapDrag.ts`), and a block dragged back onto the tray loses its date.
 *
 * HIS CALLS (2026-10-22)
 * ----------------------
 * - **Behind a button**: "No date" in the Calendar's header opens it, and
 *   closed the hours keep the whole screen.
 * - **Both ways**: a block dropped on the tray (or, closed, on its button)
 *   has its deadline taken off and is undated again.
 * - **All of them**, highest score first, the tray scrolling.
 *
 * THE SESSION'S CALLS
 * -------------------
 * - **What is in it** is what the hours would draw if it had a date: an open
 *   top-level task that is not ignored (BIG-3), as `timelineItems` reads.
 * - **A repeating task keeps its date**: its series is counted from it
 *   (`lib/recurrence.ts`), so it never goes back to the tray; it shakes, as
 *   a block that cannot move does. One due before an event cannot be held
 *   at all (`dragRefusal`).
 */
import { resolveRule, type RecurrenceSource } from '../recurrence';

export interface TrayCandidate {
  id: string;
  title: string;
  status: string;
  deadline?: string;
  parent?: string;
}

/** The tray's tasks, the highest score first, then by name. */
export function trayTasks<T extends TrayCandidate>(
  tasks: readonly T[],
  scoreOf: (task: T) => number,
  ignored: ReadonlySet<string>,
): T[] {
  const open = tasks.filter((t) => t.status !== 'completed' && !t.deadline && !t.parent && !ignored.has(t.id));
  const score = new Map(open.map((t) => [t.id, scoreOf(t)]));
  return open.sort((a, b) => score.get(b.id)! - score.get(a.id)! || a.title.localeCompare(b.title));
}

/** Why a block cannot go back onto the tray, or null when it can. */
export type UndateRefusal = 'repeat';

/** A repeating task keeps its date: the series is measured from it. */
export function undateRefusal(task: RecurrenceSource): UndateRefusal | null {
  return resolveRule(task) ? 'repeat' : null;
}
