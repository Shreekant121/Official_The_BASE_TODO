/**
 * The Trash, as pure data: what a deleted thing is kept as, when it expires,
 * how much of it can be kept, and exactly what putting it back means.
 *
 * Nothing here touches the store, Firestore, or the clock — every function
 * takes the state and `now` it should work from, which is what makes the
 * thirty-day expiry and the parent-chain rebuild testable rather than
 * something you find out about a month later.
 *
 * **The Trash lives in its own document**, `users/{uid}/data/trash` (see
 * `lib/trashSync.ts`), never in the main synced document. A deleted project
 * carries every task that was inside it, so folding it into `data/main` would
 * mean deleting a project *increases* what has to fit under Firestore's 1 MiB
 * cap — the exact opposite of what the user was trying to do. Its own document
 * gets its own megabyte, and `trimTrash` keeps it under that on its own terms:
 * oldest out first, so the most recent mistake is always the one you can undo.
 */
import { firestoreValueSize } from './syncDocSize';
import type { Backref, DeletableState, DeletionKind, DeletionPlan } from './cascadeDelete';
import type { Project, Task, TaskList } from '../store/useStore';

/** How long a deleted thing is kept before the on-load sweep drops it. */
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ceiling for the trash document, well under Firestore's 1 MiB so the entry
 * wrapper and a little future drift still fit. The newest entry is never
 * dropped to satisfy it — a single deletion cannot exceed what the whole app
 * fits in, so keeping it is always safe.
 */
export const TRASH_BUDGET_BYTES = 900 * 1024;

/** Belt to the budget's braces — stops a thousand tiny deletions accumulating. */
export const TRASH_ENTRY_LIMIT = 200;

/**
 * One deletion, kept whole. A project entry holds the project, its lists and
 * every task that was in them, because that is what has to come back together.
 */
export interface TrashEntry {
  /** The entry's own id, not the entity's — the same task can be deleted, restored and deleted again. */
  id: string;
  kind: DeletionKind;
  /** What the user deleted, as they would name it. */
  title: string;
  deletedAt: number;
  projects: Project[];
  taskLists: TaskList[];
  backlogTasks: Task[];
  /** See `DeletionPlan.ancestors` — the chain that has to exist for a restore to land somewhere. */
  ancestors: { project?: Project; list?: TaskList };
  /** See `DeletionPlan.backrefs` — references cut from records that survived. */
  backrefs: { dependsOn: Backref[]; sharedListIds: Backref[] };
}

export function entryFromPlan(plan: DeletionPlan, id: string, now: number): TrashEntry {
  return {
    id,
    kind: plan.kind,
    title: plan.title,
    deletedAt: now,
    projects: plan.removed.projects,
    taskLists: plan.removed.taskLists,
    backlogTasks: plan.removed.backlogTasks,
    ancestors: plan.ancestors,
    backrefs: plan.backrefs,
  };
}

export function expiresAt(entry: TrashEntry): number {
  return entry.deletedAt + TRASH_RETENTION_MS;
}

/** Whole days left before the sweep takes it, floored at 0. */
export function daysLeft(entry: TrashEntry, now: number): number {
  return Math.max(0, Math.ceil((expiresAt(entry) - now) / (24 * 60 * 60 * 1000)));
}

/**
 * The on-load sweep. Separated from `trimTrash` because the two drop entries
 * for different reasons and the UI says different things about them.
 */
export function purgeExpired(
  entries: TrashEntry[],
  now: number,
): { kept: TrashEntry[]; purged: TrashEntry[] } {
  const kept: TrashEntry[] = [];
  const purged: TrashEntry[] = [];
  for (const entry of entries) (expiresAt(entry) <= now ? purged : kept).push(entry);
  return { kept, purged };
}

/**
 * Enforces the document budget. `entries` is newest-first, so this only ever
 * drops from the end — and never the first entry, however large it is.
 */
export function trimTrash(entries: TrashEntry[]): TrashEntry[] {
  const capped = entries.slice(0, TRASH_ENTRY_LIMIT);
  while (capped.length > 1 && firestoreValueSize(capped) > TRASH_BUDGET_BYTES) capped.pop();
  return capped;
}

/** Total size of the trash document's payload, by Firestore's own rules. */
export function trashBytes(entries: TrashEntry[]): number {
  return firestoreValueSize(entries);
}

// ─── Restore ─────────────────────────────────────────────────────────────────

/**
 * What a restore reads from an entry. A Trash entry, and since BUILD-11 an
 * Archive entry too — "Put back" is this same function, so the two cannot
 * disagree about where a thing lands.
 */
export type RestorableEntry = Pick<TrashEntry, 'projects' | 'taskLists' | 'backlogTasks' | 'ancestors' | 'backrefs'>;

export interface RestoreResult {
  /** The slices to write back. Today's focus queue is deliberately not among them. */
  next: Pick<DeletableState, 'projects' | 'taskLists' | 'backlogTasks'>;
  /** Tasks whose list could not be rebuilt and that landed in the fallback list instead. */
  reroutedTaskIds: string[];
}

/**
 * Puts an entry back.
 *
 * The order matters: project, then list, then task. A task restored into a
 * list that no longer exists is invisible — it belongs to nothing the UI ever
 * renders — so the chain above it is rebuilt first, from the ancestors
 * snapshotted at delete time. Only when that is impossible (an entry written
 * before ancestors were recorded, or a list whose project has been deleted and
 * whose own snapshot is gone) does a task fall back to `fallbackList`, which
 * the caller passes as Action Steps.
 *
 * Everything is additive and id-checked, so restoring twice is harmless.
 */
export function planRestore(
  state: Pick<DeletableState, 'projects' | 'taskLists' | 'backlogTasks'>,
  entry: RestorableEntry,
  fallbackList: Pick<TaskList, 'id' | 'title'>,
): RestoreResult {
  const projects = [...state.projects];
  const projectIds = new Set(projects.map((p) => p.id));
  const addProject = (p: Project | undefined) => {
    if (!p || projectIds.has(p.id)) return;
    projects.push(p);
    projectIds.add(p.id);
  };

  addProject(entry.ancestors.project);
  for (const p of entry.projects) addProject(p);

  const taskLists = [...state.taskLists];
  const listIds = new Set(taskLists.map((l) => l.id));
  const addList = (l: TaskList | undefined) => {
    if (!l || listIds.has(l.id)) return;
    // A list whose project is gone renders nowhere, so restoring it would only
    // hide the tasks inside it. Leave it out and let them reroute instead.
    if (l.projectId && !projectIds.has(l.projectId)) return;
    taskLists.push(l);
    listIds.add(l.id);
  };

  addList(entry.ancestors.list);
  for (const l of entry.taskLists) addList(l);

  const backlogTasks = [...state.backlogTasks];
  const taskIds = new Set(backlogTasks.map((t) => t.id));
  const reroutedTaskIds: string[] = [];
  for (const task of entry.backlogTasks) {
    if (taskIds.has(task.id)) continue;
    const landed = task.listId && listIds.has(task.listId)
      ? task
      : { ...task, listId: fallbackList.id, listName: fallbackList.title };
    if (landed !== task) reroutedTaskIds.push(task.id);
    backlogTasks.push(landed);
    taskIds.add(task.id);
  }

  // A task in the entry kept its own references whole — nothing outside the
  // entry cut them — so one can point at a task or list deleted and purged
  // after this entry went in. Keep only the ones that now resolve, by the
  // rule the reattach below follows. Run after every task has landed, so a
  // link between two tasks of this entry survives. An emptied list stays `[]`,
  // as the delete's own cut leaves it — never `undefined` in synced data.
  for (let i = state.backlogTasks.length; i < backlogTasks.length; i++) {
    const task = backlogTasks[i];
    const dependsOn = task.dependsOn?.filter((id) => taskIds.has(id));
    const sharedListIds = task.sharedListIds?.filter((id) => listIds.has(id));
    if (dependsOn?.length === task.dependsOn?.length && sharedListIds?.length === task.sharedListIds?.length) continue;
    backlogTasks[i] = {
      ...task,
      ...(dependsOn && { dependsOn }),
      ...(sharedListIds && { sharedListIds }),
    };
  }

  // Sew the cut references back on, but only the ones that now resolve —
  // a prerequisite that was itself deleted and purged stays gone rather than
  // coming back as a dangling id.
  const reattach = (refs: Backref[], field: 'dependsOn' | 'sharedListIds', exists: Set<string>) => {
    for (const ref of refs) {
      const index = backlogTasks.findIndex((t) => t.id === ref.taskId);
      if (index === -1) continue;
      const restorable = ref.ids.filter((id) => exists.has(id));
      if (restorable.length === 0) continue;
      const current = backlogTasks[index][field] ?? [];
      const merged = [...current, ...restorable.filter((id) => !current.includes(id))];
      backlogTasks[index] = { ...backlogTasks[index], [field]: merged };
    }
  };
  reattach(entry.backrefs.dependsOn, 'dependsOn', taskIds);
  reattach(entry.backrefs.sharedListIds, 'sharedListIds', listIds);

  return { next: { projects, taskLists, backlogTasks }, reroutedTaskIds };
}

// ─── Summary line for the Trash panel ────────────────────────────────────────

/**
 * "3 lists · 12 tasks" — what a row says it will bring back *with* it. A task
 * entry describes nothing: "1 task" next to a row already labelled Task is
 * noise, not information.
 */
export function describeEntryContents(entry: TrashEntry): string {
  if (entry.kind === 'task') return '';
  const parts: string[] = [];
  // The projects that went inside it (BIG-2) — the row names the first.
  const inside = entry.projects.length - 1;
  if (entry.kind === 'project' && inside > 0) {
    parts.push(`${inside} project${inside === 1 ? '' : 's'} inside`);
  }
  if (entry.taskLists.length > 0) {
    parts.push(`${entry.taskLists.length} list${entry.taskLists.length === 1 ? '' : 's'}`);
  }
  if (entry.backlogTasks.length > 0) {
    parts.push(`${entry.backlogTasks.length} task${entry.backlogTasks.length === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'empty';
}

/** Day and month, no year and no time — enough to place a deletion inside a thirty-day window. */
export function formatDeletedAt(deletedAt: number): string {
  return new Date(deletedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
