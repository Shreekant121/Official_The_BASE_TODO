import { type Task, getBlockingTasks, taskEstimatedMinutes } from '../store/useStore';
import { scoreAll, type ScoreBreakdown } from './priority';

/*
 * `taskEstimatedMinutes` and `DEFAULT_TASK_MINUTES` used to be defined here.
 * They moved to `store/useStore.ts` when the Calendar block became a third
 * caller: the block runs for exactly as long as this says the task takes, so
 * the number has to be the same one the priority score reasons about. Since
 * item 16 it IS that one — `taskEstimatedMinutes` is `durationMinutes` from
 * `lib/priority.ts` under the app's own name for it, so the two cannot
 * disagree by construction rather than by adjacency.
 */

/**
 * A candidate Smart Start refused to schedule because it is waiting on
 * something else. `blockers` are the prerequisites still standing in its way:
 * incomplete, and not themselves in the queue.
 *
 * A task stays in this list even once the user has overridden the hold and it
 * *is* in the queue — the row it drives in `SmartStartModal` is a toggle, and a
 * list whose rows vanish as you click them cannot be un-clicked.
 */
export interface HeldBackTask {
  task: Task;
  blockers: Task[];
}

export interface SmartQueue {
  /** Today's queue, in the order it should be worked — a blocker always ahead of what it blocks. */
  queue: Task[];
  /** Everything withheld because a prerequisite isn't done, ranked the same way the queue is. */
  heldBack: HeldBackTask[];
}

export interface SmartQueueOptions {
  /**
   * Ids the user pressed "Schedule anyway" on. Such a task is admitted at its
   * own rank **in spite of both its prerequisites and the hour budget**, and
   * its minutes are not charged against that budget.
   *
   * Both halves are deliberate. A button that silently did nothing whenever the
   * budget happened to be full would be worse than not offering it; and a
   * button that made room by quietly dropping a task the user had already read
   * in the preview would be worse still. Pressing it adds exactly one task and
   * changes nothing else. The queue then runs over the hour, which is real, so
   * `SmartStartModal` says by how much.
   */
  overrides?: ReadonlySet<string>;
  /**
   * The app's one scoring pass, from `usePriorityScores()`.
   *
   * It is passed in rather than computed here because the dependency graph is
   * a property of the **whole backlog** and this function is routinely handed
   * a filtered slice of it — New Session calls it with the tasks not already
   * queued. Scoring that slice would make a blocker's Bottleneck count depend
   * on which screen asked, and the ranking below is the one thing this
   * function exists to get right.
   *
   * Omitted, it scores what it was given against the wall clock. That is the
   * honest fallback for a test, and the reason no caller in the app takes it:
   * a screen that let this run its own pass would be a second ranking
   * authority.
   */
  scores?: { scoreOf: (task: Task) => number };
  /**
   * Ignored work (BIG-3) — `usePriorityScores().ignored.ids`. **Never offered**,
   * his call: an ignored task is not a candidate, and a task waiting on one
   * cannot be admitted with its chain, because admitting the chain would offer
   * the ignored prerequisite. It is held back instead and says what it waits on.
   */
  ignored?: ReadonlySet<string>;
}

const NO_OVERRIDES: ReadonlySet<string> = new Set();
const NOTHING_IGNORED: ReadonlySet<string> = new Set();

/**
 * One pass over whatever this was handed, against the wall clock. Only reached
 * when no caller supplied `scores` — see `SmartQueueOptions.scores`.
 */
function fallbackScorer(tasks: Task[]): (task: Task) => number {
  const map: ReadonlyMap<string, ScoreBreakdown> = scoreAll(tasks, Date.now());
  return (task) => map.get(task.id)?.score ?? 0;
}

/**
 * The copy of a task that goes into today's queue: `allocatedTime` (seconds)
 * stamped from the one duration, so Set Deadlines and Focus Mode already have a
 * per-task clock to work from — and `scheduledAnyway` when it got there by an
 * override. See `admit` in `buildSmartQueue` for why those two travel together.
 */
function queueCopy(task: Task, overridden: boolean): Task {
  return {
    ...task,
    allocatedTime: Math.round(taskEstimatedMinutes(task) * 60),
    ...(overridden ? { scheduledAnyway: true } : {}),
  };
}

/**
 * Everything `task` is still waiting on that isn't in `excluded` already,
 * ordered deepest-first so pushing the array in order can never place a task
 * ahead of its own prerequisite.
 *
 * `schedulable` is false when the chain cannot be scheduled at all — a
 * prerequisite that is a subtask has no row of its own to put in a queue, so
 * the group is impossible and the dependent has to be held back instead. The
 * rest of the chain is still walked and returned, for `planStartNow`.
 *
 * A prerequisite that no longer exists, or is already done, is not a
 * prerequisite; that is the same reading `getBlockingTasks` takes, so a stale
 * dependency never withholds a task for ever.
 *
 * `seen` keeps the walk safe against a dependency cycle. The picker refuses
 * to build one (`wouldCreateDependencyCycle`), but nothing re-validates data
 * that arrived from an older version of the app or through the agent, and a
 * cold start that hangs would be a far worse failure than a queue in the
 * wrong order.
 *
 * Module-level since BUILD-2, which asks the same question about one task.
 */
function prerequisiteChainOf(
  task: Task,
  byId: ReadonlyMap<string, Task>,
  excluded: ReadonlySet<string>,
  ignored: ReadonlySet<string> = NOTHING_IGNORED,
): { chain: Task[]; schedulable: boolean } {
  const chain: Task[] = [];
  const seen = new Set<string>([task.id]);
  let schedulable = true;

  const visit = (current: Task) => {
    for (const id of current.dependsOn ?? []) {
      if (excluded.has(id) || seen.has(id)) continue;
      const dep = byId.get(id);
      if (!dep || dep.status === 'completed') continue;
      // An ignored prerequisite is never offered (BIG-3), so it cannot come
      // along with its dependent: the group is impossible, like a subtask's.
      if (dep.parent || ignored.has(id)) { schedulable = false; continue; }
      seen.add(id);
      visit(dep);
      chain.push(dep);
    }
  };

  visit(task);
  return { chain, schedulable };
}

/**
 * What "Start now" on one task does (BUILD-2).
 *
 * - `start` — the task can be worked right now. `queue` is today's whole queue
 *   for it: that one task, stamped exactly as Smart Start stamps a task.
 * - `blocked` — it is waiting on unfinished work. Shreekant's instruction was
 *   *"just leave that one and give an option to start tasks that block it"*,
 *   so there is no override here, and `startable` is what can be offered
 *   instead: the prerequisites anywhere in its chain that are **not waiting on
 *   anything themselves**, deepest first. A direct blocker that is itself
 *   blocked is not offered — pressing it would only land on this same answer
 *   one step down — but what it waits on is. Nothing is offered from a branch
 *   with no bottom: a dependency cycle, or a prerequisite that is a subtask,
 *   which has no row of its own (the reading `buildSmartQueue` takes). So
 *   `startable` can be empty, and the menu says so rather than refusing.
 *   `blockers` are the direct ones, for the sentence that names them.
 * - `unavailable` — nothing to start: the task is finished, is a subtask row,
 *   or is not in the backlog at all.
 *
 * Same chain walk as `buildSmartQueue`, on purpose — the item forbids a
 * second opinion about whether a task can start.
 */
export type StartNowPlan =
  | { kind: 'start'; queue: [Task] }
  | { kind: 'blocked'; blockers: Task[]; startable: Task[] }
  | { kind: 'unavailable' };

const NOTHING_QUEUED: ReadonlySet<string> = new Set();

export function planStartNow(
  backlogTasks: Task[],
  taskId: string,
  ignored: ReadonlySet<string> = NOTHING_IGNORED,
): StartNowPlan {
  const byId = new Map(backlogTasks.map((t) => [t.id, t]));
  const task = byId.get(taskId);
  if (!task || task.status === 'completed' || task.parent) return { kind: 'unavailable' };

  // "Start now" on an ignored task itself is his own press on its own row, and
  // it starts; what is never done is *offering* one (BIG-3), so an ignored
  // prerequisite is left out of `startable` below.
  const free = (t: Task) => {
    const { chain, schedulable } = prerequisiteChainOf(t, byId, NOTHING_QUEUED);
    return schedulable && chain.length === 0;
  };
  if (free(task)) return { kind: 'start', queue: [queueCopy(task, false)] };

  const startable = prerequisiteChainOf(task, byId, NOTHING_QUEUED)
    .chain.filter((t) => !ignored.has(t.id))
    .filter(free);
  return { kind: 'blocked', blockers: getBlockingTasks(backlogTasks, task), startable };
}

/**
 * Builds a "cold start" focus queue that fits inside `hoursAvailable`.
 *
 * - Considers only incomplete, top-level backlog tasks (subtasks roll up
 *   through their parent, so they're never scheduled on their own here) that
 *   are not ignored (BIG-3).
 * - Ranks by the priority score descending, breaking ties by the earliest
 *   deadline (a task with a deadline always sorts ahead of one without).
 * - Greedily fills the hour budget: walks the ranked list and takes each task
 *   whose estimated duration still fits the remaining time, skipping ones too
 *   big to fit so smaller high-value tasks further down can still slot in.
 * - **Never schedules a task ahead of a prerequisite it is still waiting on.**
 *   A blocked task is admitted only together with everything it waits on, all
 *   of it or none of it, and those prerequisites are pushed *first* — which is
 *   why filtering alone would not have been enough. Ranking is by score, and a
 *   blocker used to score below the task it blocks routinely. **Item 16
 *   reversed that** — the Conductivity floor puts a blocker above whatever it
 *   is holding up, always — so rank order now gets the pair right on its own.
 *   The grouping still earns its place: it admits a group whole or not at all
 *   against the budget, it refuses a chain whose prerequisite is a subtask,
 *   and it is what orders a dependency cycle, which has no floor to rank by.
 * - Everything still blocked afterwards comes back in `heldBack` rather than
 *   vanishing, so the modal can explain the absence and offer to override it.
 * - Always returns at least one task (with whatever it waits on ahead of it) so
 *   a one-button start never lands on an empty queue.
 * - Stamps `allocatedTime` (seconds) on every returned task so Set Deadlines /
 *   Focus Mode already have a per-task duration to work from, and
 *   `scheduledAnyway` on the ones admitted by an override — see `admit`.
 */
export function buildSmartQueue(
  hoursAvailable: number,
  backlogTasks: Task[],
  options: SmartQueueOptions = {},
): SmartQueue {
  const overrides = options.overrides ?? NO_OVERRIDES;
  const ignored = options.ignored ?? NOTHING_IGNORED;
  const budgetMinutes = Math.max(0, hoursAvailable) * 60;
  const scoreOf = options.scores?.scoreOf ?? fallbackScorer(backlogTasks);

  const byId = new Map(backlogTasks.map((t) => [t.id, t]));

  const candidates = backlogTasks
    .filter((t) => t.status !== 'completed' && !t.parent && !ignored.has(t.id))
    .sort((a, b) => {
      const scoreDiff = scoreOf(b) - scoreOf(a);
      if (scoreDiff !== 0) return scoreDiff;
      // Tie-break: earliest deadline first; tasks without a deadline sort last.
      const aTime = a.deadline ? new Date(a.deadline).getTime() : Infinity;
      const bTime = b.deadline ? new Date(b.deadline).getTime() : Infinity;
      return aTime - bTime;
    });

  const queue: Task[] = [];
  const queuedIds = new Set<string>();
  let spentMinutes = 0;

  /**
   * `charge: false` is the override path — see `SmartQueueOptions.overrides`.
   *
   * It is also the only path that stamps `scheduledAnyway`, and the two travel
   * together for one reason: they are the same press. Item 19 locks a blocked
   * task out of being completed on every screen, so an override that admitted
   * the task and left it locked would hand you a row in today's queue that
   * Focus Mode refuses to tick — the button meaning nothing exactly one screen
   * later, which is what the settled decision says must not happen.
   *
   * A task admitted **with** its prerequisite is deliberately not stamped. It
   * was not overridden; it was scheduled in the right order, and if you skip
   * the prerequisite it should lock again.
   */
  const admit = (task: Task, charge = true) => {
    queue.push(queueCopy(task, !charge));
    queuedIds.add(task.id);
    if (charge) spentMinutes += taskEstimatedMinutes(task);
  };

  /** `null` when the chain cannot be scheduled — see `prerequisiteChainOf`. */
  const prerequisiteChain = (task: Task): Task[] | null => {
    const { chain, schedulable } = prerequisiteChainOf(task, byId, queuedIds, ignored);
    return schedulable ? chain : null;
  };

  for (const task of candidates) {
    if (queuedIds.has(task.id)) continue;

    const chain = prerequisiteChain(task);
    const blocked = chain === null || chain.length > 0;

    // An override only means anything to a task that is actually being held
    // back. Letting it apply to an unblocked one would quietly exempt it from
    // the budget as well, with nothing left on screen to explain the overrun.
    if (blocked && overrides.has(task.id)) { admit(task, false); continue; }

    // Nothing to try: what this one waits on has no row of its own to schedule.
    if (chain === null) continue;

    const group = [...chain, task];
    const cost = group.reduce((sum, t) => sum + taskEstimatedMinutes(t), 0);
    if (spentMinutes + cost <= budgetMinutes) for (const t of group) admit(t);
  }

  // Guarantee a non-empty cold start: if nothing fit the budget, take the
  // highest-ranked task that can be scheduled anyway — together with whatever
  // it is waiting on, since a blocked task standing on its own is the one thing
  // this queue must never contain.
  if (queue.length === 0) {
    for (const task of candidates) {
      const chain = prerequisiteChain(task);
      if (chain === null) continue;
      for (const t of [...chain, task]) admit(t);
      break;
    }
  }

  // Anything whose prerequisites did not come with it. Direct blockers only:
  // "waiting on X" is what the user can act on, and X's own blocker gets its
  // own row.
  const heldBack: HeldBackTask[] = [];
  for (const task of candidates) {
    const blockers = getBlockingTasks(backlogTasks, task).filter((b) => !queuedIds.has(b.id));
    if (blockers.length > 0) heldBack.push({ task, blockers });
  }

  return { queue, heldBack };
}
