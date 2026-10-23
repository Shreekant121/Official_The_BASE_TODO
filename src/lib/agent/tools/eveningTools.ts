import { defineTool, optionalBoolean, requiredStringArray, ToolArgError } from '../toolKit';
import type { ToolDef, ToolResult } from '../types';
import { eveningPatch, isEvening } from '../../dashboard/timeline';
import { toZonedDayString } from '../dates';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { BATCH_CAP, findTaskAnywhere } from './taskTools';

/**
 * 29-1c2, IDEA 38 — "THIS EVENING", FOR ATLAS.
 *
 * The Dashboard's Today block has a moon on each row: it sends a task to this
 * evening and back. Atlas does the same through `eveningPatch`, the moon's own
 * function, so the two cannot disagree: a task sent to the evening is due
 * today at 9pm (the day's end within an hour of 9pm), it remembers the time it
 * had, and back puts that time back — 6pm if the deadline was changed since.
 * `update_task` with a deadline would move it too, but would not remember, and
 * the moon would then bring it back to 6pm instead of to his time.
 *
 * It writes through `updateBacklogTask`, the one path, so today's queue copy
 * follows and the deadline maths runs; every task is captured first, so
 * Revert on `/log` puts each deadline back. Free, like `move_task`: nothing
 * here is out of reach of that Revert.
 *
 * **`back` with no ids brings back everything in this evening.** Measured on
 * gemma (2026-10-21, three runs): sending a named task worked every time, but
 * "take everything out of the evening" failed every time — the model could
 * not work out from the deadlines which tasks were in the evening, and once
 * said it had moved 74. Which tasks are in the evening is the tool's
 * arithmetic, not the model's.
 */
export const sendToEvening: ToolDef = defineTool({
  name: 'send_to_evening',
  mutates: true,
  description:
    'Send tasks to this evening, or bring them back — the moon on the Dashboard. "Do the invoice tonight", "move ' +
    'these to this evening", "take that out of the evening". Sent: due today at 9pm, and BASE remembers the time ' +
    'it had. With back: true it gets that time back (6pm if its deadline was changed since). Takes a list of ids. ' +
    'For any other time, use update_task.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Exact ids from search_tasks, list_all_tasks or list_today. Every task to move, in one list. With back: true, ' +
          'leave it out to bring back every task in this evening.',
      },
      back: { type: 'boolean', description: 'True brings them back out of the evening. Leave it out to send them there.' },
    },
    required: [],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const back = optionalBoolean(args, 'back') === true;
    /* An empty list is a left-out one: gemma sent `taskIds: []` for "everything" once in three. */
    const listed = Array.isArray(args.taskIds) && args.taskIds.length === 0 ? false : 'taskIds' in args;
    const named = listed ? requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' }) : [];
    if (named.length === 0 && !back) throw new ToolArgError('say which tasks to send to this evening, in "taskIds".');
    const taskIds = named.length > 0 ? [...new Set(named)] : eveningTonight(ctx.store.getState().backlogTasks, ctx.now, ctx.timezone);
    if (taskIds.length === 0) {
      return { ok: true, summary: 'Nothing is in this evening, so nothing changed.', data: { done: 0, back, tasks: [] } };
    }

    const outcome = await runBatch(taskIds, async (taskId) => {
      const found = findTaskAnywhere(ctx.store.getState(), taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };
      if (found.location === 'subtask') {
        return { ok: false as const, title: found.task.title, reason: 'it is a step inside another task, and only a whole task has an evening — send its task.' };
      }
      const task = ctx.store.getState().backlogTasks.find((t) => t.id === taskId);
      if (!task) return { ok: false as const, title: found.task.title, reason: missingIdReason('task') };
      if (task.status === 'completed') {
        return { ok: false as const, title: task.title, reason: 'it is already finished, so it has no evening to go to.' };
      }

      if (isEvening(task.deadline) !== back) {
        return { ok: true as const, title: task.title, value: { taskId, moved: false, deadline: task.deadline } };
      }
      const patch = eveningPatch(task, ctx.now, ctx.timezone);
      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      ctx.store.updateBacklogTask(taskId, patch);
      return { ok: true as const, title: task.title, value: { taskId, moved: true, deadline: patch.deadline } };
    });

    return batchResult(
      outcome,
      (done) => {
        const moved = done.filter((entry) => entry.value.moved);
        const stayed = done.filter((entry) => !entry.value.moved);
        const parts: string[] = [];
        if (moved.length > 0) {
          parts.push(back ? `Brought ${titleList(moved.map((e) => e.title))} back from the evening` : `Sent ${titleList(moved.map((e) => e.title))} to this evening`);
        }
        if (stayed.length > 0) {
          const where = back ? 'not in the evening' : 'already in the evening';
          parts.push(`${titleList(stayed.map((e) => e.title))} ${stayed.length === 1 ? 'was' : 'were'} ${where}, so nothing changed`);
        }
        return `${parts.join('; ')}.`;
      },
      { back, tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

/** Every open, top-level task due today after 6pm — what "everything in this evening" means. */
function eveningTonight(backlog: readonly { id: string; parent?: string; status: string; deadline?: string }[], now: Date, timeZone: string): string[] {
  const today = toZonedDayString(now, timeZone);
  return backlog
    .filter((t) => !t.parent && t.status !== 'completed' && t.deadline?.startsWith(today) && isEvening(t.deadline))
    .map((t) => t.id);
}
