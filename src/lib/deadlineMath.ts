/**
 * **The one deadline rule.**
 *
 * `newDeadline = max(existing deadline, Max(prerequisite deadlines) + 1 day)`
 *
 * That single line is the whole of the app's automation over dates. It
 * propagates a delay all the way downstream *and* preserves slack you
 * deliberately left, because a task already scheduled a fortnight after its
 * prerequisite stays where it is. The separately-proposed "shift everything
 * downstream by the same delta" was deleted before it was built: it is a
 * second implementation of the same job that would eventually disagree with
 * the first, and re-running this rule after any deadline change gives the
 * downstream movement for free.
 *
 * Pure — no clock, no store, no I/O. `now` is not even an argument, because
 * the rule does not ask what time it is: it compares dates to each other.
 * The timezone is, for the same reason `lib/recurrence.ts` takes one — "one
 * day later" means the same wall clock tomorrow, and across a DST boundary
 * that is not the same as 86,400,000 milliseconds.
 *
 * Five decisions are baked in here and each one is a thing the rule
 * deliberately does *not* do.
 *
 * **Push-only.** A deadline is never pulled earlier. If a prerequisite moves
 * *forward* nothing downstream tightens up — the slack you had is slack you
 * still have, and an app that silently pulls your dates in is an app you stop
 * trusting with them.
 *
 * **An undated task is left undated.** The rule takes a `max` against an
 * existing deadline, and a task with none has nothing to push. Giving it one
 * would be the app inventing a date out of the graph, which is the same thing
 * rollover was cut for — and it would start the task scoring Deadline
 * Proximity against a date nobody chose.
 *
 * **Completed tasks neither push nor are pushed.** A finished prerequisite has
 * already finished; its deadline is history, and pushing something downstream
 * because of a date that is no longer a constraint is simply wrong. And moving
 * a *completed* task's deadline rewrites the record of what happened. This is
 * the same reading `getBlockingTasks` and the Bottleneck variable already
 * take: the graph is made of incomplete work.
 *
 * **A fixed task goes loud instead of moving.** `deadlineIsFixed` is the
 * opt-out, and it exists because this module is the first thing in the app
 * that can move a date on its own. A fixed task that the rule says is now
 * impossible comes back as a **conflict** rather than a move — *"this cannot
 * be finished on time and the date cannot move"* is a real answer and the one
 * thing the app could not previously give. Its own date still propagates
 * downstream unchanged, because its date is still the fact everything after it
 * has to live with. **A task linked to an event is fixed too** (29-2d1,
 * `eventId`): its date is the event's, which no prerequisite can move.
 *
 * **Nothing is silent.** Every move and every conflict comes back in the plan
 * so the caller can name it. The store hands them to a dismissible banner; see
 * `store/useUIStore.ts`.
 */
import { parseStoredDate, toTaskDateString, zonedParts, zonedTimeToInstant } from './agent/dates';

/**
 * **The gap between a prerequisite and what waits on it, in days.**
 *
 * One. It is the whole of this module's tuning, and it is here rather than
 * inline for the reason `lib/priority.ts` keeps a `TUNING` block: how the
 * system *feels* — how much breathing room it insists on between two pieces of
 * work — is a thing to argue with, and arguing with it should not mean reading
 * the arithmetic.
 */
export const DEADLINE_GAP_DAYS = 1;

/**
 * What the rule reads off a task. Narrower than `Task` on purpose, the same
 * way `PriorityTask` is: the fixture in the tests is then a literal rather
 * than a whole task record, and nothing here can quietly start depending on a
 * field it has no business reading.
 */
export interface DeadlineTask {
  id: string;
  title: string;
  status?: string;
  deadline?: string;
  originalDeadline?: string;
  deadlineIsFixed?: boolean;
  /** 29-2d1: due before an event — fixed, like `deadlineIsFixed`. */
  eventId?: string;
  dependsOn?: string[];
}

/** The prerequisite that forced a move or a conflict — the binding one, not all of them. */
export interface DeadlineCause {
  taskId: string;
  title: string;
  /** Its own deadline, after any push of its own. Stored `YYYY-MM-DDTHH:mm`. */
  deadline: string;
}

/** One task's date, moved. */
export interface DeadlineMove {
  taskId: string;
  title: string;
  /** Where it was. */
  from: string;
  /** Where the rule put it. */
  to: string;
  because: DeadlineCause;
  /**
   * Whether this is the push that writes `originalDeadline` — true the first
   * time a task is ever moved, false every time after. The escalator measures
   * lateness from that anchor, so a task pushed three times reads as three
   * weeks late rather than as freshly overdue.
   */
  anchored: boolean;
}

/** A task the rule cannot fix: its date is fixed and its prerequisite lands after it. */
export interface DeadlineConflict {
  taskId: string;
  title: string;
  /** The date it is holding, and will keep holding. */
  deadline: string;
  /** The date the rule would have moved it to, had it been allowed. */
  required: string;
  because: DeadlineCause;
}

/** What one task actually has written to it. Nothing else on the task is touched. */
export interface DeadlinePatch {
  taskId: string;
  deadline: string;
  /** Present only on a task's **first** push. Absent thereafter — see `anchored`. */
  originalDeadline?: string;
}

/**
 * The whole answer: what moved, what could not, and the writes that say so.
 *
 * `moves` and `patches` are the same events twice over — one shaped for a
 * sentence, one shaped for the store — deliberately, because the alternative
 * is a caller deriving the copy from the patch and getting `originalDeadline`
 * into a banner.
 */
export interface DeadlinePlan {
  moves: DeadlineMove[];
  conflicts: DeadlineConflict[];
  patches: DeadlinePatch[];
}

export interface DeadlineOptions {
  /**
   * How a stored `YYYY-MM-DDTHH:mm` should be read, and the zone a day is
   * added in. Defaults to nothing on purpose: every caller in the app knows
   * its zone, and a default here would be a second answer to the question
   * `lib/agent/dates.ts` exists to be the only answer to.
   */
  timeZone: string;
  /** Overridable for tests and for anyone who wants a wider gap. */
  gapDays?: number;
  /**
   * Ignored work (BIG-3), from `lib/ignoredWork.ts`. **No deadline maths**, his
   * call: an ignored task is never pushed by a prerequisite, and it pushes
   * nothing downstream either — it is read exactly as a finished task is, which
   * contributes no date. Its own date stays what he typed.
   */
  ignored?: ReadonlySet<string>;
}

const NOTHING_IGNORED: ReadonlySet<string> = new Set();

const EMPTY: DeadlinePlan = { moves: [], conflicts: [], patches: [] };

/**
 * `days` later, same wall clock.
 *
 * Not `+ n × 86_400_000`: on the two days a year a zone changes offset, that
 * arithmetic lands an hour out, and a deadline that drifts to 17:00 every
 * March is the kind of bug nobody reports and everybody notices.
 */
function addDaysInZone(instant: Date, days: number, timeZone: string): Date {
  const p = zonedParts(instant, timeZone);
  return zonedTimeToInstant({ ...p, day: p.day + days }, timeZone);
}

/**
 * **The rule, run over a whole backlog.**
 *
 * Resolution is a memoised depth-first walk up the `dependsOn` edges, so a
 * chain of any length settles in one pass and in the right order — a task's
 * prerequisites are resolved before it is, which is what makes "recursive"
 * mean anything. Every task resolves exactly once.
 *
 * **The cycle guard is the `visiting` set**, and it breaks a loop by reading
 * the back edge's *stored* deadline rather than its resolved one. A cycle has
 * no correct answer — A cannot come a day after B while B comes a day after A
 * — so the only thing that matters is that the walk terminates and never
 * invents an ever-later date by going round again. Which prerequisite in a
 * cycle gets read stale depends on where the walk entered it; that is
 * accepted, and it is not reachable through the UI anyway, since
 * `wouldCreateDependencyCycle` refuses the edge at edit time. This is the
 * second line of defence, for graphs that arrived from the agent, from a
 * restore, or from the cloud.
 */
export function planDeadlineCascade(
  tasks: readonly DeadlineTask[],
  { timeZone, gapDays = DEADLINE_GAP_DAYS, ignored = NOTHING_IGNORED }: DeadlineOptions,
): DeadlinePlan {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const active = (task: DeadlineTask): boolean => task.status !== 'completed' && !ignored.has(task.id);

  /** Resolved deadline per task, as an instant. `null` means "contributes nothing". */
  const resolved = new Map<string, Date | null>();
  const visiting = new Set<string>();
  const moves: DeadlineMove[] = [];
  const conflicts: DeadlineConflict[] = [];
  const patches: DeadlinePatch[] = [];

  const storedInstant = (task: DeadlineTask): Date | null =>
    active(task) ? parseStoredDate(task.deadline, timeZone) : null;

  function resolve(task: DeadlineTask): Date | null {
    const cached = resolved.get(task.id);
    if (cached !== undefined) return cached;
    // The back edge of a cycle. Read the stored date and do not recurse.
    if (visiting.has(task.id)) return storedInstant(task);

    const own = storedInstant(task);
    if (own === null) {
      // Completed, ignored, or undated. Either way it neither moves nor pushes.
      resolved.set(task.id, null);
      return null;
    }

    visiting.add(task.id);
    let required: Date | null = null;
    let cause: DeadlineCause | null = null;
    for (const prerequisiteId of task.dependsOn ?? []) {
      if (prerequisiteId === task.id) continue;
      const prerequisite = byId.get(prerequisiteId);
      // An id that resolves to nothing is dropped, exactly as
      // `getBlockingTasks` drops it: a dependency on a deleted task must never
      // invent a constraint.
      if (!prerequisite || !active(prerequisite)) continue;
      const prerequisiteDate = resolve(prerequisite);
      if (!prerequisiteDate) continue;
      const candidate = addDaysInZone(prerequisiteDate, gapDays, timeZone);
      if (required !== null && candidate.getTime() <= required.getTime()) continue;
      required = candidate;
      cause = {
        taskId: prerequisite.id,
        title: prerequisite.title,
        deadline: toTaskDateString(prerequisiteDate, timeZone),
      };
    }
    visiting.delete(task.id);

    // `max(existing, …)` — this is where push-only lives. Anything at or
    // before the date the task already holds simply loses the comparison.
    if (required === null || cause === null || required.getTime() <= own.getTime()) {
      resolved.set(task.id, own);
      return own;
    }

    const requiredString = toTaskDateString(required, timeZone);
    const ownString = toTaskDateString(own, timeZone);

    if (task.deadlineIsFixed || task.eventId) {
      conflicts.push({
        taskId: task.id,
        title: task.title,
        deadline: ownString,
        required: requiredString,
        because: cause,
      });
      // It keeps its date, and its date is what everything after it inherits.
      resolved.set(task.id, own);
      return own;
    }

    // `originalDeadline` is written **once**, on a task's first push, and the
    // value written is the date it held before this move — the date it was
    // first given. A task that already carries one is left alone; the anchor
    // the escalator measures from must not creep forward with every push, or
    // pushing an overdue task would make it read as freshly late, which is the
    // exact inversion the field exists to prevent.
    const anchored = task.originalDeadline === undefined;
    moves.push({
      taskId: task.id,
      title: task.title,
      from: ownString,
      to: requiredString,
      because: cause,
      anchored,
    });
    patches.push({
      taskId: task.id,
      deadline: requiredString,
      ...(anchored ? { originalDeadline: ownString } : {}),
    });
    resolved.set(task.id, required);
    return required;
  }

  for (const task of tasks) resolve(task);

  return moves.length === 0 && conflicts.length === 0 ? EMPTY : { moves, conflicts, patches };
}

/** Nothing moved and nothing is impossible. The steady state, and the common one. */
export function isQuietPlan(plan: DeadlinePlan): boolean {
  return plan.moves.length === 0 && plan.conflicts.length === 0;
}

/**
 * **Does this edit need the rule re-run?**
 *
 * Three fields, and only three: the date itself, who this task waits on, and
 * whether its date is allowed to move. Completion is the fourth, because a
 * task reopened re-enters the graph as a prerequisite carrying a date that was
 * not a constraint a moment ago — and if that makes something downstream
 * impossible, the moment to say so is now.
 *
 * Everything else a task edit can touch — a title, an estimate, a tag — leaves
 * the graph exactly as it was, and running a cascade over it would be a pass
 * that can only ever conclude nothing.
 */
export function affectsDeadlines(before: DeadlineTask, updates: Partial<DeadlineTask>): boolean {
  if ('deadline' in updates && updates.deadline !== before.deadline) return true;
  if ('deadlineIsFixed' in updates && !!updates.deadlineIsFixed !== !!before.deadlineIsFixed) return true;
  if ('eventId' in updates && !!updates.eventId !== !!before.eventId) return true;
  if ('status' in updates && updates.status !== before.status) return true;
  if ('dependsOn' in updates) {
    const next = updates.dependsOn ?? [];
    const previous = before.dependsOn ?? [];
    if (next.length !== previous.length || next.some((id, i) => id !== previous[i])) return true;
  }
  return false;
}
