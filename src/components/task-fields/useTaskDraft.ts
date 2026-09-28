import { useMemo, useState } from 'react';
import {
  useStore,
  type Subtask,
  type Task,
  type TaskLink,
  type TaskList,
  type TaskRecurrence,
  type TaskStatus,
} from '../../store/useStore';
import { customRRuleOf } from '../../lib/recurrence';
import type { PriorityTask } from '../../lib/priority';
import { REMINDER_USE_DEFAULT, reminderToPicker, resolveReminderMinutes } from './reminderOptions';

/**
 * Every editable task field, held as the shape the form controls want
 * (numbers as strings, `undefined` as `''`) rather than the shape the store
 * wants. `toUpdates()` converts back.
 */
export interface TaskDraft {
  title: string;
  description: string;
  notes: string;
  status: TaskStatus;
  startDate: string;
  deadline: string;
  /**
   * "Fixed date (never auto-reschedule)". Item 18's opt-out from the one
   * deadline rule, and it is on this sheet rather than beside it because the
   * question it answers is about *this* deadline: can the app move it.
   */
  deadlineIsFixed: boolean;
  humanOverride?: number;
  estimatedTime: string;
  valueINR: string;
  recurrence: TaskRecurrence;
  /** The custom pattern as an RRULE string; see `lib/recurrence.ts`. */
  recurrenceRule?: string;
  /** May hold a `REMINDER_*` sentinel while editing; see `reminderOptions.ts`. */
  reminderMinutes: number;
  customReminderMinutes: string;
  tags: string[];
  links: TaskLink[];
  imageUrl: string;
  subtasks: Subtask[];
  assignee: string;
  listId: string;
  sharedListIds: string[];
  dependsOn: string[];
}

/** The four fields `taskNeedsAttention()` gates on — drives the "Needs …" chips. */
export interface TaskDraftMissing {
  score: boolean;
  deadline: boolean;
  estimate: boolean;
  description: boolean;
}

export function taskToDraft(task?: Task): TaskDraft {
  const reminder = reminderToPicker(task?.reminderMinutes);
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    notes: task?.notes ?? '',
    status: task?.status ?? 'needsAction',
    startDate: task?.startDate ?? '',
    deadline: task?.deadline ?? '',
    deadlineIsFixed: task?.deadlineIsFixed ?? false,
    humanOverride: task?.humanOverride,
    estimatedTime: task?.estimatedTime?.toString() ?? '',
    valueINR: task?.valueINR?.toString() ?? '',
    recurrence: task?.recurrence ?? 'none',
    // Read through `customRRuleOf`, so a task still carrying a pre-v8 rule
    // object opens with its real pattern in the picker rather than an empty
    // one that saving would then write over the top of.
    recurrenceRule: task ? customRRuleOf(task) : undefined,
    reminderMinutes: task ? reminder.value : REMINDER_USE_DEFAULT,
    customReminderMinutes: reminder.custom,
    tags: task?.tags ?? [],
    links: task?.links ?? [],
    imageUrl: task?.imageUrl ?? '',
    subtasks: task?.subtasks ?? [],
    assignee: task?.assignee ?? '',
    listId: task?.listId ?? '',
    sharedListIds: task?.sharedListIds ?? [],
    dependsOn: task?.dependsOn ?? [],
  };
}

function parseEstimate(value: string): number | undefined {
  const minutes = value ? parseInt(value) : NaN;
  return Number.isFinite(minutes) ? minutes : undefined;
}

/**
 * The one and only mapping from draft back to a `Partial<Task>`. Both the task
 * card and the unified needs-attention page save through here, so the
 * `allocatedTime` mirror, the reminder sentinel translation, and the
 * empty-string → `undefined` normalisation can't drift between them.
 */
function draftToUpdates(draft: TaskDraft, task: Task, taskLists: TaskList[]): Partial<Task> {
  const newPrimaryList = taskLists.find((l) => l.id === draft.listId);
  const estimatedTime = parseEstimate(draft.estimatedTime);
  return {
    title: draft.title.trim() || task.title,
    description: draft.description.trim() || undefined,
    notes: draft.notes.trim() || undefined,
    status: draft.status,
    startDate: draft.startDate || undefined,
    deadline: draft.deadline || undefined,
    // `false` and absent are one fact for this flag, so unticking it REMOVES
    // the key rather than storing a `false` on every task that was never
    // fixed. `withPatch` does the removing; same treatment item 17 gave a
    // zeroed `emergencyBoost`, for the same reason.
    deadlineIsFixed: draft.deadlineIsFixed ? true : undefined,
    estimatedTime,
    // Keeps the Set Deadlines / Focus Mode duration connected to this same
    // estimate, so a task selected for today already has its time filled in
    // instead of needing to be set again from scratch there. Only written when
    // the estimate itself moved — saving an unrelated field must not stomp a
    // duration the user hand-tuned on the Set Deadlines page, and omitting the
    // key entirely (rather than echoing a possibly stale `task.allocatedTime`)
    // leaves the live focus-queue copy alone as well.
    ...(estimatedTime && estimatedTime !== task.estimatedTime
      ? { allocatedTime: estimatedTime * 60 }
      : {}),
    valueINR: draft.valueINR ? Math.max(0, parseFloat(draft.valueINR)) : undefined,
    recurrence: draft.recurrence !== 'none' ? draft.recurrence : undefined,
    recurrenceRule: draft.recurrence === 'custom' ? draft.recurrenceRule : undefined,
    // Always cleared: the draft was seeded from it, so saving a task that had
    // only the pre-v8 object leaves it holding only the string. `withPatch`
    // removes an `undefined` key rather than writing one, which Firestore
    // would reject.
    customRecurrence: undefined,
    reminderMinutes: resolveReminderMinutes(draft.reminderMinutes, draft.customReminderMinutes),
    tags: draft.tags.length > 0 ? draft.tags : undefined,
    links: draft.links.length > 0 ? draft.links : undefined,
    imageUrl: draft.imageUrl || undefined,
    subtasks: draft.subtasks,
    assignee: draft.assignee || undefined,
    humanOverride: draft.humanOverride,
    listId: draft.listId || undefined,
    listName: newPrimaryList?.title ?? task.listName,
    sharedListIds: draft.sharedListIds.length > 0 ? draft.sharedListIds : undefined,
    dependsOn: draft.dependsOn.length > 0 ? draft.dependsOn : undefined,
  };
}

/**
 * Staged edits for a whole task. Nothing reaches the store until `commit()`,
 * which is what lets the needs-attention queue stay live without reshuffling
 * under the user mid-edit.
 *
 * `task` is optional so a caller can keep the hook mounted when its queue runs
 * dry; with no task the draft is empty, never dirty, and `commit()` is a no-op.
 */
export function useTaskDraft(task: Task | undefined) {
  const taskLists = useStore((s) => s.taskLists);
  const setTaskTimeMemory = useStore((s) => s.setTaskTimeMemory);

  const [draft, setDraft] = useState<TaskDraft>(() => taskToDraft(task));

  // Reseed during render (comparing against the last-seen id) rather than in an
  // effect, so stepping to another task never paints the previous task's values
  // for a frame first.
  const [seededId, setSeededId] = useState(task?.id);
  if (task?.id !== seededId) {
    setSeededId(task?.id);
    setDraft(taskToDraft(task));
  }

  // Accepts an updater as well as a plain value, mirroring `setState`. Field
  // editors that transform their previous value rather than replacing it (the
  // subtask tree) need this: two edits can land in one batch — a rename
  // committed on blur followed by a delete click — and a replacement built
  // from a stale render would drop the first one.
  const setField = <K extends keyof TaskDraft>(
    key: K,
    value: TaskDraft[K] | ((previous: TaskDraft[K]) => TaskDraft[K]),
  ) =>
    setDraft((prev) => ({
      ...prev,
      [key]: typeof value === 'function'
        ? (value as (previous: TaskDraft[K]) => TaskDraft[K])(prev[key])
        : value,
    }));

  const patch = (updates: Partial<TaskDraft>) => setDraft((prev) => ({ ...prev, ...updates }));

  const stored = useMemo(() => taskToDraft(task), [task]);
  // Both sides are built by `taskToDraft` and only ever updated by spreading,
  // so key order matches and a structural compare is safe.
  const isDirty = JSON.stringify(draft) !== JSON.stringify(stored);

  const estimatedMinutes = parseEstimate(draft.estimatedTime);

  const missing: TaskDraftMissing = {
    score: draft.humanOverride === undefined,
    deadline: !draft.deadline,
    estimate: !estimatedMinutes,
    description: !draft.description.trim(),
  };

  /**
   * The unsaved draft as the engine reads a task (`PriorityTask`).
   *
   * Hand it to `usePriorityScores().readDraft` — that is what fills in the two
   * graph variables from the saved side, which nothing here can know. The
   * fields split three ways and the split is the point:
   *
   *   - **From the draft**, because an edit changes them: importance, the
   *     deadline, the estimate.
   *   - **From the saved task**, because no control on this screen writes
   *     them: `allocatedTime`, `avoidedCount` (Focus Mode's deferrals),
   *     `emergencyBoost` (item 17's button) and `originalDeadline` (item 18's
   *     deadline math). They still have to be *present* — an emergency the
   *     draft dropped would make the ring fall while you typed a title.
   *   - **`id` and `listId`**, which are how `readDraft` finds the saved
   *     breakdown and which danger-zone rules apply. A new task has no id yet
   *     and correctly gets nothing back.
   */
  const scoreInput: PriorityTask = {
    id: task?.id ?? '',
    status: task?.status,
    listId: draft.listId || undefined,
    humanOverride: draft.humanOverride,
    avoidedCount: task?.avoidedCount,
    emergencyBoost: task?.emergencyBoost,
    deadline: draft.deadline || undefined,
    originalDeadline: task?.originalDeadline,
    estimatedTime: estimatedMinutes,
    allocatedTime: task?.allocatedTime,
    dependsOn: task?.dependsOn,
  };

  const toUpdates = (): Partial<Task> => (task ? draftToUpdates(draft, task, taskLists) : {});

  /**
   * Hands the mapped updates to `apply` and performs the write-throughs that
   * always accompany a task save.
   */
  const commit = (apply: (updates: Partial<Task>) => void) => {
    if (!task) return;
    const updates = draftToUpdates(draft, task, taskLists);
    apply(updates);
    // Mirror into title-based time memory too, same as Set Deadlines and the
    // PERT dialog, so re-adding a same-named task later remembers the estimate.
    if (estimatedMinutes) setTaskTimeMemory(updates.title ?? task.title, estimatedMinutes * 60);
  };

  return { draft, setField, patch, isDirty, missing, estimatedMinutes, scoreInput, toUpdates, commit };
}

export type TaskDraftController = ReturnType<typeof useTaskDraft>;
