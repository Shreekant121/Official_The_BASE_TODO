/**
 * What completing — or un-completing — a repeating task does to the backlog.
 *
 * `recurrence.ts` answers *when* a repeating task comes round again and builds
 * the successor as data. This module is the bit in between that and the store:
 * it decides whether a particular status change is a completion at all, and it
 * works out the whole edit as a plan so the store can apply it in one write.
 *
 * **There is exactly one place a task's status changes**, `updateBacklogTask`,
 * and that is why the wiring lives here rather than in the four screens that
 * complete things (Focus Mode's Done button, the status pills on the task card
 * and the needs-attention page, the outsourced-work approval, and the agent's
 * `complete_task`). Four call sites each remembering to spawn a clone is the
 * same shape as the six delete sites that each forgot a different part of the
 * cleanup, which is what `cascadeDelete.ts` exists to have stopped.
 *
 * A transition is judged from the pair (task before, task after), never from
 * the patch alone: saving the task card writes `status: 'completed'` on every
 * save, including saves of a task that was already completed, and each of
 * those must not spawn another copy.
 *
 * Nothing here mutates or reads a clock — `now`, the timezone and the id
 * factory arrive as arguments, exactly as in `recurrence.ts`.
 */
import type { FocusLogEntry, Task } from '../store/useStore';
import {
  buildSuccessorTask,
  nextOccurrence,
  occurrenceAt,
  occurrenceNumberOf,
  seriesAnchorOf,
} from './recurrence';

/** The slice of the store a transition has to see. */
export interface RecurrenceState {
  backlogTasks: Task[];
  /** Today's focus queue — a clone that reached it has been picked up. */
  tasks: Task[];
  /** Time logged, per task id. */
  focusLog: FocusLogEntry[];
}

export interface RecurrenceOptions {
  now: Date;
  timeZone: string;
  newId: () => string;
}

/**
 * The backlog edit a status change implies, over and above writing the status
 * itself. `null` means the change was not a completion or un-completion of a
 * repeating task, which is the overwhelmingly common case.
 */
export interface RecurrenceTransition {
  /**
   * Extra fields for the task whose status changed. On a first completion this
   * is the series identity — the row being completed becomes occurrence 1 of a
   * series, retrospectively — so that a later un-complete can find its way
   * back to the clone.
   */
  stamp?: Partial<Task>;
  /** The successor, to be inserted directly after the completed task. */
  successor?: Task;
  /** The successor being taken back, on an un-complete. */
  removeId?: string;
}

export function planRecurrenceTransition(
  state: RecurrenceState,
  before: Task,
  after: Task,
  options: RecurrenceOptions,
): RecurrenceTransition | null {
  const wasDone = before.status === 'completed';
  const isDone = after.status === 'completed';
  if (wasDone === isDone) return null;
  return isDone ? planSpawn(after, options) : planRollback(state, before, options.timeZone);
}

// ─── Completing ──────────────────────────────────────────────────────────────

/**
 * `after` rather than `before` is what the successor is built from: a save
 * from the task card carries the whole form, so the tick that completed a task
 * may have arrived alongside a retitle or a new estimate, and the copy should
 * carry the work as it was left, not as it was found.
 */
function planSpawn(after: Task, options: RecurrenceOptions): RecurrenceTransition | null {
  const next = nextOccurrence(after, options.now, options.timeZone);
  if (next.kind !== 'next') return null;

  const seriesId = after.seriesId ?? options.newId();
  const successor = buildSuccessorTask(after, next, {
    newId: options.newId,
    seriesId,
    createdAt: options.now.getTime(),
  });

  // A task set to repeat carries none of the three series fields until the
  // first time it is finished — see the note on `Task.seriesId`. Stamping them
  // on now is what turns "a task with a repeat rule" into "occurrence 1 of a
  // series", and `occurrence` in particular is what stops the next completion
  // starting the count again.
  const stamp: Partial<Task> = {};
  if (!after.seriesId) stamp.seriesId = seriesId;
  if (!Number.isFinite(after.occurrence)) stamp.occurrence = 1;
  if (!after.seriesAnchor) {
    const anchor = seriesAnchorOf(after);
    if (anchor) stamp.seriesAnchor = anchor;
  }

  return { stamp: Object.keys(stamp).length > 0 ? stamp : undefined, successor };
}

// ─── Un-completing ───────────────────────────────────────────────────────────

/**
 * Reopening a task takes back the copy its completion made — but only while
 * that copy is still untouched. Once it has been worked on it is somebody's
 * work, and silently deleting it because a tick was undone somewhere else
 * would be the worst outcome available.
 */
function planRollback(state: RecurrenceState, before: Task, timeZone: string): RecurrenceTransition | null {
  if (!before.seriesId) return null;

  const completed = occurrenceNumberOf(before);
  const successor = state.backlogTasks
    .filter((t) => t.seriesId === before.seriesId && t.id !== before.id && occurrenceNumberOf(t) > completed)
    .sort((a, b) => occurrenceNumberOf(a) - occurrenceNumberOf(b))[0];

  if (!successor || !isUntouched(state, before, successor, timeZone)) return null;
  return { removeId: successor.id };
}

/**
 * Whether `successor` is still exactly what completing `predecessor` produced.
 *
 * Rebuilt and compared whole, rather than checked against a list of "signs
 * somebody touched it". A list would have to be extended by hand every time
 * `Task` grows a field, and the failure of forgetting to is silent and
 * destructive — the clone gets deleted with the user's edit inside it. A
 * rebuild inverts that: anything unaccounted for reads as a difference, so the
 * clone survives. It also means the only judgement call being made here is the
 * one in `recurrence.ts` about what a successor *is*.
 *
 * The rebuild is exact because `occurrenceAt` measures from the series anchor
 * and so does not care how long ago the completion happened, and because the
 * predecessor was stamped with its series identity at spawn time, which makes
 * the two builds agree on `seriesId` too.
 *
 * Ids and `createdAt` are excluded at every depth — they are minted fresh on
 * every build by design (`resetSubtasks` mints new subtask ids so work on one
 * occurrence cannot tick off the next), so they can never match.
 *
 * Two things a rebuild cannot see are checked separately: a clone dragged into
 * today's focus queue, and time logged against it in Focus Mode. Both leave
 * the clone's own row alone.
 */
function isUntouched(state: RecurrenceState, predecessor: Task, successor: Task, timeZone: string): boolean {
  if (state.tasks.some((t) => t.id === successor.id)) return false;
  if (state.focusLog.some((entry) => entry.taskId === successor.id)) return false;

  const scheduled = occurrenceAt(predecessor, occurrenceNumberOf(successor), timeZone);
  if (!scheduled) return false;

  const expected = buildSuccessorTask(predecessor, scheduled, {
    newId: () => '',
    seriesId: predecessor.seriesId ?? '',
    createdAt: 0,
  });
  return sameContent(successor, expected, VOLATILE_FIELDS);
}

/** Minted per build, so never comparable. Applied at every depth. */
const VOLATILE_FIELDS: ReadonlySet<string> = new Set(['id', 'createdAt']);

/**
 * Structural equality, treating an absent key and an `undefined` one as the
 * same thing — which they are everywhere else in this app, and are not to
 * `JSON.stringify`.
 */
function sameContent(a: unknown, b: unknown, ignore: ReadonlySet<string>): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => sameContent(item, b[index], ignore));
  }

  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)].filter((key) => !ignore.has(key)));
  for (const key of keys) {
    if (!sameContent(left[key], right[key], ignore)) return false;
  }
  return true;
}
