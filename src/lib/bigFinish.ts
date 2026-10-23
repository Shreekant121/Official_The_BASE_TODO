/**
 * What a press just finished that earns confetti (29-1P14a, idea 2). Pure:
 * the backlog before and after one write, the projects and the lists.
 *
 * His call (2026-10-15): confetti for **a finished project, a finished
 * milestone and a perfect day** — "only for real milestones", as the idea
 * card says, so an ordinary tick never gets it. The perfect day is not a
 * press (the hours are met while a clock runs) and is watched elsewhere
 * (`components/MomentsHost.tsx`); this file answers the other two.
 *
 * - **A milestone** is `Task.milestone` (29-1P9b), finished by this write.
 * - **A project is finished** when this write ticked the last open task of
 *   its whole tree — the board's own "100% done" (`subtreeTasks`, the count
 *   `ProjectView` draws), for the project the task is in or any project
 *   above it. A project with nothing in it is never "finished".
 *
 * Only a task that was already there and open counts. A Trash restore brings
 * back finished tasks that were not in the backlog a moment ago, and a
 * repeating task's next copy arrives open, so neither finishes anything.
 */
import { buildProjectTree, subtreeTasks } from './projectTree';
import type { Project, Task, TaskList } from '../store/useStore';

export type BigFinish = 'project' | 'milestone';

export function bigFinish(
  before: readonly Task[],
  after: readonly Task[],
  projects: readonly Project[],
  lists: readonly TaskList[],
): BigFinish | null {
  const was = new Map(before.map((t) => [t.id, t]));
  const finished = after.filter((t) => {
    if (t.status !== 'completed') return false;
    const old = was.get(t.id);
    return !!old && old.status !== 'completed';
  });
  if (finished.length === 0) return null;

  /* Which projects to check: each finished task's own, and every one above. */
  const tree = buildProjectTree(projects);
  const listProject = new Map(lists.map((l) => [l.id, l.projectId]));
  const candidates = new Set<string>();
  for (const t of finished) {
    for (const listId of [t.listId, ...(t.sharedListIds ?? [])]) {
      const projectId = listId ? listProject.get(listId) : undefined;
      if (!projectId) continue;
      candidates.add(projectId);
      for (const up of tree.ancestorsOf(projectId)) candidates.add(up.id);
    }
  }
  const allDone = (tasks: readonly Task[]) => tasks.length > 0 && tasks.every((t) => t.status === 'completed');
  for (const id of candidates) {
    if (allDone(subtreeTasks(tree, lists, after, id)) && !allDone(subtreeTasks(tree, lists, before, id))) {
      return 'project';
    }
  }
  return finished.some((t) => t.milestone) ? 'milestone' : null;
}
