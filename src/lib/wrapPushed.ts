/**
 * The task he pushed most (29-1P14e2, idea 107's "pushed" page): read off
 * each task's story (29-1P9c, `users/{uid}/story/{taskId}`), which is the only
 * place a deadline's moves are kept. Pure: the stories, the backlog and the
 * days are arguments (`wrapPushed.test.ts`).
 *
 * A PUSH is a moment, inside the period, that sent the task later by his
 * hand (or Atlas's, asked by him):
 *   - **"Put off"** in Focus (`avoided`): always a push.
 *   - **A start date moved later** (`start`): later than the start the story
 *     last held, or, with none before it, later than the day it was set on —
 *     Tomorrow on a row is this one.
 *   - **A deadline moved later** (`deadline`): later than the deadline the
 *     story last held. The first deadline a story records has nothing to be
 *     later than, so it is never counted: setting a date is not pushing one.
 *     A move whose `because` names another task is item 18's cascade, the
 *     app's doing and not his, and is never counted.
 * Moves before the period still set what "later than" means. A story is the
 * last 30 moments, so a task pushed fifty times counts what is left of them.
 *
 * Only a task still on the board can be named (the Trash and the Archive are
 * not read for a page of the story), and ignored work is left out (BIG-3).
 * One push is not a story: the page wants at least `PUSHED_MIN`.
 */
import { dayOf } from './stats';
import type { StoryEvent } from './taskStory';
import type { FocusLogEntry, Task } from '../store/useStore';

/** Fewer pushes than this and there is no page. */
export const PUSHED_MIN = 2;

export interface PushedTask {
  id: string;
  title: string;
  /** Pushes inside the period. */
  pushes: number;
  done: boolean;
  /** Seconds on the timer this task has had, ever: "it took ten minutes". */
  seconds: number;
}

export interface PushedInput {
  stories: ReadonlyMap<string, readonly StoryEvent[]>;
  backlog: readonly Task[];
  /** Every day of the period, `YYYY-MM-DD`. */
  days: ReadonlySet<string>;
  focusLog: readonly FocusLogEntry[];
  /** Ignored work's task ids (`ignoredWork(...).ids`). */
  ignored: ReadonlySet<string>;
  timeZone: string;
}

/** `YYYY-MM-DD` of a stored date (`YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`). */
const dayPart = (stored: string) => stored.slice(0, 10);

/** How many of a story's moments inside `days` were pushes. */
export function countPushes(events: readonly StoryEvent[], days: ReadonlySet<string>, timeZone: string): number {
  let pushes = 0;
  let deadline: string | undefined;
  let start: string | undefined;
  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const inside = days.has(dayOf(e.at, timeZone));
    if (e.k === 'avoided') {
      if (inside) pushes += 1;
    } else if (e.k === 'start') {
      const to = e.to ? dayPart(e.to) : undefined;
      if (to && inside && to > (start ?? dayOf(e.at, timeZone))) pushes += 1;
      start = to;
    } else if (e.k === 'deadline') {
      const to = e.to ? dayPart(e.to) : undefined;
      if (to && inside && !e.because && deadline && to > deadline) pushes += 1;
      deadline = to;
    }
  }
  return pushes;
}

/** The task pushed most in the period, the newest-made of a tie; null under `PUSHED_MIN`. */
export function pushedMost(input: PushedInput): PushedTask | null {
  const { stories, backlog, days, focusLog, ignored, timeZone } = input;
  let best: { task: Task; pushes: number } | null = null;
  for (const task of backlog) {
    if (task.parent || task.isSubtaskProxy || ignored.has(task.id)) continue;
    const story = stories.get(task.id);
    if (!story || story.length === 0) continue;
    const pushes = countPushes(story, days, timeZone);
    if (pushes < PUSHED_MIN) continue;
    if (!best || pushes > best.pushes || (pushes === best.pushes && (task.createdAt ?? 0) > (best.task.createdAt ?? 0))) {
      best = { task, pushes };
    }
  }
  if (!best) return null;
  const { task, pushes } = best;
  const seconds = focusLog.reduce((sum, e) => sum + (e.taskId === task.id && e.seconds > 0 ? e.seconds : 0), 0);
  return { id: task.id, title: task.title, pushes, done: task.status === 'completed', seconds };
}

/** The line under the stamp. Never a scold: an open one is simply still there. */
export function pushedWords(pushed: Pick<PushedTask, 'done' | 'seconds'>, span: (seconds: number) => string): string {
  if (!pushed.done) return 'It is still on the list, waiting for its day.';
  if (pushed.seconds >= 3600) return `When you finally did it, it took ${span(pushed.seconds)}.`;
  const minutes = Math.round(pushed.seconds / 60);
  if (minutes >= 1) return `When you finally did it, it took ${minutes === 1 ? 'one minute' : `${minutes} minutes`}.`;
  return 'And then, one day, you just did it.';
}
