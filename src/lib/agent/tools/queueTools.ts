import type { Task } from '../../../store/useStore';
import { describeDate } from '../dates';
import { defineTool, requiredStringArray } from '../toolKit';
import type { ToolDef } from '../types';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { BATCH_CAP, compactRow, findTaskAnywhere, listTitleFor } from './taskTools';

/**
 * The focus queue — "Selected for Today" — is the `tasks` array, which is a
 * completely separate thing from `backlogTasks` where every task actually
 * lives. Decision D15 gives membership of it its own explicit tool pair for
 * exactly one reason: without them the model conflates "add a task" with "add
 * it to today", and either creates a duplicate task or silently fails to put an
 * existing one in front of the user.
 *
 * These tools change *membership only*. They never create, complete, reschedule
 * or delete anything.
 *
 * A caveat worth knowing at Step 5: `useSnapshotStore` snapshots entities, not
 * array membership, and a queued task is normally also a backlog task — so a
 * revert restores the task's *fields*, not the fact that it was in the queue.
 * Undoing an add is `remove_from_today` and vice versa; both tools say so.
 */

/** Mirrors `TaskSelection.handleSelectTask`: an estimate in minutes becomes the session's allocated seconds. */
function withSessionTime(task: Task): Task {
  if (task.allocatedTime || !task.estimatedTime) return task;
  return { ...task, allocatedTime: task.estimatedTime * 60 };
}

export const addToToday: ToolDef = defineTool({
  name: 'add_to_today',
  mutates: true,
  description:
    'Put existing tasks into "Selected for Today", the queue a focus session runs through. Takes a list, so "line ' +
    'these four up for today" is one call. Use it when the user says they want to work on something today, now, or ' +
    'next. It changes nothing about the tasks themselves — not their deadlines, not their statuses, not which list ' +
    'they belong to. It does not create anything: if a task does not exist yet, call create_task first and then pass ' +
    'the ids it returns.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Exact ids from search_tasks or tasks you just created, in the order they should be worked. A subtask id is accepted and queues that subtask on its own.',
      },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx) => {
    const taskIds = requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' });

    const outcome = await runBatch(taskIds, async (taskId) => {
      /*
       * ITEM 13D — RE-READ PER TASK, AND THIS IS THE ONE PLACE IT IS LOAD-BEARING.
       *
       * `setFocusQueue` replaces the whole array. Reading `state.tasks` once
       * outside the loop and appending to that copy would make every task in
       * the batch land at the same position and each write throw away the one
       * before it — four ids in, one task queued. So the queue is read fresh
       * for each, exactly as four separate calls would have seen it.
       */
      const state = ctx.store.getState();
      const queue = [...state.tasks];

      const existing = queue.find((t) => t.id === taskId);
      if (existing) {
        return {
          ok: true as const,
          title: existing.title,
          value: { taskId, alreadyQueued: true, position: queue.indexOf(existing) + 1, completed: existing.status === 'completed' },
        };
      }

      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };

      let entry: Task;
      if (found.location === 'subtask' && found.rootTask) {
        const { task: subtask, rootTask } = found;
        // A lightweight stand-in carrying the subtask's own id, so edits made
        // during the session write straight back into the real subtask.
        entry = {
          id: subtask.id,
          title: subtask.title,
          description: subtask.description,
          status: subtask.status ?? 'needsAction',
          priority: subtask.priority,
          allocatedTime: subtask.allocatedTime,
          deadline: subtask.deadline,
          listId: rootTask.listId,
          listName: rootTask.listName,
          subtasks: subtask.subtasks,
          humanOverride: subtask.humanOverride,
          avoidedCount: subtask.avoidedCount,
          emergencyBoost: subtask.emergencyBoost,
          isSubtaskProxy: true,
        };
      } else {
        entry = withSessionTime(found.task as Task);
      }

      const position = queue.length + 1;
      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      ctx.store.setFocusQueue([...queue, entry]);

      return {
        ok: true as const,
        title: entry.title,
        value: { taskId, alreadyQueued: false, position, completed: entry.status === 'completed' },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const added = done.filter((entry) => !entry.value.alreadyQueued);
        const already = done.filter((entry) => entry.value.alreadyQueued);
        const completed = added.filter((entry) => entry.value.completed);

        const parts: string[] = [];
        if (added.length === 1) parts.push(`Added "${added[0].title}" to today's queue at position ${added[0].value.position}`);
        else if (added.length > 1) {
          parts.push(
            `Added ${added.length} tasks to today's queue at positions ${added[0].value.position}–${added[added.length - 1].value.position}: ${titleList(added.map((entry) => entry.title))}`,
          );
        }
        if (already.length > 0) {
          parts.push(
            added.length > 0
              ? `${already.length} ${already.length === 1 ? 'was' : 'were'} already there`
              : `${titleList(already.map((entry) => entry.title))} ${already.length === 1 ? 'is' : 'are'} already in today's queue, so nothing changed`,
          );
        }
        // Worth saying once however many there are: queueing something already
        // ticked off is nearly always a mistake upstream.
        if (completed.length > 0) {
          parts.push(`${completed.length === 1 ? 'one of them is' : `${completed.length} of them are`} already marked completed — check that is intended`);
        }
        // The clauses are semicolon-joined and the standing note is its own
        // sentence, so nothing reads as a lowercase word after a full stop.
        const note = added.length > 0 ? ' Nothing else about them changed; remove_from_today takes them back out.' : '';
        return `${parts.join('; ')}.${note}`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const removeFromToday: ToolDef = defineTool({
  name: 'remove_from_today',
  mutates: true,
  description:
    'Take tasks out of "Selected for Today". Takes a list, so clearing several off today is one call. Use it when the ' +
    'user drops something from today or wants the queue cleared down. The tasks themselves are untouched — they stay ' +
    'in their lists, keep their deadlines, and are not completed and not deleted. This is the only way to undo ' +
    'add_to_today.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: { type: 'array', items: { type: 'string' }, description: 'Exact ids, normally taken from list_today.' },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx) => {
    const taskIds = requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' });

    const outcome = await runBatch(taskIds, async (taskId) => {
      // Fresh each time, for `add_to_today`'s reason: the array is replaced
      // wholesale, so a stale copy would put back what the previous item removed.
      const state = ctx.store.getState();
      const queue = [...state.tasks];

      const queued = queue.find((t) => t.id === taskId);
      if (!queued) {
        const found = findTaskAnywhere(state, taskId);
        /*
         * Not in the queue is a *success*, exactly as it was before this
         * batched: the user asked for it not to be there and it is not there.
         * A task that does not exist at all is the only failure here.
         */
        if (!found) return { ok: false as const, reason: 'it is not in today’s queue and no task has that id — call list_today to see what is.' };
        return { ok: true as const, title: found.task.title, value: { taskId, wasQueued: false, listName: '' } };
      }

      const remaining = queue.filter((t) => t.id !== taskId);
      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      ctx.store.setFocusQueue(remaining);

      return {
        ok: true as const,
        title: queued.title,
        value: { taskId, wasQueued: true, listName: listTitleFor(state, queued.listId, queued.listName) || 'its list' },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const removed = done.filter((entry) => entry.value.wasQueued);
        const absent = done.filter((entry) => !entry.value.wasQueued);
        const parts: string[] = [];
        if (removed.length === 1) {
          parts.push(`Removed "${removed[0].title}" from today's queue. The task itself is unchanged and still in ${removed[0].value.listName}`);
        } else if (removed.length > 1) {
          parts.push(
            `Removed ${removed.length} tasks from today's queue: ${titleList(removed.map((entry) => entry.title))}. The tasks themselves are unchanged and still in their lists`,
          );
        }
        if (absent.length > 0) {
          parts.push(
            removed.length > 0
              ? `${absent.length} ${absent.length === 1 ? 'was' : 'were'} not in it`
              : `${titleList(absent.map((entry) => entry.title))} ${absent.length === 1 ? 'was' : 'were'} not in today's queue, so nothing changed`,
          );
        }
        return `${parts.join('; ')}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const listToday: ToolDef = defineTool({
  name: 'list_today',
  mutates: false,
  description:
    'Show what is in "Selected for Today", in the order a focus session will run it. Use it before answering anything ' +
    'about today\'s plan, before removing something, and to check whether a task is already queued. This is not the ' +
    'same as tasks due today — for those, search_tasks with a deadline filter.',
  parametersSchema: { type: 'object', properties: {}, required: [] },
  execute: async (_args, ctx) => {
    const state = ctx.store.getState();

    const rows = state.tasks.map((task, index) => ({
      position: index + 1,
      ...compactRow(state, task),
      allocatedMinutes: task.allocatedTime ? Math.round(task.allocatedTime / 60) : undefined,
      isSubtask: task.isSubtaskProxy === true,
    }));

    if (rows.length === 0) {
      return { ok: true, summary: 'Today\'s queue is empty. add_to_today puts something in it.', data: { queue: [] } };
    }

    const totalMinutes = state.tasks.reduce((sum, task) => sum + (task.allocatedTime ?? 0), 0) / 60;
    const nextDue = describeDate(state.tasks[0].deadline, ctx.timezone);
    return {
      ok: true,
      summary: `${rows.length} task${rows.length === 1 ? '' : 's'} queued for today, ${Math.round(totalMinutes)} minutes allocated. First up: "${state.tasks[0].title}" (due ${nextDue}).`,
      data: { queue: rows, totalAllocatedMinutes: Math.round(totalMinutes) },
    };
  },
});

export const queueTools: ToolDef[] = [addToToday, removeFromToday, listToday];
