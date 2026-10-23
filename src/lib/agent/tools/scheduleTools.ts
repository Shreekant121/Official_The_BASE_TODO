import { defineTool, requiredString, requiredStringArray, ToolArgError } from '../toolKit';
import type { ToolDef, ToolResult } from '../types';
import { describeDate, resolveDateInput } from '../dates';
import { taskEstimatedMinutes } from '../../../store/useStore';
import { useEventStore } from '../../../store/useEventStore';
import { dragRefusal, droppedDeadline } from '../../calendar/snapDrag';
import { trayTasks } from '../../calendar/tray';
import { priorityScores } from '../../../store/usePriorityScores';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { BATCH_CAP, SEARCH_RESULT_CAP, compactRow, findTaskAnywhere } from './taskTools';

/**
 * 29-2e3a, IDEA 125 — DRAGGING A BLOCK ON THE CALENDAR, FOR ATLAS.
 *
 * On the Calendar's hours he drags a task's block to a time, and it is due
 * when the block ends there: its top at 3pm, an hour's task due at 4pm (his
 * call, 2026-10-21: the drop sets the deadline, as every block in BASE ends
 * at its deadline). "Do the invoice at 3pm" is that drop, and the arithmetic
 * is `droppedDeadline`, the drag's own, so the two cannot disagree — a model
 * handed `update_task` would set the deadline to 3pm and the block would run
 * 2-3pm instead.
 *
 * Several tasks go one after another from the start, in the order given:
 * "the invoice and the call from 3pm" fills the afternoon without the model
 * adding lengths. It refuses what the drag refuses: a finished task, and one
 * due before an event (it follows the event; `update_task` with
 * `clear: ['eventId']` unties it first).
 *
 * It writes through `updateBacklogTask`, the one path, so the deadline maths
 * runs and Google's block follows; every task is captured first, so Revert on
 * `/log` puts each deadline back. Free, like `send_to_evening`.
 */
export const scheduleTask: ToolDef = defineTool({
  name: 'schedule_task',
  mutates: true,
  description:
    'Put tasks on the calendar at a start time — "do the invoice at 3pm", "gym tomorrow at 7am", "the call and the ' +
    'report from 2pm". As dragging a block on the Calendar: the task starts there and is due when it ends (the start ' +
    'plus its length). Several tasks go one after another, in the order given. For a due time ("due by 5pm"), use ' +
    'update_task.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact ids from search_tasks, list_all_tasks or list_today, in the order they should run.',
      },
      start: {
        type: 'string',
        description:
          'When the first one starts: "YYYY-MM-DDTHH:mm", in the user\'s timezone, which is given to you every turn. It ' +
          'needs a time of day.',
      },
    },
    required: ['taskIds', 'start'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const taskIds = [...new Set(requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' }))];
    const raw = requiredString(args, 'start');
    const resolved = resolveDateInput(raw, ctx.now, ctx.timezone);
    if (!resolved.ok) throw new ToolArgError(`"start": ${resolved.error}`);
    if (!/\d{2}:\d{2}/.test(raw)) throw new ToolArgError('"start" needs a time of day, as "YYYY-MM-DDTHH:mm".');
    const [day, clock] = resolved.value.split('T');
    const [h, m] = clock.split(':').map(Number);
    let at = { day, start: h * 60 + m };

    const outcome = await runBatch(taskIds, async (taskId) => {
      const found = findTaskAnywhere(ctx.store.getState(), taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };
      if (found.location === 'subtask') {
        return { ok: false as const, title: found.task.title, reason: 'it is a step inside another task, and only a whole task has a block on the calendar — schedule its task.' };
      }
      const task = ctx.store.getState().backlogTasks.find((t) => t.id === taskId);
      if (!task) return { ok: false as const, title: found.task.title, reason: missingIdReason('task') };
      const refusal = dragRefusal(task);
      if (refusal === 'done') {
        return { ok: false as const, title: task.title, reason: 'it is already finished, and a finished block stays where it was done.' };
      }
      if (refusal === 'event') {
        const event = useEventStore.getState().events.find((e) => e.id === task.eventId);
        return {
          ok: false as const,
          title: task.title,
          reason: `it is due before ${event ? `"${event.title}"` : 'an event'} and moves with it. To give it its own time, untie it first with update_task and clear: ["eventId"].`,
        };
      }

      const deadline = droppedDeadline(at.day, at.start, taskEstimatedMinutes(task));
      const starts = `${at.day}T${String(Math.floor(at.start / 60)).padStart(2, '0')}:${String(at.start % 60).padStart(2, '0')}`;
      const [nextDay, nextClock] = deadline.split('T');
      const [nh, nm] = nextClock.split(':').map(Number);
      at = { day: nextDay, start: nh * 60 + nm };
      if (task.deadline === deadline) {
        return { ok: true as const, title: task.title, value: { taskId, moved: false, starts, deadline } };
      }
      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      ctx.store.updateBacklogTask(taskId, { deadline });
      return { ok: true as const, title: task.title, value: { taskId, moved: true, starts, deadline } };
    });

    return batchResult(
      outcome,
      (done) => {
        const moved = done.filter((entry) => entry.value.moved);
        const stayed = done.filter((entry) => !entry.value.moved);
        const parts: string[] = [];
        if (moved.length > 0) {
          const first = moved[0].value;
          parts.push(
            moved.length === 1
              ? `Put ${titleList(moved.map((e) => e.title))} at ${describeDate(first.starts, ctx.timezone)}, due ${dueWords(first.starts, first.deadline, ctx.timezone)}`
              : `Put ${titleList(moved.map((e) => e.title))} one after another from ${describeDate(first.starts, ctx.timezone)}, the last due ${dueWords(first.starts, moved[moved.length - 1].value.deadline, ctx.timezone)}`,
          );
        }
        if (stayed.length > 0) {
          parts.push(`${titleList(stayed.map((e) => e.title))} ${stayed.length === 1 ? 'was' : 'were'} already there, so nothing changed`);
        }
        return `${parts.join('; ')}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

/** "16:00" on the day it starts; the whole date when the block runs past midnight. */
function dueWords(starts: string, deadline: string, timeZone: string): string {
  return deadline.slice(0, 10) === starts.slice(0, 10) ? deadline.slice(11) : describeDate(deadline, timeZone);
}

/**
 * 29-2e3b — THE CALENDAR'S "NO DATE" TRAY, FOR ATLAS.
 *
 * The tray lists his tasks with no deadline, the highest score first, and he
 * drags one onto the hours to give it a time. "What have I not given a date
 * to?" and "put my two most important undated tasks at 2pm" are that tray: this
 * reads it in the tray's own order (`trayTasks`, on the app's one scoring
 * pass), `schedule_task` is the drag, and `update_task` with `clear:
 * ["deadline"]` is a block dragged back onto it. `search_tasks` with
 * `hasDeadline: false` finds the same tasks but ranks them by the words, not
 * the score, so "the most important" would be a guess.
 */
export const listUndated: ToolDef = defineTool({
  name: 'list_undated',
  mutates: false,
  description:
    'The tasks with no deadline, the most important (highest score) first: the Calendar’s "No date" tray. Use it ' +
    'for "what have I not scheduled?" or "my most important undated tasks". Returns at most ' + SEARCH_RESULT_CAP +
    ' rows with the length of each in minutes. To give them a time, schedule_task; to take the date off a task ' +
    '(back to the tray), update_task with clear: ["deadline"].',
  parametersSchema: { type: 'object', properties: {}, required: [] },
  execute: async (_args, ctx): Promise<ToolResult> => {
    const state = ctx.store.getState();
    const scores = priorityScores(state.backlogTasks, state.taskLists, Math.floor(ctx.now.getTime() / 60_000), state.projects);
    const tray = trayTasks(state.backlogTasks, scores.scoreOf, scores.ignored.ids);
    const shown = tray.slice(0, SEARCH_RESULT_CAP).map((task) => ({
      ...compactRow(state, task),
      minutes: taskEstimatedMinutes(task),
      score: Math.round(scores.scoreOf(task) * 10) / 10,
    }));
    const truncated = tray.length > shown.length;
    return {
      ok: true,
      summary:
        tray.length === 0
          ? 'Every open task has a deadline: the "No date" tray is empty.'
          : `${tray.length} task${tray.length === 1 ? '' : 's'} with no deadline, the most important first` +
            (truncated ? `; the first ${shown.length} are here.` : '. That is all of them.'),
      data: { tasks: shown, total: tray.length, truncated },
    };
  },
});
