import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  planProjectDeletion,
  planListDeletion,
  planTaskDeletion,
  type DeletionPlan,
} from '../lib/cascadeDelete';
import { runDeletionEffects } from '../lib/deletionEffects';
import { resolveUserTimeZone } from '../lib/agent/dates';
import { planRecurrenceTransition, type RecurrenceTransition } from '../lib/recurrenceCompletion';
import { rruleFromLegacyRule } from '../lib/recurrence';
/* The one duration answer. `lib/priority.ts` imports only *types* back from
   this file, so the cycle is erased at build and there is no import order to
   get wrong. */
import { durationMinutes, hasEmergencyLapsed } from '../lib/priority';
import { affectsDeadlines, isQuietPlan, planDeadlineCascade, type DeadlinePlan } from '../lib/deadlineMath';
import { ignoredWorkOf } from '../lib/ignoredWork';
import { planProjectMove } from '../lib/projectTree';
import type { ProjectCoverStyle } from '../lib/projectCover';
import { useTrashStore } from './useTrashStore';
import { useArchiveStore } from './useArchiveStore';
import { useUIStore } from './useUIStore';

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  /**
   * How the cover is drawn when there is no photo (29-1P8a, idea 149): one of
   * six styles, its colours and Shuffle's seed. Absent means the default,
   * derived from the id. Read it only through `lib/projectCover.ts`.
   */
  cover?: ProjectCoverStyle;
  createdAt: number;
  /** Position among its siblings — the projects sharing its parent (BIG-2). */
  order: number;
  /**
   * The project this one sits inside (BIG-2), absent at the top level. Never
   * read it directly: a parent that is gone, or a cycle two devices wrote at
   * once, makes it lie. `lib/projectTree.ts` is the one reader.
   */
  parentId?: string;
  /**
   * Ignored work (BIG-3): this project and everything inside it, at any depth,
   * is never scored, offered or pushed. Never read it directly — the flag that
   * counts may be on a project above; `lib/ignoredWork.ts` is the one reader.
   */
  ignored?: boolean;
  /**
   * Time on this project and everything inside it doesn't count as worked
   * (BIG-6, 29-1b). `lib/workedTime.ts` is the one reader.
   */
  notWorked?: boolean;
  /**
   * The day he wants it finished by, `YYYY-MM-DD` (29-1P9b, idea 156, his
   * pick C): the coral line on the project's "when it'll be done" chart. It
   * never moves on its own, unlike a task's deadline. Read it through
   * `lib/projectForecast.ts` (`validDay`).
   */
  finishBy?: string;
  /** Public share doc id — presence means this project has a live read-only public page at `/s/{shareId}` (see `lib/publicShare.ts`). */
  shareId?: string;
  /** SimpleURL short-link keyword + branded domain for the public share URL (see `lib/simpleUrl.ts`). */
  shortUrlKeyword?: string;
  shortUrlDomain?: string;
  /**
   * "Outsourcing" mode: when true, viewers of this project's public share can
   * claim tasks and submit them for approval (see `lib/shareSubmissions.ts`).
   * When false/undefined the share is view-only.
   */
  shareAllowContributions?: boolean;
  /**
   * "Client view" (BUILD-14): the share also shows your name on the tasks you
   * are doing, a live timer while a focus run is on one, and the time taken.
   * Ignored while `shareAllowContributions` is on — a worker is never shown it.
   */
  shareShowPeople?: boolean;
  /**
   * The last day the public link works, `YYYY-MM-DD` (BUILD-14). It closes at
   * the local midnight after it. Absent means it never closes on its own.
   */
  shareExpiresOn?: string;
}

export interface Subtask {
  id: string;
  title: string;
  description?: string;
  deadline?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  allocatedTime?: number;
  status?: 'needsAction' | 'completed';
  subtasks?: Subtask[];
  // Same scoring fields as Task — lets any subtask, at any depth, get its
  // own priority score ("sub tasks and sub sub tasks and on and on").
  humanOverride?: number;
  avoidedCount?: number;
  /**
   * Item 17's Emergency flag, on a subtask for the same reason the two above
   * are: a subtask dragged into "Selected for Today" becomes a proxy `Task`
   * and is scored as one, and the task sheet opened on that proxy offers the
   * same Emergency control every other task gets. Without the field here the
   * control would write and the write would silently go nowhere — see
   * `SUBTASK_PROXY_FIELDS`, which is the list that makes it land.
   */
  emergencyBoost?: number;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'needsAction' | 'completed' | 'in-progress';
export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

// ─── Custom repeat pattern ───────────────────────────────────────────────────

/**
 * How a custom repeat was stored before v8, and **the only reason this type
 * still exists**: nothing writes one any more. The pattern is now an iCalendar
 * RRULE string on `Task.recurrenceRule` (`lib/recurrence.ts` is the only thing
 * that reads inside it), which covers patterns this object could not express
 * at all — the last Friday of the month, the 2nd Tuesday, the 15th — and is
 * byte-for-byte what a Google Calendar event's `recurrence` field wants.
 *
 * `migrate` below converts every rule in this browser on load. It is kept
 * declared because the *cloud* document carries no version and lands straight
 * in `setState` (`lib/firestoreSync.ts`), and because a task sitting in the
 * Trash keeps whatever shape it was deleted in for thirty days, so a pre-v8
 * rule can still turn up long afterwards. `customRRuleOf` reads it for those.
 *
 * @deprecated Read-only. Write `recurrenceRule`.
 */
export interface LegacyRecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  /** 0 = Sunday … 6 = Saturday, only meaningful when freq === 'weekly'. */
  byWeekday?: number[];
  endType: 'never' | 'onDate' | 'afterCount';
  endDate?: string;
  endCount?: number;
}

/**
 * Every pre-v8 rule in a list of tasks, rewritten as an RRULE string.
 *
 * Exported because the persist migration is not the only door tasks come in
 * through: `lib/firestoreSync.ts` drops a whole unversioned cloud document
 * into `setState`, so a snapshot written by an older client would otherwise
 * put the old objects straight back. Returns the array it was given when
 * there was nothing to change, so the sync path is not handed a new reference
 * on every snapshot.
 */
export function upgradeTaskRecurrence(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  if (!tasks.some((task) => task?.customRecurrence)) return tasks;

  return tasks.map((task) => {
    if (!task?.customRecurrence) return task;
    const upgraded: Task = {
      ...task,
      recurrenceRule: task.recurrenceRule ?? rruleFromLegacyRule(task.customRecurrence),
    };
    delete upgraded.customRecurrence;
    return upgraded;
  });
}

/** A task as it may still arrive from before OPT-3. */
type TaskWithOldFields = Task & { notes?: unknown; tags?: unknown };

function hasNotesOrTags(task: Task | undefined): boolean {
  return !!task && ('notes' in task || 'tags' in task);
}

/**
 * Notes and tags left the app at OPT-3 — Shreekant, 2026-10-06: *"description
 * is enough"*, and tags *"entirely from the software"*. His call on what was
 * already stored: **a task's notes are added to the end of its description**,
 * so nothing he wrote is lost, and **its tags are deleted**.
 *
 * Applied at every door tasks come in through, for the reason
 * `upgradeTaskRecurrence` above is — the persist migration, the unversioned
 * cloud document (`hydrateFromPayload`, which `mcp/` uses too), and Restore
 * from the Trash or the Archive, which keep whole tasks in their old shape.
 * Folding is safe to repeat: the notes key is removed once folded, and notes
 * the description already contains are dropped rather than added twice.
 * Returns the array it was given when there was nothing to change, so the
 * sync path is not handed a new reference on every snapshot.
 */
export function upgradeTaskNotesAndTags(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  if (!tasks.some(hasNotesOrTags)) return tasks;
  return tasks.map((task) => {
    if (!hasNotesOrTags(task)) return task;
    const upgraded: TaskWithOldFields = { ...task };
    const notes = typeof upgraded.notes === 'string' ? upgraded.notes.trim() : '';
    delete upgraded.notes;
    delete upgraded.tags;
    const description = upgraded.description?.trim() ?? '';
    if (notes && !description.includes(notes)) {
      upgraded.description = description ? `${description}\n\n${notes}` : notes;
    }
    return upgraded;
  });
}

/** The focus log's copy of a task's tags, removed for the same reason. */
export function upgradeFocusLogTags(entries: FocusLogEntry[]): FocusLogEntry[] {
  if (!Array.isArray(entries)) return [];
  if (!entries.some((entry) => entry && 'tags' in entry)) return entries;
  return entries.map((entry) => {
    if (!('tags' in entry)) return entry;
    const upgraded: FocusLogEntry & { tags?: unknown } = { ...entry };
    delete upgraded.tags;
    return upgraded;
  });
}

// ─── Phase 3: Priority Score System ──────────────────────────────────────────

/**
 * How a task's importance was stored before v9: an Eisenhower quadrant worth
 * 1–4 and a "personal score" worth 1–5, added together by
 * the old scorer and by nothing else. **The only reason this type
 * still exists** is that old shapes keep arriving long after the migration:
 * the cloud document carries no schema version and lands straight in
 * `setState` (`lib/firestoreSync.ts`), and a task sitting in the Trash keeps
 * whatever shape it was deleted in for thirty days.
 *
 * @deprecated Read-only. Write `humanOverride`.
 */
export interface LegacyScoringFields {
  /** 1 = Not Urgent + Not Important, 2 = Not Urgent + Important, 3 = Urgent + Not Important, 4 = Urgent + Important */
  eisenhowerQuadrant?: 1 | 2 | 3 | 4;
  /** 1–5 from the scoring session. */
  personalScore?: number;
  /** Accumulated +1 per Focus Mode quasi-need deferral. Now `avoidedCount`. */
  quasiNeedBonus?: number;
}

/**
 * The ceiling on the one manual dial — `eisenhowerQuadrant`'s 4 plus
 * `personalScore`'s 5, which is why the merge costs no task a single point.
 */
export const HUMAN_OVERRIDE_MAX = 9;

/**
 * The ceiling on the Emergency flag, and on the Avoided counter (item 17).
 *
 * **Both are `TUNING.caps` in `lib/priority.ts`, restated here as the ceiling
 * on what is *stored* rather than on what is *scored*.** The engine already
 * clamps whatever it is handed, so these two do not change any score; what
 * they change is what the app is willing to write. That matters differently
 * for each of them:
 *
 *   - `EMERGENCY_MAX` is the top of a control someone drags, so the control
 *     needs a number to draw stops up to.
 *   - `AVOIDED_MAX` is a counter that nothing was stopping. `addAvoidedCount`
 *     incremented for ever, so a task deferred fourteen times stored 14 and
 *     scored 5 — the row would have read "Avoided ×14" while the factor bar
 *     read `+5 /5`, which is the screen disagreeing with itself about one
 *     fact. It saturates now.
 */
export const EMERGENCY_MAX = 5;
export const AVOIDED_MAX = 5;

/**
 * How many live emergencies it takes before the app says something.
 *
 * IMPROVEMENTS.md item 17, in as many words: *"a warning past 3 — if six
 * things are emergencies, the button has stopped meaning anything."* It is a
 * warning and never a limit: the flag is Shreekant's judgement and the app
 * does not get to refuse it, it only gets to point out that the judgement has
 * stopped distinguishing anything.
 */
export const EMERGENCY_CROWD = 3;

/**
 * Every pre-v9 task and subtask rewritten onto the single importance dial.
 *
 * **Two fields become one by addition**, which is exactly what
 * the pre-v9 scorer was already doing with them — it summed `e + p` among
 * its five terms — so no task changed rank on the day this shipped. The old 1–4
 * and 1–5 land on 0–9, which is the new dial's whole range.
 *
 * **A task nobody ever scored stays unscored.** Read literally, `(e ?? 0) +
 * (p ?? 0)` gives every untouched task a `humanOverride` of 0 — a *judgement
 * of zero* rather than *no judgement* — and `isTaskScored` would then report
 * every task in the app as scored, emptying the Needs Attention queue and the
 * nav badge overnight. So the sum is written only where at least one of the
 * two was actually set.
 *
 * Exported, and applied at both doors tasks come in through, for the reason
 * `upgradeTaskRecurrence` above is: the persist migration never sees the
 * unversioned cloud document. Returns the array it was given when there was
 * nothing to change, so the sync path is not handed a new reference on every
 * snapshot.
 */
export function upgradeTaskScoring<T extends Task[] | Subtask[]>(tasks: T): T {
  if (!Array.isArray(tasks)) return [] as unknown as T;
  if (!tasks.some(needsScoringUpgrade)) return tasks;
  return (tasks as Array<Task | Subtask>).map(upgradeOneScoring) as T;
}

function needsScoringUpgrade(task: (Task | Subtask) & LegacyScoringFields): boolean {
  if (!task) return false;
  if (task.eisenhowerQuadrant !== undefined) return true;
  if (task.personalScore !== undefined) return true;
  if (task.quasiNeedBonus !== undefined) return true;
  return (task.subtasks ?? []).some(needsScoringUpgrade);
}

function upgradeOneScoring<T extends Task | Subtask>(task: T): T {
  if (!needsScoringUpgrade(task)) return task;
  const legacy = task as T & LegacyScoringFields;
  const upgraded = { ...task } as T & LegacyScoringFields;

  if (legacy.eisenhowerQuadrant !== undefined || legacy.personalScore !== undefined) {
    upgraded.humanOverride =
      upgraded.humanOverride ?? (legacy.eisenhowerQuadrant ?? 0) + (legacy.personalScore ?? 0);
  }
  if (legacy.quasiNeedBonus !== undefined) {
    upgraded.avoidedCount = upgraded.avoidedCount ?? legacy.quasiNeedBonus;
  }
  delete upgraded.eisenhowerQuadrant;
  delete upgraded.personalScore;
  delete upgraded.quasiNeedBonus;

  if (upgraded.subtasks) upgraded.subtasks = upgradeTaskScoring(upgraded.subtasks);
  return upgraded;
}

/**
 * What a task with no duration data at all is charged. 30 min is the
 * Micro/Standard boundary the engine's duration variable draws, so it is the
 * neutral guess: a task nobody estimated neither wins nor loses by it.
 *
 * `TUNING.defaultTaskMinutes` in `lib/priority.ts` is the same number, said
 * where the score can read it without importing the store.
 */
export const DEFAULT_TASK_MINUTES = 30;

/**
 * **How long a task takes, in minutes — the app's single answer**, and since
 * item 16 it is literally one function: `durationMinutes` from
 * `lib/priority.ts`, re-exported under the name the app already calls it by.
 *
 * **The precedence flipped, and that is the point.** It used to read
 * `estimatedTime` first; the settled decision is `allocatedTime` first —
 * *"`allocatedTime` is what you deliberately set for today, `estimatedTime` is
 * the generic guess, and the deliberate one should win"*. Item 15 built the
 * engine on the new order and left this one on the old one, because item 15
 * was not allowed to change what the app does; this is the session that closes
 * the gap, so Smart Start's hour budget, the Smart Start modal's printed
 * minutes, the Google Calendar block in `lib/deadlineReminder.ts` and the
 * score's own Latest Start are now four readings of one number.
 *
 * Note the order matches `taskFocusSeconds` below now, and no longer opposes
 * it. That opposition was the thing worth removing: two functions in one file
 * disagreeing about which field means "how long is this".
 */
export function taskEstimatedMinutes(task: { estimatedTime?: number; allocatedTime?: number }): number {
  return durationMinutes(task);
}

/** Scores can now carry a `.5` from the duration modifier — always render one decimal so chips never jitter between "9" and "9.5" widths. */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Whether someone has actually judged this task's importance.
 *
 * `undefined` is the unscored state and `0` is a deliberate "this matters
 * none" — the dial has a zero stop and pressing the selected stop again
 * clears it, so the two are reachable separately and mean different things.
 */
export function isTaskScored(task: { humanOverride?: number }): boolean {
  return task.humanOverride !== undefined;
}

/**
 * A top-level task "needs attention" when it isn't completed and is still
 * missing anything the unified needs-attention page (D1) exists to fill in:
 * a priority score, a deadline, a time estimate, or a description. Shared by
 * the `NeedsAttention` page (the queue) and the nav badge so both agree on the
 * count.
 * `estimatedTime` of 0 counts as missing (a zero-minute estimate is meaningless).
 */
export function taskNeedsAttention(task: {
  status?: TaskStatus;
  humanOverride?: number;
  deadline?: string;
  estimatedTime?: number;
  description?: string;
}): boolean {
  if (task.status === 'completed') return false;
  if (!isTaskScored(task)) return true;
  if (!task.deadline) return true;
  if (!task.estimatedTime) return true;
  if (!task.description || task.description.trim() === '') return true;
  return false;
}

/**
 * How long the Focus Mode countdown should run for a task, in seconds.
 *
 * Two fields can supply it: `allocatedTime` (seconds) is the duration tuned
 * for *this* session on the Set Deadlines page, `estimatedTime` (minutes) is
 * the task's own standing estimate from its card. Preferring the former and
 * falling back to the latter is what lets a duration typed anywhere show up in
 * the session without having to be entered a second time. `0` means no
 * duration was ever set — the timer sits at 00:00 rather than inventing a
 * length, which is the one thing it does NOT share with
 * `taskEstimatedMinutes`: that one has to spend a number, so it falls back to
 * `DEFAULT_TASK_MINUTES`; a countdown can honestly show nothing.
 */
export function taskFocusSeconds(task: { allocatedTime?: number; estimatedTime?: number }): number {
  if (task.allocatedTime && task.allocatedTime > 0) return task.allocatedTime;
  if (task.estimatedTime && task.estimatedTime > 0) return Math.round(task.estimatedTime * 60);
  return 0;
}

// ─── Recursive subtask time helpers (Set Deadlines / Focus Mode) ────────────

/** A leaf subtask's effective time is its own `allocatedTime`; a parent's is the sum of its children — lets time budgets roll up through infinite depth. */
export function subtaskTotalSeconds(sub: Subtask): number {
  const children = sub.subtasks ?? [];
  if (children.length === 0) return sub.allocatedTime || 0;
  return children.reduce((sum, c) => sum + subtaskTotalSeconds(c), 0);
}

export function subtasksTotalSeconds(subs: Subtask[]): number {
  return subs.reduce((sum, s) => sum + subtaskTotalSeconds(s), 0);
}

export function countSubtasksRecursive(subtasks: Subtask[]): { total: number; done: number } {
  return subtasks.reduce(
    (acc, s) => {
      const child = countSubtasksRecursive(s.subtasks ?? []);
      return { total: acc.total + 1 + child.total, done: acc.done + (s.status === 'completed' ? 1 : 0) + child.done };
    },
    { total: 0, done: 0 },
  );
}

export function updateSubtaskTimeInTree(tree: Subtask[], id: string, allocatedTime: number): Subtask[] {
  return tree.map((s) => ({
    ...s,
    allocatedTime: s.id === id ? allocatedTime : s.allocatedTime,
    subtasks: s.subtasks ? updateSubtaskTimeInTree(s.subtasks, id, allocatedTime) : s.subtasks,
  }));
}

/** Finds a subtask anywhere in the backlog by id, returning it along with its top-level root task. */
export function findSubtaskWithRoot(backlogTasks: Task[], subtaskId: string): { subtask: Subtask; rootTask: Task } | null {
  function search(subs: Subtask[]): Subtask | null {
    for (const s of subs) {
      if (s.id === subtaskId) return s;
      if (s.subtasks && s.subtasks.length > 0) {
        const found = search(s.subtasks);
        if (found) return found;
      }
    }
    return null;
  }
  for (const rootTask of backlogTasks) {
    const found = search(rootTask.subtasks ?? []);
    if (found) return { subtask: found, rootTask };
  }
  return null;
}

/**
 * **The stored Emergency level for a task or a subtask, read live** (item 17).
 *
 * A number, so a `useStore` selector built on it is `Object.is`-stable and the
 * task sheet re-renders only when this task's own flag actually moves.
 *
 * It exists because `setEmergencyBoost` writes immediately while three of the
 * sheet's four call sites hold their task in local `useState` — a snapshot
 * taken when the sheet opened. Reading the level back off that snapshot would
 * show the control ignoring its own press. Nothing else on the sheet has this
 * problem, because nothing else on it writes without going through Save.
 */
export function emergencyBoostOf(backlogTasks: Task[], id: string): number {
  const task = backlogTasks.find((t) => t.id === id);
  if (task) return task.emergencyBoost ?? 0;
  return findSubtaskWithRoot(backlogTasks, id)?.subtask.emergencyBoost ?? 0;
}

/** Recursively applies `updater` to the subtask matching `subtaskId` anywhere across every backlog task's tree. */
function updateSubtaskAnywhere(backlogTasks: Task[], subtaskId: string, updater: (s: Subtask) => Subtask): Task[] {
  function walk(subs: Subtask[]): { subs: Subtask[]; changed: boolean } {
    let changed = false;
    const next = subs.map((s) => {
      if (s.id === subtaskId) { changed = true; return updater(s); }
      if (s.subtasks && s.subtasks.length > 0) {
        const child = walk(s.subtasks);
        if (child.changed) { changed = true; return { ...s, subtasks: child.subs }; }
      }
      return s;
    });
    return { subs: next, changed };
  }
  return backlogTasks.map((t) => {
    if (!t.subtasks || t.subtasks.length === 0) return t;
    const result = walk(t.subtasks);
    return result.changed ? { ...t, subtasks: result.subs } : t;
  });
}

/**
 * The only fields an update addressed by *subtask* id can write through to the
 * real subtask — a `Subtask` carries a subset of `Task`'s shape. Exported so
 * the snapshot store (`useSnapshotStore`) can tell when a revert of a subtask
 * would silently fail to restore a field rather than pretending it succeeded.
 */
export const SUBTASK_PROXY_FIELDS = [
  'title', 'status', 'allocatedTime', 'deadline', 'priority',
  'humanOverride', 'avoidedCount', 'emergencyBoost',
] as const;

function pickSubtaskFields(updates: Partial<Task>): Partial<Subtask> {
  const out: Partial<Subtask> = {};
  for (const key of SUBTASK_PROXY_FIELDS) {
    if (key in updates) (out as Record<string, unknown>)[key] = (updates as Record<string, unknown>)[key];
  }
  return out;
}

export interface TaskLink {
  id: string;
  title: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: TaskPriority;
  allocatedTime?: number;
  listId?: string;
  listName?: string;
  parent?: string;
  subtasks?: Subtask[];
  startDate?: string;
  deadline?: string;
  recurrence?: TaskRecurrence;
  /**
   * The custom pattern, as an iCalendar RRULE string —
   * `FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR` is the last Friday of every month.
   * Set only when `recurrence` is `'custom'`; the four presets are folded into
   * the same shape by `resolveRule`, so nothing outside `lib/recurrence.ts`
   * has to know which of the two a task carries.
   */
  recurrenceRule?: string;
  /** @deprecated Pre-v8 rule object — read for its schedule, never written. */
  customRecurrence?: LegacyRecurrenceRule;
  /**
   * Repeating tasks are *complete-and-clone*: finishing one stamps it done for
   * good and spawns a successor. These three fields are what tie those separate
   * rows together into one series — see `lib/recurrence.ts`, the only thing that
   * computes them.
   *
   * `seriesId` is shared by every occurrence. `occurrence` is its 1-based
   * position (the task the user first set to repeat is 1). `seriesAnchor` is
   * occurrence 1's date, kept verbatim so occurrence *n* is always measured from
   * the start of the series rather than from its predecessor — without it a
   * monthly task anchored on the 31st would land on the 28th in February and
   * then stay on the 28th for ever.
   *
   * All three are absent until a repeating task is first completed, which is
   * exactly the state that means "occurrence 1, anchored on its own date".
   */
  seriesId?: string;
  occurrence?: number;
  seriesAnchor?: string;
  reminderMinutes?: number;
  links?: TaskLink[];
  imageUrl?: string;
  assignee?: string;
  /**
   * When `assignee` last changed to someone (29-1P13): the Dashboard's
   * "Waiting on" counts the days from it. Stamped by `applyTaskUpdate`, so
   * every path that names a person — the sheet, Atlas — gets it; a task
   * handed over before it existed has none and shows no count.
   */
  assignedAt?: number;
  /**
   * Sent to "this evening" (29-1c2, idea 38): the deadline it had (`was`,
   * absent if none) and the one it was given (`to`). Bringing it back restores
   * `was` only while the deadline is still `to` — changed in between, back is
   * 6pm. Written and cleared only by `eveningPatch` (`lib/dashboard/timeline.ts`).
   */
  beforeEvening?: { was?: string; to: string };
  estimatedTime?: number;
  completedAt?: number;
  createdAt?: number;
  order?: number;
  // Phase 3 — Priority Score fields
  humanOverride?: number;     // 0–9, the one manual importance dial
  avoidedCount?: number;      // accumulated +1 from quasi-need deferrals
  /**
   * 0–5, set by hand: "drop everything for this". Read by `lib/priority.ts`,
   * where it is one of the four variables that *multiply* once a task is
   * inside its danger zone, which is what makes it able to lift a task past
   * anything else on the screen.
   *
   * **It stops counting once `originalDeadline` has passed.** A missed
   * emergency that went on multiplying would keep screaming "drop everything"
   * about a date that is already gone, while the escalator is saying the
   * useful thing on the same task. The engine reads it as zero from that
   * moment; item 17's button also clears the field, so the two agree.
   *
   * Written by the Emergency picker on the task sheet and the row menus'
   * "Flag as emergency" (item 17).
   */
  emergencyBoost?: number;
  /**
   * The deadline this task was **first** given, before anything pushed it.
   *
   * The Post-deadline Escalator measures lateness from here and never from the
   * current deadline, so a task pushed back three times reads as three weeks
   * late rather than as freshly overdue. Without that anchor, moving an
   * overdue deadline forward would make an ancient miss score *lower* than one
   * that happened this morning — the exact inversion the scoring design exists
   * to prevent.
   *
   * Written **once**, on a task's first automatic push, and never again — by
   * item 18's deadline maths (`lib/deadlineMath.ts`). A task that has never
   * been pushed has none, so `lib/priority.ts` reads
   * `originalDeadline ?? deadline`.
   */
  originalDeadline?: string;
  /**
   * "Fixed date (never auto-reschedule)". Deadline maths is the first thing in
   * the app that can move a date on its own, so the opt-out exists before it
   * does. A fixed task is never pushed by a prerequisite; instead it goes
   * loud — the escalator runs on it and it surfaces as a conflict, because
   * *"this cannot be finished on time and the date cannot move"* is a real
   * answer.
   *
   * Read by item 18's deadline maths (`lib/deadlineMath.ts`).
   */
  deadlineIsFixed?: boolean;
  /**
   * 29-2d1: the event this task is due before ("Buy running shoes" before the
   * marathon). Its deadline is the event's (`linkedDeadline`, at the start, or
   * 6pm the day before an all-day one) and follows it when the event's date is
   * changed (`useEventStore.updateEvent`). Deadline maths reads it as fixed,
   * and any other write of `deadline` drops it (`applyTaskUpdate`). Lifted off
   * when the event is deleted, the date kept. See `lib/events/eventLinks.ts`.
   */
  eventId?: string;
  /**
   * D2 — task dependencies. Ids of other top-level tasks (in any project or
   * list) that have to be completed before this one.
   *
   * **They stopped being advisory at item 19.** This comment used to end
   * *"never hidden, reordered, or prevented from being worked on"*, and all
   * three of those have now gone: item 16's Conductivity floor reorders (a
   * blocker outranks whatever it is holding up), Smart Start withholds, and a
   * task with an unfinished prerequisite is **locked** — greyed on every
   * screen it appears on and refused by every completion control in the app,
   * `complete_task` included. `isTaskLocked` is that test, and nothing should
   * ask the question any other way.
   *
   * It still **opens and still edits**. A wrong dependency has to be fixable
   * from the row it broke, and Needs Attention exists to fill in missing
   * fields, which a locked task needs as much as any other one does.
   *
   * Cycles are guarded at edit time (see `wouldCreateDependencyCycle`), and
   * every walk over this graph is cycle-guarded anyway — the picker is not the
   * only door tasks come in through.
   */
  dependsOn?: string[];
  /**
   * A milestone (29-1P9b, idea 155): one of the project's big steps, drawn on
   * the line behind its "40% done". What it waits on is its own `dependsOn`
   * (his call), so this flag adds nothing to the graph and nothing to the
   * score. Absent, never `false` — the sheet removes the key when switched off.
   */
  milestone?: boolean;
  /** Monetary value of this task in Indian Rupees — rolls up into its list/project totals (see `taskListValueINR`/`projectValueINR`). */
  valueINR?: number;
  /**
   * "Hive mind" cross-linking — a task can be shared into additional lists
   * (which may live in other projects) beyond its primary `listId`. Editing
   * the task anywhere updates the single underlying record everywhere it's
   * shared, since it's the same object in `backlogTasks`.
   */
  sharedListIds?: string[];
  /**
   * True when this Task entry is a lightweight stand-in for a single
   * subtask (dragged directly into "Selected for Today" instead of its
   * parent task). Shares its `id` with the real subtask, so any update
   * (completion, time allocation, scoring, quasi-need) is written straight
   * back into the subtask wherever it lives in `backlogTasks` — Hive Mind
   * write-through, no separate bookkeeping needed since subtask ids are
   * globally unique UUIDs.
   */
  isSubtaskProxy?: boolean;
  /**
   * **"Schedule anyway" — this task is unlocked for today's session** even
   * though something it depends on is unfinished. Item 19.
   *
   * **It lives on the queue copy and only on the queue copy.** Today's queue
   * (`tasks`) holds snapshots taken when a task was committed to the day —
   * `buildSmartQueue` already stamps `allocatedTime` on them the same way —
   * and `updateTask` writes to that array alone. So the unlock expires exactly
   * when the session it was granted for does, which is what "for that session"
   * has to mean: tomorrow's queue is built fresh and the task is locked again
   * unless you say so again. **Never write it through `updateBacklogTask`.** A
   * flag that survived on the task of record would be a permanent exemption
   * granted by a button that does not say it is granting one.
   *
   * Two things set it, both an explicit press: Smart Start's "Schedule anyway"
   * on a held-back row, and New Session's, on a blocked row in the available
   * list. Nothing else — a task admitted *together with* its prerequisite is
   * not overridden, it is scheduled in the right order, and it should lock
   * again if you skip that prerequisite.
   */
  scheduledAnyway?: boolean;
  /**
   * @deprecated Phase 4 leftover from the old primary-calendar "Deadline: X"
   * marker. The Notification System now uses a deterministic Google Calendar
   * event id derived from `task.id` on a dedicated calendar instead (see
   * `lib/notificationSync.ts`), so this field is no longer read or written.
   * Left in place only so old synced data doesn't fail to parse.
   */
  googleEventId?: string;
  /** Public share doc id — presence means this task has a live read-only public page at `/s/{shareId}` (see `lib/publicShare.ts`). */
  shareId?: string;
  /** SimpleURL short-link keyword + branded domain for the public share URL (see `lib/simpleUrl.ts`). */
  shortUrlKeyword?: string;
  shortUrlDomain?: string;
  /**
   * "Blinding": when true, this task is omitted from any shared/public view of
   * the list or project it belongs to — a way to hide specific tasks from a
   * client while still sharing the rest (see `lib/publicShare.ts`).
   */
  hiddenFromShare?: boolean;
  /** Outsourcing mode for a task shared on its own (see `Project.shareAllowContributions`). */
  shareAllowContributions?: boolean;
  /** Client view for a task shared on its own (see `Project.shareShowPeople`). */
  shareShowPeople?: boolean;
  /** Link end date for a task shared on its own (see `Project.shareExpiresOn`). */
  shareExpiresOn?: string;
  /**
   * A skill this task's focus time was meant to count towards. **Written by
   * nothing since FIX-12** (audit B2): nothing set it and nothing showed it.
   * Old values are left where they are, read by nothing.
   */
  skillId?: string;
  /**
   * Ignored work (BIG-3): never scored, never offered by Smart Start or Needs
   * Attention, never pushed by deadline maths — still on its board. Its list or
   * a project above can ignore it too, so ask `lib/ignoredWork.ts`, not this.
   */
  ignored?: boolean;
  /**
   * Doesn't count as worked (BIG-6, 29-1b): `true` doesn't count, `false`
   * **counts anyway** under a list or project that doesn't, absent = as they
   * say. Ask `lib/workedTime.ts`, not this.
   */
  notWorked?: boolean;
}

/** What `setIgnored` turns the switch on (BIG-3). */
import type { IgnoreSubject as IgnoreTarget } from '../lib/ignoredWork';
export type { IgnoreTarget };

export interface TaskList {
  id: string;
  title: string;
  projectId?: string;
  order?: number;
  /** Ignored work (BIG-3) — every task in the list. Read through `lib/ignoredWork.ts`. */
  ignored?: boolean;
  /** Doesn't count as worked (BIG-6, 29-1b) — every task in it. Read through `lib/workedTime.ts`. */
  notWorked?: boolean;
  /** Public share doc id — presence means this list has a live read-only public page at `/s/{shareId}` (see `lib/publicShare.ts`). */
  shareId?: string;
  /** SimpleURL short-link keyword + branded domain for the public share URL (see `lib/simpleUrl.ts`). */
  shortUrlKeyword?: string;
  shortUrlDomain?: string;
  /** "Blinding": when true, this whole list is omitted from any shared project view (see `lib/publicShare.ts`). */
  hiddenFromShare?: boolean;
  /** Outsourcing mode for a list shared on its own (see `Project.shareAllowContributions`). */
  shareAllowContributions?: boolean;
  /** Client view for a list shared on its own (see `Project.shareShowPeople`). */
  shareShowPeople?: boolean;
  /** Link end date for a list shared on its own (see `Project.shareExpiresOn`). */
  shareExpiresOn?: string;
}

/** Sums `valueINR` across every top-level task in a given list (subtasks don't carry their own value field). */
export function taskListValueINR(tasks: Task[], listId: string): number {
  return tasks
    .filter((t) => t.listId === listId && !t.parent)
    .reduce((sum, t) => sum + (t.valueINR ?? 0), 0);
}

/** Sums `valueINR` across every list belonging to a project (i.e. every task list's own rollup, added together). */
export function projectValueINR(taskLists: TaskList[], tasks: Task[], projectId: string): number {
  return taskLists
    .filter((l) => l.projectId === projectId)
    .reduce((sum, l) => sum + taskListValueINR(tasks, l.id), 0);
}

/**
 * Compact ₹ formatting for rollup badges, using the Indian lakh/crore
 * convention (e.g. `250000` -> `"₹2.5L"`, `12000000` -> `"₹1.2Cr"`) rather
 * than Western thousand-grouping, since that's the currency's home
 * convention and keeps large totals from blowing out a small badge's width.
 * Falls back to plain `en-IN` grouping under ₹1L.
 */
export function formatINR(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(abs % 1_00_00_000 === 0 ? 0 : 1)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(abs % 1_00_000 === 0 ? 0 : 1)}L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

// ─── Focus time-log ─────────────────────────────────────────────────────────

/**
 * One contiguous stretch of focused work on a single task, written whenever
 * the Focus Mode timer stops (pause, done, skip, quasi-need defer, or leaving
 * focus mode). Pausing and resuming produces two entries rather than one
 * merged span, so `startedAt`/`endedAt` always bound real elapsed wall-clock
 * time and never swallow a paused gap.
 *
 * Project / list are *snapshots* taken at write time rather
 * than resolved on read, so history stays meaningful after a task is moved
 * between lists or deleted outright. (A `tags` snapshot was here until OPT-3
 * took tags out of the app; `upgradeTaskNotesAndTags` strips old ones.)
 */
export interface FocusLogEntry {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId?: string;
  listId?: string;
  /** Not written since FIX-12 (audit B2); old entries keep theirs. */
  skillId?: string;
  /** Wall-clock seconds worked in this stretch (`endedAt - startedAt`). */
  seconds: number;
  /** Epoch ms. */
  startedAt: number;
  /** Epoch ms. */
  endedAt: number;
  /**
   * 29-1P10a, idea 96: "When this ends, I'll have…", as he wrote it before the
   * task's clock started. Only on the last entry of a task's run — see
   * `lib/focusIntent.ts` for why never on every stretch.
   */
  intent?: string;
  /** Mark done's answer to that line. "Not yet" kept the task open, so it is never here. */
  outcome?: 'yes' | 'partly';
}

/**
 * What a caller supplies to `addFocusLog`. `id` is minted by the store, and
 * `projectId` is derived from `listId` there too so every entry agrees on
 * which project a list belonged to.
 */
export type FocusLogDraft = Omit<FocusLogEntry, 'id' | 'projectId'>;

/**
 * The whole store is synced as a single Firestore document, which has a hard
 * 1MB ceiling. Entries are ~150–250 bytes each, so keeping the most recent
 * few thousand leaves plenty of headroom for tasks/projects while still
 * covering years of realistic use for "all-time" analytics.
 */
const FOCUS_LOG_LIMIT = 5000;

/**
 * Union of two focus logs, de-duplicated by entry id and ordered oldest →
 * newest. Entries are immutable, append-only and there is no way to delete
 * one, so a union is always the correct reconciliation. Every other slice
 * syncs last-write-wins (cloud replaces local), which for this slice would
 * silently destroy real recorded work — sessions logged while offline, or on a
 * second device that hadn't yet seen the first device's write. Tolerates
 * missing/garbage input so a malformed synced doc can't take the app down.
 */
export function mergeFocusLogs(
  a: FocusLogEntry[] | undefined,
  b: FocusLogEntry[] | undefined,
): FocusLogEntry[] {
  const byId = new Map<string, FocusLogEntry>();
  for (const entry of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    if (!entry || typeof entry.id !== 'string') continue;
    /* The union, not the later copy: an entry is written once and only ever
       gains `intent`/`outcome` afterwards (29-1P10a), so a cloud copy from
       before that stamp must not wipe it off this device's. */
    const prev = byId.get(entry.id);
    byId.set(entry.id, prev ? { ...prev, ...entry } : entry);
  }
  const merged = [...byId.values()].sort((x, y) => x.startedAt - y.startedAt);
  return merged.length > FOCUS_LOG_LIMIT ? merged.slice(merged.length - FOCUS_LOG_LIMIT) : merged;
}

export const DEFAULT_LISTS: TaskList[] = [
  { id: 'action', title: 'Action Steps' },
  { id: 'backburner', title: 'Backburner' },
  { id: 'reference', title: 'Reference Materials' },
];

/**
 * Live lookup for a list's current title. `Task.listName` is only a
 * denormalized snapshot taken at create/move time — renaming a list never
 * used to propagate to it, which is exactly what made task cards show
 * stale/deleted list names. Every display site should resolve through this
 * instead of reading `task.listName` directly; the stored field is kept
 * only as a fallback for the rare case the list itself has been removed.
 */
export function getListTitle(taskLists: TaskList[], listId?: string, fallback?: string): string {
  if (!listId) return fallback ?? '';
  return taskLists.find((l) => l.id === listId)?.title ?? fallback ?? '';
}

// ─── D2: Task dependencies (soft, warning-only) ─────────────────────────────

/**
 * Would adding `depId` as a prerequisite of `taskId` create a dependency
 * cycle? An edge `taskId → depId` means "taskId depends on depId". A cycle
 * exists if `depId` can already reach `taskId` by following existing
 * `dependsOn` edges (or if they're the same task). Used to keep the
 * "Depends on…" picker from ever letting the user build A→B→A.
 */
export function wouldCreateDependencyCycle(tasks: Task[], taskId: string, depId: string): boolean {
  if (taskId === depId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set<string>();
  const stack = [depId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const t = byId.get(current);
    if (t?.dependsOn) stack.push(...t.dependsOn);
  }
  return false;
}

/**
 * Returns the prerequisite tasks that are still blocking `task` — i.e. its
 * `dependsOn` entries that resolve to an existing task that isn't completed.
 * Missing/deleted prerequisite ids are silently ignored, so a stale
 * dependency never wrongly blocks a task forever.
 */
export function getBlockingTasks(tasks: Task[], task: { dependsOn?: string[] }): Task[] {
  if (!task.dependsOn || task.dependsOn.length === 0) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocking: Task[] = [];
  for (const id of task.dependsOn) {
    const dep = byId.get(id);
    if (dep && dep.status !== 'completed') blocking.push(dep);
  }
  return blocking;
}

/**
 * **Whether this task is LOCKED** — waiting on unfinished work, and not
 * unlocked for today's session. Item 19's one definition, so that "greyed" and
 * "cannot be completed" are the same test on every screen rather than five
 * separate readings of `getBlockingTasks` that drift apart.
 *
 * Three ways out of it, and each is a decision somebody already made:
 *
 * - **A completed task is never locked.** Un-ticking one is how you reopen it,
 *   and a lock on the control that reopens it would leave a task nothing could
 *   ever touch again. It is the same suppression a finished row already gets
 *   for its deadline countdown, its Red Alert badge and its Emergency menu.
 * - **`scheduledAnyway` unlocks it**, which is the whole promise of the button
 *   — *"an override you deliberately pressed is not re-imposed one screen
 *   later, or the button stops meaning anything"*. See the field.
 * - **A prerequisite that no longer exists, or is already done, is not a
 *   prerequisite** — `getBlockingTasks`'s own reading, so a task deleted out
 *   from under a dependency cannot lock what was waiting on it for ever.
 *
 * `tasks` is where the prerequisites are looked up, and it should be the
 * **backlog** even when `task` is a snapshot copy out of today's queue: the
 * blocker's completion is live data, and reading it out of the queue would
 * keep a task locked by something you finished ten minutes ago.
 */
export function isTaskLocked(tasks: Task[], task: Task): boolean {
  if (task.status === 'completed') return false;
  if (task.scheduledAnyway) return false;
  return getBlockingTasks(tasks, task).length > 0;
}

/**
 * **Why this task is locked, as one sentence** — or `undefined` when it isn't.
 *
 * Every refused control in the app says this and none of them composes its own:
 * the board's `Tick`, the list view's, New Session's `SelectDot`, the "Done"
 * pill on the task sheet and on Needs Attention, and Focus Mode's "Mark done".
 * Six controls on five screens refusing the same task should not be able to
 * give six accounts of why, and a disabled control that says only *what* it
 * will not do is not something anyone can act on — the blocker's **name** is
 * the whole of the information.
 *
 * It reads as a label, not as an error: the app's settled line on this is
 * *"Blocked is stated, not shouted — a red box on a task you cannot start is
 * noise you can't act on"*, and that governs the words as much as the colour.
 */
export function taskLockReason(tasks: Task[], task: Task): string | undefined {
  if (!isTaskLocked(tasks, task)) return undefined;
  const names = getBlockingTasks(tasks, task).map((t) => `“${t.title}”`);
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Waiting on ${list} — finish ${names.length === 1 ? 'that' : 'those'} first.`;
}

interface AppState {
  sessionDuration: number;
  setSessionDuration: (seconds: number) => void;

  taskTimeMemory: Record<string, number>;
  setTaskTimeMemory: (title: string, seconds: number) => void;

  projects: Project[];
  addProject: (data: Omit<Project, 'id' | 'createdAt' | 'order'>) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  /** Soft delete — cascades through the project's lists and tasks, into the Trash. See `applyDeletion`. */
  deleteProject: (id: string) => void;
  /**
   * BUILD-11. Out of every board, count, queue, search and Atlas, kept for
   * good — see `applyArchive`. `false` when nothing was archived (no such
   * project, or the archive document is full), in which case nothing moved.
   */
  archiveProject: (id: string) => boolean;
  /** Reorders one set of siblings — the ids given, and only those. */
  reorderProjects: (orderedIds: string[]) => void;
  /**
   * BIG-2 — puts a project inside another (`null`: the top level), last among
   * its new siblings, with everything it holds. `false` when that would put it
   * inside itself or something under it, or names nothing.
   */
  moveProject: (id: string, parentId: string | null) => boolean;

  taskLists: TaskList[];
  backlogTasks: Task[];
  addTaskList: (title: string, projectId?: string) => TaskList;
  renameTaskList: (id: string, title: string) => void;
  updateTaskList: (id: string, updates: Partial<TaskList>) => void;
  /**
   * Ignored work (BIG-3): turn the switch on a task, a list or a project.
   * Turning it on also takes everything it now covers out of today's queue —
   * his call, 2026-09-29. Turning it off puts nothing back.
   */
  setIgnored: (target: IgnoreTarget, ignored: boolean) => void;
  /**
   * "Doesn't count as worked" (BIG-6, 29-1b). `undefined` removes the switch;
   * `false` is a task's "counts anyway" and only means anything on a task.
   */
  setNotWorked: (target: IgnoreTarget, value: boolean | undefined) => void;
  /** Soft delete — cascades through the list's tasks, into the Trash. See `applyDeletion`. */
  deleteTaskList: (id: string) => void;
  reorderTaskLists: (projectId: string | undefined, orderedIds: string[]) => void;
  /** Returns the new task's id (29-1c1: the quick-add note's Undo, the + dropped into a list). */
  addBacklogTask: (title: string, listId: string, parentId?: string) => string;
  updateBacklogTask: (id: string, updates: Partial<Task>) => void;
  /**
   * Soft delete, into the Trash. Clears today's focus queue (including any
   * subtask-proxy row), strips the id from every other task's `dependsOn`,
   * and has the share document and Calendar reminder cancelled. Callers do
   * **not** need to clean up after it — see `applyDeletion`.
   */
  deleteBacklogTask: (id: string) => void;
  /** BUILD-11 — `archiveProject` for one top-level task, with its subtasks. */
  archiveBacklogTask: (id: string) => boolean;
  reorderBacklogTasks: (listId: string, orderedIds: string[]) => void;
  moveTaskToList: (taskId: string, toListId: string, beforeTaskId?: string | null) => void;
  shareTaskToList: (taskId: string, listId: string) => void;
  unshareTaskFromList: (taskId: string, listId: string) => void;

  tasks: Task[];
  setTasks: (tasks: Task[]) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;

  focusLog: FocusLogEntry[];
  addFocusLog: (draft: FocusLogDraft) => void;

  // Phase 3 actions
  addAvoidedCount: (taskId: string) => void;
  /**
   * **Set the Emergency flag, 0–`EMERGENCY_MAX`.** Writes immediately rather
   * than through a draft: flagging an emergency is an act, not an edit to be
   * saved later, and it is offered from a row's ⋯ menu where there is nothing
   * to save. `0` clears the field outright — see the action for why absent and
   * zero must not both exist.
   *
   * Addressed by task id **or subtask id**; a subtask reached through its
   * "Selected for Today" proxy row writes through to the real subtask.
   */
  setEmergencyBoost: (taskId: string, level: number) => void;
  /**
   * Clear every Emergency whose anchor date has gone by. A no-op that returns
   * the state untouched when none has, so it is safe to run on a timer.
   */
  clearLapsedEmergencies: (now?: number) => void;
  addNestedSubtask: (rootTaskId: string, parentSubtaskId: string, title: string) => void;
}

/**
 * The one way anything is deleted.
 *
 * `lib/cascadeDelete.ts` works out what has to change; this applies it, keeps
 * a copy in the Trash so it can be undone for thirty days, and announces it so
 * the share document and Calendar reminder get cancelled. All three delete
 * actions go through here, which is the point: before this, six call sites
 * each hand-rolled a different subset of the cleanup and only one of them was
 * right, so a deleted task could stay in today's queue, keep blocking another
 * task, keep serving a public link and keep firing a deadline reminder.
 *
 * A plan that matched nothing is a no-op — no state write, no trash row.
 */
function applyDeletion(set: (partial: Partial<AppState>) => void, plan: DeletionPlan): void {
  if (!plan.matched) return;
  set(plan.next);
  useTrashStore.getState().record(plan);
  runDeletionEffects(plan);
}

/**
 * The one way anything is archived (BUILD-11) — `applyDeletion`'s twin, with
 * the Archive as the keeper instead of the Trash. The plan is the delete
 * cascade's own, because "gone from everything" is exactly what that cascade
 * already computes: the focus-queue row, the subtask proxies, other tasks'
 * `dependsOn`, the `sharedListIds` cross-links (`lib/archiveModel.ts`).
 *
 * The keeper is asked **first**, so an archive that cannot be kept (the
 * document is full) removes nothing. The announcement drops the share ids —
 * an archived thing's public link stays up, Shreekant's call — and keeps the
 * calendar half, so its blocks come off Google Calendar as a delete's do.
 */
function applyArchive(set: (partial: Partial<AppState>) => void, plan: DeletionPlan): boolean {
  if (!plan.matched) return false;
  if (!useArchiveStore.getState().record(plan)) return false;
  set(plan.next);
  runDeletionEffects({ ...plan, shareIds: [] });
  return true;
}

/**
 * A patch applied so that clearing a field *removes* it.
 *
 * `{ ...task, ...updates }` leaves a key set to `undefined` sitting on the
 * object, which reads the same everywhere in JavaScript but is a hard write
 * error in Firestore — the whole document push fails, so one cleared field
 * silently stops every later edit reaching the cloud. `buildSuccessorTask`
 * already strips them for the same reason.
 */
function withPatch<T extends object>(base: T, patch: Partial<T>): T {
  const next = { ...base, ...patch };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    if (patch[key] === undefined) delete next[key];
  }
  return next;
}

/** One more deferral, saturating at `AVOIDED_MAX`. See that constant for why it saturates. */
function bumpAvoided(current: number | undefined): number {
  return Math.min(AVOIDED_MAX, (current ?? 0) + 1);
}

/**
 * Every edit to a top-level task, applied. Which makes it the one place a
 * task's *status* changes, and therefore the one place a repeating task can
 * spawn its successor or take it back again.
 *
 * Three things happen here beyond writing the patch. The completion is
 * *timestamped* — `completedAt` used to be set by two of the four paths that
 * complete a task and by neither of the other two, so when a task was finished
 * depended on where it was ticked off. The successor is worked out by
 * `recurrenceCompletion.ts` and inserted **immediately after** its predecessor,
 * so it appears where the finished copy is rather than at the top of the list;
 * it inherits its predecessor's `order`, and duplicate orders sort adjacently
 * because the array position breaks the tie. And reopening a task deletes the
 * clone its completion made — directly, not into the Trash, because a clone
 * nobody ever saw is not something a person deleted.
 *
 * Returns the tasks to store and the patch actually written, which is the one
 * the focus queue must mirror rather than the caller's.
 *
 * **Item 18 added a fourth thing, and it is the only one that writes to tasks
 * other than this one.** When an edit touches the dependency graph — the
 * deadline, the prerequisites, the fixed-date flag, or completion — the one
 * deadline rule is re-run over the whole backlog and anything it pushes is
 * applied here, inside the same `set`. That is deliberate: it makes the whole
 * cascade a single store write, so it reaches Firestore once and Google
 * Calendar's reconcile pass diffs it once, in one batch, instead of firing an
 * API call per moved task. What it *cannot* do here is say so — a banner is a
 * side effect and this function is a reducer — so the plan comes back with the
 * tasks and `updateBacklogTask` reports it.
 */
function applyTaskUpdate(
  state: AppState,
  existing: Task,
  updates: Partial<Task>,
): { backlogTasks: Task[]; updates: Partial<Task>; deadlines: DeadlinePlan | null } {
  const after = withPatch(existing, updates);
  let written = updates;

  if (updates.status !== undefined && updates.status !== existing.status) {
    if (updates.status === 'completed') {
      if (!('completedAt' in updates)) written = { ...written, completedAt: Date.now() };
    } else if (existing.status === 'completed') {
      written = { ...written, completedAt: undefined };
    }
  }

  /* 29-2d1: a linked task's date is the event's. A deadline written by anything
     but the link itself (the event following, the sheet, which always says
     `eventId`) is a date set by hand, and a date set by hand wins: the link goes. */
  if (existing.eventId && 'deadline' in updates && !('eventId' in updates) && updates.deadline !== existing.deadline) {
    written = { ...written, eventId: undefined };
  }

  /* Handed to someone new, or taken back: when, for "Waiting on" (29-1P13). */
  const who = (t: Partial<Task>) => (t.assignee ?? '').trim();
  if ('assignee' in updates && !('assignedAt' in updates) && who(updates) !== who(existing)) {
    written = { ...written, assignedAt: who(updates) ? Date.now() : undefined };
  }

  const transition: RecurrenceTransition | null = planRecurrenceTransition(state, existing, after, {
    now: new Date(),
    timeZone: resolveUserTimeZone(),
    newId: () => crypto.randomUUID(),
  });
  if (transition?.stamp) written = { ...written, ...transition.stamp };

  let backlogTasks = state.backlogTasks.map((t) => (t.id === existing.id ? withPatch(t, written) : t));
  if (transition?.removeId) backlogTasks = backlogTasks.filter((t) => t.id !== transition.removeId);
  if (transition?.successor) {
    const at = backlogTasks.findIndex((t) => t.id === existing.id);
    backlogTasks = [...backlogTasks.slice(0, at + 1), transition.successor, ...backlogTasks.slice(at + 1)];
  }

  /* The one deadline rule. Run over the state this edit produced — including
     any successor it just spawned — rather than over the state it started
     from, so a chain settles against the date that was actually written. */
  let deadlines: DeadlinePlan | null = null;
  if (affectsDeadlines(existing, written)) {
    const plan = planDeadlineCascade(backlogTasks, {
      timeZone: resolveUserTimeZone(),
      ignored: ignoredWorkOf(backlogTasks, state.taskLists, state.projects).ids,
    });
    if (!isQuietPlan(plan)) {
      deadlines = plan;
      const byId = new Map(plan.patches.map((patch) => [patch.taskId, patch]));
      if (byId.size > 0) {
        backlogTasks = backlogTasks.map((t) => {
          const patch = byId.get(t.id);
          return patch
            ? withPatch(t, {
                deadline: patch.deadline,
                // Spread rather than assigned, so a task that already carries
                // an anchor keeps it. `withPatch` would *delete* the key it was
                // handed as `undefined`, which is the opposite of "written
                // once and never again".
                ...(patch.originalDeadline !== undefined
                  ? { originalDeadline: patch.originalDeadline }
                  : {}),
              })
            : t;
        });
      }
    }
  }

  return { backlogTasks, updates: written, deadlines };
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      sessionDuration: 14400,
      setSessionDuration: (seconds) => set({ sessionDuration: seconds }),

      taskTimeMemory: {},
      setTaskTimeMemory: (title, seconds) =>
        set((state) => ({
          taskTimeMemory: { ...state.taskTimeMemory, [title]: seconds },
        })),

      projects: [],
      addProject: (data) => {
        // Last among the siblings it joins (BIG-2). The whole array's length
        // did that job while every project was a sibling of every other.
        const siblings = get().projects.filter((p) => (p.parentId ?? null) === (data.parentId ?? null));
        const project: Project = {
          ...data,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          order: siblings.reduce((max, p) => Math.max(max, p.order), -1) + 1,
        };
        set((state) => ({ projects: [...state.projects, project] }));
        return project;
      },
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
        })),
      deleteProject: (id) => applyDeletion(set, planProjectDeletion(get(), id)),
      archiveProject: (id) => applyArchive(set, planProjectDeletion(get(), id)),

      reorderProjects: (orderedIds) =>
        set((state) => {
          const byId = new Map(state.projects.map((p) => [p.id, p]));
          const reordered = orderedIds
            .map((id, index) => {
              const project = byId.get(id);
              return project ? { ...project, order: index } : null;
            })
            .filter(Boolean) as Project[];
          const leftovers = state.projects.filter((p) => !orderedIds.includes(p.id));
          return { projects: [...reordered, ...leftovers] };
        }),
      moveProject: (id, parentId) => {
        const next = planProjectMove(get().projects, id, parentId);
        if (!next) return false;
        set({ projects: next });
        return true;
      },

      taskLists: DEFAULT_LISTS,
      backlogTasks: [],

      addTaskList: (title, projectId) => {
        const list: TaskList = {
          id: crypto.randomUUID(),
          title,
          projectId,
          order: get().taskLists.filter((l) => l.projectId === projectId).length,
        };
        set((state) => ({ taskLists: [...state.taskLists, list] }));
        return list;
      },

      updateTaskList: (id, updates) =>
        set((state) => ({
          taskLists: state.taskLists.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),

      setIgnored: (target, ignored) =>
        set((state) => {
          // Cleared by removing the key, never by writing `false` — an absent
          // flag is the default and a synced document stays as it was.
          const flag = <T extends { ignored?: boolean }>(record: T): T => {
            const { ignored: _was, ...rest } = record;
            void _was;
            return (ignored ? { ...rest, ignored: true } : rest) as T;
          };
          const projects =
            target.kind === 'project'
              ? state.projects.map((p) => (p.id === target.id ? flag(p) : p))
              : state.projects;
          const taskLists =
            target.kind === 'list'
              ? state.taskLists.map((l) => (l.id === target.id ? flag(l) : l))
              : state.taskLists;
          const backlogTasks =
            target.kind === 'task'
              ? state.backlogTasks.map((t) => (t.id === target.id ? flag(t) : t))
              : state.backlogTasks;

          let tasks = state.tasks.map((t) => (target.kind === 'task' && t.id === target.id ? flag(t) : t));
          if (ignored) {
            const work = ignoredWorkOf(backlogTasks, taskLists, projects);
            tasks = tasks.filter((t) => !work.has(t));
          }
          return { projects, taskLists, backlogTasks, tasks };
        }),

      /* Written straight onto the record, like `setIgnored`: a flag, not a
         status, so it has no business in `updateBacklogTask`'s path. Only the
         backlog's copy is read (`lib/workedTime.ts`), so the queue is left be. */
      setNotWorked: (target, value) =>
        set((state) => {
          const flag = <T extends { notWorked?: boolean }>(record: T): T => {
            const { notWorked: _was, ...rest } = record;
            void _was;
            const v = target.kind === 'task' ? value : value ? true : undefined;
            return (v === undefined ? rest : { ...rest, notWorked: v }) as T;
          };
          if (target.kind === 'project') return { projects: state.projects.map((p) => (p.id === target.id ? flag(p) : p)) };
          if (target.kind === 'list') return { taskLists: state.taskLists.map((l) => (l.id === target.id ? flag(l) : l)) };
          return { backlogTasks: state.backlogTasks.map((t) => (t.id === target.id ? flag(t) : t)) };
        }),

      renameTaskList: (id, title) =>
        set((state) => ({
          taskLists: state.taskLists.map((l) => (l.id === id ? { ...l, title } : l)),
          // `listName` is only a display fallback (see `getListTitle`), but
          // keep it fresh anyway so old/offline-synced data stays sane.
          backlogTasks: state.backlogTasks.map((t) => (t.listId === id ? { ...t, listName: title } : t)),
          tasks: state.tasks.map((t) => (t.listId === id ? { ...t, listName: title } : t)),
        })),

      deleteTaskList: (id) => applyDeletion(set, planListDeletion(get(), id)),

      reorderTaskLists: (projectId, orderedIds) =>
        set((state) => {
          const others = state.taskLists.filter((l) => l.projectId !== projectId);
          const scoped = state.taskLists.filter((l) => l.projectId === projectId);
          const reordered = orderedIds
            .map((id, index) => {
              const list = scoped.find((l) => l.id === id);
              return list ? { ...list, order: index } : null;
            })
            .filter(Boolean) as TaskList[];
          return { taskLists: [...others, ...reordered] };
        }),

      addBacklogTask: (title, listId, parentId) => {
        const list = get().taskLists.find((l) => l.id === listId);
        const tasksInList = get().backlogTasks.filter((t) => t.listId === listId && !t.parent);
        const newTask: Task = {
          id: crypto.randomUUID(),
          title,
          status: 'needsAction',
          listId,
          listName: list?.title ?? '',
          subtasks: [],
          createdAt: Date.now(),
          order: tasksInList.length,
        };

        if (parentId) {
          set((state) => ({
            backlogTasks: state.backlogTasks.map((t) =>
              t.id === parentId
                ? {
                    ...t,
              subtasks: [
                  ...(t.subtasks ?? []),
                  { id: newTask.id, title, status: 'needsAction' as const, subtasks: [] },
                ],
                  }
                : t
            ),
          }));
        } else {
          set((state) => ({ backlogTasks: [newTask, ...state.backlogTasks] }));
        }
        return newTask.id;
      },

      updateBacklogTask: (id, updates) => {
        /* Lifted out of the `set` so the banner is raised *after* the write
           lands, the way `applyDeletion` records a Trash entry after its own.
           Announcing from inside a reducer would mean a second store's setState
           running in the middle of this one's. */
        let deadlines: DeadlinePlan | null = null;

        set((state) => {
          // The focus queue keeps its own snapshot copies of the tasks picked
          // for today, so an edit made anywhere else — a task card, the detail
          // panel, the needs-attention page — has to be mirrored into it too.
          // Without this the session keeps running on the values the task had
          // at selection time, most visibly a duration that was set afterwards
          // and never reaches the countdown.
          //
          // It takes a *map* rather than one patch because item 18's deadline
          // rule can move tasks other than the one being edited, and a task it
          // pushed that is also in today's queue would otherwise run the rest
          // of the session against the date it no longer has.
          const mirrorIntoFocusQueue = (writes: ReadonlyMap<string, Partial<Task>>): { tasks?: Task[] } => {
            if (writes.size === 0) return {};
            let changed = false;
            const tasks = state.tasks.map((t) => {
              const written = writes.get(t.id);
              if (!written) return t;
              // A proxy stands in for a single subtask, which only carries a
              // subset of the task fields — mirror exactly what was persisted
              // onto the subtask itself, nothing more.
              const applied: Partial<Task> = t.isSubtaskProxy ? pickSubtaskFields(written) : written;
              if (Object.keys(applied).length === 0) return t;
              changed = true;
              return withPatch(t, applied);
            });
            return changed ? { tasks } : {};
          };

          const existing = state.backlogTasks.find((t) => t.id === id);
          if (existing) {
            const result = applyTaskUpdate(state, existing, updates);
            deadlines = result.deadlines;
            const writes = new Map<string, Partial<Task>>([[id, result.updates]]);
            for (const patch of result.deadlines?.patches ?? []) {
              if (patch.taskId !== id) writes.set(patch.taskId, { deadline: patch.deadline });
            }
            return {
              backlogTasks: result.backlogTasks,
              ...mirrorIntoFocusQueue(writes),
            };
          }
          // No top-level match — `id` may belong to a subtask (e.g. viewed
          // via a "Selected for Today" subtask proxy row); write through.
          // Recurrence does not reach here: a subtask has no repeat rule of
          // its own, and the settled decision keeps repeating out of subtasks
          // entirely. Nor does deadline maths: a subtask can never be a
          // prerequisite, so it has no position in the graph to cascade from.
          const subUpdates = pickSubtaskFields(updates);
          if (Object.keys(subUpdates).length === 0) return {};
          return {
            backlogTasks: updateSubtaskAnywhere(state.backlogTasks, id, (s) => ({ ...s, ...subUpdates })),
            ...mirrorIntoFocusQueue(new Map([[id, updates]])),
          };
        });

        if (deadlines) useUIStore.getState().reportDeadlineShift(deadlines);
      },

      deleteBacklogTask: (id) => applyDeletion(set, planTaskDeletion(get(), id)),
      archiveBacklogTask: (id) => applyArchive(set, planTaskDeletion(get(), id)),

      reorderBacklogTasks: (listId, orderedIds) =>
        set((state) => {
          const otherTasks = state.backlogTasks.filter((t) => t.listId !== listId);
          const listTasks = state.backlogTasks.filter((t) => t.listId === listId);
          const reordered = orderedIds
            .map((id, index) => {
              const task = listTasks.find((t) => t.id === id);
              return task ? { ...task, order: index } : null;
            })
            .filter(Boolean) as Task[];
          return { backlogTasks: [...otherTasks, ...reordered] };
        }),

      moveTaskToList: (taskId, toListId, beforeTaskId) =>
        set((state) => {
          const targetList = state.taskLists.find((l) => l.id === toListId);
          const listTasks = state.backlogTasks
            .filter((t) => t.listId === toListId && !t.parent)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          // Build new ordered id array for the target list
          const idsWithoutMoved = listTasks.filter((t) => t.id !== taskId).map((t) => t.id);
          let insertIdx = idsWithoutMoved.length;
          if (beforeTaskId && beforeTaskId !== 'end') {
            const idx = idsWithoutMoved.indexOf(beforeTaskId);
            if (idx !== -1) insertIdx = idx;
          }
          const newIds = [...idsWithoutMoved];
          newIds.splice(insertIdx, 0, taskId);

          return {
            backlogTasks: state.backlogTasks.map((t) => {
              if (t.id === taskId) {
                return { ...t, listId: toListId, listName: targetList?.title ?? '', order: newIds.indexOf(taskId) };
              }
              if (t.listId === toListId && !t.parent) {
                const newOrder = newIds.indexOf(t.id);
                return newOrder !== -1 ? { ...t, order: newOrder } : t;
              }
              return t;
            }),
          };
        }),

      shareTaskToList: (taskId, listId) =>
        set((state) => ({
          backlogTasks: state.backlogTasks.map((t) => {
            if (t.id !== taskId || t.listId === listId) return t;
            const existing = t.sharedListIds ?? [];
            if (existing.includes(listId)) return t;
            return { ...t, sharedListIds: [...existing, listId] };
          }),
        })),

      unshareTaskFromList: (taskId, listId) =>
        set((state) => ({
          backlogTasks: state.backlogTasks.map((t) =>
            t.id === taskId
              ? { ...t, sharedListIds: (t.sharedListIds ?? []).filter((id) => id !== listId) }
              : t
          ),
        })),

      tasks: [],
      setTasks: (tasks) => set({ tasks }),
      updateTask: (id, updates) =>
        set((state) => {
          const target = state.tasks.find((t) => t.id === id);
          const tasks = state.tasks.map((task) => (task.id === id ? { ...task, ...updates } : task));

          // Hive-mind write-through: a proxy task standing in for a single
          // dragged-in subtask mirrors relevant edits back onto the real
          // subtask wherever it lives in the backlog.
          if (target?.isSubtaskProxy) {
            const subUpdates = pickSubtaskFields(updates);
            if (Object.keys(subUpdates).length > 0) {
              return { tasks, backlogTasks: updateSubtaskAnywhere(state.backlogTasks, id, (s) => ({ ...s, ...subUpdates })) };
            }
          }
          return { tasks };
        }),

      focusLog: [],
      addFocusLog: (draft) =>
        set((state) => {
          // A stretch shorter than a second is a mis-tap on pause/resume, not
          // work — logging it would only pollute the analytics with noise.
          if (draft.seconds < 1) return {};

          const entry: FocusLogEntry = { id: crypto.randomUUID(), ...draft };
          const projectId = draft.listId
            ? state.taskLists.find((l) => l.id === draft.listId)?.projectId
            : undefined;
          if (projectId) entry.projectId = projectId;

          const next = [...state.focusLog, entry];
          return {
            focusLog: next.length > FOCUS_LOG_LIMIT ? next.slice(next.length - FOCUS_LOG_LIMIT) : next,
          };
        }),

      addAvoidedCount: (taskId) =>
        set((state) => {
          const hasTopLevelMatch = state.backlogTasks.some((t) => t.id === taskId);
          if (hasTopLevelMatch) {
            return {
              backlogTasks: state.backlogTasks.map((t) =>
                t.id === taskId ? { ...t, avoidedCount: bumpAvoided(t.avoidedCount) } : t
              ),
            };
          }
          // Not a top-level task — it may be a dragged-in subtask proxy;
          // search the whole backlog tree and bump it there instead.
          return {
            backlogTasks: updateSubtaskAnywhere(state.backlogTasks, taskId, (s) => ({ ...s, avoidedCount: bumpAvoided(s.avoidedCount) })),
          };
        }),

      setEmergencyBoost: (taskId, level) =>
        set((state) => {
          /* Clamped, and **zero is stored as absent**. `emergencyBoost: 0` and
             no field at all mean the same thing to the engine, and one way of
             saying "no emergency" is what lets every reader of the field test
             it rather than compare it — a row marker, the count, and the sweep
             below all ask only whether it is there.
             `withPatch` is what turns the `undefined` into a real removal;
             Firestore rejects an `undefined` value outright. */
          const clamped = Math.round(Math.min(EMERGENCY_MAX, Math.max(0, level)));
          const next = clamped > 0 ? clamped : undefined;

          const existing = state.backlogTasks.find((t) => t.id === taskId);
          if (existing) {
            if (existing.emergencyBoost === next) return {};
            return {
              backlogTasks: state.backlogTasks.map((t) =>
                t.id === taskId ? withPatch(t, { emergencyBoost: next }) : t
              ),
            };
          }
          // A subtask, reached through its proxy row. `emergencyBoost` is a
          // `SUBTASK_PROXY_FIELDS` member precisely so this lands.
          return {
            backlogTasks: updateSubtaskAnywhere(state.backlogTasks, taskId, (s) =>
              withPatch(s, { emergencyBoost: next })),
          };
        }),

      clearLapsedEmergencies: (now = Date.now()) =>
        set((state) => {
          /* **The write half of "an emergency clears itself".** The engine
             already reads a lapsed one as zero, so nothing on screen waits on
             this — what it fixes is the *stored* field, which would otherwise
             sit at 4 for ever on a task whose date went by in March, and come
             back as a live emergency the moment item 18's deadline maths
             pushes that date into the future again.

             It returns `{}` untouched when nothing lapsed, which is the whole
             reason it is safe to run on a timer: no new array, no re-render,
             and no Firestore write on a document that is capped at 1 MB and
             rewritten whole. */
          let changed = false;
          const backlogTasks = state.backlogTasks.map((task) => {
            if (task.emergencyBoost === undefined) return task;
            if (!hasEmergencyLapsed(task, now)) return task;
            changed = true;
            return withPatch(task, { emergencyBoost: undefined });
          });
          return changed ? { backlogTasks } : {};
        }),

      addNestedSubtask: (rootTaskId, parentSubtaskId, title) => {
        function addToTree(subtasks: Subtask[], parentId: string, newSub: Subtask): Subtask[] {
          return subtasks.map((s) => {
            if (s.id === parentId) {
              return { ...s, subtasks: [...(s.subtasks ?? []), newSub] };
            }
            if (s.subtasks && s.subtasks.length > 0) {
              return { ...s, subtasks: addToTree(s.subtasks, parentId, newSub) };
            }
            return s;
          });
        }
        const newSub: Subtask = {
          id: crypto.randomUUID(),
          title,
          status: 'needsAction',
          subtasks: [],
        };
        set((state) => ({
          backlogTasks: state.backlogTasks.map((t) =>
            t.id === rootTaskId
              ? { ...t, subtasks: addToTree(t.subtasks ?? [], parentSubtaskId, newSub) }
              : t
          ),
        }));
      },
    }),
    {
      name: 'mutineer-os-storage',
      version: 10,
      migrate: (persisted) => {
        const state = persisted as Record<string, unknown>;
        if (!state.taskLists || (state.taskLists as TaskList[]).length === 0) {
          state.taskLists = DEFAULT_LISTS;
        }
        if (!state.backlogTasks) state.backlogTasks = [];
        if (!state.tasks) state.tasks = [];
        if (!state.sessionDuration) state.sessionDuration = 14400;
        if (!state.taskTimeMemory) state.taskTimeMemory = {};
        if (!state.projects) state.projects = [];
        if (!Array.isArray(state.focusLog)) state.focusLog = [];
        // Focus Periods / Focus Calendar feature was removed entirely —
        // drop any leftover persisted key from older versions instead of
        // carrying dead data forward forever.
        delete state.focusPeriods;
        // v8 — the custom repeat pattern became an RRULE string. Converting
        // rather than reinterpreting is the whole point: no repeating task
        // changes the day it next comes round.
        state.backlogTasks = upgradeTaskRecurrence(state.backlogTasks as Task[]);
        state.tasks = upgradeTaskRecurrence(state.tasks as Task[]);
        // v9 — the Eisenhower quadrant and the personal score became one
        // importance dial, and the quasi-need bonus was renamed. Adding the
        // two is what the pre-v9 scorer already did with them, so this
        // changed no task's score and no task's rank at the time.
        state.backlogTasks = upgradeTaskScoring(state.backlogTasks as Task[]);
        state.tasks = upgradeTaskScoring(state.tasks as Task[]);
        // v10 — notes and tags left the app (OPT-3). Notes fold into the
        // description; tags are deleted, his call.
        state.backlogTasks = upgradeTaskNotesAndTags(state.backlogTasks as Task[]);
        state.tasks = upgradeTaskNotesAndTags(state.tasks as Task[]);
        state.focusLog = upgradeFocusLogTags(state.focusLog as FocusLogEntry[]);
        return state as unknown as AppState;
      },
    }
  )
);
