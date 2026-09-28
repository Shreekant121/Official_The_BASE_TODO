/**
 * **One scoring pass for the whole app, and everything that reads it.**
 *
 * `lib/priority.ts` is pure and knows nothing about React or the store. This
 * is the seam between them: it takes `backlogTasks` and `taskLists`, runs
 * `scoreAll` once, and hands every screen the same map. Item 16's swap goes
 * through here — a read site that used to call `computePriorityScore(task)`
 * now calls `usePriorityScores()` once and looks the task up.
 *
 * **Why a shared pass and not a hook that scores what it is given.**
 * Bottleneck Severity walks everything downstream of a task and the
 * Conductivity floor needs the *final* score of the task being blocked, so a
 * per-screen pass over a filtered list would answer differently on every
 * screen — the board would rank a blocker by what it blocks *on the board*,
 * and Home by what it blocks on Home. The graph is a property of the backlog,
 * not of the viewport, so it is walked once over the whole backlog and every
 * screen reads the same answer.
 *
 * **The clock is a minute, deliberately.** The old scorer called `Date.now()`
 * inside every render, so it was exact and uncacheable; the new one takes
 * `now` as an argument, which means something has to decide when "now" moves.
 * A minute is far finer than anything the score can notice — the deadline
 * horizon is fourteen days and the sigmoid is measured in days — and it is
 * coarse enough that the memo actually holds across a render. One interval is
 * shared by every subscriber through `useSyncExternalStore`, and it does not
 * run at all while nothing is mounted.
 *
 * **`peak` is what a `/max` is drawn against**, since the settled decision
 * deleted the fixed ceiling: *"the ring fills against the highest score
 * currently on screen, since an absolute ceiling no longer exists"*. It is
 * computed here over the whole live backlog rather than per screen, which is
 * a knowing narrowing of that sentence: the same task appears on the board, in
 * Smart Start and on its own panel, and a denominator that changed between
 * them would make one task look like three different readings. One number,
 * app-wide, moving only when the backlog does.
 */
import { useMemo, useSyncExternalStore } from 'react';
import {
  scoreAll,
  scoreDraft,
  type PriorityTask,
  type ScoreBreakdown,
} from '../lib/priority';
import { useStore, type Task, type TaskList } from './useStore';

/** How often `now` moves. See the header — a minute is far finer than the score can read. */
const TICK_MS = 60_000;

// ─── The shared minute ───────────────────────────────────────────────────────

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let minute = Math.floor(Date.now() / TICK_MS);

function subscribe(onChange: () => void): () => void {
  /* The clock stops when the last reader unmounts, so the first one back in
     re-reads it. React re-checks the snapshot straight after subscribing and
     re-renders if it moved, which is the whole reason this belongs here and
     not in `getMinute` — that one has to be pure or every render tears. */
  if (listeners.size === 0) minute = Math.floor(Date.now() / TICK_MS);
  listeners.add(onChange);

  if (timer === null) {
    timer = setInterval(() => {
      const next = Math.floor(Date.now() / TICK_MS);
      if (next === minute) return;
      minute = next;
      for (const fn of listeners) fn();
    }, TICK_MS);
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Pure — the same answer for the whole of a render pass. */
function getMinute(): number {
  return minute;
}

// ─── The pass ────────────────────────────────────────────────────────────────

export interface PriorityScores {
  /** Epoch ms the whole pass was computed against. */
  now: number;
  /** Every backlog task's breakdown, by id. */
  map: ReadonlyMap<string, ScoreBreakdown>;
  /**
   * The highest score among incomplete tasks, floored at 1 so an empty
   * backlog cannot divide by zero. This is the `/max` every reading is drawn
   * against.
   */
  peak: number;
  /** How many incomplete tasks are inside their danger zone. The nav's count. */
  redAlertCount: number;
  /**
   * **How many incomplete tasks are carrying a live Emergency** (item 17).
   *
   * Counted off `variables.emergency`, not off the stored field, and the
   * difference is the whole point: an emergency whose anchor date has gone by
   * scores zero and has stopped meaning anything, so counting the field would
   * report a crowd of flags that are no longer doing anything. This is how
   * many are actually shouting — which is what the Emergency control's warning
   * past `EMERGENCY_CROWD` is about.
   */
  emergencyCount: number;
  /**
   * This task's breakdown.
   *
   * A task the pass never saw is scored on its own with both graph variables
   * at zero — which is the truth, not an approximation, for the two shapes
   * that reach a row without being in the backlog: a **subtask proxy** dragged
   * into "Selected for Today" (nothing can depend on a subtask, so it has no
   * position in the graph) and a focus-queue snapshot of a task that has since
   * been deleted.
   */
  read: (task: PriorityTask) => ScoreBreakdown;
  /** `read(task).score`, for the sort comparators that want a bare number. */
  scoreOf: (task: PriorityTask) => number;
  /**
   * **The task being edited.** The panel's ring has to move while a dial is
   * dragged, and a map keyed by saved id cannot answer for an unsaved draft.
   *
   * So this takes the graph half — how many tasks are stuck behind this one,
   * and what the worst of them is worth — from the saved breakdown, and
   * recomputes only the half an edit can actually change. Dragging Human
   * Override cannot alter the graph; shortening a blocker can, and does, which
   * is why the conductivity *coefficient* is recomputed from the draft while
   * `highestBlockedScore` comes from the saved side.
   *
   * A brand-new task has no saved side and gets 0 for the graph half — not an
   * approximation, since nothing can depend on a task that does not exist yet.
   */
  readDraft: (draft: PriorityTask) => ScoreBreakdown;
}

let cache: {
  tasks: readonly Task[];
  lists: readonly TaskList[];
  minute: number;
  value: PriorityScores;
} | null = null;

/**
 * The memoised pass. Exported for the places that have the arrays but not a
 * React tree — nothing does yet, and the moment something does it must not
 * start a second scoring authority.
 */
export function priorityScores(
  tasks: readonly Task[],
  lists: readonly TaskList[],
  atMinute: number,
): PriorityScores {
  if (cache && cache.tasks === tasks && cache.lists === lists && cache.minute === atMinute) {
    return cache.value;
  }

  const now = atMinute * TICK_MS;
  const map = scoreAll(tasks, now, { taskLists: lists });

  let peak = 1;
  let redAlertCount = 0;
  let emergencyCount = 0;
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    const entry = map.get(task.id);
    if (!entry) continue;
    if (entry.score > peak) peak = entry.score;
    if (entry.redAlert) redAlertCount += 1;
    if (entry.variables.emergency > 0) emergencyCount += 1;
  }

  const read = (task: PriorityTask): ScoreBreakdown =>
    map.get(task.id) ?? scoreDraft(task, null, now, { taskLists: lists });

  const value: PriorityScores = {
    now,
    map,
    peak,
    redAlertCount,
    emergencyCount,
    read,
    scoreOf: (task) => read(task).score,
    readDraft: (draft) => scoreDraft(draft, map.get(draft.id) ?? null, now, { taskLists: lists }),
  };

  cache = { tasks, lists, minute: atMinute, value };
  return value;
}

/**
 * **The app's scores.** Stable across renders until the backlog, the lists or
 * the minute moves, so it is safe in a `useMemo` dependency list and safe to
 * call from as many components as want it — they all get the same object.
 */
export function usePriorityScores(): PriorityScores {
  const tasks = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const atMinute = useSyncExternalStore(subscribe, getMinute, getMinute);
  return useMemo(() => priorityScores(tasks, lists, atMinute), [tasks, lists, atMinute]);
}
