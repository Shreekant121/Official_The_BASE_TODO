/**
 * The three things a person does with the Archive (BUILD-11), each touching
 * more than one store and therefore living above them, as `lib/trash.ts` does
 * for the Trash.
 *
 * Every menu that offers Archive calls these rather than the store action, so
 * the sentence that follows is the same everywhere. Atlas has no archive tool;
 * the store actions stay free of anything said on screen, which is what keeps
 * `mcp/` (the same store, in Node) from needing a UI store to load.
 */
import { useStore, DEFAULT_LISTS, upgradeTaskScoring } from '../store/useStore';
import { useArchiveStore } from '../store/useArchiveStore';
import { useUIStore } from '../store/useUIStore';
import { planRestore, type RestoreResult } from './trashModel';

/** Where a task goes when the list it belonged to cannot be rebuilt — the Trash's rule. */
const FALLBACK_LIST = DEFAULT_LISTS[0];

const FULL = {
  title: 'The archive is full',
  detail: 'Nothing was archived. Put something back, or delete it instead.',
  tone: 'overrun' as const,
};

export function archiveProject(id: string): boolean {
  const project = useStore.getState().projects.find((p) => p.id === id);
  if (!project) return false;
  const name = project.name || 'Untitled project';
  const ok = useStore.getState().archiveProject(id);
  useUIStore.getState().showArchiveNotice(ok
    ? { title: `Archived ${name}`, detail: 'On the shelf · Settings → Archive' }
    : FULL);
  return ok;
}

/** A top-level task only. A subtask archives with its parent; the callers do not offer it. */
export function archiveTask(id: string): boolean {
  const task = useStore.getState().backlogTasks.find((t) => t.id === id);
  if (!task) return false;
  const title = task.title || 'Untitled task';
  const ok = useStore.getState().archiveBacklogTask(id);
  useUIStore.getState().showArchiveNotice(ok
    ? { title: `Archived ${title}`, detail: 'Out of every queue · Settings → Archive' }
    : FULL);
  return ok;
}

/**
 * Takes an entry off the shelf, through the Trash's own `planRestore`, so the
 * two can never disagree about where a thing lands. A project goes back to
 * Home with its lists and tasks; **nothing re-enters today's queue** — the
 * design's note, and the Trash's rule too. Its calendar blocks come back on
 * the next reconcile pass, which this write triggers. `null` means the entry
 * was already gone.
 */
export function putBackFromArchive(entryId: string): RestoreResult | null {
  const entry = useArchiveStore.getState().entries.find((e) => e.id === entryId);
  if (!entry) return null;

  const { projects, taskLists, backlogTasks } = useStore.getState();
  const result = planRestore({ projects, taskLists, backlogTasks }, entry, FALLBACK_LIST);
  // An entry keeps whatever shape it was archived in, for good — so it passes
  // through the same scoring upgrade the Trash's restore does.
  useStore.setState({ ...result.next, backlogTasks: upgradeTaskScoring(result.next.backlogTasks) });
  useArchiveStore.getState().remove(entryId);
  return result;
}
