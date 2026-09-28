/**
 * What is going to fire today, and at what time — DESIGN-2.
 *
 * The v3 mockup (`design-system/screens/notifications.html`) redrew the
 * Notifications screen around BUILD-5's settled model: **only tasks starting
 * today, at `deadline − estimate`**, each row carrying the arithmetic that
 * produced its time. This is that rule, on its own, as a pure function.
 *
 * WHY IT IS NOT IN THE PAGE
 * -------------------------
 * The same reason `deadlineReminder.ts` is not in `notificationSync.ts`: the
 * question *"what fires today, and when?"* is worth answering somewhere a
 * test can reach. `NotificationsPage.tsx` cannot be unit-tested — it drags in
 * `./firebase` and a live SDK through four subscriptions — so a rule that
 * lived there would be provable only by eye, against a screen whose whole
 * claim is that its times are real.
 *
 * IT DOES NOT GET A SECOND OPINION ABOUT THE TIME
 * -----------------------------------------------
 * The fire time is `deadlineBlockFor(task).startMs` — the *start of the
 * calendar block*, not a number recomputed here. CLAUDE.md is explicit that
 * nothing re-derives the duration, and the point of this screen is that the
 * time it prints and the block the calendar draws are the same instant. Get
 * that from anywhere else and the two can drift apart silently, which is the
 * exact failure the old screen had: it printed `sendAt`, stored as
 * `deadline − leadTime`, for an alert Google actually fires before the block
 * *starts*. Three numbers for one event. Now there is one.
 *
 * `reminds` is likewise borrowed rather than re-asked. It already means "does
 * this task ping at all" — false for a completed task, and false for one whose
 * reminder has been set to none, which is what `handleDismiss` writes and what
 * the row menu's *"Do not fire today"* sets. A task opted out has no row.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * - **Sent and snoozed.** DESIGN-2 left snoozed out because nothing could
 *   snooze yet. BUILD-5 added the snooze, and both states now exist in
 *   `FiringState` — but they are facts about what the sender did, kept in its
 *   log, so `withDelivery` (`pushPlan.ts`) applies them on top of these rows.
 *   This function still answers from the task alone.
 * - **Quick reminders** (`lib/reminders.ts`). They genuinely fire, but they
 *   have no task behind them and therefore no `due − estimate` to show. The
 *   item is explicit: a row with no real task behind it does not belong on
 *   this screen. They still reach History, and the calendar still carries
 *   them.
 * - **Tomorrow.** Every dated task already draws a calendar block; a second
 *   stream of "due tomorrow" rows is the noise BUILD-5 decided against.
 *
 * Pure: no clock, no I/O, no Firebase. `now` and `timeZone` are parameters
 * for the same reason they are everywhere else in this codebase — so the
 * answer is testable and so a DST boundary is somebody's explicit problem.
 */
import { deadlineBlockFor } from './deadlineReminder';
import { toZonedDayString } from './agent/dates';
import { getListTitle, type Project, type Task, type TaskList } from '../store/useStore';
import type { NotificationSettings } from './notificationSettings';
import type { PushLogEntry } from './pushPlan';

/**
 * The states a row can be in, all derivable from real state.
 *
 * `next` is the single soonest row still to come — it is what the screen is
 * *for*, and it is the only row that carries accent. `queued` is everything
 * after it. `missed` is anything whose moment has passed; it is never
 * re-fired, which is BUILD-5's rule and why the row says so rather than
 * quietly disappearing.
 *
 * `sent` and `snoozed` are BUILD-5's, and this function never produces them:
 * they come from what the sender actually did, which only its log knows, and
 * `withDelivery` in `pushPlan.ts` applies them. Without that log every past
 * row stays `missed`, which is what DESIGN-2 drew.
 */
export type FiringState = 'next' | 'queued' | 'missed' | 'sent' | 'snoozed';

export interface FiringRow {
  /** The task behind the row. There is always one — see the header. */
  task: Task;
  /** When the alert fires: `deadline − estimate`, the block's start. */
  at: number;
  /** The deadline it was subtracted from — the left half of the arithmetic. */
  dueAt: number;
  /** The estimate that was subtracted — the right half. The app's one duration answer. */
  estimateMinutes: number;
  state: FiringState;
  /** The task's project, resolved live. `undefined` for a task in a bare list. */
  projectName?: string;
  /** The project's id, so a row can reach the board it belongs to. */
  projectId?: string;
  /** The task's list, resolved live through `getListTitle` rather than the stale snapshot. */
  listName: string;
  /** What the sender logged for this row, once `withDelivery` has been applied. */
  delivery?: PushLogEntry;
}

export interface FiringTodayContext {
  tasks: Task[];
  taskLists: TaskList[];
  projects: Project[];
  settings: NotificationSettings;
  timeZone: string;
  now: number;
}

/**
 * Every alert that fires today, soonest first.
 *
 * **`settings.enabled` is deliberately not a filter here.** Pausing
 * notifications does not change *what would* fire, and the screen dims the
 * list rather than emptying it — the mockup's `muted` prop, and the honest
 * reading: "these are your alerts, and they are switched off" is information,
 * where an empty screen is just an empty screen. `deadlineBlockFor` folds
 * `enabled` into `eligible`, so it is asked with the switch held on and the
 * page is left to say the switch is off.
 */
export function firingToday({
  tasks,
  taskLists,
  projects,
  settings,
  timeZone,
  now,
}: FiringTodayContext): FiringRow[] {
  const today = toZonedDayString(new Date(now), timeZone);
  const asIfEnabled: NotificationSettings = { ...settings, enabled: true };

  const listProject = new Map(taskLists.map((l) => [l.id, l.projectId]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const rows: FiringRow[] = [];

  for (const task of tasks) {
    const block = deadlineBlockFor(task, asIfEnabled, timeZone);
    // `reminds` is the app's existing answer to "does this ping": it is false
    // for a completed task and for one opted out with a zero reminder.
    if (!block.reminds || block.startMs === null || block.deadlineMs === null) continue;
    if (toZonedDayString(new Date(block.startMs), timeZone) !== today) continue;

    const projectId = task.listId ? listProject.get(task.listId) : undefined;
    rows.push({
      task,
      at: block.startMs,
      dueAt: block.deadlineMs,
      estimateMinutes: block.durationMinutes,
      // Provisional — `next` is assigned below, once the list is ordered.
      state: block.startMs < now ? 'missed' : 'queued',
      projectName: projectId ? projectName.get(projectId) : undefined,
      projectId,
      listName: getListTitle(taskLists, task.listId, task.listName),
    });
  }

  /* Ordered by the clock, then by id — the tiebreak is not decoration. Two
     tasks can share a fire time exactly (same deadline, same estimate), and a
     list whose order depends on `backlogTasks`' order would reshuffle on any
     unrelated edit, which a screenshot baseline would then catch as a change
     nobody made. */
  rows.sort((a, b) => a.at - b.at || a.task.id.localeCompare(b.task.id));

  const next = rows.find((r) => r.state !== 'missed');
  if (next) next.state = 'next';

  return rows;
}

/**
 * The rows that have not fired yet — the count the header and the kicker both
 * print. A snoozed row is one of them: its last call is still to come.
 */
export function stillToFire(rows: FiringRow[]): FiringRow[] {
  return rows.filter((r) => r.state !== 'missed' && r.state !== 'sent');
}
