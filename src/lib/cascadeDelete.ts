/**
 * What "delete" actually has to touch — worked out as pure data, so it can be
 * tested without a browser and so every delete path in the app agrees.
 *
 * A task is not one row. It is a row in `backlogTasks`, possibly a snapshot
 * copy in today's focus queue (`tasks`), possibly a *subtask proxy* row in
 * that queue standing in for one of its subtasks, an entry in some other
 * task's `dependsOn`, a `publicShares/{shareId}` document anyone with the link
 * can still read, and a Google Calendar event that will fire a reminder for a
 * deadline that no longer exists. Before this module, `deleteBacklogTask` was
 * a one-line filter over `backlogTasks` and each of the six call sites patched
 * up whichever of the rest it happened to remember.
 *
 * Nothing here mutates or performs I/O. A planner reads the current slices and
 * returns the slices as they should be, plus a list of what left (for the
 * Trash) and what still has to be cleaned up outside the store (share
 * documents, calendar events). The store applies the first part; the trash
 * store keeps the second; `lib/deletionCleanup.ts` performs the third.
 *
 * Deliberately covers projects, lists and top-level tasks only. Deleting a
 * *subtask* is small and obviously intentional, and subtasks are nested values
 * with no parent pointer — restoring one would mean rebuilding a position, not
 * a reference. That is a settled scope decision, not an oversight.
 */
import type { Project, Task, TaskList } from '../store/useStore';

/** The store slices a deletion can touch. */
export interface DeletableState {
  projects: Project[];
  taskLists: TaskList[];
  backlogTasks: Task[];
  /** Today's focus queue — snapshot copies, see CLAUDE.md. */
  tasks: Task[];
}

export type DeletionKind = 'project' | 'list' | 'task';

/**
 * A reference that pointed *into* what was deleted and had to be cut from a
 * record that survived. Kept so a restore can sew it back on rather than
 * returning a task that has quietly lost its prerequisites.
 */
export interface Backref {
  /** The surviving task the reference was cut from. */
  taskId: string;
  /** The ids removed from that task's `dependsOn` / `sharedListIds`. */
  ids: string[];
}

export interface DeletionPlan {
  kind: DeletionKind;
  /** What the user will recognise it as, for the Trash row. */
  title: string;
  /** `false` when the id matched nothing — callers skip the trash write. */
  matched: boolean;
  /** The slices as they should be once the deletion is applied. */
  next: DeletableState;
  /** Everything that left the store, verbatim. */
  removed: {
    projects: Project[];
    taskLists: TaskList[];
    backlogTasks: Task[];
  };
  /**
   * Ancestors that were *not* deleted, snapshotted so a restore can rebuild
   * the chain even if they have since been deleted themselves — a task
   * remembers its list and that list's project, a list remembers its project.
   */
  ancestors: { project?: Project; list?: TaskList };
  /** References cut from records that survived. */
  backrefs: { dependsOn: Backref[]; sharedListIds: Backref[] };
  /** `publicShares/{id}` documents with nothing left behind them. */
  shareIds: string[];
  /** Tasks carrying a deadline, whose Google Calendar reminder must be cancelled. */
  calendarTaskIds: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Every id in a task's subtask tree, at any depth. Subtask ids are globally unique. */
function subtaskIds(task: Task): string[] {
  const out: string[] = [];
  const walk = (subs: Task['subtasks']) => {
    for (const s of subs ?? []) {
      out.push(s.id);
      walk(s.subtasks);
    }
  };
  walk(task.subtasks);
  return out;
}

function shareIdsOf(entities: { shareId?: string }[]): string[] {
  return entities.map((e) => e.shareId).filter((id): id is string => !!id);
}

/**
 * The removal itself, shared by all three planners so a project delete cleans
 * up exactly the way a single task delete does.
 */
function applyRemoval(
  state: DeletableState,
  removedProjects: Project[],
  removedLists: TaskList[],
  removedTasks: Task[],
): Pick<DeletionPlan, 'next' | 'removed' | 'backrefs' | 'shareIds' | 'calendarTaskIds'> {
  const removedTaskIds = new Set(removedTasks.map((t) => t.id));
  const removedListIds = new Set(removedLists.map((l) => l.id));
  // A proxy row in the focus queue shares its id with the subtask it stands
  // in for, so a subtask goes out of the queue with the task that owned it.
  const removedSubtaskIds = new Set(removedTasks.flatMap(subtaskIds));

  const dependsOn: Backref[] = [];
  const sharedListIds: Backref[] = [];

  /** Cuts references to what is going away, recording each cut for the restore. */
  const detach = (task: Task, record: boolean): Task => {
    let next = task;

    const cutDeps = task.dependsOn?.filter((id) => removedTaskIds.has(id)) ?? [];
    if (cutDeps.length > 0) {
      next = { ...next, dependsOn: task.dependsOn!.filter((id) => !removedTaskIds.has(id)) };
      if (record) dependsOn.push({ taskId: task.id, ids: cutDeps });
    }

    const cutShares = task.sharedListIds?.filter((id) => removedListIds.has(id)) ?? [];
    if (cutShares.length > 0) {
      next = { ...next, sharedListIds: task.sharedListIds!.filter((id) => !removedListIds.has(id)) };
      if (record) sharedListIds.push({ taskId: task.id, ids: cutShares });
    }

    return next;
  };

  const nextBacklog = state.backlogTasks
    .filter((t) => !removedTaskIds.has(t.id))
    .map((t) => detach(t, true));

  // The queue loses the deleted rows, the proxies for their subtasks, and
  // anything that belonged to a list that has gone. Its surviving rows are
  // snapshots of backlog tasks, so their references are cut the same way —
  // but not recorded twice, the backlog pass above already has them.
  const nextQueue = state.tasks
    .filter((t) => !removedTaskIds.has(t.id))
    .filter((t) => !(t.isSubtaskProxy && removedSubtaskIds.has(t.id)))
    .filter((t) => !(t.listId && removedListIds.has(t.listId)))
    .map((t) => detach(t, false));

  return {
    next: {
      projects: removedProjects.length === 0
        ? state.projects
        : state.projects.filter((p) => !removedProjects.some((r) => r.id === p.id)),
      taskLists: removedLists.length === 0
        ? state.taskLists
        : state.taskLists.filter((l) => !removedListIds.has(l.id)),
      backlogTasks: nextBacklog,
      tasks: nextQueue,
    },
    removed: { projects: removedProjects, taskLists: removedLists, backlogTasks: removedTasks },
    backrefs: { dependsOn, sharedListIds },
    shareIds: [
      ...shareIdsOf(removedProjects),
      ...shareIdsOf(removedLists),
      ...shareIdsOf(removedTasks),
    ],
    // A task with no deadline never had an event; asking Google to delete one
    // would be a wasted round trip per task on every project deletion.
    calendarTaskIds: removedTasks.filter((t) => !!t.deadline).map((t) => t.id),
  };
}

function noMatch(kind: DeletionKind, state: DeletableState): DeletionPlan {
  return {
    kind,
    title: '',
    matched: false,
    next: state,
    removed: { projects: [], taskLists: [], backlogTasks: [] },
    ancestors: {},
    backrefs: { dependsOn: [], sharedListIds: [] },
    shareIds: [],
    calendarTaskIds: [],
  };
}

// ─── Planners ────────────────────────────────────────────────────────────────

export function planTaskDeletion(state: DeletableState, taskId: string): DeletionPlan {
  const task = state.backlogTasks.find((t) => t.id === taskId);
  if (!task) return noMatch('task', state);

  const list = state.taskLists.find((l) => l.id === task.listId);
  const project = list?.projectId ? state.projects.find((p) => p.id === list.projectId) : undefined;

  return {
    kind: 'task',
    title: task.title,
    matched: true,
    ancestors: { project, list },
    ...applyRemoval(state, [], [], [task]),
  };
}

export function planListDeletion(state: DeletableState, listId: string): DeletionPlan {
  const list = state.taskLists.find((l) => l.id === listId);
  if (!list) return noMatch('list', state);

  const project = list.projectId ? state.projects.find((p) => p.id === list.projectId) : undefined;
  const tasks = state.backlogTasks.filter((t) => t.listId === listId);

  return {
    kind: 'list',
    title: list.title,
    matched: true,
    ancestors: { project },
    ...applyRemoval(state, [], [list], tasks),
  };
}

export function planProjectDeletion(state: DeletableState, projectId: string): DeletionPlan {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return noMatch('project', state);

  const lists = state.taskLists.filter((l) => l.projectId === projectId);
  const listIds = new Set(lists.map((l) => l.id));
  const tasks = state.backlogTasks.filter((t) => !!t.listId && listIds.has(t.listId));

  return {
    kind: 'project',
    title: project.name,
    matched: true,
    ancestors: {},
    ...applyRemoval(state, [project], lists, tasks),
  };
}
