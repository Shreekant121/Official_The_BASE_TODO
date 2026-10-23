/**
 * Work that ignores the score and the deadline (BIG-3) — the one answer to
 * "is this task ignored, and why?", pure and tested.
 *
 * Shreekant can mark a task, a list, a project or a whole mega project as
 * ignored. **His calls, 2026-09-29:** it is invisible to the queue, never
 * offered by Smart Start, never in Needs Attention, fully visible on its own
 * board, and no deadline maths touches it. Ignoring a project ignores
 * **everything inside it, at any depth**, and nothing inside can opt back in —
 * so there is exactly one way for a task to be un-ignored: nothing above it,
 * and nothing on it, says so.
 *
 * Three fields hold it (`Task.ignored`, `TaskList.ignored`, `Project.ignored`)
 * and **every reader asks this module, never a field**: the flag that counts
 * may be two projects up. The project chain is walked through
 * `lib/projectTree.ts`, so a parent that is gone or a synced cycle cannot make
 * a project inherit from something that is not drawn above it.
 *
 * A task belongs where its own `listId` puts it. A task *shared* into an
 * ignored list is not ignored by that — it is still offered through the list
 * it lives in, which is the one its board draws it under.
 */
import type { Project, Subtask, Task, TaskList } from '../store/useStore';
import { buildProjectTree } from './projectTree';

/** What made a task, list or project ignored — the thing the sentence names. */
export type IgnoreSource =
  | { kind: 'task' }
  | { kind: 'list'; list: TaskList }
  | { kind: 'project'; project: Project };

export interface IgnoredWork {
  /**
   * Every ignored task id: the top-level tasks, and every subtask under one at
   * any depth — a subtask dragged into today's queue carries its own id.
   */
  ids: ReadonlySet<string>;
  /**
   * Whether a task — top-level, or a subtask stand-in — is ignored, **as the
   * backlog says**. A task's own flag is read off the backlog record, never
   * off the object handed in: today's queue holds copies, and a copy taken
   * before the switch was turned off would otherwise stay ignored all day.
   */
  has: (task: Pick<Task, 'id' | 'listId'>) => boolean;
  /**
   * Why a task is ignored, or undefined when it is not. The switch highest up
   * wins: turning off the task's own would change nothing while its project's
   * is on.
   */
  reasonOf: (task: Pick<Task, 'id' | 'listId'>) => IgnoreSource | undefined;
  /** Why a list is ignored: its own flag, or a project at or above it. */
  listReason: (listId: string | undefined) => IgnoreSource | undefined;
  /** Why a project is ignored: its own flag, or one above it. */
  projectReason: (projectId: string | undefined) => IgnoreSource | undefined;
}

function collectSubtaskIds(subtasks: readonly Subtask[] | undefined, into: Set<string>): void {
  for (const s of subtasks ?? []) {
    into.add(s.id);
    collectSubtaskIds(s.subtasks, into);
  }
}

export function ignoredWork(
  tasks: readonly Task[],
  lists: readonly TaskList[],
  projects: readonly Project[],
): IgnoredWork {
  const tree = buildProjectTree(projects);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const listById = new Map(lists.map((l) => [l.id, l]));

  const projectCache = new Map<string, IgnoreSource | undefined>();
  const projectReason = (projectId: string | undefined): IgnoreSource | undefined => {
    if (!projectId) return undefined;
    if (projectCache.has(projectId)) return projectCache.get(projectId);
    const project = projectById.get(projectId);
    let reason: IgnoreSource | undefined;
    if (project) {
      // The outermost ignored project is the one named: it is the switch that
      // has to be turned off, and a nearer one would only send him looking.
      for (const p of [...tree.ancestorsOf(projectId), project]) {
        if (p.ignored) { reason = { kind: 'project', project: p }; break; }
      }
    }
    projectCache.set(projectId, reason);
    return reason;
  };

  const listReason = (listId: string | undefined): IgnoreSource | undefined => {
    if (!listId) return undefined;
    const list = listById.get(listId);
    if (!list) return undefined;
    return projectReason(list.projectId) ?? (list.ignored ? { kind: 'list', list } : undefined);
  };

  const ids = new Set<string>();
  for (const task of tasks) {
    if (task.parent) continue;
    if (task.ignored || listReason(task.listId)) {
      ids.add(task.id);
      collectSubtaskIds(task.subtasks, ids);
    }
  }

  const reasonOf = (task: Pick<Task, 'id' | 'listId'>): IgnoreSource | undefined =>
    listReason(task.listId) ?? (ids.has(task.id) ? { kind: 'task' } : undefined);

  return {
    ids,
    has: (task) => ids.has(task.id) || !!listReason(task.listId),
    reasonOf,
    listReason,
    projectReason,
  };
}

/** A thing that can be ignored, as the switch on it is named. */
export interface IgnoreSubject {
  kind: 'task' | 'list' | 'project';
  id: string;
}

/**
 * Whether `reason` is the subject's own switch rather than one above it. A
 * project inside an ignored project is ignored by a *project* too, so the kind
 * alone cannot tell the two apart.
 */
export function isOwnSwitch(reason: IgnoreSource, self: IgnoreSubject): boolean {
  if (reason.kind !== self.kind) return false;
  if (reason.kind === 'list') return reason.list.id === self.id;
  if (reason.kind === 'project') return reason.project.id === self.id;
  return true;
}

/**
 * The sentence a screen prints under something ignored. `self` is what the
 * sentence is about, so a list ignored by its own switch reads "Ignored" and
 * not "Ignored because this list is".
 */
export function ignoreSentence(reason: IgnoreSource, self: IgnoreSubject): string {
  if (isOwnSwitch(reason, self)) return 'Ignored — never scored or offered';
  if (reason.kind === 'list') return `Ignored because the list "${reason.list.title}" is`;
  if (reason.kind === 'project') return `Ignored because the project "${reason.project.name}" is`;
  return 'Ignored — never scored or offered';
}

/** A short reason for a picker row or a badge's title. */
export function ignoreShort(reason: IgnoreSource): string {
  if (reason.kind === 'list') return `Ignored with "${reason.list.title}"`;
  if (reason.kind === 'project') return `Ignored with "${reason.project.name}"`;
  return 'Ignored';
}

let cache: {
  tasks: readonly Task[];
  lists: readonly TaskList[];
  projects: readonly Project[];
  value: IgnoredWork;
} | null = null;

/**
 * The memoised answer for the store's current arrays. Every screen and the
 * scoring pass read the same object until one of the three arrays changes.
 */
export function ignoredWorkOf(
  tasks: readonly Task[],
  lists: readonly TaskList[],
  projects: readonly Project[],
): IgnoredWork {
  if (cache && cache.tasks === tasks && cache.lists === lists && cache.projects === projects) {
    return cache.value;
  }
  const value = ignoredWork(tasks, lists, projects);
  cache = { tasks, lists, projects, value };
  return value;
}
