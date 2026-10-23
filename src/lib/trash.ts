/**
 * The three things a person can do to the Trash, each of which touches both
 * stores and therefore lives above them (neither store imports the other).
 *
 * Restoring is the only one that writes back into the app's real data.
 * Emptying and the on-load sweep only drop entries — the share documents and
 * Calendar reminders belonging to those entities were already cancelled at
 * delete time, because a public link that outlives its deletion by thirty days
 * is not a Trash, it is a leak.
 */
import { useStore, DEFAULT_LISTS, upgradeTaskNotesAndTags, upgradeTaskScoring } from '../store/useStore';
import { useTrashStore } from '../store/useTrashStore';
import { planRestore, type RestoreResult } from './trashModel';

/** Where a task goes when the list it belonged to cannot be rebuilt (see `planRestore`). */
const FALLBACK_LIST = DEFAULT_LISTS[0];

/**
 * Puts an entry back and clears it from the Trash. Returns what happened, so
 * the panel can say "…but three tasks went to Action Steps" when the list they
 * belonged to could not be rebuilt. `null` means the entry was already gone.
 *
 * The share document and Calendar reminder are not restored here and do not
 * need to be: both are rebuilt from the store by the reconcile passes that
 * `firestoreSync.ts` runs after the next write, which this restore is.
 */
export function restoreFromTrash(entryId: string): RestoreResult | null {
  const entry = useTrashStore.getState().entries.find((e) => e.id === entryId);
  if (!entry) return null;

  const { projects, taskLists, backlogTasks } = useStore.getState();
  const result = planRestore({ projects, taskLists, backlogTasks }, entry, FALLBACK_LIST);
  // A Trash entry keeps whatever shape the task was deleted in, so an entry
  // made before the two importance fields merged comes back holding them —
  // which would read as an unscored task with a score of zero. This is the
  // third door `upgradeTaskScoring` guards, after the persist migration and
  // the cloud snapshot.
  useStore.setState({ ...result.next, backlogTasks: upgradeTaskNotesAndTags(upgradeTaskScoring(result.next.backlogTasks)) });
  useTrashStore.getState().remove(entryId);
  return result;
}

export function emptyTrash(): void {
  useTrashStore.getState().empty();
}

/** The on-load sweep. Returns how many entries had passed thirty days. */
export function purgeExpiredTrash(now = Date.now()): number {
  return useTrashStore.getState().purge(now);
}
