/**
 * "Doesn't count as worked" (BIG-6, 29-1b) — the one answer to "does time on
 * this count towards the hours he worked?", pure and tested.
 *
 * His calls, 2026-09-30: a project, a list or a task can be marked as not
 * counting; it **passes down** like Ignore (BIG-3) does, but **unlike Ignore
 * one task inside can switch itself back on**. Time on something that does
 * not count is still shown on the Dashboard, greyed and outside the totals
 * (his pick, asked in 29-1b).
 *
 * Three fields hold it, all named `notWorked`:
 * - `Project.notWorked` / `TaskList.notWorked` — `true` or absent;
 * - `Task.notWorked` — `true` (doesn't count), `false` (**counts anyway**, the
 *   switch back on under a list or project that doesn't), or absent (as its
 *   list and project say).
 *
 * **Every reader asks this module, never a field**, for Ignore's reason: the
 * flag that counts may be two projects up. The project chain is walked through
 * `lib/projectTree.ts`, so a parent that is gone or a synced cycle cannot make
 * a project inherit from something that is not drawn above it.
 *
 * Time is judged by where the task is NOW, not where it was when the time was
 * logged — marking Self Care as not worked takes last week's Self Care time
 * out of last week's bars too, which is what "this doesn't count" means. A task
 * that is gone falls back to the list and project its log entry snapshotted.
 */
import type { Project, Subtask, Task, TaskList } from '../store/useStore';
import { buildProjectTree } from './projectTree';

/** What makes time not count — the thing a menu names. */
export type NotWorkedSource =
  | { kind: 'task' }
  | { kind: 'list'; list: TaskList }
  | { kind: 'project'; project: Project };

export interface WorkedJudge {
  /**
   * Why time on this task does not count, or undefined when it does. `listId`
   * and `projectId` are the log entry's snapshot, used only when the task is
   * no longer on the board. A subtask's id answers as its top-level task.
   */
  taskReason: (taskId: string | undefined, listId?: string, projectId?: string) => NotWorkedSource | undefined;
  /** Why a list's time does not count: its own flag, or a project at or above it. */
  listReason: (listId: string | undefined) => NotWorkedSource | undefined;
  /** Why a project's time does not count: its own flag, or one above it. */
  projectReason: (projectId: string | undefined) => NotWorkedSource | undefined;
  /**
   * What is above a task, ignoring the task's own switch — so a menu can say
   * "Self Care doesn't count" beside "Count this one anyway".
   */
  aboveTask: (taskId: string) => NotWorkedSource | undefined;
}

function indexSubtasks(top: Task, subtasks: readonly Subtask[] | undefined, into: Map<string, Task>): void {
  for (const s of subtasks ?? []) {
    into.set(s.id, top);
    indexSubtasks(top, s.subtasks, into);
  }
}

export function workedJudge(
  tasks: readonly Task[],
  lists: readonly TaskList[],
  projects: readonly Project[],
): WorkedJudge {
  const tree = buildProjectTree(projects);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const listById = new Map(lists.map((l) => [l.id, l]));
  const topOf = new Map<string, Task>();
  for (const task of tasks) {
    if (task.parent) continue;
    topOf.set(task.id, task);
    indexSubtasks(task, task.subtasks, topOf);
  }

  const projectCache = new Map<string, NotWorkedSource | undefined>();
  const projectReason = (projectId: string | undefined): NotWorkedSource | undefined => {
    if (!projectId) return undefined;
    if (projectCache.has(projectId)) return projectCache.get(projectId);
    const project = projectById.get(projectId);
    let reason: NotWorkedSource | undefined;
    if (project) {
      /* The outermost one is named: it is the switch to turn off. */
      for (const p of [...tree.ancestorsOf(projectId), project]) {
        if (p.notWorked) { reason = { kind: 'project', project: p }; break; }
      }
    }
    projectCache.set(projectId, reason);
    return reason;
  };

  const listReason = (listId: string | undefined): NotWorkedSource | undefined => {
    if (!listId) return undefined;
    const list = listById.get(listId);
    if (!list) return undefined;
    return projectReason(list.projectId) ?? (list.notWorked ? { kind: 'list', list } : undefined);
  };

  const placeReason = (listId: string | undefined, projectId: string | undefined) =>
    listId && listById.has(listId) ? listReason(listId) : projectReason(projectId);

  const aboveTask = (taskId: string): NotWorkedSource | undefined => {
    const top = topOf.get(taskId);
    return top ? listReason(top.listId) : undefined;
  };

  const taskReason = (taskId: string | undefined, listId?: string, projectId?: string): NotWorkedSource | undefined => {
    const top = taskId ? topOf.get(taskId) : undefined;
    if (!top) return placeReason(listId, projectId);
    if (top.notWorked === false) return undefined;
    if (top.notWorked === true) return listReason(top.listId) ?? { kind: 'task' };
    return listReason(top.listId);
  };

  return { taskReason, listReason, projectReason, aboveTask };
}

/** A thing the switch is on, as its menu names it. */
export interface WorkedSubject {
  kind: 'task' | 'list' | 'project';
  id: string;
}

/** Whether `reason` is the subject's own switch rather than one above it. */
export function isOwnNotWorked(reason: NotWorkedSource, self: WorkedSubject): boolean {
  if (reason.kind !== self.kind) return false;
  if (reason.kind === 'list') return reason.list.id === self.id;
  if (reason.kind === 'project') return reason.project.id === self.id;
  return true;
}

export function notWorkedHolder(reason: NotWorkedSource): string {
  if (reason.kind === 'project') return reason.project.name;
  if (reason.kind === 'list') return reason.list.title;
  return '';
}

let cache: {
  tasks: readonly Task[];
  lists: readonly TaskList[];
  projects: readonly Project[];
  value: WorkedJudge;
} | null = null;

/** The memoised judge for the store's current arrays. */
export function workedJudgeOf(
  tasks: readonly Task[],
  lists: readonly TaskList[],
  projects: readonly Project[],
): WorkedJudge {
  if (cache && cache.tasks === tasks && cache.lists === lists && cache.projects === projects) return cache.value;
  const value = workedJudge(tasks, lists, projects);
  cache = { tasks, lists, projects, value };
  return value;
}
