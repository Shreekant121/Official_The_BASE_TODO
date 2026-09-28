/**
 * Set Deadlines — RECONCILED (UI-27) against `design-system/screens/deadlines.html`.
 *
 * UI-10 built this screen without the mockup (`DesignSync list_projects` had
 * returned an empty array for the ninth time). The mockup arrived with UI-21's
 * handoff bundle, and it opens by stating the screen's one job:
 *
 *   *"The queue is already chosen. This screen answers the second half of the
 *   product's question — how long have I got? — by turning a list of committed
 *   tasks into a clock: every allocation lands the session on a finish time,
 *   and that time is the loudest number on the page."*
 *
 * **That clock is what we had missed entirely.** The screen was a list of
 * allocations with a total. It is now two panes — Allocation, and The run —
 * and the run pane answers *when does this end*, which is the question a plan
 * is made to answer.
 *
 * THE MOCKUP NAMES THREE THINGS THE OLD SCREEN GOT WRONG. All three are fixed:
 *
 * 1. **"A total with nothing to compare it to."** UI-10 had already half-fixed
 *    this with a spare/overrun note; the source's answer is a budget *line* —
 *    the allocated figure against the window, with a bar that goes amber the
 *    second the plan outruns it. Ported whole, and the `Countdown` that used to
 *    carry the total leaves this screen: the loudest number here is the finish
 *    time, not the sum.
 * 2. **"Subtasks in a drawer that covered the task it described."** The
 *    breakdown expands **inside the card** now, and the rows are the same
 *    `DeadlineSubtaskRow` the drawer held, so nothing about the recursion
 *    changed — only where it appears. UI-32 took the drawer away from Focus
 *    Mode too, so nothing opens one any more and the file it lived in is
 *    `SubtaskRows.tsx`.
 * 3. **"A parent with subtasks stops being typed at all — its allocation is the
 *    sum."** This one was a live bug, not just a shape: the fixture's first task
 *    stores 90 minutes while its subtasks add up to 50, so the card and the
 *    drawer inside it stated **two different numbers for the same task**. The
 *    field is `locked` when there is a roll-up, and the mount effect writes the
 *    sum through — the same rule `handleChangeSubtaskTime` has always applied,
 *    now applied on arrival so Focus Mode counts down what this screen showed.
 *
 * ALSO TAKEN FROM THE SOURCE
 * --------------------------
 * - **The header is a pill (a rounded rectangle since V3-6, his ask) with the
 *   flow `Stepper` in it** (Select · Deadlines ·
 *   Focus, with the real value as each step's hint). `Stepper` was ported for
 *   this, from `design-system/components/navigation/Stepper.jsx`.
 * - **The commit bar came back to the bottom** and the window is a field in it,
 *   not a label — see the divergence note below for what changes on a tablet.
 * - **The task card states its position in the run and where it lands on the
 *   clock**, then the title with its score, then the facts as kickers: the
 *   list, the deadline, and what it is waiting on.
 * - The two panes' material: `--pad-card-lg` in `--r-card-lg` over
 *   `--glass-fill-2` and `--glass-shadow-pane`, the `1.55fr / 1fr` split, the
 *   run blocks sized `max(38, min(120, minutes / 2))` so a long task is
 *   visibly longer, the first block tinted and emitting because it is what
 *   happens next, and the dashed "Unplanned" tail.
 *
 * WHAT IS UNCHANGED — and this is the part that matters
 * -----------------------------------------------------
 * Every store call is where it was: the mount effect that restores a time from
 * `taskTimeMemory` (then the task's own estimate), the write pair on every edit
 * — `updateTask` for today's queue and `setTaskTimeMemory` so the same title
 * arrives filled in next time — `handleApplyPert`'s `{ allocatedTime,
 * estimatedTime }`, the recursive roll-up through `updateSubtaskTimeInTree` +
 * `subtasksTotalSeconds`, and `reorderTasks` rebuilding the queue from the
 * dropped order.
 *
 * `SortableList`/`SortableRow` are untouched: this is one of the three flat
 * lists on the app's single drag system. **The h/m boxes are still real
 * `<input>` elements and that is load-bearing** — `index.css` exempts
 * `[data-drag-row] input` back to `user-select: text`, and `SortableList`'s
 * `isInteractiveTarget` lets a press on an `input` through instead of starting
 * a drag. The session `Slider` is an `<input type="range">` for the same
 * second reason.
 *
 * FOUR THINGS THE MOCKUP HAS THAT WE DELIBERATELY DO NOT
 * -----------------------------------------------------
 * - **An editable start time.** The source types one in; this session starts
 *   when Start Protocol is pressed, so the start is a number the product works
 *   out rather than a field. `now` is read once on mount, which is both this
 *   app's idiom (`TrashPage`, `NotificationsPage`) and what
 *   `react-hooks/purity` requires.
 * - **"Trim to fit"**, which scales every allocation until the plan fits. Every
 *   allocation here is also a `taskTimeMemory` seed for the next session, so a
 *   bulk rewrite would either poison those defaults with a squeezed number or
 *   leave the memory disagreeing with the queue. It also cannot reach the
 *   leaves of a rolled-up task without rewriting the subtask tree.
 * - **↑/↓ buttons to reorder a card.** The run order is set by dragging, on the
 *   app's one drag system, which the prototype has no equivalent of and which
 *   already answers the keyboard (dnd-kit's `KeyboardSensor`).
 * - **Add / remove a step from inside the breakdown.** Editing the subtask tree
 *   is the task sheet's job; this screen allocates to the tree it is given.
 *
 * AND ONE THING WE HAVE THAT IT DOES NOT: the amber **"Needs time"** pill, and
 * a Start Protocol that stays disabled until every task has one. The source
 * only disables when *nothing* is allocated. A field you have not filled in is
 * *needs a decision*, which is the same call UI-9 made for its "Needs …" chips
 * — and it is the answer to why the button is greyed out, which the screen
 * never gave before UI-10.
 *
 * DIVERGENCE, TABLET: on a narrow window this screen's `MiniNav` floats at
 * exactly the bottom of the viewport — the collision UI-10 moved the old bottom
 * bar into the header to escape — so the commit bar sticks **above** the nav
 * there (60px of pill, `--sp-5` off the bottom) rather than at `--sp-6` like
 * the source's. Leaving it in the flow instead was tried and is worse: at 820
 * × 1180 the whole page very nearly fits one viewport, so the bar lands under
 * the nav pill with Start Protocol half off the screen. The run pane is also
 * ordered **first** on narrow — stacked, the loudest number on the page would
 * otherwise sit below the whole list and never be seen.
 *
 * V3 (V3-6, step 10) — SET DEADLINES IS ON V3. Design:
 * `design-system/Deadlines.dc.html`. The default export is the `<V3Scope>` and
 * `SetDeadlinesScreen` is inside it, so `useMotion()` sees the scope and the
 * PERT dialog, Capture and every other overlay opened from here come out V3.
 * **His call, 2026-09-24: "keep everything as today, just apply the new
 * design."** So the two panes, the finish clock, the typed h/m boxes, the
 * session slider and Start Protocol all stay where and what they are; only
 * the material moved. On this screen: the rail carries the mark, Back is
 * round glass, Start Protocol is gel (V3's one primary), the rows condense on
 * `useMotion()`'s curve, and kickers read in sentence case through the
 * tokens. "Set Deadlines" keeps its capitals — the system voice, as Focus's
 * "FOCUS".
 * **Not built, because V3 changes no features** (and he said no to each):
 * the design's timeline column with hour marks and a "Window ends" line, its
 * 2h / 4h / 6h / 8h window buttons, − / + fifteen-minute steppers, the
 * Fits / Tight / Won't fit chips with past-the-window rows dimmed, and
 * "Start with N that fit".
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useStore, countSubtasksRecursive, isTaskScored, subtasksTotalSeconds,
  taskFocusSeconds, updateSubtaskTimeInTree, type Task,
} from '../store/useStore';
import { motion } from 'framer-motion';
import CaptureModal from './CaptureModal';
import { Z } from '../lib/zLayers';
import { DeadlineSubtaskRow } from './SubtaskRows';
import PertEstimationModal from './PertEstimationModal';
import { SortableList, SortableRow } from './SortableList';
import { TimeWell } from './TimeWell';
import {
  Button, Icon, IconButton, MetaKicker, MiniNav, ScoreDial, Slider, StatusPill, Stepper, useMedia,
  useMotion, V3Scope, WIDE,
} from '../ui';
import { usePriorityScores } from '../store/usePriorityScores';
import { useFooterReserve } from '../lib/useFooterReserve';
import { RedAlertBadge } from './task-fields/RedAlertBadge';
import { formatClock, formatSpan } from '../lib/timeSpan';
import { BudgetTrack } from './session/BudgetTrack';
import { useNavModel } from './navModel';
import { RailMark } from './BrandMark';

/** The slider's ceiling. A "work session" longer than this is not one. */
const MAX_SESSION_SECONDS = 12 * 3600;

/**
 * Five minutes. The slider is the coarse instrument — sweep it for the shape of
 * the afternoon — and the h/m boxes beside it are the exact one, so the step
 * only has to be fine enough that the knob never visibly disagrees with them.
 */
const SESSION_STEP_SECONDS = 300;

/**
 * The source folds its two panes into one under 1180px and this is that number.
 * It is not `WIDE`: `WIDE` (960) is the app-wide switch between the nav rail
 * and the floating bar, and a 1.55/1 split of what is left at 960 gives a
 * second column too narrow to read a clock in.
 */
const TWO_PANE = '(min-width: 1180px)';

const DAY = 86_400_000;

/**
 * One answer for what a row on this screen is worth. A parent's allocation is
 * what its children add up to; only a leaf carries its own number.
 */
function rowSeconds(task: Task): number {
  const rolled = subtasksTotalSeconds(task.subtasks ?? []);
  return rolled > 0 ? rolled : task.allocatedTime || 0;
}

/**
 * The mockup's `dueText`, on the app's own deadline field. Copy only — the
 * scoring authority is `lib/priority.ts` through `usePriorityScores`, as it is
 * everywhere else.
 */
function dueReading(iso: string | undefined, now: number): { text: string; hot: boolean } | null {
  if (!iso) return null;
  const days = (new Date(iso).getTime() - now) / DAY;
  if (days < 0) return { text: 'Overdue', hot: true };
  if (days <= 1) return { text: `Due in ${Math.max(1, Math.round(days * 24))}h`, hot: true };
  if (days <= 7) return { text: `Due in ${Math.ceil(days)}d`, hot: false };
  return { text: `Due in ${Math.round(days / 7)}w`, hot: false };
}

/* The switch (V3-6). Its own component for Focus's reason: `useMotion()` reads
   the scope from context, so the screen must sit below the provider. */
export default function SetDeadlines() {
  return (
    <V3Scope>
      <SetDeadlinesScreen />
    </V3Scope>
  );
}

function SetDeadlinesScreen() {
  const navigate = useNavigate();
  const nav = useNavModel();
  const motionTokens = useMotion();
  const wide = useMedia(WIDE);
  const twoPane = useMedia(TWO_PANE);
  const scores = usePriorityScores();
  const {
    tasks,
    backlogTasks,
    updateTask,
    setTasks,
    sessionDuration,
    setSessionDuration,
    taskTimeMemory,
    setTaskTimeMemory,
  } = useStore();

  /* Read once. The plan is a plan, not a live clock — and a value that moved
     between renders would put a different finish time on screen every second. */
  const [now] = useState(() => Date.now());

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [pertTaskIndex, setPertTaskIndex] = useState<number | null>(null);

  /*
    WHERE THE COMMIT BAR STARTS, MEASURED (BUILD-1, `lib/useFooterReserve.ts`):
    the app-level focus pill is fixed to the window and knows nothing about
    this screen, so this is what keeps it off the bar. Measured rather than
    typed because the bar wraps — 76px on one line, taller as the window
    narrows.
    The capture button used to float above the bar on the same measurement;
    since V3-6 it sits in the bar's own row, beside it (his ask, 2026-09-24),
    so it needs no number at all.
  */
  const barRef = useRef<HTMLDivElement>(null);
  useFooterReserve(barRef);

  /*
    The bar's own lift off the bottom of the scroll. On a narrow window that
    is the floating `MiniNav` to clear — 60px of pill sitting `--sp-5` off the
    bottom; see the tablet divergence note at the top of this file.
  */
  const barLift = wide ? 'var(--sp-6)' : 'calc(60px + var(--sp-5) + var(--sp-4))';

  const handleChangeSubtaskTime = (taskId: string, subtaskId: string, seconds: number) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const updatedSubtasks = updateSubtaskTimeInTree(task.subtasks ?? [], subtaskId, seconds);
    const newParentTotal = subtasksTotalSeconds(updatedSubtasks);
    updateTask(taskId, { subtasks: updatedSubtasks, allocatedTime: newParentTotal });
    setTaskTimeMemory(task.title, newParentTotal);
  };

  useEffect(() => {
    let hasChanges = false;
    const restoredTasks = tasks.map((task) => {
      /*
       * A parent's allocation IS the sum of its subtasks — the rule
       * `handleChangeSubtaskTime` has always written, now applied on arrival.
       * Without it a task can store one number while the breakdown inside it
       * adds up to another, and both are on screen at once the moment the
       * card is opened. Only when there is a sum: subtasks with no time on
       * them must not silently zero a parent that has one.
       */
      const rolled = subtasksTotalSeconds(task.subtasks ?? []);
      if (rolled > 0) {
        if (task.allocatedTime === rolled) return task;
        hasChanges = true;
        return { ...task, allocatedTime: rolled };
      }
      if (task.allocatedTime) return task;
      // Prefer the time this title was last given here, then fall back to the
      // task's own estimate from its card — either way the field arrives
      // filled in rather than blocking "Start Protocol" until it's retyped.
      const restored = taskTimeMemory[task.title] || taskFocusSeconds(task);
      if (!restored) return task;
      hasChanges = true;
      return { ...task, allocatedTime: restored };
    });
    if (hasChanges) setTasks(restoredTasks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyPert = (expectedMinutes: number) => {
    if (pertTaskIndex === null) return;
    const task = tasks[pertTaskIndex];
    const totalSecs = expectedMinutes * 60;
    updateTask(task.id, { allocatedTime: totalSecs, estimatedTime: expectedMinutes });
    setTaskTimeMemory(task.title, totalSecs);
    setPertTaskIndex(null);
  };

  const totalSeconds = tasks.reduce((acc, t) => acc + rowSeconds(t), 0);

  const taskIds = tasks.map((t) => t.id);
  const reorderTasks = (orderedIds: string[]) => {
    const byId = new Map(tasks.map((t) => [t.id, t]));
    setTasks(orderedIds.map((id) => byId.get(id)).filter((t): t is Task => !!t));
  };

  const allTasksHaveTime = tasks.every((t) => rowSeconds(t) > 0);

  /*
   * Does the plan fit in the session? Both numbers were already on this screen
   * and neither was ever compared to the other; this is that subtraction and
   * nothing more. Nothing new is stored, and nothing is prevented — an
   * over-committed session still starts.
   */
  const spareSeconds = sessionDuration - totalSeconds;
  const overrun = spareSeconds < 0;

  /* Run order → clock. Computed once, read by both panes. */
  const startMinutes = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  /* Summed forward rather than carried in a running variable, which
     `react-hooks/immutability` rejects outright — and the queue is a handful
     of rows, so the quadratic walk is free. */
  const blockMinutes = (task: Task) => Math.round(rowSeconds(task) / 60);
  const blocks = tasks.map((task, i) => ({
    id: task.id,
    title: task.title,
    minutes: blockMinutes(task),
    at: startMinutes + tasks.slice(0, i).reduce((n, t) => n + blockMinutes(t), 0),
  }));
  const endsAt = startMinutes + Math.round(totalSeconds / 60);

  const paneStyle = {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: 'var(--sp-6)',
    alignContent: 'start',
    minWidth: 0,
    padding: 'var(--pad-card-lg)',
    borderRadius: 'var(--r-card-lg)',
    backgroundImage: 'var(--glass-fill-2)',
    WebkitBackdropFilter: 'var(--glass-bd-md)',
    backdropFilter: 'var(--glass-bd-md)',
    boxShadow: 'var(--glass-shadow-pane)',
  } as const;

  const paneTitle = {
    font: 'var(--type-title)',
    fontSize: 'var(--text-xl)',
    letterSpacing: 'var(--tracking-title)',
    color: 'var(--fg-1)',
    margin: 0,
  } as const;

  return (
    /* `ag-page` rather than the old opaque wrapper, so the grid backdrop shows
       through and the panes above it have something to refract. */
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
        </div>
      )}

      {/*
        NO BOTTOM PADDING, and that is load-bearing for the commit bar below.
        A `position: sticky` offset is resolved against the SCROLLPORT'S
        CONTENT BOX, so this element's own bottom padding was being added to
        the bar's `bottom` — 80px of it on a wide window, 128 on a narrow one.
        The bar therefore parked ~100px up the page and floated over the middle
        of the allocation list instead of sitting at the foot of the window.
        The room the padding was reserving is now the bar's own, since the bar
        is the last thing in the column and nothing scrolls under it.
      */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: wide ? '0 var(--gutter-page)' : '0 var(--gutter-page-sm)',
        }}
      >
        <div
          style={{
            width: '100%', maxWidth: 1240, margin: '0 auto',
            display: 'grid', gap: 'var(--sp-8)',
            paddingTop: wide ? 'var(--sp-9)' : 'var(--sp-8)',
            /*
              AT LEAST A WINDOW TALL, WITH THE SLACK IN THE MIDDLE ROW. This is
              what puts the commit bar at the FOOT of a short page. `sticky`
              never moves an element past its natural position, so with two
              tasks the bar landed wherever the content happened to end and left
              the rest of the window empty below it — measured at 1440×900, bar
              bottom at 701 with 199px of nothing under it. Given a full-height
              column its natural place IS the bottom, and sticky's only job is
              to lift it clear of the edge (or of the nav, on narrow).
              `border-box`, because this `minHeight` has to contain the padding
              above it or the column is a scrollbar taller than its scrollport.
              **The row template is load-bearing, and `margin-top: auto` on the
              bar is not the same thing.** A grid STRETCHES its auto rows to
              fill a min-height container, so the slack would be split three
              ways: the bar reaches the bottom, but the header pill grows with
              it (measured, 98px → 165px) and the narrow window's `--sp-12`
              would have to be given up to the auto margin. Naming the middle
              row `1fr` hands every spare pixel to the panes instead, and a long
              list is left exactly as it was — the column is then taller than
              the window, nothing stretches, and the bar floats over the list.
            */
            minHeight: '100%', boxSizing: 'border-box',
            gridTemplateRows: 'auto 1fr auto',
          }}
        >
          {/* ── The header pill: what this is, the way out, and where you are ── */}
          <header
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap',
              padding: 'var(--sp-4) var(--sp-6) var(--sp-4) var(--sp-4)',
              /* A rounded rectangle, not a pill — his ask at V3-6, and the
                 same corners FIX-10 gave Focus's header. */
              borderRadius: 'var(--r-md)',
              backgroundImage: 'var(--glass-fill-2)',
              WebkitBackdropFilter: 'var(--glass-bd-lg)',
              backdropFilter: 'var(--glass-bd-lg)',
              boxShadow: 'var(--glass-shadow-pane)',
              animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
            }}
          >
            {/* Round glass since V3-6, as the board's, Focus's and Score's Back. */}
            <IconButton label="Back to task selection" onClick={() => navigate('/select')}>
              <Icon name="arrow-left" size={18} />
            </IconButton>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              {/*
                The source's header says "Deadlines"; this app's own name for
                the screen is "Set Deadlines" and New Session's footer button
                sends you here by that name, so the words stay and only the
                type treatment — the OS label voice — is taken.
              */}
              <h1
                style={{
                  /* Capitals in V3 too: the system voice, not a kicker. */
                  font: 'var(--type-system)', textTransform: 'uppercase',
                  letterSpacing: 'var(--tracking-system)', color: 'var(--fg-1)', whiteSpace: 'nowrap',
                }}
              >
                Set Deadlines
              </h1>
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                Allocate the queue. The clock does the rest.
              </p>
            </div>
            <span style={{ flex: 1, minWidth: 'var(--sp-8)' }} />
            {wide && (
              /* `hint` is where the real value lives — a stepper with only
                 labels is decoration, and `Stepper.prompt.md` says so. */
              <Stepper
                current={1}
                steps={[
                  { label: 'Select', hint: `${tasks.length} chosen` },
                  { label: 'Deadlines', hint: formatSpan(totalSeconds) },
                  { label: 'Focus' },
                ]}
                style={{ margin: 0 }}
              />
            )}
          </header>

          <div
            style={{
              display: 'grid', gap: 'var(--gap-card)', alignItems: 'start',
              gridTemplateColumns: twoPane ? 'minmax(0, 1.55fr) minmax(0, 1fr)' : '1fr',
            }}
          >
            {/* ═══════════ ALLOCATION ═══════════ */}
            <div style={{ ...paneStyle, order: twoPane ? 0 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <h2 style={paneTitle}>Allocation</h2>
                <Chip>{tasks.length} committed</Chip>
              </div>

              {/* The budget line. Minutes only mean something against a window. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                  <MetaKicker icon="timer" tone={overrun ? 'var(--hue-amber)' : 'var(--fg-3)'}>Allocated</MetaKicker>
                  <span
                    style={{
                      font: 'var(--type-numeric)', fontSize: 'var(--text-lg)', fontVariantNumeric: 'tabular-nums',
                      color: overrun ? 'var(--hue-amber)' : 'var(--fg-1)',
                    }}
                  >
                    {formatSpan(totalSeconds)}
                  </span>
                  <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
                    of a {formatSpan(sessionDuration)} window
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{ font: 'var(--type-caption)', color: overrun ? 'oklch(0.95 0.07 82)' : 'var(--fg-4)' }}>
                    {overrun ? `${formatSpan(-spareSeconds)} past the window` : `${formatSpan(spareSeconds)} unplanned`}
                  </span>
                </div>
                <BudgetTrack spent={totalSeconds} budget={sessionDuration} over={overrun} />
              </div>

              <SortableList ids={taskIds} onReorder={reorderTasks} className="relative w-full grid gap-3">
                {tasks.map((task, index) => {
                  const seconds = rowSeconds(task);
                  const rolled = subtasksTotalSeconds(task.subtasks ?? []) > 0;
                  const open = openTaskId === task.id;
                  const subCounts = task.subtasks && task.subtasks.length > 0
                    ? countSubtasksRecursive(task.subtasks)
                    : null;
                  const due = dueReading(task.deadline, now);
                  const blockedBy = (task.dependsOn ?? [])
                    .map((id) => backlogTasks.find((b) => b.id === id)?.title)
                    .filter((title): title is string => !!title);

                  return (
                    <SortableRow key={task.id} id={task.id}>
                      {({ isDragging, isAnyDragging }) => (
                        <motion.div
                          layout={!isAnyDragging}
                          /* Panes in this system arrive by CONDENSING, never by
                             sliding in from off-screen (motion.css). */
                          initial={{ opacity: 0, scale: 0.94, y: 6 }}
                          animate={{ opacity: 1, scale: isDragging ? 1.02 : 1, y: 0 }}
                          transition={{ duration: motionTokens.dur.base, ease: motionTokens.ease.glass, delay: index * 0.05 }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr)',
                            gap: 'var(--sp-5)',
                            borderRadius: 'var(--r-lg)',
                            padding: 'var(--sp-6)',
                            backgroundImage: open ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
                            WebkitBackdropFilter: 'var(--glass-bd-sm)',
                            backdropFilter: 'var(--glass-bd-sm)',
                            boxShadow: isDragging
                              ? 'var(--glass-shadow-thick)'
                              : open
                                ? 'var(--glass-rim-2), var(--glass-cast-2)'
                                : 'var(--glass-rim-1)',
                            cursor: isDragging ? 'grabbing' : 'grab',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
                            {/* Position in the run order, and where it lands on
                                the clock. The grip stays beside it because
                                dragging is what changes that number. */}
                            <span
                              aria-hidden="true"
                              /* White dots on nothing (V3-6, his ask); the
                                 tile under them was the fill glyph's. */
                              style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-1)' }}
                            >
                              <Icon name="grip-vertical" size={18} />
                            </span>
                            <div style={{ display: 'grid', gap: 2, justifyItems: 'center', width: 46, flex: '0 0 auto' }}>
                              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
                                {formatClock(blocks[index].at)}
                              </span>
                            </div>

                            <div aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-faint)', flex: '0 0 auto' }} />

                            <div style={{ flex: 1, minWidth: 190, display: 'grid', gap: 'var(--sp-2)' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
                                <span
                                  className="truncate"
                                  style={{ font: 'var(--type-title)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', minWidth: 0 }}
                                >
                                  {task.title}
                                </span>
                                {/* `sm` — "inside a task row", which is the size
                                    ScoreDial's own doc names for this. Only when
                                    the task has actually been scored: a 0.0 chip
                                    is a claim, not a blank. */}
                                {isTaskScored(task) && (
                                  <ScoreDial
                                    value={scores.scoreOf(task)}
                                    max={scores.peak}
                                    alert={scores.read(task).redAlert}
                                    size="sm"
                                  />
                                )}
                                <RedAlertBadge redAlert={scores.read(task).redAlert} compact />
                              </span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                                {task.listName && <MetaKicker tone="var(--fg-4)">{task.listName}</MetaKicker>}
                                {due && (
                                  <MetaKicker icon="calendar-clock" tone={due.hot ? 'var(--hue-amber)' : 'var(--fg-4)'}>
                                    {due.text}
                                  </MetaKicker>
                                )}
                                {blockedBy.length > 0 && (
                                  <MetaKicker icon="lock" tone="var(--fg-4)">After {blockedBy.join(', ')}</MetaKicker>
                                )}
                                {/* Amber, not rose: a field you have not filled
                                    in needs a decision, it is not a live
                                    problem — and it is why Start Protocol is
                                    greyed out. */}
                                {seconds === 0 && (
                                  <StatusPill status="review" size="sm" dot={false}>Needs time</StatusPill>
                                )}
                              </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
                              <IconButton
                                label={`Estimate "${task.title}" with PERT`}
                                title="PERT estimate"
                                size="sm"
                                variant="ghost"
                                onClick={() => setPertTaskIndex(index)}
                              >
                                <Icon name="calculator" size={16} />
                              </IconButton>

                              {subCounts && (
                                <>
                                  <IconButton
                                    label={`${open ? 'Hide' : 'Show'} subtasks of "${task.title}"`}
                                    size="sm"
                                    variant="ghost"
                                    active={open}
                                    aria-expanded={open}
                                    onClick={() => setOpenTaskId(open ? null : task.id)}
                                  >
                                    <Icon name="list-tree" size={16} />
                                  </IconButton>
                                  <span
                                    aria-hidden="true"
                                    style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-4)', width: 10, marginLeft: -6 }}
                                  >
                                    {subCounts.total}
                                  </span>
                                </>
                              )}

                              {/* Last in the row on every card, so the times
                                  read down the page as one column. */}
                              <TimeWell
                                seconds={seconds}
                                blankWhenZero={!rolled}
                                locked={rolled}
                                name={`allocated to "${task.title}"`}
                                onSeconds={(secs) => {
                                  updateTask(task.id, { allocatedTime: secs });
                                  setTaskTimeMemory(task.title, secs);
                                }}
                              />
                            </div>
                          </div>

                          {/* Subtasks resolve inside the card that owns them — a
                              drawer here would cover the task it describes. */}
                          {open && subCounts && (
                            <div
                              style={{
                                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)',
                                gap: 'var(--sp-3)', padding: 'var(--sp-5)',
                                borderRadius: 'var(--r-md)',
                                backgroundImage: 'var(--glass-well)',
                                boxShadow: 'var(--glass-well-shadow)',
                                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                                <MetaKicker icon="list-tree">Breakdown</MetaKicker>
                                <span style={{ flex: 1 }} />
                                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                                  The parent is the sum. Type on the leaves.
                                </span>
                              </div>
                              {(task.subtasks ?? []).map((sub) => (
                                <DeadlineSubtaskRow
                                  key={sub.id}
                                  sub={sub}
                                  depth={0}
                                  onChangeTime={(subId, secs) => handleChangeSubtaskTime(task.id, subId, secs)}
                                />
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </SortableRow>
                  );
                })}
              </SortableList>
            </div>

            {/* ═══════════ THE RUN ═══════════ */}
            <div style={{ ...paneStyle, order: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <h2 style={paneTitle}>The run</h2>
                <span style={{ flex: 1 }} />
                <MetaKicker icon="play">Starts</MetaKicker>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatClock(startMinutes)}
                </span>
              </div>

              {/* The screen's loudest number: when this ends. */}
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)',
                  gap: 'var(--sp-3)', padding: 'var(--sp-7)', borderRadius: 'var(--r-lg)',
                  backgroundImage: overrun ? 'var(--glass-tint-amber)' : 'var(--glass-tint-accent)',
                  boxShadow: overrun
                    ? 'var(--glass-rim-2), var(--glow-amber-md)'
                    : 'var(--glass-rim-2), var(--glow-accent-sm)',
                  transition: 'background-image var(--dur-base) var(--ease-glass)',
                }}
              >
                <MetaKicker icon="flag-triangle-right" tone={overrun ? 'oklch(0.95 0.07 82)' : 'var(--accent)'}>
                  Session ends
                </MetaKicker>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-5xl)', lineHeight: 1,
                    color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
                    /* The token, not a typed hue, so V3's emerald reaches it. */
                    textShadow: overrun ? 'none' : 'var(--text-glow-accent)',
                  }}
                >
                  {formatClock(endsAt)}
                </span>
                <span style={{ font: 'var(--type-caption)', color: overrun ? 'oklch(0.95 0.07 82)' : 'var(--fg-2)' }}>
                  {overrun
                    ? `${formatSpan(-spareSeconds)} past the window you set.`
                    : `${formatSpan(spareSeconds)} of the window still unplanned.`}
                </span>
              </div>

              {/*
                `minmax(0, 1fr)`, not a bare `grid`. An implicit grid column is
                `auto`, whose floor is min-content, and a run row's min-content
                is its task title — so one long title widened this column to
                607px inside a 414px pane and every row in the list hung out
                past the pane's right edge. The title's own `truncate` cannot
                save it: the row had already been given the wider track to fill.
                Same guard `paneStyle` above carries, for the same reason.
              */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-3)' }}>
                {blocks.map((block, i) => (
                  <div key={block.id} style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'stretch' }}>
                    <span
                      style={{
                        font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                        color: i === 0 ? 'var(--fg-2)' : 'var(--fg-4)',
                        fontVariantNumeric: 'tabular-nums', width: 42, flex: '0 0 auto', paddingTop: 12,
                      }}
                    >
                      {formatClock(block.at)}
                    </span>
                    {/* Half a pixel a minute, floored and capped — a long task
                        is visibly longer without a two-hour one owning the pane. */}
                    <div
                      style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                        height: Math.max(38, Math.min(120, block.minutes * 0.5)),
                        padding: '0 var(--sp-5)', borderRadius: 'var(--r-sm)',
                        backgroundImage: i === 0 ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
                        boxShadow: i === 0 ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
                        transition: 'height var(--dur-slow) var(--ease-glass)',
                      }}
                    >
                      <span
                        className="truncate"
                        style={{
                          flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                          color: i === 0 ? 'var(--fg-1)' : 'var(--fg-2)',
                        }}
                      >
                        {block.title}
                      </span>
                      <span
                        style={{
                          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatSpan(block.minutes * 60)}
                      </span>
                    </div>
                  </div>
                ))}

                {!overrun && spareSeconds > 0 && (
                  <div style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'stretch' }}>
                    <span
                      style={{
                        font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)',
                        fontVariantNumeric: 'tabular-nums', width: 42, flex: '0 0 auto', paddingTop: 12,
                      }}
                    >
                      {formatClock(endsAt)}
                    </span>
                    <div
                      style={{
                        flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                        minHeight: 38, padding: '0 var(--sp-5)', borderRadius: 'var(--r-sm)',
                        border: '1px dashed var(--line-soft)',
                      }}
                    >
                      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-4)', flex: 1 }}>
                        Unplanned
                      </span>
                      <span
                        style={{
                          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {formatSpan(spareSeconds)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── The commit bar. The window is a field, not a label. ────────── */}
          {/*
            The sticky piece is a ROW: the bar, and the capture button beside
            it (V3-6, his ask — it floated above the bar's right end before).
            The row, not the bar, is what sticks and what is measured, so the
            button rides with the bar at every width and the focus pill clears
            both.
          */}
          <div
            ref={barRef}
            style={{
              position: 'sticky',
              bottom: barLift,
              /*
                Clearance for how far sticky lifts the bar off its own natural
                position at the foot of the scroll. The grid's `--sp-8` gap
                already covers the wide window's 20px; the narrow one lifts it
                88px to clear the floating `MiniNav`, so it needs the rest or
                the last allocation row ends up underneath it.
              */
              marginTop: wide ? 0 : 'var(--sp-12)',
              zIndex: 30,
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
            }}
          >
            <div
              style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
                padding: 'var(--sp-4) var(--sp-5)', borderRadius: 'var(--r-pill)',
                backgroundImage: 'var(--glass-fill-2)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                backdropFilter: 'var(--glass-bd-lg)',
                boxShadow: 'var(--glass-shadow-thick)',
              }}
            >
              <MetaKicker icon="hourglass" style={{ paddingLeft: 'var(--sp-4)' }}>Work session</MetaKicker>
              <TimeWell
                size="lg"
                seconds={sessionDuration}
                name="in this work session"
                tone={overrun ? 'amber' : undefined}
                onSeconds={setSessionDuration}
              />
              {/*
                Sweep it for the shape of the afternoon, type in the boxes when it
                has to be exact; they are the same value and either one moves the
                other. `showValue` is off because the boxes beside it already say
                the number — the source's three readouts exist for a slider
                standing on its own.
              */}
              <div style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 340 }}>
                <Slider
                  label="Work session length"
                  valueText={formatSpan(sessionDuration)}
                  showValue={false}
                  value={Math.min(sessionDuration, MAX_SESSION_SECONDS)}
                  min={0}
                  max={MAX_SESSION_SECONDS}
                  step={SESSION_STEP_SECONDS}
                  onValueChange={setSessionDuration}
                />
              </div>
              {/* Dropped on a narrow window: the bar has to stay one line for
                  Start Protocol to fit beside the field, and the run pane says
                  the same thing directly above it there, much louder. */}
              {wide && (
                <span style={{ font: 'var(--type-label)', color: overrun ? 'oklch(0.95 0.07 82)' : 'var(--fg-3)', minWidth: 0 }}>
                  {overrun
                    ? `${formatSpan(-spareSeconds)} more work than window`
                    : totalSeconds === 0
                      ? 'Nothing allocated yet'
                      : `${formatSpan(totalSeconds)} allocated · ends ${formatClock(endsAt)}`}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {/* The screen's one emerald: this is what makes the session live,
                  and it is only offered once every task has a time on it.
                  Gel since V3-6 — V3's one primary; `solid` outside a scope. */}
              <Button
                variant="gel"
                onClick={() => navigate('/focus')}
                disabled={!allTasksHaveTime || tasks.length === 0}
                title={allTasksHaveTime ? 'Start the focus session' : 'Every task needs a time first'}
                iconRight={<Icon name="arrow-right" size={16} />}
                style={{ flex: '0 0 auto' }}
              >
                Start Protocol
              </Button>
            </div>
            <IconButton
              label="Capture an idea or task"
              title="Capture an idea or task"
              size="lg"
              onClick={() => setIsCapturing(true)}
              style={{ flex: '0 0 auto' }}
            >
              <Icon name="plus" size={22} />
            </IconButton>
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}

      <PertEstimationModal
        isOpen={pertTaskIndex !== null}
        subtitle={pertTaskIndex !== null ? tasks[pertTaskIndex]?.title : undefined}
        baseMinutes={pertTaskIndex !== null ? Math.round(rowSeconds(tasks[pertTaskIndex]) / 60) : undefined}
        onClose={() => setPertTaskIndex(null)}
        onApply={handleApplyPert}
      />

      <CaptureModal isOpen={isCapturing} onClose={() => setIsCapturing(false)} />
    </div>
  );
}

/*
 * The mockup composes `Chip` inline on every screen that needs one, and this
 * screen's is 28px where the shared `src/ui` chip is 32 — `deadlines.html` and
 * `focus.html` draw 28, `session.html` 30, `scoring.html` 32, so the source
 * itself does not agree and the local copy is what this mockup draws.
 *
 * The matching local `Kicker` is gone: UI-31 needed the same shape for the
 * session screen's budget line, so it is `MetaKicker` in `src/ui` now and
 * renders exactly what this file used to.
 */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', flex: '0 0 auto',
        height: 28, padding: '0 var(--sp-4)', borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        color: 'var(--fg-2)', font: 'var(--type-label)', fontSize: 'var(--text-xs)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}
