/**
 * New Session, step 1 — RECONCILED against `design-system/screens/session.html`
 * at UI-31. Built by UI-14 and UI-15, and the mockup was owed from both: it
 * could not be pulled then (`DesignSync list_projects` returned an empty array
 * for the twelfth straight session), so the screen was composed from the
 * tokens and the already-ported components in `src/ui/`. UI-21 landed the
 * handoff bundle and this is the diff.
 *
 * THE SCREEN'S CENTRAL CLAIM, AND WE HAD NONE OF IT
 * ------------------------------------------------
 * The mockup opens by stating it: *"The queue carries a TIME BUDGET, which the
 * old screen did not. A list of three tasks is not a plan; three tasks against
 * four hours is. Smart Start fills against it, and the bar goes amber the
 * moment the queue over-commits the day."* (Coral here since 29-1P2c2.)
 *
 * **The budget already existed in the store and this screen had never shown
 * it.** `sessionDuration` defaults to 14400s — four hours, which is the
 * mockup's own `BUDGET = 240` minutes — and Set Deadlines has drawn a bar
 * against it since UI-27. Step 1 was picking tasks blind and step 2 was where
 * you found out they did not fit. "Today" now carries the same reading:
 * committed against the window, what is left, and the trough that goes coral
 * the moment the plan outruns the day. The bar itself is `session/BudgetTrack`,
 * shared with Set Deadlines — one field, one drawing.
 *
 * **`Smart start` is that verb now, and it used to be a different one.** It
 * sorted today's queue and jumped straight to Focus Mode, skipping Set
 * Deadlines — while Home's Smart Start button *builds* a queue against an hour
 * budget. Two buttons, one name, two behaviours. The mockup settles it: on
 * this screen Smart start FILLS the queue, best score first, stopping at the
 * budget and never committing to work that cannot start. That is
 * `lib/smartStart.ts`'s `buildSmartQueue` exactly, so this screen calls the
 * app's own authority rather than the mockup's four-line greedy loop — which
 * also buys the prerequisite handling the mockup skips: a blocked task is
 * admitted only together with everything it waits on, in the right order.
 * **The jump to Focus is gone with it.** The `Stepper` in the header now says
 * what the flow is (Select · Deadlines · Focus) and the footer is the one way
 * forward, which is what the mockup draws. Nothing is lost that Set Deadlines
 * does not immediately offer.
 *
 * WHAT ELSE UI-31 TOOK
 * --------------------
 * - **A session bar, not a page heading.** The `--r-pill` header with back,
 *   the OS-voice label and the flow `Stepper` — the same object Set Deadlines
 *   has carried since UI-27, and the two steps now look like two steps of one
 *   thing. **The screen is called "New Session" now**: that is the mockup's
 *   name for it, and it is what the nav has always called this route
 *   (`navModel.tsx`). "Task Selection" was a third name for a thing that
 *   already had two.
 * - **The panes are `--r-card-lg` / `--pad-card-lg`**, the feature-card inset,
 *   rather than `Card`'s standard 24px. Two panes are the whole page here.
 * - **Both counts are `Chip`s** — `panels.tsx`'s shared pill — where they were
 *   bare uppercase mono readouts trailing the toolbar. Today's goes `active`
 *   once anything is in it.
 * - **The empty queue is a dashed slot**, `.ag-addrow`, with the kicker, the
 *   sentence naming the budget and a Smart start inside it. It was a centred
 *   grey "Queue is empty." — and UI-29 already established that dashed is how
 *   this system draws a slot with nothing in it yet, `session.html` being one
 *   of the seven places that proves it.
 * - **"Next: Set Deadlines" is `frost`.** `Button.prompt.md` gives frost to
 *   the loudest action on a busy backdrop, and this pane now has a genuinely
 *   live emerald in the budget bar for a default glass button to compete with.
 *   Same correction UI-28 made on login and UI-30 on the scoring commit bar.
 * - **Search says how many rows survived it**, which is the one thing the
 *   field could not tell you while it was filtering the list behind it.
 * - The row itself is `session/TaskRow.tsx` — see that file for the material,
 *   the `SelectDot`, the score and the estimate.
 *
 * FOUR THINGS THE MOCKUP HAS THAT WE DELIBERATELY DO NOT
 * -----------------------------------------------------
 * - **"Save this set" (the star).** There is no saved-set entity in the store,
 *   so the button would either do nothing or need a schema change, which
 *   belongs to the functional queue. The award button beside it stays: it goes
 *   to the Score screen, it is the app's own, and it is the one way from here
 *   to the tasks that still need scoring.
 * - **A toast on every mutation.** There is no page-level toast host on this
 *   screen and every other mutation here has a visible result in one of the
 *   two panes. Smart start is the exception and has one, because *"nothing
 *   fits"* is a real outcome that otherwise looks like a dead button —
 *   `smartStart.ts` names that hazard itself.
 * - **Its filter as a `MorphMenu`.** The list filter is a `PortalDropdown` on
 *   `components/pickers.tsx`, which is UI-18's settled shell and is what all
 *   three of this screen's popovers share. It already states the same things
 *   the mockup's menu does — a heading, every list, a count against each.
 * - **Indented child rows in the available list.** The mockup's data model
 *   gives a subtask its own sibling row; ours nests them in `Task.subtasks`
 *   and draws them in `session/QueueSubtaskTree.tsx` under an expandable
 *   parent. That is the app's model, not a material difference.
 *
 * WHAT IS UNCHANGED — and this is the part that matters
 * -----------------------------------------------------
 * Every store call and hook is where it was. This screen still owns
 * `newListTitle`, `newListProjectId`, `newTaskTitle` and `newTaskListId`, so
 * closing a half-typed form and opening it again finds what you typed, and the
 * list you last added a task to is still the list the next one goes to.
 * `handleSelectTask` still carries a task's Est. Time over as `allocatedTime`
 * so Set Deadlines arrives filled in; `handleDropSubtask` still builds the same
 * lightweight `isSubtaskProxy` Task so edits downstream write back into the
 * real subtask; `handleAddTaskLines` / `handleAddListLines` still take one
 * title per line; `handleSmartSort` still sorts on the priority score;
 * and **deleting still calls `deleteBacklogTask` and nothing else** — the
 * focus-queue row, the subtask proxy, other tasks' `dependsOn` and the rest are
 * `applyDeletion`'s job, and filtering `selectedTasks` here afterwards would
 * write a pre-delete copy back over the queue that delete just cleaned.
 * `SortableList`/`SortableRow` are untouched: this is one of the three flat
 * lists on the app's single drag system.
 *
 * **THE SUBTASK → "TODAY" DRAG IS STILL NATIVE HTML5.** It is the one native
 * drag left in the app on purpose — see the header of
 * `session/QueueSubtaskTree.tsx` for why, and do not convert it to dnd-kit.
 */
import { useState, useMemo, useCallback, useRef, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRememberedState } from '../lib/useRememberedState';
import {
  useStore, type Task, type TaskList, findSubtaskWithRoot, getListTitle,
  getBlockingTasks, taskLockReason, taskFocusSeconds,
} from '../store/useStore';
import { builtInShortcut, useShortcuts } from '../contexts/ShortcutsContext';
import { motion, AnimatePresence } from 'framer-motion';
import TaskDetailPanel from './TaskDetailPanel';
import { PortalDropdown } from './PortalDropdown';
import { SortableList, SortableRow } from './SortableList';
import { useRevealOnScroll } from '../lib/useRevealOnScroll';
import TaskRow from './session/TaskRow';
import QueueSubtaskTree from './session/QueueSubtaskTree';
import NewListForm from './session/NewListForm';
import AddTaskForm from './session/AddTaskForm';
import { PickerEmpty, PickerHeading, PickerList, PickerOption } from './pickers';
import {
  Chip, GelButton, Icon, Input, Lit, LitLine, litSafe, MetaKicker, MiniNav, SoftButton, SoftIconButton, SoftToggle,
  Stepper, Toast, useMedia, WIDE,
} from '../ui';
import { RailMark } from './BrandMark';
import { BudgetTrack } from './session/BudgetTrack';
import { buildSmartQueue } from '../lib/smartStart';
import { usePriorityScores } from '../store/usePriorityScores';
import { formatSpan, formatSpanSpoken } from '../lib/timeSpan';
import { useNavModel } from './navModel';
import { Z } from '../lib/zLayers';
import { cue } from '../lib/sound';
import { cheerTick } from '../lib/tickCheer';
import { startTaskTomorrow } from '../lib/startTomorrow';
import { doneSide, tomorrowSide } from './task-fields/swipeSides';

/**
 * Both panels' shell — the mockup's `paneStyle`, and the same one Set
 * Deadlines composes. `--r-card-lg` and `--pad-card-lg` rather than `Card`'s
 * standard 24px inset: two panes ARE this page, so they are feature cards.
 */
const PANE = {
  padding: 'var(--pad-card-lg)',
  borderRadius: 'var(--r-card-lg)',
  backgroundImage: 'var(--glass-fill-2)',
  WebkitBackdropFilter: 'var(--glass-bd-md)',
  backdropFilter: 'var(--glass-bd-md)',
  boxShadow: 'var(--glass-shadow-pane)',
  animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
} as const;

/** Both panels' title. */
const PANEL_TITLE = {
  font: 'var(--type-title)',
  fontSize: 'var(--text-xl)',
  letterSpacing: 'var(--tracking-title)',
  color: 'var(--fg-1)',
  whiteSpace: 'nowrap' as const,
  margin: 0,
};

/** How long a Smart start toast stays up. The mockup's own 2600ms. */
const TOAST_MS = 2600;

/**
 * What Smart start would add from `queue` within `budgetLeft` seconds: its
 * picks in order, dropping one that does not fit (see `handleSmartStart`).
 * The title line (29-1P14c) reads the same answer, so "12 tasks that fit" is
 * exactly what the button would add.
 */
function fitInBudget(queue: Task[], budgetLeft: number): Task[] {
  const fits: Task[] = [];
  let spent = 0;
  for (const task of queue) {
    const cost = task.allocatedTime ?? 0;
    if (spent + cost > budgetLeft) continue;
    fits.push(task);
    spent += cost;
  }
  return fits;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * A panel's scroller. `ag-scroll` hides the track for the same reason the
 * subtask drawer does — a scrollbar inside a pane of glass reads as browser
 * chrome resting on the surface — and `ag-fade` (OPT-10, `ui/screens.css`)
 * fades whichever end has rows past it, so they dissolve into the toolbar
 * above and the pane's own edge below instead of being sliced off square.
 */
const SCROLLER = 'ag-scroll ag-fade';
const SCROLLER_STYLE = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto' as const,
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--sp-4)',
  paddingTop: 'var(--sp-3)',
  paddingRight: 'var(--sp-3)',
};

/**
 * Nothing on the left to show. The mockup's shape: a kicker naming the state
 * and one sentence saying what to do about it, left-aligned rather than a
 * centred grey line — *"No tasks found."* was the same words whether you had
 * filtered everything away or genuinely committed all of it.
 *
 * It is NOT a dashed slot. `.ag-addrow` says *nothing here yet, put something
 * here*; this list is not a slot you add to, and the mockup only dashes the
 * queue's empty state.
 */
function EmptyAvailable({ filtered, typed }: { filtered: boolean; typed: string }) {
  /* 29-1P14c: his approved words, lit. A list filter with nothing typed has
     no "x" to quote, so it says "here". */
  const text = !filtered
    ? '**Every task** is already in **today**.'
    : `Nothing ${typed === '' ? 'here' : `matches **“${litSafe(typed)}”**`}. **Clear the filter**, or **add a task**.`;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'start', padding: 'var(--sp-9) var(--sp-6)' }}>
      <MetaKicker icon="inbox" tone="var(--fg-4)">Nothing here</MetaKicker>
      <LitLine text={text} style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }} />
    </div>
  );
}

/**
 * The head of the closed "Ignored" section (BIG-3). His call, 2026-09-29:
 * ignored work is never in the list the app ranks for him, but he can still
 * open this and hand-pick one himself. Its rows are built only once it is
 * opened, so a whole ignored mega project costs this screen nothing.
 */
function IgnoredHeader({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        width: '100%',
        margin: 'var(--sp-6) 0 var(--sp-3)',
        padding: 'var(--sp-5) var(--sp-2) var(--sp-2)',
        background: 'transparent',
        border: 0,
        borderTop: '1px solid var(--line-faint)',
        cursor: 'pointer',
        color: 'var(--fg-4)',
        textAlign: 'left',
      }}
    >
      <MetaKicker icon="moon" tone="var(--fg-4)">Ignored · {count}</MetaKicker>
      <span style={{ flex: 1 }} />
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>
        {open ? 'Hide' : 'Never offered — open to pick one yourself'}
      </span>
      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
    </button>
  );
}

type AvailableItem = { kind: 'task'; task: Task } | { kind: 'ignored-header' };

export default function TaskSelection() {
  const navigate = useNavigate();
  const nav = useNavModel();
  const wide = useMedia(WIDE);
  const scores = usePriorityScores();
  const {
    tasks: selectedTasks,
    setTasks: setSelectedTasks,
    backlogTasks,
    taskLists,
    projects,
    addTaskList,
    addBacklogTask,
    addNestedSubtask,
    updateBacklogTask,
    deleteBacklogTask,
    sessionDuration,
  } = useStore();

  const [isAdding, setIsAdding] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  /* Remembered (2026-09-15). Creating a list still switches the filter to
     it - see `handleAddListLines` - so this only decides where he starts. */
  const [activeFilterId, setActiveFilterId] = useRememberedState<string>(
    'base.select.filter', 'all',
  );
  const [showSearch, setShowSearch] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTaskListId, setNewTaskListId] = useState(taskLists[0]?.id ?? '');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');

  // The filter popover's anchor is a wrapping <span>: its trigger is an
  // `IconButton`/`Button` from the design system, which are plain function
  // components rather than `forwardRef`s, so the anchor the popover measures
  // is the element around them. The two form pickers own their own refs —
  // `session/pickers.tsx`'s `PickerButton` IS a forwardRef.
  const filterTriggerRef = useRef<HTMLSpanElement>(null);

  // Unified subtask adding context
  const [addingSubtaskContext, setAddingSubtaskContext] = useState<{
    rootTaskId: string;
    parentId: string;
    isNested: boolean;
    listId: string;
  } | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  // New list creation state
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListProjectId, setNewListProjectId] = useState<string>('');

  // Task detail panel
  const [detailTask, setDetailTask] = useState<Task | null>(null);

  /*
   * Smart start's own report. The one action on this screen whose outcome can
   * be nothing at all — every task left either blocked or too big for what is
   * free — and a button that silently does nothing is the hazard
   * `lib/smartStart.ts` names in its own header.
   */
  /* One lit sentence since 29-1P14c (`**` lights words, `LitLine`). */
  const [toast, setToast] = useState<{ text: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string) => {
    setToast({ text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useShortcuts('task-selection', [
    { ...builtInShortcut('new-task'), handler: () => setIsAdding(true) },
    { ...builtInShortcut('new-list'), handler: () => setIsAddingList(true) },
  ]);

  // Dragging a single subtask (from Available Tasks) into "Selected for Today"
  const [draggedSubtaskId, setDraggedSubtaskId] = useState<string | null>(null);
  const [isSubtaskDropTarget, setIsSubtaskDropTarget] = useState(false);

  const selectedTaskIds = useMemo(() => selectedTasks.map((t) => t.id), [selectedTasks]);
  const reorderSelectedTasks = (orderedIds: string[]) => {
    const byId = new Map(selectedTasks.map((t) => [t.id, t]));
    setSelectedTasks(orderedIds.map((id) => byId.get(id)).filter((t): t is Task => !!t));
  };

  const selectedIds = useMemo(() => new Set(selectedTasks.map((t) => t.id)), [selectedTasks]);

  const availableTasks = useMemo(
    () => backlogTasks.filter((t) => !selectedIds.has(t.id) && t.status !== 'completed'),
    [backlogTasks, selectedIds]
  );

  /*
   * THE BUDGET. `sessionDuration` is the store's, four hours by default, and
   * Set Deadlines has drawn a bar against it since UI-27 — this screen is
   * where the commitment is actually made, so it reads the same field.
   *
   * A row costs `taskFocusSeconds`: the allocation if one has been tuned, the
   * task's own estimate otherwise. That is the app's single answer to "how
   * long is this", which is what stops the total disagreeing with the numbers
   * the rows print beside their titles.
   */
  const committedSeconds = useMemo(
    () => selectedTasks.reduce((sum, t) => sum + taskFocusSeconds(t), 0),
    [selectedTasks]
  );
  const freeSeconds = sessionDuration - committedSeconds;
  const overCommitted = freeSeconds < 0;

  /*
   * THE TITLE LINE (29-1P14c, idea 87's own example, his approved words).
   * Before he picks: the day's hours, how many tasks Smart start would add,
   * and which it would put first — the same `fitInBudget` the button runs, so
   * the line never promises what the button would not do. Once he has picked:
   * how many, and the head of his own queue.
   */
  const titleLine = useMemo(() => {
    if (selectedTasks.length > 0) {
      return `**${plural(selectedTasks.length, 'task')}** chosen. Start with **${litSafe(selectedTasks[0].title)}**.`;
    }
    const { queue } = buildSmartQueue(sessionDuration / 3600, availableTasks, { scores, ignored: scores.ignored.ids });
    const fits = fitInBudget(queue, sessionDuration);
    const start = fits.length > 0 ? ` Start with **${litSafe(fits[0].title)}**.` : '';
    return `You have **${formatSpanSpoken(sessionDuration)}** and **${plural(fits.length, 'task')}** that fit.${start}`;
  }, [availableTasks, scores, selectedTasks, sessionDuration]);

  const handleEditTask = (taskId: string) => {
    if (!editTaskTitle.trim()) { setEditingTaskId(null); return; }
    updateBacklogTask(taskId, { title: editTaskTitle });
    setSelectedTasks(selectedTasks.map((t) => (t.id === taskId ? { ...t, title: editTaskTitle } : t)));
    setEditingTaskId(null);
    setEditTaskTitle('');
  };

  /**
   * Closing the search clears the query, and that is the fix rather than the
   * tidy-up: hiding the field on its own left the list silently filtered with
   * nothing on screen saying so — eight tasks became one and the only clue
   * was the count. The field has no clear cross of its own for the same
   * reason (`.ag-field::-webkit-search-cancel-button` in `screens.css`).
   */
  const closeSearch = () => {
    setShowSearch(false);
    setSearchQuery('');
  };

  const handleDeleteTask = (taskId: string) => {
    // `selectedTasks` IS the store's focus queue, so filtering it here after
    // the delete would write a *pre-delete* copy back over the queue the
    // delete just cleaned — putting any subtask-proxy row straight back.
    deleteBacklogTask(taskId);
  };

  /** Bulk-capable: one title per line creates one list each, in order; the filter switches to the last one created. */
  const handleAddListLines = (lines: string[]) => {
    if (lines.length === 0) return;
    let lastList: TaskList | undefined;
    for (const title of lines) {
      lastList = addTaskList(title, newListProjectId || undefined);
    }
    if (lastList) setActiveFilterId(lastList.id);
    setNewListTitle('');
    setNewListProjectId('');
    setIsAddingList(false);
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /** Bulk-capable: one title per line creates one task each, in order. */
  const handleAddTaskLines = (lines: string[]) => {
    if (lines.length === 0 || !newTaskListId) return;
    lines.forEach((title) => addBacklogTask(title, newTaskListId));
    setNewTaskTitle('');
    setIsAdding(false);
  };

  const handleAddSubtask = () => {
    if (!addingSubtaskContext || !newSubtaskTitle.trim()) return;
    const { rootTaskId, parentId, isNested, listId } = addingSubtaskContext;
    if (isNested) {
      addNestedSubtask(rootTaskId, parentId, newSubtaskTitle.trim());
    } else {
      addBacklogTask(newSubtaskTitle.trim(), listId, parentId);
    }
    setNewSubtaskTitle('');
    setAddingSubtaskContext(null);
  };

  /**
   * Commit a task to today.
   *
   * `anyway` is item 19's override, and it is the ONLY way a locked task gets
   * in from this screen — the dot on a locked row is disabled and the row
   * offers "Schedule anyway" instead, which is the same press Smart Start's
   * held-back list asks for. It stamps `scheduledAnyway` on the copy that
   * enters the queue, so the task can be ticked off in Focus Mode: an override
   * you deliberately pressed must not be re-imposed one screen later.
   *
   * **The stamp goes on the queue copy and nowhere else.** `selectedTasks` IS
   * the store's focus queue, and `updateTask` writes only to that array, so the
   * unlock dies with the session — see `Task.scheduledAnyway`.
   */
  const handleSelectTask = (task: Task, anyway = false) => {
    if (selectedTasks.some((t) => t.id === task.id)) return;
    // Carry the task card's Est. Time estimate over as the Set Deadlines
    // duration when it hasn't been allocated yet, so the time field there
    // is already filled in instead of needing to be set again from scratch.
    const queued: Task = {
      ...task,
      ...(!task.allocatedTime && task.estimatedTime ? { allocatedTime: task.estimatedTime * 60 } : {}),
      ...(anyway ? { scheduledAnyway: true } : {}),
    };
    setSelectedTasks([...selectedTasks, queued]);
  };

  const handleRemoveTask = (taskId: string) => {
    setSelectedTasks(selectedTasks.filter((t) => t.id !== taskId));
  };

  /*
   * 29-1P6b (17), his calls: a row swiped right is DONE, left STARTS IT
   * TOMORROW (its start date; it stays in its list). Either way it is off
   * today's plan, so a queued row also leaves the queue — in the same press,
   * so one undo puts both back. The queue is read fresh from the store, not
   * this render's copy: the tick has just mirrored into it (the trap
   * `handleDeleteTask` notes). A subtask dragged in on its own has no task of
   * its own to finish or date, and a row already done offers nothing.
   */
  const swipeFor = (task: Task, queued: boolean) => {
    if (task.isSubtaskProxy) return undefined;
    const real = backlogTasks.find((t) => t.id === task.id);
    if (!real || real.status === 'completed') return undefined;
    const takeOut = () => {
      if (queued) setSelectedTasks(useStore.getState().tasks.filter((t) => t.id !== task.id));
    };
    return {
      right: doneSide(false, taskLockReason(backlogTasks, task) !== undefined, (row) => {
        cue('tick');
        cheerTick(row);
        updateBacklogTask(task.id, { status: 'completed', completedAt: Date.now() });
        takeOut();
      }),
      left: tomorrowSide(false, () => {
        startTaskTomorrow(task.id, task.title);
        takeOut();
      }),
    };
  };

  // Drop a single dragged subtask into "Selected for Today" — creates a
  // lightweight proxy Task (same id as the subtask) instead of the whole
  // parent task, so edits made from Set Deadlines / Focus Mode write
  // straight back into the real subtask (see `isSubtaskProxy` in useStore.ts).
  const handleDropSubtask = (subtaskId: string) => {
    if (selectedTasks.some((t) => t.id === subtaskId)) return;
    const found = findSubtaskWithRoot(backlogTasks, subtaskId);
    if (!found) return;
    const { subtask, rootTask } = found;
    const proxyTask: Task = {
      id: subtask.id,
      title: subtask.title,
      description: subtask.description,
      status: subtask.status ?? 'needsAction',
      priority: subtask.priority,
      allocatedTime: subtask.allocatedTime,
      deadline: subtask.deadline,
      listId: rootTask.listId,
      listName: rootTask.listName,
      subtasks: subtask.subtasks,
      humanOverride: subtask.humanOverride,
      avoidedCount: subtask.avoidedCount,
      emergencyBoost: subtask.emergencyBoost,
      isSubtaskProxy: true,
    };
    setSelectedTasks([...selectedTasks, proxyTask]);
  };

  const handleSmartSort = useCallback(() => {
    const sorted = [...selectedTasks].sort((a, b) => scores.scoreOf(b) - scores.scoreOf(a));
    setSelectedTasks(sorted);
  }, [scores, selectedTasks, setSelectedTasks]);

  /*
   * FILL the day, best score first, stopping at what is left of the budget —
   * the mockup's verb for this button, and `buildSmartQueue` is the app's own
   * answer to it. Handing it the AVAILABLE tasks rather than the whole backlog
   * is what makes it additive: it ranks and admits out of that list, so a task
   * already committed can neither be picked twice nor charged twice.
   *
   * The budget it fills is what remains after the existing queue, in hours,
   * because that is the unit `buildSmartQueue` takes. Everything it returns
   * already carries `allocatedTime`, which is the same stamp
   * `handleSelectTask` applies by hand — so a task queued either way arrives at
   * Set Deadlines with a duration on it.
   */
  const handleSmartStart = useCallback(() => {
    const budgetLeft = Math.max(0, sessionDuration - committedSeconds);
    const { queue } = buildSmartQueue(budgetLeft / 3600, availableTasks, { scores, ignored: scores.ignored.ids });
    /*
     * `buildSmartQueue` guarantees a non-empty COLD start — it takes the
     * highest-ranked schedulable task even when nothing fit — which is right
     * for Home's one-button start and wrong here, where the budget is on
     * screen and the user is watching it. A pick that does not fit what is
     * free is dropped, and if that leaves nothing the toast says so.
     */
    const fits = fitInBudget(queue, budgetLeft);
    if (fits.length === 0) {
      say(`Nothing fits in **the ${formatSpan(budgetLeft)} left**.`);
      return;
    }
    const spent = fits.reduce((sum, task) => sum + (task.allocatedTime ?? 0), 0);
    setSelectedTasks([...selectedTasks, ...fits]);
    say(`**${plural(fits.length, 'task')}** added. **${formatSpan(committedSeconds + spent)}** planned.`);
  }, [availableTasks, committedSeconds, say, scores, selectedTasks, sessionDuration, setSelectedTasks]);

  const matchesView = (task: Task) => {
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.subtasks?.some((st) => st.title.toLowerCase().includes(searchQuery.toLowerCase())) ?? false);
    const matchesList =
      activeFilterId === 'all' ||
      task.listId === activeFilterId ||
      (task.sharedListIds?.includes(activeFilterId) ?? false);
    return matchesSearch && matchesList;
  };
  // Ignored work (BIG-3) is never in the list the app offers; it waits in its
  // own closed section at the bottom, under the same search and filter.
  const displayTasks = availableTasks.filter((task) => !scores.ignored.has(task) && matchesView(task));
  const displayIgnored = availableTasks.filter((task) => scores.ignored.has(task) && matchesView(task));
  const [showIgnored, setShowIgnored] = useState(false);
  const availableItems: AvailableItem[] = [
    ...displayTasks.map((task): AvailableItem => ({ kind: 'task', task })),
    ...(displayIgnored.length > 0 ? [{ kind: 'ignored-header' } as const] : []),
    ...(showIgnored ? displayIgnored.map((task): AvailableItem => ({ kind: 'task', task })) : []),
  ];

  /* Only what is near the screen is drawn; the rest arrives as the list
     scrolls towards it. See `useRevealOnScroll` for the measurement. */
  const availableScrollerRef = useRef<HTMLDivElement | null>(null);
  const { count: drawnCount, sentinelRef } = useRevealOnScroll(availableItems.length, availableScrollerRef);

  /** Task counts per list, shown next to each option in the filter popover. */
  const listCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of availableTasks) {
      const ids = [task.listId, ...(task.sharedListIds ?? [])];
      for (const id of ids) {
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }, [availableTasks]);

  const activeFilterLabel = activeFilterId === 'all'
    ? 'All Lists'
    : taskLists.find((l) => l.id === activeFilterId)?.title ?? 'Filtered';

  return (
    /* `ag-page` rather than the old opaque wrapper, so the grid backdrop shows
       through and the two panes above it have something to refract. */
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          /* 112px on a narrow window is the floating nav bar's lane. The page
             itself never scrolls — each panel scrolls its own list. */
          padding: wide
            ? 'var(--sp-9) var(--gutter-page)'
            : 'var(--sp-8) var(--gutter-page-sm) 112px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1500,
            margin: '0 auto',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--sp-7)',
          }}
        >
          {/* ── The session bar: what this is, the way out, and where you are ──
              The mockup's own header, and the same object Set Deadlines has
              carried since UI-27 — the two steps of one flow now look like it.
              "New Session" rather than "Task Selection": the mockup's name for
              the screen, and what `navModel.tsx` has always called this route. */}
          <header
            style={{
              flex: '0 0 auto',
              display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap',
              padding: 'var(--sp-4) var(--sp-6) var(--sp-4) var(--sp-4)',
              /* A rounded rectangle like every other top bar (his BASE list). */
              borderRadius: 'var(--r-md)',
              backgroundImage: 'var(--glass-fill-2)',
              WebkitBackdropFilter: 'var(--glass-bd-lg)',
              backdropFilter: 'var(--glass-bd-lg)',
              boxShadow: 'var(--glass-shadow-pane)',
              animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
            }}
          >
            <SoftIconButton label="Back to Home" onClick={() => navigate('/')}>
              <Icon name="arrow-left" size={18} />
            </SoftIconButton>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <h1
                style={{
                  font: 'var(--type-system)', textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-system)', color: 'var(--fg-1)', whiteSpace: 'nowrap',
                }}
              >
                New Session
              </h1>
              {/* 29-1P14c, idea 87's own example: a live line, his approved words. */}
              <LitLine as="p" text={titleLine} style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }} />
            </div>
            <span style={{ flex: 1, minWidth: 'var(--sp-8)' }} />
            {wide && (
              /* Only Select has a value to report yet — a hint under Deadlines
                 here would be naming a number nothing has allocated. */
              <Stepper
                current={0}
                steps={[
                  { label: 'Select', hint: `${selectedTasks.length} chosen` },
                  { label: 'Deadlines' },
                  { label: 'Focus' },
                ]}
                style={{ margin: 0 }}
              />
            )}
          </header>

          {/*
            Flex (not CSS Grid) so the 50/50 split is driven purely by `flex-1`
            and never by content size — with CSS Grid, an implicit row sized
            `auto` leaves child percentage heights ambiguous, which let cards
            grow to fit their content instead of the available space and
            reintroduced page-level scrolling. `minHeight: 0` on this container
            makes it fill exactly whatever vertical space remains below the
            header, on any screen size — no page-level scrollbar. Each panel
            only ever scrolls its own list.
          */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: wide ? 'row' : 'column',
              gap: 'var(--sp-7)',
            }}
          >
            {/* ── Available ─────────────────────────────────────────────── */}
            <section
              style={{
                ...PANE,
                flex: 1,
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  flex: '0 0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-5)',
                  flexWrap: 'wrap',
                }}
              >
                {/* The count is a `Chip` beside the title, not a mono readout
                    trailing the toolbar — the mockup's shape, and it puts the
                    number next to the word it counts. It states how many are
                    AVAILABLE, not how many survived the filter: the search
                    field says that, and a chip that moved with every keystroke
                    would be the same number twice. */}
                <h2 style={PANEL_TITLE}>Available</h2>
                <Chip>{availableTasks.length} total</Chip>
                <span style={{ flex: 1 }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                  <SoftToggle
                    round
                    size="sm"
                    aria-label="Search tasks"
                    title="Search"
                    pressed={showSearch}
                    onClick={() => (showSearch ? closeSearch() : setShowSearch(true))}
                  >
                    <Icon name="search" size={16} />
                  </SoftToggle>

                  {/* The <span> is the popover's anchor — see the ref comment above. */}
                  <span ref={filterTriggerRef} style={{ display: 'inline-flex' }}>
                    {activeFilterId !== 'all' ? (
                      <SoftToggle
                        size="sm"
                        pressed
                        title="Filter by list"
                        onClick={() => setIsFilterOpen((v) => !v)}
                        icon={<Icon name="filter" size={14} />}
                        style={{ maxWidth: 190 }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {activeFilterLabel}
                        </span>
                      </SoftToggle>
                    ) : (
                      <SoftToggle
                        round
                        size="sm"
                        aria-label="Filter by list"
                        title="Filter by list"
                        pressed={isFilterOpen}
                        onClick={() => setIsFilterOpen((v) => !v)}
                      >
                        <Icon name="filter" size={16} />
                      </SoftToggle>
                    )}
                  </span>

                  <SoftToggle
                    size="sm"
                    pressed={isAddingList}
                    onClick={() => setIsAddingList((v) => !v)}
                    icon={<Icon name="folder-plus" size={15} />}
                  >
                    New list
                  </SoftToggle>

                  <SoftToggle
                    size="sm"
                    pressed={isAdding}
                    onClick={() => setIsAdding(!isAdding)}
                    icon={<Icon name="plus" size={15} />}
                  >
                    Add task
                  </SoftToggle>
                </div>
              </div>

              {/*
                ── The four panels UI-15 rebuilt ────────────────────────────
                The search field, the list filter's contents, the New-list
                form and the Add-task form. Each one only exists once you
                press something in the toolbar above, which is why UI-14 was
                able to leave them behind and still hand over a screen that
                was entirely Aurora Glass at rest.
              */}

              {/* Search. A real `Input` — the etched well every field in this
                  system is, rather than a bordered box with an icon absolutely
                  positioned on top of it. */}
              <AnimatePresence>
                {showSearch && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, marginTop: 0 }}
                    animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                    exit={{ height: 0, opacity: 0, marginTop: 0 }}
                    style={{ flex: '0 0 auto', overflow: 'hidden' }}
                  >
                    <Input
                      autoFocus
                      type="search"
                      aria-label="Search tasks and subtasks"
                      placeholder="Search tasks or subtasks…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
                      iconLeft={<Icon name="search" size={16} />}
                      /* How many rows survived — the one thing the field could
                         not tell you while it was filtering the list behind
                         it. The mockup's own readout. */
                      suffix={searchQuery ? <MetaKicker tone="var(--fg-4)">{displayTasks.length} match</MetaKicker> : undefined}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* List filter — a portal popover anchored to the filter button, so
                  opening it overlays the page instead of expanding the card and
                  squeezing "Selected for Today" out of view. */}
              <PortalDropdown
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                onOpen={() => setIsFilterOpen(true)}
                triggerRef={filterTriggerRef}
                width={300}
              >
                <PickerHeading icon={<Icon name="filter" size={14} />}>Filter by list</PickerHeading>
                <PickerList maxHeight="min(55vh, 340px)">
                  <PickerOption
                    selected={activeFilterId === 'all'}
                    meta={availableTasks.length}
                    onClick={() => { setActiveFilterId('all'); setIsFilterOpen(false); }}
                  >
                    All lists
                  </PickerOption>
                  {taskLists.map((list) => (
                    <PickerOption
                      key={list.id}
                      selected={activeFilterId === list.id}
                      meta={listCounts.get(list.id) ?? 0}
                      onClick={() => { setActiveFilterId(list.id); setIsFilterOpen(false); }}
                    >
                      {list.title}
                    </PickerOption>
                  ))}
                  {taskLists.length === 0 && (
                    <PickerEmpty>No lists yet. Make one with **New list**.</PickerEmpty>
                  )}
                </PickerList>
              </PortalDropdown>

              {/* New list — its own action, independent of the filter. */}
              <NewListForm
                open={isAddingList}
                title={newListTitle}
                onTitleChange={setNewListTitle}
                projectId={newListProjectId}
                onProjectIdChange={setNewListProjectId}
                projects={projects}
                onSubmitLines={handleAddListLines}
                onCancel={() => { setIsAddingList(false); setNewListTitle(''); setNewListProjectId(''); }}
              />

              <AddTaskForm
                open={isAdding}
                title={newTaskTitle}
                onTitleChange={setNewTaskTitle}
                listId={newTaskListId}
                onListIdChange={setNewTaskListId}
                taskLists={taskLists}
                onSubmitLines={handleAddTaskLines}
                onCancel={() => { setIsAdding(false); setNewTaskTitle(''); }}
              />

              {/* ── The list ─────────────────────────────────────────────── */}
              <div ref={availableScrollerRef} className={SCROLLER} style={{ ...SCROLLER_STYLE, marginTop: 'var(--sp-5)' }}>
                <AnimatePresence>
                  {availableItems.slice(0, drawnCount).map((item) => {
                    if (item.kind === 'ignored-header') {
                      return (
                        <IgnoredHeader
                          key="ignored-header"
                          count={displayIgnored.length}
                          open={showIgnored}
                          onToggle={() => setShowIgnored((open) => !open)}
                        />
                      );
                    }
                    const task = item.task;
                    const isAddingToThisTask =
                      addingSubtaskContext?.rootTaskId === task.id &&
                      addingSubtaskContext.parentId === task.id;
                    const subtasks = task.subtasks ?? [];
                    const expanded = expandedIds.has(task.id) || isAddingToThisTask;

                    return (
                      <TaskRow
                        key={task.id}
                        task={task}
                        side="available"
                        listTitle={getListTitle(taskLists, task.listId, task.listName)}
                        blockedBy={getBlockingTasks(backlogTasks, task)}
                        lockReason={taskLockReason(backlogTasks, task)}
                        onScheduleAnyway={() => handleSelectTask(task, true)}
                        editing={editingTaskId === task.id}
                        editTitle={editTaskTitle}
                        onEditTitleChange={setEditTaskTitle}
                        onCommitEdit={() => handleEditTask(task.id)}
                        onCancelEdit={() => setEditingTaskId(null)}
                        onStartEdit={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}
                        onSelect={() => handleSelectTask(task)}
                        onDetails={() => setDetailTask(task)}
                        onAddSubtask={() => {
                          setAddingSubtaskContext({
                            rootTaskId: task.id,
                            parentId: task.id,
                            isNested: false,
                            listId: task.listId ?? '',
                          });
                          setExpandedIds((prev) => new Set(prev).add(task.id));
                          setNewSubtaskTitle('');
                        }}
                        onRemove={() => handleDeleteTask(task.id)}
                        expanded={expanded}
                        onToggleExpand={subtasks.length > 0 ? () => toggleExpand(task.id) : undefined}
                        swipe={swipeFor(task, false)}
                      >
                        {subtasks.length > 0 && (
                          <QueueSubtaskTree
                            subtasks={subtasks}
                            rootTaskId={task.id}
                            listId={task.listId ?? ''}
                            depth={0}
                            expandedIds={expandedIds}
                            onToggle={toggleExpand}
                            adding={{
                              context: addingSubtaskContext,
                              title: newSubtaskTitle,
                              onAddClick: (subtaskId, rId, lId) => {
                                setAddingSubtaskContext({
                                  rootTaskId: rId,
                                  parentId: subtaskId,
                                  isNested: true,
                                  listId: lId,
                                });
                                setExpandedIds((prev) => new Set(prev).add(subtaskId));
                                setNewSubtaskTitle('');
                              },
                              onTitleChange: setNewSubtaskTitle,
                              onConfirm: handleAddSubtask,
                              onCancel: () => { setAddingSubtaskContext(null); setNewSubtaskTitle(''); },
                            }}
                            onDragStartSub={setDraggedSubtaskId}
                            onDragEndSub={() => setDraggedSubtaskId(null)}
                            draggedSubtaskId={draggedSubtaskId}
                          />
                        )}

                        {/* Root-level new subtask input */}
                        <AnimatePresence>
                          {isAddingToThisTask && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              style={{ overflow: 'hidden' }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 'var(--sp-3)',
                                  marginTop: 'var(--sp-3)',
                                  padding: 'var(--sp-4) var(--sp-5)',
                                  borderRadius: 'var(--r-sm)',
                                  background: 'var(--glass-well)',
                                  boxShadow: 'var(--glass-well-shadow)',
                                }}
                              >
                                <Icon name="corner-down-right" size={16} className="shrink-0" style={{ color: 'var(--fg-4)' }} />
                                <input
                                  autoFocus
                                  type="text"
                                  data-ag-field=""
                                  className="ag-field"
                                  value={newSubtaskTitle}
                                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddSubtask();
                                    if (e.key === 'Escape') { setAddingSubtaskContext(null); setNewSubtaskTitle(''); }
                                  }}
                                  onBlur={() => { if (!newSubtaskTitle.trim()) { setAddingSubtaskContext(null); } }}
                                  placeholder="Add a subtask…"
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    padding: 0,
                                    border: 0,
                                    outline: 'none',
                                    background: 'transparent',
                                    font: 'var(--type-body)',
                                    fontSize: 'var(--text-sm)',
                                    color: 'var(--fg-1)',
                                  }}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </TaskRow>
                    );
                  })}

                  {displayTasks.length === 0 && !isAdding && (
                    <EmptyAvailable filtered={!!searchQuery.trim() || activeFilterId !== 'all'} typed={searchQuery.trim()} />
                  )}
                </AnimatePresence>
                {drawnCount < availableItems.length && <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, flex: '0 0 auto' }} />}
              </div>
            </section>

            {/* ── Today ─────────────────────────────────────────────────── */}
            {/* The drag handlers live on a wrapper rather than the pane, so the
                drop halo has something to be positioned against. */}
            <div
              onDragOver={(e) => { if (draggedSubtaskId) { e.preventDefault(); setIsSubtaskDropTarget(true); } }}
              onDragLeave={() => setIsSubtaskDropTarget(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsSubtaskDropTarget(false);
                if (draggedSubtaskId) handleDropSubtask(draggedSubtaskId);
                setDraggedSubtaskId(null);
              }}
              style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex' }}
            >
              <section
                style={{
                  ...PANE,
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  /* Cyan, and it stays cyan now that a committed row is
                     emerald. `readme.md` rations the accent and its glow to
                     objects that are live, selected, running or overrun — a
                     target you have not dropped on yet is none of those, which
                     is the same line UI-29 drew between the board's selected
                     row and its drop target. */
                  ...(isSubtaskDropTarget
                    ? {
                      boxShadow:
                          'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2), 0 0 0 1px var(--status-queued)',
                    }
                    : {}),
                }}
              >
                <AnimatePresence>
                  {isSubtaskDropTarget && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      style={{
                        position: 'absolute',
                        inset: 'var(--sp-4)',
                        zIndex: 2,
                        display: 'grid',
                        placeItems: 'center',
                        pointerEvents: 'none',
                        borderRadius: 'var(--r-card)',
                        backgroundImage: 'var(--glass-tint-cyan)',
                        backdropFilter: 'var(--glass-bd-sm)',
                        WebkitBackdropFilter: 'var(--glass-bd-sm)',
                        boxShadow: 'inset 0 0 0 1px var(--status-queued)',
                      }}
                    >
                      <span
                        style={{
                          font: 'var(--type-kicker)',
                          letterSpacing: 'var(--tracking-kicker)',
                          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                          color: 'var(--status-queued)',
                        }}
                      >
                        Drop subtask here
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div
                  style={{
                    flex: '0 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sp-5)',
                    flexWrap: 'wrap',
                  }}
                >
                  <h2 style={PANEL_TITLE}>Today</h2>
                  <Chip active={selectedTasks.length > 0}>
                    {selectedTasks.length} {selectedTasks.length === 1 ? 'task' : 'tasks'}
                  </Chip>
                  <span style={{ flex: 1 }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                    {/*
                      Soft raised, second actions (29-1P2). Neither is the
                      loudest thing in this pane — the footer's gel is — and
                      the design system allows exactly one lit button per view.
                    */}
                    <SoftButton
                      size="sm"
                      onClick={handleSmartStart}
                      title="Fill the rest of the day, best score first"
                      icon={<Icon name="zap" size={15} />}
                    >
                      Smart start
                    </SoftButton>
                    <SoftButton
                      size="sm"
                      onClick={handleSmartSort}
                      disabled={selectedTasks.length < 2}
                      title="Sort by priority score"
                      icon={<Icon name="arrow-down-up" size={15} />}
                    >
                      Smart sort
                    </SoftButton>
                    <SoftIconButton
                      size="sm"
                      label="Review tasks that need attention"
                      title="Review tasks that need attention"
                      onClick={() => navigate('/scoring')}
                    >
                      <Icon name="award" size={16} />
                    </SoftIconButton>
                  </div>
                </div>

                {/*
                  THE BUDGET. A queue without one is a wish list — the mockup's
                  own line, and the reading Set Deadlines has always shown one
                  step too late. Coral the moment the plan outruns the day (29-1P2c2).
                */}
                <div style={{ flex: '0 0 auto', display: 'grid', gap: 'var(--sp-3)', marginTop: 'var(--sp-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                    <MetaKicker icon="timer" tone={overCommitted ? 'var(--status-overrun)' : 'var(--fg-3)'}>
                      Committed
                    </MetaKicker>
                    <span
                      style={{
                        font: 'var(--type-numeric)', fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums',
                        color: overCommitted ? 'var(--status-overrun)' : 'var(--fg-1)',
                      }}
                    >
                      {formatSpan(committedSeconds)}
                    </span>
                    <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
                      of a {formatSpan(sessionDuration)} day
                    </span>
                    <span style={{ flex: 1 }} />
                    <span style={{ font: 'var(--type-caption)', color: overCommitted ? 'var(--job-coral-text)' : 'var(--fg-4)' }}>
                      {overCommitted
                        ? `${formatSpan(-freeSeconds)} over the day`
                        : `${formatSpan(freeSeconds)} free`}
                    </span>
                  </div>
                  <BudgetTrack spent={committedSeconds} budget={sessionDuration} over={overCommitted} />
                </div>

                <SortableList
                  ids={selectedTaskIds}
                  onReorder={reorderSelectedTasks}
                  className={SCROLLER}
                  style={{ ...SCROLLER_STYLE, marginTop: 'var(--sp-5)' }}
                >
                  <AnimatePresence>
                    {selectedTasks.map((task, n) => {
                      const subtasks = task.subtasks ?? [];
                      const expanded = expandedIds.has(task.id);

                      return (
                        <SortableRow key={task.id} id={task.id}>
                          {({ isDragging }) => (
                            <TaskRow
                              task={task}
                              side="queued"
                              index={n}
                              listTitle={getListTitle(taskLists, task.listId, task.listName)}
                              /* Both sides state it now — see note 0 on
                                 `session/TaskRow`. A queued row can be blocked
                                 without being locked (that is what "Schedule
                                 anyway" produces), and it can be genuinely
                                 locked: Smart Start admits a blocker and its
                                 dependent as a group, and the dependent stays
                                 locked until the blocker is actually done. The
                                 lookup is against the BACKLOG, because that is
                                 where a blocker's completion lives — this row
                                 is a snapshot copy taken when the day was
                                 built. */
                              blockedBy={getBlockingTasks(backlogTasks, task)}
                              lockReason={taskLockReason(backlogTasks, task)}
                              isDragging={isDragging}
                              editing={editingTaskId === task.id}
                              editTitle={editTaskTitle}
                              onEditTitleChange={setEditTaskTitle}
                              onCommitEdit={() => handleEditTask(task.id)}
                              onCancelEdit={() => setEditingTaskId(null)}
                              onStartEdit={() => { setEditingTaskId(task.id); setEditTaskTitle(task.title); }}
                              onDetails={() => setDetailTask(task)}
                              onSelect={() => handleRemoveTask(task.id)}
                              onRemove={() => handleRemoveTask(task.id)}
                              expanded={expanded}
                              onToggleExpand={subtasks.length > 0 ? () => toggleExpand(task.id) : undefined}
                              swipe={swipeFor(task, true)}
                            >
                              {subtasks.length > 0 && (
                                <QueueSubtaskTree
                                  subtasks={subtasks}
                                  rootTaskId={task.id}
                                  listId={task.listId ?? ''}
                                  depth={0}
                                  expandedIds={expandedIds}
                                  onToggle={toggleExpand}
                                />
                              )}
                            </TaskRow>
                          )}
                        </SortableRow>
                      );
                    })}

                    {selectedTasks.length === 0 && (
                      /*
                        A dashed slot, not a grey line. UI-29 established that
                        `.ag-addrow` is how this system draws somewhere with
                        nothing in it yet — `session.html` is one of the seven
                        files that prove it — and the copy names the budget the
                        bar above is measuring, so the empty state and the
                        reading agree.
                      */
                      <div
                        className="ag-addrow"
                        style={{
                          display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start', alignContent: 'center',
                          minHeight: 220, padding: 'var(--sp-8)', borderRadius: 'var(--r-lg)',
                        }}
                      >
                        <MetaKicker icon="inbox" tone="var(--fg-4)">Queue empty</MetaKicker>
                        <LitLine
                          style={{
                            font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                            color: 'var(--fg-3)', maxWidth: '34ch',
                          }}
                        >
                          You have <Lit>{formatSpanSpoken(sessionDuration)}</Lit>. Pick tasks on the left, or let <Lit>Smart start</Lit> fill them.
                        </LitLine>
                        {/* With nothing picked this is the way forward: a plain orange gel (29-1P2). */}
                        <GelButton colour="orange" tile={false} size="md" onClick={handleSmartStart} icon={<Icon name="zap" size={16} />}>
                          Smart start
                        </GelButton>
                      </div>
                    )}
                  </AnimatePresence>
                </SortableList>

                {/* The step forward. A footer inside the pane, not a slab
                    floating over the list — the list no longer needs 160px of
                    dead space under it to scroll clear of this.
                    The screen's one lit button: a plain orange gel since 29-1P2
                    (go — the step towards starting), no tile, since the tile is
                    for the Start itself on Set Deadlines. */}
                <div style={{ flex: '0 0 auto', paddingTop: 'var(--sp-5)' }}>
                  <GelButton
                    block
                    colour="orange"
                    tile={false}
                    onClick={() => navigate('/deadlines')}
                    disabled={selectedTasks.length === 0}
                    title={selectedTasks.length === 0 ? 'Pick at least one task first' : 'Allocate time for these tasks'}
                  >
                    Next: Set Deadlines
                    <Icon name="arrow-right" size={18} />
                  </GelButton>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}

      {/*
        Smart start's report. The only toast on this screen — see the header
        for why the other mutations do not get one. `Z.toast` shares a rung
        with `Z.nav`, so on a narrow window it is lifted clear of the floating
        `MiniNav`'s 112px lane rather than left to a tie in paint order.
      */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed', bottom: wide ? 'calc(var(--sp-8) + var(--safe-b))' : 'calc(112px + var(--safe-b))', left: '50%',
              transform: 'translateX(-50%)', zIndex: Z.toast,
            }}
          >
            <Toast
              icon={<Icon name="check" size={16} />}
              title={<LitLine text={toast.text} style={{ color: 'var(--fg-3)' }} />}
              onDismiss={() => setToast(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task detail panel */}
      <AnimatePresence>
        {detailTask && (
          <TaskDetailPanel
            task={detailTask}
            onClose={() => setDetailTask(null)}
            onSave={(updates) => {
              updateBacklogTask(detailTask.id, updates);
              setSelectedTasks(
                selectedTasks.map((t) => t.id === detailTask.id ? { ...t, ...updates } : t)
              );
              setDetailTask(null);
            }}
            onDelete={() => {
              // Queue cleanup belongs to the delete itself — see `handleDeleteTask`.
              deleteBacklogTask(detailTask.id);
              setDetailTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
