import type { Project, Task, TaskList } from '../../../store/useStore';
import { defineTool, optionalEnum, optionalString, requiredStringArray, ToolArgError } from '../toolKit';
import type { AgentStoreState, ToolDef, ToolResult } from '../types';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { findList, findProject } from './boardTools';
import { BATCH_CAP, findTaskAnywhere, listTitleFor, projectNameFor } from './taskTools';

/**
 * BUILD-17 — ATLAS CAN MOVE AND REORDER TASKS.
 *
 * Before this, `update_task` said in its own description that it could not
 * move a task to another list, and nothing anywhere wrote `Task.order` — a
 * whole list could change project (`update_list`) but a single task could not
 * move at all. Moving and reordering are **one write** here, as they are on
 * the board: a task's place is its list and its position in it, and "put the
 * invoice at the top of Admin" is both at once.
 *
 * **It runs free, not through the front door** — Shreekant's call. A move is
 * trivially undone: every task it writes is captured first, so Revert on
 * `/log` puts each one back in its old list at its old position.
 *
 * WHAT IT WRITES, AND WHY THROUGH `updateBacklogTask`
 * ---------------------------------------------------
 * The board's drag goes through `moveTaskToList`, which writes `backlogTasks`
 * only. This goes through `updateBacklogTask` instead — the one path — so a
 * moved task that is also in today's queue has its copy there relabelled too
 * (CLAUDE.md: the two arrays drifting apart is the source of several bugs).
 * The destination list is renumbered 0..n-1, which is what `moveTaskToList`
 * does; the list a task left keeps its gap, which sorts the same.
 *
 * **Only a task's home list is renumbered.** A task shared into a list
 * (`sharedListIds`) draws there by its own `order`, which belongs to its home
 * list, so it is never an anchor's neighbour to count. Moving a task *into* a
 * list it was shared into drops that share, or it would be filed and
 * cross-linked in the same place.
 *
 * Not in `fallbackTools`: the in-browser assistant keeps its eight
 * (`tools/index.ts`).
 */

const POSITIONS = ['top', 'bottom'] as const;

export type PlaceAt = { kind: 'top' | 'bottom' } | { kind: 'before' | 'after'; taskId: string };

export interface Placement {
  taskId: string;
  order: number;
}

/**
 * Every top-level task filed in `listId`, in its new order, once `moving` has
 * been put at `at` — pure, so the arithmetic is tested apart from the store.
 *
 * `moving` keeps the order it was given, as a block, which is what *"put these
 * three at the top"* means. The rest keep the order the board draws them in:
 * `order`, then backlog position for ties (`Array.prototype.sort` is stable,
 * and the board sorts the same array the same way).
 */
export function placeInList(backlog: Task[], listId: string, moving: string[], at: PlaceAt): Placement[] {
  const movingSet = new Set(moving);
  const staying = backlog
    .filter((task) => !task.parent && task.listId === listId && !movingSet.has(task.id))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((task) => task.id);

  let index: number;
  if (at.kind === 'before' || at.kind === 'after') {
    const anchor = staying.indexOf(at.taskId);
    if (anchor === -1) throw new Error(`placeInList: ${at.taskId} is not a task filed in ${listId}.`);
    index = at.kind === 'before' ? anchor : anchor + 1;
  } else {
    index = at.kind === 'top' ? 0 : staying.length;
  }

  return [...staying.slice(0, index), ...moving, ...staying.slice(index)].map((taskId, order) => ({ taskId, order }));
}

type Lookup<T> = { found: T } | { reason: string };

/** `findList`'s rules — an id, or an exact name that is unique — inside one project when one was named. */
function findListIn(state: AgentStoreState, ref: string, project: Project | undefined): Lookup<TaskList> {
  if (!project) return findList(state, ref);
  const inProject = state.taskLists.filter((list) => list.projectId === project.id);
  const needle = ref.trim().toLowerCase();
  const byId = inProject.find((list) => list.id === ref);
  if (byId) return { found: byId };
  const named = inProject.filter((list) => list.title.trim().toLowerCase() === needle);
  if (named.length === 1) return { found: named[0] };
  const lists = inProject.length === 0 ? 'it has no lists yet' : `its lists are ${titleList(inProject.map((list) => list.title))}`;
  return { reason: `"${project.name}" has no list called "${ref.trim()}" — ${lists}.` };
}

function listLabel(state: AgentStoreState, list: TaskList): string {
  const project = projectNameFor(state, list.id);
  return project ? `${list.title} in ${project}` : list.title;
}

export const moveTask: ToolDef = defineTool({
  name: 'move_task',
  mutates: true,
  description:
    'Move tasks to another list or project, reorder them within their list, or both in one call — "move the invoice ' +
    'to Admin", "put these at the top", "do this one after that one". Takes a list of ids; they travel together, in ' +
    'the order given. Name where they go with "list" (a list name or id) and/or "project"; a project alone puts them ' +
    'in its first list. Say where in the list with ONE of "position" (top or bottom), "beforeTaskId" or ' +
    '"afterTaskId" — a task named there decides the list by itself, so "list" can be left out. A task moved to ' +
    'another list with no position goes to the bottom. Steps (subtasks) cannot be moved on their own. Moving changes ' +
    'nothing else about a task, and Revert on the log puts it back.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact ids from search_tasks, list_all_tasks, or tasks you just created. They are placed together, in this order.',
      },
      list: { type: 'string', description: 'The list to move them into, by exact name or id. Omit to keep them in their own list.' },
      project: {
        type: 'string',
        description: 'The project to move them into, by exact name or id. With "list", says which project that list is in.',
      },
      position: { type: 'string', enum: [...POSITIONS], description: 'Put them at the top or the bottom of the list.' },
      beforeTaskId: { type: 'string', description: 'Put them just above this task, in its list. The id of a task, never a title.' },
      afterTaskId: { type: 'string', description: 'Put them just below this task, in its list. The id of a task, never a title.' },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    // A repeated id would be placed twice and counted twice.
    const taskIds = [...new Set(requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' }))];
    const listRef = optionalString(args, 'list');
    const projectRef = optionalString(args, 'project');
    const position = optionalEnum(args, 'position', POSITIONS);
    const beforeTaskId = optionalString(args, 'beforeTaskId');
    const afterTaskId = optionalString(args, 'afterTaskId');

    /*
     * Everything that is wrong with the ARGUMENTS is wrong before anything is
     * touched, so it throws and `defineTool` returns one refusal that wrote
     * nothing — the same rule `update_task` reads its patch by.
     */
    const placings = [position, beforeTaskId, afterTaskId].filter((value) => value !== undefined).length;
    if (placings > 1) {
      throw new ToolArgError('send only one of "position", "beforeTaskId" and "afterTaskId" — each of them says where the tasks go.');
    }
    if (listRef === undefined && projectRef === undefined && placings === 0) {
      throw new ToolArgError(
        'there is nothing to do — send "list" or "project" to move the tasks, or "position", "beforeTaskId" or "afterTaskId" to reorder them.',
      );
    }

    const state = ctx.store.getState();

    let project: Project | undefined;
    if (projectRef !== undefined) {
      const lookup = findProject(state, projectRef);
      if ('reason' in lookup) throw new ToolArgError(lookup.reason);
      project = lookup.found;
    }

    let destination: TaskList | undefined;
    const disclosures: string[] = [];
    if (listRef !== undefined) {
      const lookup = findListIn(state, listRef, project);
      if ('reason' in lookup) throw new ToolArgError(lookup.reason);
      destination = lookup.found;
    } else if (project !== undefined) {
      const lists = state.taskLists
        .filter((list) => list.projectId === project.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (lists.length === 0) {
        throw new ToolArgError(`"${project.name}" has no lists yet, so there is nowhere in it to put a task — create_list (Projects drawer) makes one.`);
      }
      destination = lists[0];
      if (lists.length > 1) disclosures.push(`"${project.name}" has ${lists.length} lists, so they went to its first, ${destination.title}`);
    }

    const anchorId = beforeTaskId ?? afterTaskId;
    const anchorKey = beforeTaskId !== undefined ? 'beforeTaskId' : 'afterTaskId';
    let anchor: Task | undefined;
    if (anchorId !== undefined) {
      anchor = state.backlogTasks.find((task) => task.id === anchorId && !task.parent);
      if (!anchor) {
        throw new ToolArgError(`"${anchorKey}" is not a task on the board — ${missingIdReason('task')}`);
      }
      if (taskIds.includes(anchor.id)) {
        throw new ToolArgError(`"${anchor.title}" is one of the tasks being moved, so it cannot also be the one they go next to.`);
      }
      const anchorList = state.taskLists.find((list) => list.id === anchor?.listId);
      if (!anchorList) {
        throw new ToolArgError(`"${anchor.title}" is not filed in any list, so there is no place beside it to put anything.`);
      }
      if (destination && destination.id !== anchorList.id) {
        throw new ToolArgError(
          `"${anchor.title}" is in ${listLabel(state, anchorList)}, not ${listLabel(state, destination)}. Leave out "list" and ` +
            '"project" to put the tasks beside it, or name a task that is in the list you want.',
        );
      }
      destination = anchorList;
    }

    const at: PlaceAt | undefined = anchor
      ? { kind: beforeTaskId !== undefined ? 'before' : 'after', taskId: anchor.id }
      : position !== undefined
        ? { kind: position }
        : undefined;

    // Per task: can this one be placed at all, and where is it going?
    const checked = await runBatch(taskIds, async (taskId) => {
      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };
      if (found.location === 'subtask') {
        return {
          ok: false as const,
          title: found.task.title,
          reason: `it is a step inside "${found.rootTask?.title ?? 'another task'}", and a step moves with its task — move that task instead.`,
        };
      }
      if (found.location === 'focusQueue') {
        return { ok: false as const, title: found.task.title, reason: "it is only in today's queue, not on the board, so it has no list to move in." };
      }
      const task = found.task as Task;
      const to = destination ?? state.taskLists.find((list) => list.id === task.listId);
      if (!to) {
        return {
          ok: false as const,
          title: task.title,
          reason: 'it is not filed in any list, so there is nothing to reorder it within — send "list" to put it in one.',
        };
      }
      return { ok: true as const, title: task.title, value: { task, to } };
    });

    // One block per destination. There is only ever one unless the tasks were
    // reordered within their own lists and those lists differ.
    const byList = new Map<string, { list: TaskList; tasks: Task[] }>();
    for (const { value } of checked.done) {
      const group = byList.get(value.to.id) ?? { list: value.to, tasks: [] };
      group.tasks.push(value.task);
      byList.set(value.to.id, group);
    }

    const moved = new Set<string>();
    for (const { list, tasks } of byList.values()) {
      // With no position, only a task arriving from elsewhere moves — it goes
      // to the bottom — and one already in this list is left where it is.
      const moving = (at === undefined ? tasks.filter((task) => task.listId !== list.id) : tasks).map((task) => task.id);
      if (moving.length === 0) continue;
      const placements = placeInList(ctx.store.getState().backlogTasks, list.id, moving, at ?? { kind: 'bottom' });
      let wrote = false;

      for (const { taskId, order } of placements) {
        const current = ctx.store.getState().backlogTasks.find((task) => task.id === taskId);
        if (!current) continue;
        const arriving = current.listId !== list.id;
        if (!arriving && current.order === order) continue;

        const patch: Partial<Task> = { order };
        if (arriving) {
          patch.listId = list.id;
          patch.listName = list.title;
          if (current.sharedListIds?.includes(list.id)) {
            const rest = current.sharedListIds.filter((id) => id !== list.id);
            // `undefined` removes the field (`withPatch`); an empty array would
            // be a field that says nothing.
            patch.sharedListIds = rest.length > 0 ? rest : undefined;
          }
        }
        ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
        ctx.store.updateBacklogTask(taskId, patch);
        wrote = true;
      }
      // A block is reported as a block: in "put Laundry and Dishes at the top",
      // Dishes keeping its number is still Dishes being where he asked.
      if (wrote) for (const taskId of moving) moved.add(taskId);
    }

    const outcome = {
      done: checked.done.map((entry) => ({
        ...entry,
        value: {
          taskId: entry.value.task.id,
          from: listTitleFor(state, entry.value.task.listId, entry.value.task.listName),
          to: entry.value.to.title,
          project: projectNameFor(state, entry.value.to.id),
          changedList: entry.value.task.listId !== entry.value.to.id,
          moved: moved.has(entry.value.task.id),
        },
      })),
      failed: checked.failed,
    };

    const where = (list: TaskList, several: boolean): string => {
      const label = several ? 'their lists' : listLabel(state, list);
      if (anchor) return `in ${label}, ${at?.kind === 'before' ? 'just above' : 'just below'} "${anchor.title}"`;
      if (position === 'top') return `to the top of ${label}`;
      if (position === 'bottom') return `to the bottom of ${label}`;
      return `to ${label}`;
    };

    return batchResult(
      outcome,
      (done) => {
        const went = done.filter((entry) => entry.value.moved);
        const stayed = done.filter((entry) => !entry.value.moved);
        const lists = [...byList.values()].filter(({ tasks }) => tasks.some((task) => moved.has(task.id)));
        const parts: string[] = [];
        if (went.length > 0) {
          parts.push(`Moved ${titleList(went.map((entry) => entry.title))} ${where(lists[0].list, lists.length > 1)}`);
        }
        if (stayed.length > 0) {
          parts.push(
            `${titleList(stayed.map((entry) => entry.title))} ${stayed.length === 1 ? 'was' : 'were'} already there, so nothing changed${went.length > 0 ? ' for ' + (stayed.length === 1 ? 'it' : 'them') : ''}`,
          );
        }
        return `${[...parts, ...(went.length > 0 ? disclosures : [])].join(' — ')}.`;
      },
      {
        tasks: outcome.done.map((entry) => ({ ...entry.value, title: entry.title })),
        ...(destination ? { list: { id: destination.id, name: destination.title, project: projectNameFor(state, destination.id) } } : {}),
        ...(at ? { position: at.kind } : {}),
        ...(anchor ? { anchor: { id: anchor.id, title: anchor.title } } : {}),
      },
    );
  },
});
