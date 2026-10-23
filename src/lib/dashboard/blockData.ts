/**
 * What each Dashboard block says (BIG-6, 29-1a) — pure: the backlog, the
 * clock and the time zone are arguments, so every answer here is testable
 * without a store or a browser.
 *
 * **Ignored work (BIG-3) is filtered everywhere a block ranks, offers or
 * counts**, which is every block but project progress. That one counts like a
 * project's own card does — ignored work is "fully visible on its own board",
 * and a project's progress is a reading of that board.
 */
import { dayOf } from '../stats';
import { parseStoredDate, toZonedDayString } from '../agent/dates';
import { taskEstimatedMinutes, type Task, type TaskList, type Project } from '../../store/useStore';
import { buildProjectTree, subtreeTasks } from '../projectTree';
import type { ProgressMetric } from './layout';

type Ids = ReadonlySet<string>;

const open = (t: Task) => t.status !== 'completed';
const topLevel = (t: Task) => !t.parent;

/** Every prerequisite is finished or gone — the reading `planStartNow` takes. */
function isFree(task: Task, byId: ReadonlyMap<string, Task>): boolean {
  return (task.dependsOn ?? []).every((id) => {
    const dep = byId.get(id);
    return !dep || dep.status === 'completed';
  });
}

function deadlineMs(task: Task, timeZone: string): number {
  return parseStoredDate(task.deadline, timeZone)?.getTime() ?? Infinity;
}

// ─── Do this one thing ──────────────────────────────────────────────────────

/**
 * The tasks to recommend, best first: open, top-level, not ignored, not passed
 * on today, and **startable now** — a blocked task is never recommended, since
 * item 16's Conductivity floor already ranks what it waits on above it, so the
 * blocker is what comes up instead.
 *
 * Ranked exactly as Smart Start ranks (`buildSmartQueue`): the one scoring pass,
 * ties to the earlier deadline. One ranking authority, as that file insists.
 */
export function recommendTasks(
  backlog: readonly Task[],
  scoreOf: (task: Task) => number,
  ignored: Ids,
  passedOn: Ids,
  timeZone: string,
  limit = 3,
): Task[] {
  const byId = new Map(backlog.map((t) => [t.id, t]));
  return backlog
    .filter((t) => open(t) && topLevel(t) && !ignored.has(t.id) && !passedOn.has(t.id) && isFree(t, byId))
    .sort((a, b) => scoreOf(b) - scoreOf(a) || deadlineMs(a, timeZone) - deadlineMs(b, timeZone))
    .slice(0, limit);
}

export interface NotNow {
  taskId: string;
  at: number;
}

/** The tasks "Not now" was pressed on today, on this time zone's calendar. */
export function passedOnToday(notNow: readonly NotNow[], now: Date, timeZone: string): Set<string> {
  const today = toZonedDayString(now, timeZone);
  return new Set(notNow.filter((n) => toZonedDayString(new Date(n.at), timeZone) === today).map((n) => n.taskId));
}

// ─── Today ──────────────────────────────────────────────────────────────────

/**
 * Today's tasks: due today, or finished today. A task due today that was
 * finished yesterday still counts as done today's work — it was today's.
 * Overdue work from before today is not here; it has its own block.
 */
export function todaysTasks(
  backlog: readonly Task[],
  now: Date,
  timeZone: string,
  ignored: Ids,
): { done: Task[]; open: Task[] } {
  return tasksOnDay(backlog, toZonedDayString(now, timeZone), timeZone, ignored);
}

/**
 * The same for any day, `YYYY-MM-DD` — the Today block on the day picked on
 * the week strip (29-1c3): due that day, or finished that day.
 */
export function tasksOnDay(
  backlog: readonly Task[],
  day: string,
  timeZone: string,
  ignored: Ids,
): { done: Task[]; open: Task[] } {
  const isToday = (instant: Date | null) => instant !== null && toZonedDayString(instant, timeZone) === day;
  const todays = backlog.filter((t) => {
    if (!topLevel(t) || ignored.has(t.id)) return false;
    if (isToday(parseStoredDate(t.deadline, timeZone))) return true;
    return t.status === 'completed' && typeof t.completedAt === 'number' && isToday(new Date(t.completedAt));
  });
  const byTime = (a: Task, b: Task) => deadlineMs(a, timeZone) - deadlineMs(b, timeZone);
  return {
    done: todays.filter((t) => !open(t)).sort(byTime),
    open: todays.filter(open).sort(byTime),
  };
}

/**
 * How many tasks he finished today, whatever they were due — the gold tally
 * on the Today block (29-1P4b, idea 41). His call: tasks, not subtasks, and
 * counted from `completedAt`, so the laptop and the tablet show one number and
 * an undo takes its tick back off. Ignored work counts: he still did it.
 */
export function finishedToday(backlog: readonly Task[], now: Date, timeZone: string): number {
  return finishedOn(backlog, toZonedDayString(now, timeZone), timeZone);
}

/** The same for any day (the week strip's, 29-1c3). */
export function finishedOn(backlog: readonly Task[], today: string, timeZone: string): number {
  let n = 0;
  for (const t of backlog) {
    if (!topLevel(t) || t.status !== 'completed' || typeof t.completedAt !== 'number') continue;
    if (dayOf(t.completedAt, timeZone) === today) n++;
  }
  return n;
}

// ─── Next deadline ──────────────────────────────────────────────────────────

/** The open task whose deadline is soonest and still ahead. */
export function nextDeadline(
  backlog: readonly Task[],
  now: Date,
  timeZone: string,
  ignored: Ids,
): { task: Task; at: Date } | null {
  let best: { task: Task; at: Date } | null = null;
  for (const task of backlog) {
    if (!open(task) || !topLevel(task) || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (!at || at.getTime() <= now.getTime()) continue;
    if (!best || at.getTime() < best.at.getTime()) best = { task, at };
  }
  return best;
}

// ─── Overdue ────────────────────────────────────────────────────────────────

/** Every open task past its deadline, oldest first. */
export function overdueTasks(
  backlog: readonly Task[],
  now: Date,
  timeZone: string,
  ignored: Ids,
): { task: Task; at: Date }[] {
  const out: { task: Task; at: Date }[] = [];
  for (const task of backlog) {
    if (!open(task) || !topLevel(task) || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (at && at.getTime() < now.getTime()) out.push({ task, at });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * How big the Overdue block's flame is (OPT-12, his pick: a Snapchat streak
 * in reverse), 0 to 1 by how late the oldest task is: a spark when it has
 * only just passed, a full blaze at a week and beyond.
 */
export function overdueHeat(oldest: Date, now: Date): number {
  const hours = (now.getTime() - oldest.getTime()) / 3_600_000;
  return Math.max(0, Math.min(1, hours / (7 * 24)));
}

// ─── Project progress ───────────────────────────────────────────────────────

/**
 * The block's project when none was picked: the top-level project with the
 * most open work, so a fresh block is about something that is moving.
 */
export function busiestProject(
  projects: readonly Project[],
  lists: readonly TaskList[],
  backlog: readonly Task[],
): Project | null {
  const tree = buildProjectTree(projects);
  let best: { project: Project; count: number } | null = null;
  for (const project of tree.childrenOf(null)) {
    const count = subtreeTasks(tree, lists, backlog, project.id).filter(open).length;
    if (!best || count > best.count) best = { project, count };
  }
  return best?.project ?? null;
}

export interface ProjectProgress {
  project: Project;
  /** In the metric's own unit: tasks, minutes, or rupees. */
  done: number;
  total: number;
  /** Tasks, for the step dots and the "3 of 8" line. */
  doneTasks: number;
  totalTasks: number;
  /** Minutes, for the hours line under a task count. */
  doneMinutes: number;
  totalMinutes: number;
}

/** Counted over the whole subtree, each task once — `ProjectCard`'s own rule. */
export function projectProgress(
  project: Project,
  projects: readonly Project[],
  lists: readonly TaskList[],
  backlog: readonly Task[],
  metric: ProgressMetric,
): ProjectProgress {
  const tasks = subtreeTasks(buildProjectTree(projects), lists, backlog, project.id);
  const doneList = tasks.filter((t) => !open(t));
  const minutes = (ts: Task[]) => ts.reduce((sum, t) => sum + taskEstimatedMinutes(t), 0);
  const rupees = (ts: Task[]) => ts.reduce((sum, t) => sum + (t.valueINR ?? 0), 0);
  const [done, total] =
    metric === 'hours' ? [minutes(doneList), minutes(tasks)]
      : metric === 'money' ? [rupees(doneList), rupees(tasks)]
        : [doneList.length, tasks.length];
  return {
    project,
    done,
    total,
    doneTasks: doneList.length,
    totalTasks: tasks.length,
    doneMinutes: minutes(doneList),
    totalMinutes: minutes(tasks),
  };
}

// ─── Deadlines on a runway (idea 138) ───────────────────────────────────────

export interface RunwayItem {
  task: Task;
  at: Date;
  /** Days from now, fractional: 0 is now, `days` the runway's far end. */
  days: number;
  /** Which lane of the runway it is drawn on, 0 at the top. */
  lane: number;
}

export interface Runway {
  items: RunwayItem[];
  /** Deadlines inside the range that found no free lane. */
  hidden: number;
  /** The overdue box: open work already past its deadline. */
  overdue: number;
}

/**
 * Every open deadline from now to `days` ahead, soonest first, each given a
 * lane so no two pills overlap: a pill takes the first lane whose last pill
 * ends at least `gapDays` before it — the width of a pill, in days, which the
 * block measures. What finds no lane is counted, never drawn on top of another.
 */
export function runwayDeadlines(
  backlog: readonly Task[],
  now: Date,
  timeZone: string,
  ignored: Ids,
  opts: { days?: number; lanes: number; gapDays: number },
): Runway {
  const days = opts.days ?? 14;
  const end = now.getTime() + days * 86_400_000;
  const ahead: { task: Task; at: Date }[] = [];
  let overdue = 0;
  for (const task of backlog) {
    if (!open(task) || !topLevel(task) || ignored.has(task.id)) continue;
    const at = parseStoredDate(task.deadline, timeZone);
    if (!at) continue;
    if (at.getTime() < now.getTime()) overdue++;
    else if (at.getTime() <= end) ahead.push({ task, at });
  }
  ahead.sort((a, b) => a.at.getTime() - b.at.getTime());

  const laneEnds: number[] = [];
  const items: RunwayItem[] = [];
  let hidden = 0;
  for (const { task, at } of ahead) {
    const d = (at.getTime() - now.getTime()) / 86_400_000;
    let lane = laneEnds.findIndex((last) => d - last >= opts.gapDays);
    if (lane < 0 && laneEnds.length < opts.lanes) lane = laneEnds.length;
    if (lane < 0) { hidden++; continue; }
    laneEnds[lane] = d;
    items.push({ task, at, days: d, lane });
  }
  return { items, hidden, overdue };
}

/* How warm a deadline is, and its colour, sky to coral. Moved to
   `lib/warmth.ts` at 29-1P7a, when every date chip in the app took the same
   curve (idea 66); re-exported so the runway's imports stay where they were. */
export { deadlineWarmth, warmthColour } from '../warmth';

// ─── Waiting on people (idea 137) ───────────────────────────────────────────

/**
 * An account id is 28 letters and digits; a name is not. The same test the
 * share snapshot makes (`publicShareSnapshot.ts`): until Contacts, there is no
 * name behind any id but his own.
 */
const ACCOUNT_ID = /^[A-Za-z0-9]{20,}$/;

export interface WaitingRow {
  task: Task;
  /** The name typed on the task, or "Another account" for an id. */
  who: string;
  /** When it was handed over, if known (`assignedAt`, stamped since 29-1P13). */
  since: number | null;
}

/**
 * Open work with someone else's name on it, the longest wait first. His own
 * account on a task is not waiting on anybody.
 */
export function waitingOn(
  backlog: readonly Task[],
  ownerUid: string | null,
  ignored: Ids,
): WaitingRow[] {
  const rows: WaitingRow[] = [];
  for (const task of backlog) {
    if (!open(task) || !topLevel(task) || ignored.has(task.id)) continue;
    const who = task.assignee?.trim();
    if (!who || who === ownerUid) continue;
    rows.push({ task, who: ACCOUNT_ID.test(who) ? 'Another account' : who, since: task.assignedAt ?? null });
  }
  return rows.sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity));
}

/** Whole days since `since`, for the row's chip. */
export function daysWaiting(since: number, now: number): number {
  return Math.max(0, Math.floor((now - since) / 86_400_000));
}

/**
 * Every outsourcing link he has out — a project's, a list's or a single
 * task's with contributions on — whose workers' claims the block watches.
 * The project board's panel watches one project's; this is all of them.
 */
export function outsourceShareIds(
  projects: readonly Project[],
  lists: readonly TaskList[],
  backlog: readonly Task[],
): string[] {
  const ids = new Set<string>();
  for (const p of projects) if (p.shareId && p.shareAllowContributions) ids.add(p.shareId);
  for (const l of lists) if (l.shareId && l.shareAllowContributions) ids.add(l.shareId);
  for (const t of backlog) if (t.shareId && t.shareAllowContributions && !t.parent) ids.add(t.shareId);
  return [...ids].sort();
}

// ─── Words ──────────────────────────────────────────────────────────────────

/** "2h 30m", "45m", "3h". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** "3 days", "1 day", "5 hours" — how long ago an overdue deadline passed. */
export function agoPhrase(at: Date, now: Date): string {
  const hours = Math.floor((now.getTime() - at.getTime()) / 3_600_000);
  if (hours < 24) return hours <= 1 ? '1 hour' : `${hours} hours`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day' : `${days} days`;
}
