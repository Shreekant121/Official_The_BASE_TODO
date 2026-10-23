import type { Subtask, Task } from '../../../store/useStore';
import { describeDate, resolveDateInput } from '../dates';
import {
  defineTool,
  optionalEnum,
  optionalNumber,
  optionalString,
  requiredRecordArray,
  requiredString,
  requiredStringArray,
  ToolArgError,
} from '../toolKit';
import type { AgentStoreState, JsonSchema, ToolArgs, ToolContext, ToolDef, ToolResult } from '../types';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { BATCH_CAP, EMERGENCY_SCHEMA, findTaskAnywhere, readEmergency } from './taskTools';

/**
 * Subtasks, at any depth (item 9).
 *
 * Nothing in the eight-tool surface could reach these at all: `create_task`
 * writes `subtasks: []` and `update_task` cannot address a nested value, so
 * "break this into steps" — the single most obvious thing to ask an assistant
 * about a task — was the thing it could not do.
 *
 * WHY THESE ARE THEIR OWN TOOLS RATHER THAN A `subtasks` FIELD
 * -------------------------------------------------------------
 * The obvious shape is a `subtasks` array on `update_task`, replacing the tree
 * wholesale like `links` does. It is the wrong shape here for a reason that
 * only shows up on a small model: replacing the tree means the model must
 * reproduce every existing subtask *and its id* in order to add one, and a
 * model that paraphrases one title while doing so has silently renamed the
 * user's work. Addressing one node at a time means the worst case is a failed
 * call rather than a quiet edit to something nobody mentioned.
 *
 * WHAT A SUBTASK IS, MECHANICALLY
 * --------------------------------
 * A nested value inside `Task.subtasks`, recursively. Ids are globally unique
 * but there is **no parent pointer** — parentage is positional (CLAUDE.md) —
 * so every operation here is a rebuild of the owning task's whole tree, walked
 * from the root. That is also why deletion of a subtask is *not* routed
 * through `cascadeDelete`: it is explicitly out of that path's scope for the
 * same reason, and a removed subtask is therefore a plain edit to its owner
 * rather than a Trash entry. `remove_subtask` says so in as many words, since
 * that is the one place a user could reasonably expect the Trash to catch it.
 *
 * A subtask carries a strict subset of a task's fields (`Subtask`), which is
 * the same subset `SUBTASK_PROXY_FIELDS` writes through. Nothing here accepts
 * a field outside it.
 */

/** How deep a tree may be built. A depth limit no user will reach and no loop can pass. */
const MAX_SUBTASK_DEPTH = 10;

const SUBTASK_STATUSES = ['needsAction', 'completed'] as const;

/** Exactly the writable half of `Subtask`. `id` and `subtasks` are structural, not content. */
const SUBTASK_FIELD_SCHEMAS: Record<string, JsonSchema> = {
  description: { type: 'string', description: 'What this step involves.' },
  deadline: {
    type: 'string',
    description: 'When this step is due. Same formats as a task deadline; resolved in the user\'s timezone.',
  },
  emergencyBoost: EMERGENCY_SCHEMA,
  allocatedTime: { type: 'integer', description: 'Time set aside for this step, in MINUTES.' },
  humanOverride: {
    type: 'integer',
    description: 'How much this step matters, 0 to 9. A subtask carries its own score at any depth. Set it only when the user said so.',
  },
};

interface FoundSubtask {
  subtask: Subtask;
  /** The top-level task owning the tree. */
  rootTask: Task;
  /** Root first, then each ancestor, ending with the subtask itself. */
  path: Subtask[];
}

/** Walks every tree in the backlog for one subtask id, keeping the path that reached it. */
function locateSubtask(state: AgentStoreState, subtaskId: string): FoundSubtask | undefined {
  const walk = (nodes: Subtask[], trail: Subtask[]): Subtask[] | undefined => {
    for (const node of nodes) {
      const here = [...trail, node];
      if (node.id === subtaskId) return here;
      const deeper = node.subtasks && node.subtasks.length > 0 ? walk(node.subtasks, here) : undefined;
      if (deeper) return deeper;
    }
    return undefined;
  };
  for (const rootTask of state.backlogTasks) {
    const path = walk(rootTask.subtasks ?? [], []);
    if (path) return { subtask: path[path.length - 1], rootTask, path };
  }
  return undefined;
}

/**
 * Rebuilds a tree with one node transformed. `replace` returning `null`
 * removes the node.
 *
 * Structural sharing is not attempted: a task's subtask tree is small, and a
 * rebuild that always produces new objects cannot accidentally mutate the
 * store's current state in place — which, with Zustand handing out live
 * references, is a real way to write a change that never triggers a sync.
 */
function rebuildTree(nodes: Subtask[], targetId: string, replace: (node: Subtask) => Subtask | null): Subtask[] {
  const out: Subtask[] = [];
  for (const node of nodes) {
    if (node.id === targetId) {
      const next = replace(node);
      if (next !== null) out.push(next);
      continue;
    }
    out.push(
      node.subtasks && node.subtasks.length > 0
        ? { ...node, subtasks: rebuildTree(node.subtasks, targetId, replace) }
        : node,
    );
  }
  return out;
}

function countNodes(nodes: Subtask[] | undefined): number {
  return (nodes ?? []).reduce((total, node) => total + 1 + countNodes(node.subtasks), 0);
}

function depthOf(nodes: Subtask[] | undefined): number {
  return (nodes ?? []).reduce((deepest, node) => Math.max(deepest, 1 + depthOf(node.subtasks)), 0);
}

/** Reads the writable subtask fields. Shared by add and update. */
function readSubtaskFields(args: ToolArgs, ctx: ToolContext): { updates: Partial<Subtask>; notes: string[] } {
  const updates: Partial<Subtask> = {};
  const notes: string[] = [];

  const description = optionalString(args, 'description');
  if (description !== undefined) updates.description = description;

  const deadline = optionalString(args, 'deadline');
  if (deadline !== undefined) {
    const resolved = resolveDateInput(deadline, ctx.now, ctx.timezone);
    if (!resolved.ok) throw new ToolArgError(`"deadline": ${resolved.error}`);
    updates.deadline = resolved.value;
    if (!/\d{2}:\d{2}/.test(deadline)) notes.push(`deadline set to ${describeDate(resolved.value, ctx.timezone)}`);
  }

  const emergencyBoost = readEmergency(args, notes);
  if (emergencyBoost !== null) updates.emergencyBoost = emergencyBoost;

  const allocatedTime = optionalNumber(args, 'allocatedTime', { min: 1, max: 10_080, integer: true });
  if (allocatedTime !== undefined) updates.allocatedTime = allocatedTime;

  const humanOverride = optionalNumber(args, 'humanOverride', { min: 0, max: 9, integer: true });
  if (humanOverride !== undefined) updates.humanOverride = humanOverride;

  return { updates, notes };
}

/**
 * Writes a rebuilt tree back to the task that owns it.
 *
 * Always `updateBacklogTask`, never `updateFocusTask`, and this is not a
 * detail: `backlogTasks` is the store of record (D15) and a subtask tree lives
 * on the backlog copy. The focus queue holds membership rows, so writing a
 * tree there would put the edit somewhere the app does not read it back from.
 */
function writeTree(ctx: ToolContext, rootTask: Task, subtasks: Subtask[]): void {
  ctx.snapshots.captureTask(ctx.snapshotHandle, rootTask.id);
  ctx.store.updateBacklogTask(rootTask.id, { subtasks });
}

// ─── add_subtask ────────────────────────────────────────────────────────────

export const addSubtask: ToolDef = defineTool({
  name: 'add_subtask',
  mutates: true,
  description:
    'Add steps under a task, or under another step. Takes a list of steps — "break this into five steps" is ONE call ' +
    'with five, never five calls. "parentId" takes either a task id or a subtask id, and that is how nesting works; ' +
    'there is no separate tool for a sub-sub-task. All the steps in one call go under the same parent, in the order ' +
    'given. Each returns a new id, which is what you pass as "parentId" to go a level deeper.',
  parametersSchema: {
    type: 'object',
    properties: {
      parentId: { type: 'string', description: 'The task or subtask every step in this call goes under.' },
      steps: {
        type: 'array',
        description: 'The steps to add, in order. One entry per step; a plain string is read as a title.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The step itself, short.' },
            ...SUBTASK_FIELD_SCHEMAS,
          },
          required: ['title'],
        },
      },
    },
    required: ['parentId', 'steps'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const state = ctx.store.getState();
    const parentId = requiredString(args, 'parentId');
    const wanted = requiredRecordArray(args, 'steps', 'title', (item) => item, { max: BATCH_CAP, what: 'steps' });

    /*
     * ITEM 13D — THE PARENT IS RESOLVED ONCE, THE STEPS ARE THE LIST.
     *
     * A missing parent fails the whole call rather than every step in turn:
     * it is one fact about the arguments, not fifty failures, and reporting it
     * fifty times would bury it.
     *
     * A task and a subtask are both valid parents and are found in different
     * places, so the id is tried as each in turn — task first, since that is
     * overwhelmingly what a model passes.
     */
    const parentTask = state.backlogTasks.find((t) => t.id === parentId);
    const found = parentTask ? undefined : locateSubtask(state, parentId);
    if (!parentTask && !found) {
      return {
        ok: false,
        summary: 'No task or step has that id. Ids come from search_tasks, get_task or a step you just added — do not guess one.',
        data: { parentId },
      };
    }

    const rootTask = parentTask ?? (found as NonNullable<typeof found>).rootTask;
    const parentTitle = parentTask ? parentTask.title : (found as NonNullable<typeof found>).subtask.title;

    const outcome = await runBatch(
      wanted.map((item, index) => (typeof item.title === 'string' && item.title.trim() !== '' ? item.title.trim() : `step ${index + 1}`)),
      async (_key, index) => {
        const item = wanted[index] as ToolArgs;

        let title: string;
        let parsed: { updates: Partial<Subtask>; notes: string[] };
        try {
          title = requiredString(item, 'title');
          parsed = readSubtaskFields(item, ctx);
        } catch (err) {
          return { ok: false as const, reason: err instanceof Error ? err.message : String(err) };
        }

        // An Emergency of 0 is "none", which on a new step is no key at all.
        if (parsed.updates.emergencyBoost === undefined) delete parsed.updates.emergencyBoost;
        const child: Subtask = { id: crypto.randomUUID(), title, status: 'needsAction', subtasks: [], ...parsed.updates };

        /*
         * Re-read the owner each time. The tree is rebuilt and written back
         * whole, so a stale copy would drop every step added before this one.
         */
        const owner = ctx.store.getState().backlogTasks.find((t) => t.id === rootTask.id);
        if (!owner) return { ok: false as const, title, reason: 'the task holding it disappeared mid-call.' };

        const subtasks =
          owner.id === parentId
            ? [...(owner.subtasks ?? []), child]
            : rebuildTree(owner.subtasks ?? [], parentId, (node) => ({ ...node, subtasks: [...(node.subtasks ?? []), child] }));

        if (depthOf(subtasks) > MAX_SUBTASK_DEPTH) {
          return { ok: false as const, title, reason: `it would nest steps more than ${MAX_SUBTASK_DEPTH} deep — flatten it instead.` };
        }

        writeTree(ctx, owner, subtasks);
        return { ok: true as const, title, value: { subtaskId: child.id, parentId, parentTitle, taskId: rootTask.id, notes: parsed.notes } };
      },
    );

    const under = parentTask ? `"${parentTitle}"` : `"${parentTitle}", under "${rootTask.title}"`;
    return batchResult(
      outcome,
      (done) => {
        const notes = [...new Set(done.flatMap((entry) => entry.value.notes))];
        const tail = notes.length > 0 ? ` — ${notes.join('; ')}` : '';
        return done.length === 1
          ? `Added "${done[0].title}" as a step of ${under}${tail}.`
          : `Added ${done.length} steps to ${under}: ${titleList(done.map((entry) => entry.title))}${tail}.`;
      },
      { parentId, parentTitle, taskId: rootTask.id, subtasks: outcome.done.map((entry) => entry.value) },
    );
  },
}, { entryList: 'steps' });

// ─── update_subtask ─────────────────────────────────────────────────────────

const SUBTASK_CLEARABLE = ['description', 'deadline', 'emergencyBoost', 'allocatedTime'] as const;

export const updateSubtask: ToolDef = defineTool({
  name: 'update_subtask',
  mutates: true,
  description:
    'Change steps: rename one, give them a deadline, mark them done or not done. Takes a list of ids and applies THE ' +
    'SAME change to every one of them, so "tick off the first three steps" is one call. Only the fields you send ' +
    'change. A step stores fewer fields than a task does — there are no links or estimates on one.',
  parametersSchema: {
    type: 'object',
    properties: {
      subtaskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'The steps\' ids, from get_task, list_subtasks or add_subtask. Every step getting this same change.',
      },
      title: { type: 'string', description: 'Rewrite the step. Only when the user asked for a rename — and never across several steps at once.' },
      status: {
        type: 'string',
        enum: [...SUBTASK_STATUSES],
        description: '"completed" ticks the step off, "needsAction" un-ticks it. complete_task is for whole tasks, not steps.',
      },
      clear: {
        type: 'array',
        items: { type: 'string', enum: [...SUBTASK_CLEARABLE] },
        description: 'Names of fields to erase. Do not also pass a new value for the same field.',
      },
      ...SUBTASK_FIELD_SCHEMAS,
    },
    required: ['subtaskIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const subtaskIds = requiredStringArray(args, 'subtaskIds', { max: BATCH_CAP, what: 'steps' });

    // One patch for the whole list, read before anything is touched — see
    // `update_task` for why this is outside the loop.
    const { updates, notes } = readSubtaskFields(args, ctx);

    const title = optionalString(args, 'title');
    if (title !== undefined) {
      if (title.trim() === '') throw new ToolArgError('"title" cannot be blank.');
      if (subtaskIds.length > 1) {
        throw new ToolArgError(
          `"title" renames a step, and ${subtaskIds.length} ids were given — that would give them all the same name. Rename them one call each.`,
        );
      }
      updates.title = title.trim();
    }

    const status = optionalEnum(args, 'status', SUBTASK_STATUSES);
    if (status !== undefined) updates.status = status;

    const clear = Array.isArray(args.clear) ? (args.clear as unknown[]) : [];
    for (const raw of clear) {
      const field = String(raw);
      if (!(SUBTASK_CLEARABLE as readonly string[]).includes(field)) {
        throw new ToolArgError(`"clear" cannot include "${field}". Clearable fields on a step: ${SUBTASK_CLEARABLE.join(', ')}.`);
      }
      if (field in updates) throw new ToolArgError(`"${field}" was both set and cleared. Do one or the other.`);
      (updates as Record<string, unknown>)[field] = undefined;
    }

    const changed = Object.keys(updates);
    if (changed.length === 0) {
      return { ok: false, summary: 'Nothing to change — pass at least one field, or "clear".' };
    }

    const outcome = await runBatch(subtaskIds, async (subtaskId) => {
      // Fresh per step: two steps in one batch can share an owning task, and
      // the tree is written back whole.
      const state = ctx.store.getState();
      const found = locateSubtask(state, subtaskId);
      if (!found) return { ok: false as const, reason: 'no step has that id — call list_subtasks on the task to see its steps.' };

      /*
       * Cleared keys are *removed* rather than left holding `undefined`, for the
       * same reason `withPatch` does it in the store: Firestore rejects an
       * `undefined` value and takes the whole document push down with it, so one
       * cleared field on one subtask would silently stop every later edit in the
       * app reaching the cloud.
       */
      const subtasks = rebuildTree(found.rootTask.subtasks ?? [], subtaskId, (node) => {
        const next = { ...node, ...updates };
        for (const key of changed as (keyof Subtask)[]) {
          if (updates[key] === undefined) delete next[key];
        }
        return next;
      });
      writeTree(ctx, found.rootTask, subtasks);

      return { ok: true as const, title: found.subtask.title, value: { subtaskId, taskId: found.rootTask.id, changed } };
    });

    return batchResult(
      outcome,
      (done) => {
        const tail = notes.length > 0 ? ` — ${notes.join('; ')}` : '';
        return done.length === 1
          ? `Updated the step "${done[0].title}": ${changed.join(', ')}${tail}.`
          : `Updated ${done.length} steps — ${changed.join(', ')} on ${titleList(done.map((entry) => entry.title))}${tail}.`;
      },
      { changed, subtasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── remove_subtask ─────────────────────────────────────────────────────────

export const removeSubtask: ToolDef = defineTool({
  name: 'remove_subtask',
  mutates: true,
  description:
    'Delete steps and everything nested under them. Takes a list, so clearing several steps off a task is one call. ' +
    'Unlike delete_task this does NOT go to the Trash and cannot be restored — a step is a value inside its task, not ' +
    'a record of its own. Say so when you use it. If the user only means the steps are finished, use update_subtask ' +
    'with status "completed" instead.',
  parametersSchema: {
    type: 'object',
    properties: {
      subtaskIds: { type: 'array', items: { type: 'string' }, description: 'The steps\' ids, from get_task or list_subtasks.' },
    },
    required: ['subtaskIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const subtaskIds = requiredStringArray(args, 'subtaskIds', { max: BATCH_CAP, what: 'steps' });

    const outcome = await runBatch(subtaskIds, async (subtaskId) => {
      /*
       * Fresh per step, and here it is not only about stale trees: removing a
       * step removes everything under it, so a later id in the same batch may
       * legitimately be gone already. That reads as "no step has that id",
       * which is true and is the honest thing to report.
       */
      const state = ctx.store.getState();
      const found = locateSubtask(state, subtaskId);
      if (!found) return { ok: false as const, reason: 'no step has that id — it may already have gone with a step above it.' };

      const removedCount = 1 + countNodes(found.subtask.subtasks);
      const subtasks = rebuildTree(found.rootTask.subtasks ?? [], subtaskId, () => null);
      writeTree(ctx, found.rootTask, subtasks);

      return {
        ok: true as const,
        title: found.subtask.title,
        value: { subtaskId, taskId: found.rootTask.id, removedCount, ownerTitle: found.rootTask.title },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const total = done.reduce((sum, entry) => sum + entry.value.removedCount, 0);
        const owners = [...new Set(done.map((entry) => entry.value.ownerTitle))];
        const from = owners.length === 1 ? `"${owners[0]}"` : `${owners.length} tasks`;
        if (done.length === 1) {
          const nested = total > 1 ? ` and the ${total - 1} step${total === 2 ? '' : 's'} under it` : '';
          return `Removed the step "${done[0].title}"${nested} from ${from}. This does not go to the Trash.`;
        }
        const nested = total > done.length ? ` (${total} in all, counting the steps nested under them)` : '';
        return `Removed ${done.length} steps from ${from}${nested}: ${titleList(done.map((entry) => entry.title))}. These do not go to the Trash.`;
      },
      { subtasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── list_subtasks ──────────────────────────────────────────────────────────

interface SubtaskRow {
  id: string;
  title: string;
  status: string;
  depth: number;
  deadline?: string;
}

function flatten(nodes: Subtask[], depth: number, out: SubtaskRow[]): SubtaskRow[] {
  for (const node of nodes) {
    out.push({ id: node.id, title: node.title, status: node.status ?? 'needsAction', depth, deadline: node.deadline });
    if (node.subtasks && node.subtasks.length > 0) flatten(node.subtasks, depth + 1, out);
  }
  return out;
}

export const listSubtasks: ToolDef = defineTool({
  name: 'list_subtasks',
  mutates: false,
  description:
    'The steps of tasks as a flat list with their ids and how deep each one sits. Takes a list of task ids, so the ' +
    'steps of several tasks come back in one call. Use it when you need a step\'s id to change or remove it. get_task ' +
    'returns the same trees nested inside everything else; this is the cheaper read when steps are all you want.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: { type: 'array', items: { type: 'string' }, description: 'Exact ids from search_tasks or list_today.' },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const state = ctx.store.getState();
    const taskIds = requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' });

    const outcome = await runBatch(taskIds, async (taskId) => {
      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };

      const rows = flatten(found.task.subtasks ?? [], 0, []);
      return {
        ok: true as const,
        title: found.task.title,
        value: { taskId, subtasks: rows, done: rows.filter((row) => row.status === 'completed').length },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        if (done.length === 1) {
          const only = done[0].value;
          return only.subtasks.length === 0
            ? `"${done[0].title}" has no steps yet.`
            : `"${done[0].title}" has ${only.subtasks.length} step${only.subtasks.length === 1 ? '' : 's'}, ${only.done} done.`;
        }
        const steps = done.reduce((sum, entry) => sum + entry.value.subtasks.length, 0);
        const ticked = done.reduce((sum, entry) => sum + entry.value.done, 0);
        const empty = done.filter((entry) => entry.value.subtasks.length === 0).length;
        const none = empty > 0 ? `, and ${empty} of them ${empty === 1 ? 'has' : 'have'} none yet` : '';
        return `${steps} step${steps === 1 ? '' : 's'} across ${done.length} tasks, ${ticked} done${none}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const subtaskTools: ToolDef[] = [listSubtasks, addSubtask, updateSubtask, removeSubtask];
