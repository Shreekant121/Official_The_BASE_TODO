/**
 * A project's own Backburner (idea 91, 29-1P6c, his call 2026-10-12).
 *
 * The app has always had ONE shared Backburner, the fixed list
 * `DEFAULT_LISTS[1]` (id `backburner`, in no project), and a task parked there
 * left its project: no board shows that list. He asked instead for each
 * project to have its own, hidden from the board until it is pulled down.
 *
 * It is not a new kind of thing. A project's Backburner is any of its lists
 * whose name is "Backburner" — however it is spelt, with an emoji, in capitals
 * — so a list he already made under that name becomes it, a task moves there
 * with the ordinary list picker, and nothing about how tasks are stored
 * changes. The shared list keeps its fixed id and is untouched.
 *
 * Pure: no store, no React. `priority.ts` reads it too, so a parked task is
 * scored as calmly as one in the shared Backburner.
 */
import type { TaskList } from '../store/useStore';

/** What a project's Backburner list is called when the app makes one. */
export const BACKBURNER_TITLE = 'Backburner';

/** "Backburner", "🧊 Backburner", "back-burner", "BACKBURNER" all count. */
export function isBackburnerTitle(title: string | undefined): boolean {
  if (!title) return false;
  return title.toLowerCase().replace(/[^a-z]/g, '') === 'backburner';
}

/** A list inside a project that is that project's Backburner. */
export function isProjectBackburner(list: Pick<TaskList, 'projectId' | 'title'>): boolean {
  return !!list.projectId && isBackburnerTitle(list.title);
}

/** A project's lists, split into what its board shows and what is parked behind the pull. */
export function splitParked<L extends Pick<TaskList, 'projectId' | 'title'>>(
  lists: readonly L[],
): { board: L[]; parked: L[] } {
  const board: L[] = [];
  const parked: L[] = [];
  for (const list of lists) (isProjectBackburner(list) ? parked : board).push(list);
  return { board, parked };
}
