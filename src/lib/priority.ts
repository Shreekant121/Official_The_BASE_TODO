/**
 * How urgent is this task, really?
 *
 * The whole of the priority score lives here: seven capped variables, a
 * sigmoid that decides how much they add and how much they multiply, and a
 * floor that lifts a small task holding up a big one. Pure arithmetic — no
 * clock, no store, no I/O. `now` arrives as an argument and the timezone can
 * too, for the same reason `lib/recurrence.ts` takes both: the cases that go
 * wrong here are the ones nobody exercises by hand, and a test that depends on
 * the machine's Tuesday is a test that fails on Wednesday.
 *
 * **This is now the app's only scorer.** Item 16 moved every read site onto
 * `scoreAll`'s map and deleted `computePriorityScore`,
 * `computeTimePressureScore`, `computeDurationScore` and
 * `MAX_PRIORITY_SCORE`. Nothing calls a scoring function per task any more:
 * `store/usePriorityScores.ts` runs one pass over the whole backlog and every
 * screen looks a task up in it. That module is the only place this one is
 * called from inside the app.
 *
 * Four decisions shape everything below.
 *
 * **Time is measured to the latest start, not to the deadline.** Latest start
 * is `deadline − duration`: the last moment you can begin and still finish on
 * time. A two-hour task due at six and a two-week task due at six are not
 * equally urgent at four o'clock, and every deadline-shaped variable here
 * knows it. It is derived on demand and never stored — no new field, no cost
 * against the 1 MB sync document.
 *
 * **Adding and multiplying are both right, at different moments.** Seven
 * variables added give a calm, well-behaved ranking with a ceiling of 35. But
 * a situation that is genuinely compounding — late, and blocking six people,
 * and flagged an emergency — is not a sum, and a sum cannot lift it past a
 * merely important task. So the four *dynamic* variables also multiply, and a
 * sigmoid on how close the latest start is decides which of the two answers
 * you get. Outside the danger zone the score is the sum; inside it, the
 * product. The crossover is smooth and takes about six days.
 *
 * **A blocker inherits urgency from what it blocks, in proportion to how
 * cheap it is.** Fifteen minutes standing in front of the most important
 * thing you own is the most urgent thing you own. A full day of work standing
 * in front of it is just the work. That is the Conductivity Coefficient, and
 * it is a **floor** rather than a bonus so it can never double-count with
 * Bottleneck Severity: that variable counts *how many* things are stuck,
 * conductivity measures *how badly the worst one needs this*.
 *
 * **Every adjustable number is in `TUNING`.** How the system *feels* — how
 * sharply it panics, how far ahead it looks, how much a quick win is worth —
 * is changed there and nowhere else. Nothing below hardcodes a threshold.
 *
 * Subtasks are not scored at all. A subtask can never be a prerequisite
 * (`DependencyPicker` offers only top-level tasks), so it has no position in
 * the graph to score from. A subtask dragged into "Selected for Today"
 * becomes a proxy `Task` and is scored as one, with the two graph variables
 * at zero — which is what `scoreAll` does with it automatically, since a
 * proxy carries no `dependsOn` and nothing depends on it.
 */
import type { Task, TaskList } from '../store/useStore';
import { parseStoredDate, resolveUserTimeZone } from './agent/dates';
import { isProjectBackburner } from './backburner';

// ─── TUNING ──────────────────────────────────────────────────────────────────

/**
 * **Every number that decides how the system feels.**
 *
 * Nothing below this block hardcodes a threshold, a horizon or a cap. The
 * point is that the shape of the maths and the temperament of the app are
 * separate things: someone who finds the app panics too early moves one number
 * here, and no logic is touched, no test of *behaviour* is invalidated, and
 * nothing has to be re-derived.
 *
 * Two of these were chosen by Shreekant on 2026-09-09 rather than by the
 * design — `escalatorFullDays` and `runwayComfortDays`, both of which the
 * settled decisions specify the *shape* of and not the number. The third
 * unspecified one is `workDayHours`, which decides what "total remaining work"
 * means in days when a project's Runway is computed; eight hours is a working
 * day, and it is here to be argued with.
 */
export const TUNING = {
  /**
   * The cap on each of the seven variables. They add to 35, which is the
   * linear ceiling; the multiplicative one is `(9 + 1 + 5) + (5 × 5 × 5 × 5)`
   * = 640, an ~18× transition. Multiplying all seven would have given 28,125,
   * an 800× cliff no sigmoid can smooth away.
   */
  caps: {
    humanOverride: 9,
    deadlineProximity: 5,
    bottleneck: 5,
    duration: 1,
    emergency: 5,
    escalator: 5,
    avoided: 5,
  },

  /**
   * How far ahead the deadline countdown looks. A latest start 14 days out
   * scores 0; one that is now or past scores the full 5, linearly in between.
   */
  deadlineHorizonDays: 14,

  /**
   * Bottleneck Severity is `min(cap, coefficient × log₁₀(1 + n))` over the
   * count of transitively-blocked incomplete tasks. Logarithmic because the
   * difference between blocking one task and blocking two is enormous and the
   * difference between blocking forty and forty-one is nothing. At 2.5 the cap
   * is reached at 99 blocked tasks; blocking one scores 0.75, nine scores 2.5.
   */
  bottleneckCoefficient: 2.5,

  /**
   * The quick-win nudge, in minutes. Under `microMinutes` a task is worth the
   * full duration cap; up to `standardMinutes` it is worth half; beyond that,
   * nothing. Note there are no negative rungs any more — the old
   * `computeDurationScore` docked long tasks, this one simply stops rewarding
   * them, which is what a capped variable in a product has to do.
   */
  duration: { microMinutes: 30, standardMinutes: 120 },

  /**
   * What a task with no duration data at all is charged, in minutes. The
   * Micro/Standard boundary, so an unestimated task neither wins nor loses by
   * being unestimated. Same number as `DEFAULT_TASK_MINUTES` in the store, and
   * for the same reason.
   */
  defaultTaskMinutes: 30,

  /**
   * Days past `originalDeadline` at which the Post-deadline Escalator reaches
   * its cap. **Shreekant, 2026-09-09: two weeks.** It matches
   * `deadlineHorizonDays`, so the two halves of "time" in this score are on
   * one scale: a task missed this morning barely registers, one a week late is
   * at half volume, one two weeks late is shouting as loud as it ever will.
   */
  escalatorFullDays: 14,

  /**
   * The sigmoid's steepness, `a` in `1 / (1 + e^(−a(threshold − remaining)))`.
   * At 1 the transition from adding to multiplying spreads over roughly six
   * days. At 2 it happens inside three and reads as a step — the score jumps
   * and you cannot see why.
   */
  sigmoidSteepness: 1,

  /**
   * The Danger Zone. A task within `dangerThresholdDays` of its latest start
   * is at the sigmoid's midpoint, which is where multiplication starts
   * outweighing addition and where Red Alert fires.
   */
  dangerThresholdDays: 3,

  /**
   * How far the danger zone widens on a project that is running out of time.
   * At a Runway of zero the threshold is `dangerThresholdDays × runwayWidening`
   * — 12 days — so every task on a doomed project goes red together, which is
   * the true statement about it.
   */
  runwayWidening: 4,

  /**
   * The Runway at which widening *starts*, in days. **Shreekant, 2026-09-09:
   * two weeks.** Above this a project behaves normally; from here down to zero
   * the widening ramps in linearly. A project with no deadlines has no Runway
   * and gets the flat `dangerThresholdDays`, as does a task in no project.
   */
  runwayComfortDays: 14,

  /**
   * Hours in a working day, used only to turn a project's total remaining
   * estimated work into days so it can be subtracted from the time available.
   * **Not specified by the settled decisions** — eight is a working day.
   * Raising it makes projects look healthier; lowering it makes them go red
   * sooner.
   */
  workDayHours: 8,

  /**
   * The Conductivity Coefficient, `c = 1 + k / T` with `T` in hours floored at
   * `minHours`. A 15-minute blocker sits 5× above the task it holds up; 30 min
   * → 3×; 1 hour → 2×; 8 hours → 1.125×.
   */
  conductivity: { k: 1, minHours: 0.25 },

  /**
   * Red Alert is `W` past this — the sigmoid's midpoint, the precise moment
   * multiplication starts outweighing addition. Not an arbitrary cutoff.
   */
  redAlertW: 0.5,

  /**
   * Lists excluded from danger-zone escalation entirely: `W` is pinned to 0,
   * so their tasks are scored by the calm linear sum and can never go Red
   * Alert. A parking lot that screams is a parking lot you stop reading.
   * These are the two fixed slugs from `DEFAULT_LISTS`; the ids are what is
   * matched, not the titles, so renaming a list does not change its meaning.
   */
  excludedListIds: ['backburner', 'reference'] as readonly string[],
} as const;

/**
 * All seven caps added — 35, the ceiling on `S_linear` and the only ceiling
 * this system still has.
 *
 * It is **not** a ceiling on the score: inside the danger zone the four
 * dynamic variables multiply and the blend runs to 640, so a score of 42 is
 * ordinary and a `/35` beside it would be nonsense. What it *is* good for is
 * the factor bar, which decomposes the seven variables and therefore has to
 * be drawn against the sum of their caps. Everything that prints a `/max`
 * beside a **score** uses the highest score on screen instead — see
 * `usePriorityScores`.
 */
export const LINEAR_CEILING = Object.values(TUNING.caps).reduce((a, b) => a + b, 0);

const DAY_MS = 86_400_000;

// ─── What the engine needs from a task ───────────────────────────────────────

/**
 * The shape scoring actually reads. Deliberately narrower than `Task` so an
 * unsaved draft from `useTaskDraft` can be scored without being a whole task
 * first — see `scoreDraft`. Every real `Task` satisfies it.
 */
export interface PriorityTask {
  id: string;
  status?: string;
  listId?: string;
  deadline?: string;
  /**
   * The deadline this task was *first* given, before anything pushed it. The
   * escalator measures from here, so a task pushed back three times reads as
   * three weeks late rather than as freshly overdue. Written by item 18's
   * deadline maths on a task's first push; a task never pushed has none, and
   * `deadline` stands in for it.
   */
  originalDeadline?: string;
  estimatedTime?: number;
  allocatedTime?: number;
  humanOverride?: number;
  emergencyBoost?: number;
  avoidedCount?: number;
  dependsOn?: string[];
}

/** The seven variables, after their caps, exactly as they entered the maths. */
export interface ScoreVariables {
  humanOverride: number;
  deadlineProximity: number;
  bottleneck: number;
  duration: number;
  emergency: number;
  escalator: number;
  avoided: number;
}

/**
 * What the conductivity floor did to this task. Kept in the breakdown rather
 * than folded away because `scoreDraft` has to rebuild the floor from the
 * saved graph while the user drags a dial, and because "this scores 40 because
 * it is holding up the launch" is the single most explainable thing the engine
 * says.
 */
export interface ConductivityReading {
  /** The highest final score among the incomplete tasks this one blocks. */
  highestBlockedScore: number;
  /** `1 + k / T`. 1 when nothing is blocked, since the floor is then 0 anyway. */
  coefficient: number;
  /** `highestBlockedScore × coefficient` — the floor, whether or not it bit. */
  floor: number;
  /** The task the floor came from, or `null` when nothing is blocked. */
  from: string | null;
  /** Whether the floor actually raised this task's score. */
  applied: boolean;
}

/**
 * One task's score and every number that produced it.
 *
 * A bare number was never enough: the chips on the task panel already explain
 * *why* a task scored what it did, and that has to survive the new engine.
 */
export interface ScoreBreakdown {
  taskId: string;
  /** The score the app ranks and displays. Raw — there is no ceiling to render against. */
  score: number;
  /** The blend before the conductivity floor was considered. */
  baseScore: number;
  /** All seven added. Ceiling 35. */
  linear: number;
  /** `(override + duration + avoided) + (proximity × escalator × emergency × bottleneck)`. Ceiling 640. */
  multiplicative: number;
  /** The sigmoid, 0–1. Colour ramps read this, not the raw score. */
  W: number;
  /** `W` past `TUNING.redAlertW`. */
  redAlert: boolean;
  variables: ScoreVariables;
  /** `deadline − duration`, epoch ms. `null` when the task has no deadline. */
  latestStart: number | null;
  /** Days from `now` to the latest start. Negative when it has passed, `null` with no deadline. */
  daysToLatestStart: number | null;
  /** The widened danger threshold this task was judged against, in days. */
  dangerThresholdDays: number;
  /** `n` — transitively-blocked incomplete tasks. */
  blockedCount: number;
  conductivity: ConductivityReading;
  /**
   * Ignored work (BIG-3). Every number above is zero and nothing is red: an
   * ignored task is not ranked, so a screen that shows one prints "Ignored"
   * where the score would be rather than a 0 that reads as a verdict.
   */
  ignored: boolean;
}

export interface ScoreOptions {
  /**
   * The app's lists. Needed only to find which project a task belongs to, and
   * so to compute that project's Runway. Without them every task is judged
   * against the flat `dangerThresholdDays`, which is exactly the right answer
   * for a task in no project.
   */
  taskLists?: readonly TaskList[];
  /**
   * How a stored `YYYY-MM-DDTHH:mm` should be read. Defaults to the browser's
   * zone; pass it explicitly to keep a call fully pure (every test here does).
   */
  timeZone?: string;
  /**
   * Ignored work (BIG-3), from `lib/ignoredWork.ts`. An ignored task scores
   * zero, is never counted as blocked, never lends its score to what it waits
   * on through the conductivity floor, and adds nothing to its project's
   * Runway. It is out of the ranking entirely, not merely at the bottom of it.
   */
  ignored?: ReadonlySet<string>;
}

const NOTHING_IGNORED: ReadonlySet<string> = new Set();

/** The breakdown an ignored task gets: every number zero, nothing red. */
function ignoredReading(taskId: string, latestStart: number | null, daysToLatestStart: number | null): ScoreBreakdown {
  return {
    taskId,
    score: 0,
    baseScore: 0,
    linear: 0,
    multiplicative: 0,
    W: 0,
    redAlert: false,
    variables: { humanOverride: 0, deadlineProximity: 0, bottleneck: 0, duration: 0, emergency: 0, escalator: 0, avoided: 0 },
    latestStart,
    daysToLatestStart,
    dangerThresholdDays: TUNING.dangerThresholdDays,
    blockedCount: 0,
    conductivity: { highestBlockedScore: 0, coefficient: 1, floor: 0, from: null, applied: false },
    ignored: true,
  };
}

// ─── The small pure pieces ───────────────────────────────────────────────────

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/**
 * **How long a task takes, in minutes — this engine's single answer.**
 *
 * `allocatedTime` (seconds) first, then `estimatedTime` (minutes), then 30.
 * The deliberate number beats the generic guess: `allocatedTime` is what you
 * set for this task today, `estimatedTime` is what you once guessed it might
 * take in general.
 *
 * **This is the opposite order from `taskEstimatedMinutes` in the store**, and
 * that is a knowing, temporary divergence: the settled decision is that the
 * whole app moves to this order, but item 15 is required to leave the app's
 * behaviour untouched, and `taskEstimatedMinutes` is read by Smart Start and
 * by the calendar block. It changes when the call sites do, in item 16.
 */
export function durationMinutes(task: Pick<PriorityTask, 'estimatedTime' | 'allocatedTime'>): number {
  if (task.allocatedTime && task.allocatedTime > 0) return task.allocatedTime / 60;
  if (task.estimatedTime && task.estimatedTime > 0) return task.estimatedTime;
  return TUNING.defaultTaskMinutes;
}

/**
 * **The last moment you can begin this task and still finish on time** —
 * `deadline − duration`, epoch ms, or `null` when there is no deadline.
 *
 * Called "Latest start" everywhere it is shown, deliberately *not* "start
 * time": `Task.startDate` already exists and means "the day work begins",
 * which is a different fact and a stored one. This is derived on demand and
 * never written.
 */
export function latestStartOf(task: PriorityTask, timeZone: string): number | null {
  const deadline = parseStoredDate(task.deadline, timeZone);
  if (!deadline) return null;
  return deadline.getTime() - durationMinutes(task) * 60_000;
}

/**
 * Deadline Proximity: the full cap once the latest start is now or past,
 * decaying linearly to 0 at `deadlineHorizonDays`. No deadline → no latest
 * start → 0, which is why an undated task never enters the danger zone.
 */
function deadlineProximity(daysToLatestStart: number | null): number {
  if (daysToLatestStart === null) return 0;
  const { deadlineProximity: cap } = TUNING.caps;
  const remaining = clamp(daysToLatestStart, 0, TUNING.deadlineHorizonDays);
  return cap * (1 - remaining / TUNING.deadlineHorizonDays);
}

/**
 * The Post-deadline Escalator: how long this has been late, measured from
 * `originalDeadline` and never from the current deadline. Without that anchor,
 * pushing an overdue deadline forward would make a task three weeks late score
 * *lower* than one missed this morning — the exact inversion this design
 * exists to prevent.
 */
function escalator(task: PriorityTask, now: number, timeZone: string): number {
  const anchor = parseStoredDate(task.originalDeadline ?? task.deadline, timeZone);
  if (!anchor) return 0;
  const lateDays = (now - anchor.getTime()) / DAY_MS;
  if (lateDays <= 0) return 0;
  const { escalator: cap } = TUNING.caps;
  return cap * clamp(lateDays / TUNING.escalatorFullDays, 0, 1);
}

/**
 * **Has this task's emergency run out of the date it was anchored to?**
 *
 * The one authority for the rule, exported because item 17 has three readers
 * of it and they must not be able to disagree: this engine, which scores a
 * lapsed emergency as zero; `clearLapsedEmergencies` in the store, which does
 * the write the item asks for; and the Emergency control itself, which says so
 * in words under the trough rather than showing a level that is not counting.
 *
 * A task with no deadline at all has no anchor and never lapses — the flag is
 * then the only thing saying "now", and there is nothing for it to run out of.
 */
export function hasEmergencyLapsed(
  task: Pick<PriorityTask, 'deadline' | 'originalDeadline'>,
  now: number,
  timeZone: string = resolveUserTimeZone(),
): boolean {
  const anchor = parseStoredDate(task.originalDeadline ?? task.deadline, timeZone);
  return anchor !== null && anchor.getTime() <= now;
}

/**
 * Emergency, 0–5, set by hand.
 *
 * **It reads as zero once `originalDeadline` has passed**, which is the same
 * rule item 17's button enforces by writing the field back to zero. Doing it
 * here as well means the score is right whether or not that write has
 * happened yet — and it has to be right, because a missed emergency that kept
 * multiplying would go on screaming "drop everything" about a date that is
 * gone, while the escalator is already saying the useful thing ("you are nine
 * days late") on the same task.
 */
function emergency(task: PriorityTask, now: number, timeZone: string): number {
  const raw = clamp(task.emergencyBoost ?? 0, 0, TUNING.caps.emergency);
  if (raw === 0) return 0;
  if (hasEmergencyLapsed(task, now, timeZone)) return 0;
  return raw;
}

/** Task Duration: a small nudge for a quick win, nothing for a long haul. */
function durationScore(task: PriorityTask): number {
  const minutes = durationMinutes(task);
  const { duration: cap } = TUNING.caps;
  if (minutes < TUNING.duration.microMinutes) return cap;
  if (minutes <= TUNING.duration.standardMinutes) return cap / 2;
  return 0;
}

/** Bottleneck Severity from a count of blocked tasks: `min(cap, 2.5 log₁₀(1 + n))`. */
function bottleneckSeverity(blockedCount: number): number {
  if (blockedCount <= 0) return 0;
  return Math.min(TUNING.caps.bottleneck, TUNING.bottleneckCoefficient * Math.log10(1 + blockedCount));
}

/** The Conductivity Coefficient for a blocker of this length: `1 + k / T`, `T` in hours. */
function conductivityCoefficient(task: PriorityTask): number {
  const hours = Math.max(durationMinutes(task) / 60, TUNING.conductivity.minHours);
  return 1 + TUNING.conductivity.k / hours;
}

/**
 * `W` — how far into the danger zone this task is, 0–1.
 *
 * The logistic curve on days-until-latest-start against the (possibly widened)
 * threshold. 0.5 exactly at the threshold, which is why Red Alert is defined
 * there rather than at some number chosen to look right.
 */
function sigmoid(daysToLatestStart: number | null, thresholdDays: number): number {
  if (daysToLatestStart === null) return 0;
  const x = TUNING.sigmoidSteepness * (thresholdDays - daysToLatestStart);
  // Split by sign so a large negative exponent underflows to 0 instead of
  // overflowing `Math.exp` to Infinity on the way to the same answer.
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

// ─── The graph ───────────────────────────────────────────────────────────────

/**
 * Who is waiting on whom. `dependsOn` points from a task to its
 * prerequisites; this is that edge reversed, which is the direction both graph
 * variables actually need — Bottleneck counts what is stuck behind a task, and
 * Conductivity asks what the worst of those is worth.
 *
 * Ids that resolve to nothing are dropped, exactly as `getBlockingTasks` drops
 * them, so a dependency on a deleted task never invents a bottleneck.
 */
function buildDependents(tasks: readonly PriorityTask[]): Map<string, string[]> {
  const known = new Set(tasks.map((t) => t.id));
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const prerequisiteId of task.dependsOn ?? []) {
      if (!known.has(prerequisiteId) || prerequisiteId === task.id) continue;
      const list = dependents.get(prerequisiteId);
      if (list) list.push(task.id);
      else dependents.set(prerequisiteId, [task.id]);
    }
  }
  return dependents;
}

/**
 * `n` for every task in one pass: the count of **incomplete** tasks reachable
 * downstream of it, itself excluded.
 *
 * Cycle-guarded by construction — the walk keeps a `seen` set per source and
 * never revisits, so A→B→A terminates and counts each of the pair once.
 * Memoising the closure itself would be wrong (a set union is not a count),
 * so this is a plain breadth-first walk per task; the graphs in question have
 * tens of nodes, and the reason per-task scoring was rejected was never this
 * walk but calling it from inside a sort comparator.
 */
function countBlocked(
  tasks: readonly PriorityTask[],
  dependents: Map<string, string[]>,
  incomplete: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const seen = new Set<string>([task.id]);
    const queue = [...(dependents.get(task.id) ?? [])];
    let count = 0;
    while (queue.length > 0) {
      const id = queue.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      if (incomplete.has(id)) count += 1;
      const next = dependents.get(id);
      if (next) queue.push(...next);
    }
    counts.set(task.id, count);
  }
  return counts;
}

// ─── The project Runway ──────────────────────────────────────────────────────

/**
 * **Runway** — time until the project's last deadline, minus the total
 * remaining estimated work across it. Negative means the project cannot be
 * finished on time even working flat out, which is a true and rather important
 * thing to know, and is why all of its tasks go red together.
 *
 * `null` for a project nobody has dated: there is no runway to measure, and
 * inventing one out of a project with no deadlines would widen the danger zone
 * on the least urgent work in the app.
 */
function projectRunwayDays(
  tasks: readonly PriorityTask[],
  projectOf: Map<string, string | undefined>,
  now: number,
  timeZone: string,
): Map<string, number> {
  const lastDeadline = new Map<string, number>();
  const workMinutes = new Map<string, number>();

  for (const task of tasks) {
    if (task.status === 'completed') continue;
    const projectId = projectOf.get(task.id);
    if (!projectId) continue;
    workMinutes.set(projectId, (workMinutes.get(projectId) ?? 0) + durationMinutes(task));
    const deadline = parseStoredDate(task.deadline, timeZone);
    if (!deadline) continue;
    const at = deadline.getTime();
    const current = lastDeadline.get(projectId);
    if (current === undefined || at > current) lastDeadline.set(projectId, at);
  }

  const runway = new Map<string, number>();
  for (const [projectId, deadline] of lastDeadline) {
    const availableDays = (deadline - now) / DAY_MS;
    const workDays = (workMinutes.get(projectId) ?? 0) / 60 / TUNING.workDayHours;
    runway.set(projectId, availableDays - workDays);
  }
  return runway;
}

/**
 * The danger threshold this task is judged against, in days: the base 3,
 * widened towards ×4 as its project's Runway falls from `runwayComfortDays`
 * to zero. A task in no project, or in a project with no deadlines, gets the
 * flat base — which is the honest answer, not a default.
 */
function dangerThresholdFor(runway: number | undefined): number {
  const base = TUNING.dangerThresholdDays;
  if (runway === undefined) return base;
  const pressure = clamp((TUNING.runwayComfortDays - runway) / TUNING.runwayComfortDays, 0, 1);
  return base * (1 + (TUNING.runwayWidening - 1) * pressure);
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

/** The five non-graph variables, which are the only ones an unsaved edit can change. */
function ownVariables(task: PriorityTask, now: number, timeZone: string, daysToLatestStart: number | null) {
  return {
    humanOverride: clamp(task.humanOverride ?? 0, 0, TUNING.caps.humanOverride),
    deadlineProximity: deadlineProximity(daysToLatestStart),
    duration: durationScore(task),
    emergency: emergency(task, now, timeZone),
    escalator: escalator(task, now, timeZone),
    avoided: clamp(task.avoidedCount ?? 0, 0, TUNING.caps.avoided),
  };
}

/**
 * `Score = (1 − W) × S_linear + W × S_multiplicative`, plus the two totals
 * that produced it.
 *
 * Only the four dynamic variables multiply, and each is floored at 1 first so
 * an absent one cannot zero the product. How important a task is to you, and
 * how long it takes, are facts about the task: they do not compound with
 * themselves, so they stay in the additive part of both halves.
 */
function blend(v: ScoreVariables, W: number) {
  const linear =
    v.humanOverride + v.deadlineProximity + v.bottleneck + v.duration + v.emergency + v.escalator + v.avoided;

  const stable = v.humanOverride + v.duration + v.avoided;
  const dynamic =
    Math.max(1, v.deadlineProximity) *
    Math.max(1, v.escalator) *
    Math.max(1, v.emergency) *
    Math.max(1, v.bottleneck);
  const multiplicative = stable + dynamic;

  return { linear, multiplicative, score: (1 - W) * linear + W * multiplicative };
}

// ─── scoreAll ────────────────────────────────────────────────────────────────

/**
 * **Every task's score in one memoised, cycle-guarded pass.**
 *
 * Returns a map from task id to its full breakdown. Read sites look a task up;
 * they do not call a scoring function. That is not a style preference:
 * Bottleneck walks everything downstream and Conductivity needs the *final*
 * score of the task being blocked, so a per-task function called from inside a
 * sort comparator re-walks the same subgraphs hundreds of times and hangs
 * outright on a bad cycle.
 *
 * Pass top-level tasks only. Completed tasks are still scored (harmlessly —
 * nothing displays them) but are never counted as blocked and never lend their
 * score to a blocker, because a finished task is not waiting on anything.
 *
 * `now` is epoch milliseconds and never read from a clock in here.
 */
/**
 * The lists whose tasks never enter the danger zone: the two fixed ones, and
 * (29-1P6c, idea 91) every project's own Backburner, which is the same parking
 * lot kept inside a project. Recognised by name through `lib/backburner.ts`.
 */
function calmListIds(lists: readonly TaskList[] | undefined): ReadonlySet<string> {
  const ids = new Set<string>(TUNING.excludedListIds);
  for (const list of lists ?? []) if (isProjectBackburner(list)) ids.add(list.id);
  return ids;
}

export function scoreAll(
  tasks: readonly PriorityTask[],
  now: number,
  options: ScoreOptions = {},
): Map<string, ScoreBreakdown> {
  const timeZone = options.timeZone ?? resolveUserTimeZone();
  const ignored = options.ignored ?? NOTHING_IGNORED;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // An ignored task is out of the graph's reckoning the way a finished one is:
  // nothing counts it as blocked and it lends no score to what it waits on.
  const incomplete = new Set(
    tasks.filter((t) => t.status !== 'completed' && !ignored.has(t.id)).map((t) => t.id),
  );
  const dependents = buildDependents(tasks);
  const blockedCounts = countBlocked(tasks, dependents, incomplete);

  const listProject = new Map<string, string | undefined>(
    (options.taskLists ?? []).map((list) => [list.id, list.projectId]),
  );
  const calm = calmListIds(options.taskLists);
  const projectOf = new Map<string, string | undefined>(
    tasks.map((t) => [t.id, t.listId ? listProject.get(t.listId) : undefined]),
  );
  const runways = projectRunwayDays(
    ignored.size === 0 ? tasks : tasks.filter((t) => !ignored.has(t.id)),
    projectOf,
    now,
    timeZone,
  );

  // Pass one: everything that does not depend on another task's final score.
  const partial = new Map<string, ScoreBreakdown>();
  for (const task of tasks) {
    const latestStart = latestStartOf(task, timeZone);
    const daysToLatestStart = latestStart === null ? null : (latestStart - now) / DAY_MS;
    if (ignored.has(task.id)) {
      partial.set(task.id, ignoredReading(task.id, latestStart, daysToLatestStart));
      continue;
    }
    const blockedCount = blockedCounts.get(task.id) ?? 0;

    const projectId = projectOf.get(task.id);
    const dangerThresholdDays = dangerThresholdFor(projectId ? runways.get(projectId) : undefined);

    const variables: ScoreVariables = {
      ...ownVariables(task, now, timeZone, daysToLatestStart),
      bottleneck: bottleneckSeverity(blockedCount),
    };

    // A parking lot that screams is a parking lot you stop reading: Backburner
    // and Reference Materials never enter the danger zone, so they are scored
    // by the calm linear sum and can never go Red Alert.
    const excluded = task.listId !== undefined && calm.has(task.listId);
    const W = excluded ? 0 : sigmoid(daysToLatestStart, dangerThresholdDays);

    const { linear, multiplicative, score } = blend(variables, W);

    partial.set(task.id, {
      taskId: task.id,
      score,
      baseScore: score,
      linear,
      multiplicative,
      W,
      redAlert: W > TUNING.redAlertW,
      variables,
      latestStart,
      daysToLatestStart,
      dangerThresholdDays,
      blockedCount,
      conductivity: { highestBlockedScore: 0, coefficient: 1, floor: 0, from: null, applied: false },
      ignored: false,
    });
  }

  /**
   * Pass two: the conductivity floor, resolved depth-first so a task is
   * floored only after everything it blocks has its final score. The floor
   * therefore propagates along a chain without this needing the transitive
   * closure — A → B → C leaves C's urgency in B's final score, which is what A
   * then reads.
   *
   * `resolving` breaks a dependency cycle by handing back the unfloored score
   * for the task the walk re-entered. A cycle has no bottom to start from, so
   * some member of it has to be scored without its floor; doing it this way
   * means the *rest* of the cycle still gets one, and nothing recurses forever.
   */
  const resolving = new Set<string>();
  const resolved = new Set<string>();

  const finalScoreOf = (id: string): number => {
    const entry = partial.get(id)!;
    if (resolved.has(id) || entry.ignored) return entry.score;
    if (resolving.has(id)) return entry.baseScore;

    resolving.add(id);
    let highest = 0;
    let from: string | null = null;
    for (const dependentId of dependents.get(id) ?? []) {
      if (!incomplete.has(dependentId)) continue;
      const candidate = finalScoreOf(dependentId);
      if (candidate > highest) {
        highest = candidate;
        from = dependentId;
      }
    }
    resolving.delete(id);

    const coefficient = from === null ? 1 : conductivityCoefficient(byId.get(id)!);
    const floor = highest * coefficient;
    const applied = floor > entry.baseScore;

    entry.conductivity = { highestBlockedScore: highest, coefficient, floor, from, applied };
    entry.score = applied ? floor : entry.baseScore;
    resolved.add(id);
    return entry.score;
  };

  for (const task of tasks) finalScoreOf(task.id);
  return partial;
}

// ─── The task being edited ───────────────────────────────────────────────────

/**
 * **A task being edited scores from two halves.**
 *
 * The panel's ring updates live while a dial is dragged, and a map keyed by
 * saved id cannot answer for an unsaved draft. So take the graph half from the
 * saved breakdown and recompute only the half the edit can actually change:
 * dragging Human Override cannot alter how many tasks are stuck behind this
 * one, and neither can retyping its title.
 *
 * `saved` is `null` for a brand-new task, which gets 0 for the graph half —
 * not an approximation but the truth, since nothing can depend on a task that
 * does not exist yet.
 *
 * The conductivity **coefficient** is recomputed from the draft even so: it is
 * a function of this task's own duration, and shortening a blocker is exactly
 * the edit that should visibly lift it. What comes from the saved side is
 * `highestBlockedScore` — what the worst thing waiting on it is worth.
 */
export function scoreDraft(
  draft: PriorityTask,
  saved: ScoreBreakdown | null,
  now: number,
  options: ScoreOptions = {},
): ScoreBreakdown {
  const timeZone = options.timeZone ?? resolveUserTimeZone();
  const latestStart = latestStartOf(draft, timeZone);
  const daysToLatestStart = latestStart === null ? null : (latestStart - now) / DAY_MS;
  if (options.ignored?.has(draft.id)) return ignoredReading(draft.id, latestStart, daysToLatestStart);

  const blockedCount = saved?.blockedCount ?? 0;
  const dangerThresholdDays = saved?.dangerThresholdDays ?? TUNING.dangerThresholdDays;

  const variables: ScoreVariables = {
    ...ownVariables(draft, now, timeZone, daysToLatestStart),
    bottleneck: bottleneckSeverity(blockedCount),
  };

  const excluded = draft.listId !== undefined && calmListIds(options.taskLists).has(draft.listId);
  const W = excluded ? 0 : sigmoid(daysToLatestStart, dangerThresholdDays);
  const { linear, multiplicative, score: baseScore } = blend(variables, W);

  const highestBlockedScore = saved?.conductivity.highestBlockedScore ?? 0;
  const from = saved?.conductivity.from ?? null;
  const coefficient = from === null ? 1 : conductivityCoefficient(draft);
  const floor = highestBlockedScore * coefficient;
  const applied = floor > baseScore;

  return {
    taskId: draft.id,
    score: applied ? floor : baseScore,
    baseScore,
    linear,
    multiplicative,
    W,
    redAlert: W > TUNING.redAlertW,
    variables,
    latestStart,
    daysToLatestStart,
    dangerThresholdDays,
    blockedCount,
    conductivity: { highestBlockedScore, coefficient, floor, from, applied },
    ignored: false,
  };
}

/**
 * A convenience for the call sites item 16 will write: the score, or 0 for a
 * task the map has never heard of. Nothing in the app should be reaching for a
 * task that was not in the array it scored, but a missing key returning
 * `undefined` into a sort comparator produces `NaN` and silently scrambles the
 * order, which is a bad way to find out.
 */
export function scoreOf(scores: ReadonlyMap<string, ScoreBreakdown>, taskId: string): number {
  return scores.get(taskId)?.score ?? 0;
}

/**
 * Compile-time proof that a real `Task` is scorable as it stands, so `scoreAll`
 * can be handed `backlogTasks` directly and nothing has to map over it first.
 * If `Task.deadline` ever stops being a stored string, or `dependsOn` stops
 * being ids, this line is what says so — at the build, not at the ring.
 */
export const scorable = (task: Task): PriorityTask => task;
