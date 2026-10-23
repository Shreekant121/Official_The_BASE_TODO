/**
 * Project — the same tasks as a table.
 * PORTED (UI-29) from `ListView` / `ListRow` in `design-system/screens/project.html`.
 *
 * The board answers *what is there*; this answers *how much*. It is the same
 * rows, sorted by score inside each list, with the three numbers a board card
 * spends on prose given column headings instead: Due, Allocated, Score.
 *
 * It is the second half of the toolbar's `SegmentedControl`, which is the
 * first MODE switch in the app — hence `SegmentedControl` being ported in the
 * same session. The board stays the default.
 *
 * NOTHING HERE DRAGS, deliberately. The mockup's table has no handles and no
 * `SortableGroup`, and it is the right call twice over: a table sorted by
 * score has no manual order to express, and a row's position in it is a
 * *reading* rather than a decision. Reordering lives on the board.
 *
 * The two grids are the source's, minus its tags column (tags left the app at
 * OPT-3). The cut between them is at 1080px, which is the mockup's own `wide`,
 * not the app's 960px rail breakpoint.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  askInk, BadgeFold, Icon, IconButton, LitLine, MorphMenu, ScoreDial, StatusPill, StepTrack, Strike, useMedia,
  withStepWash, STEP_WASH_TRANSITION, type MorphMenuItem,
} from '../../ui';
import SubtaskPreviewTree from './SubtaskPreviewTree';
import { BlockedLine, Fact, Fold, MilestoneMark, RepeatCount, Tick } from './parts';
import { pressTick } from './pressTick';
import { QuickActions } from './QuickActions';
import { useDensity } from './density';
import { useWireStore } from '../../lib/blockWires';
import { SELECTED_RIM } from './TaskRow';
import { LIST_PANE_FILL, LIST_PANE_FLOOR, LIST_PANE_SHADOW, PARKED_WASH } from './ListColumn';
import {
  byScoreDesc, doneCount, elapsedMinutes, minutesLabel, repeatLabel,
  subtaskCount, workLeftMinutes,
} from './derive';
import { pressedAControl } from './cardPress';
import { Z } from '../../lib/zLayers';
import {
  useStore, formatINR, getBlockingTasks, getListTitle, taskLockReason, taskListValueINR,
  type Task, type TaskList,
} from '../../store/useStore';
import {
  DUE_GROUPS, SCORE_GROUPS, dueGroupOf, groupInto, scoreGroupOf, type GroupBy,
} from '../../lib/regroup';
import { parseStoredDate } from '../../lib/agent/dates';
import { useRegroupGlide } from './regroupGlide';
import { usePriorityScores } from '../../store/usePriorityScores';
import { RedAlertBadge } from '../task-fields/RedAlertBadge';
import { DueDate } from '../task-fields/DueDate';
import { AvoidedMark, EmergencyMark } from '../task-fields/TaskMarks';
import { emergencyMenuItems } from '../task-fields/emergencyMenu';
import { useStartNowItems } from '../task-fields/startNowMenu';
import { useIgnoreItems } from '../task-fields/ignoreMenu';
import { useWorkedItems } from '../task-fields/workedMenu';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { dustAttr } from '../../lib/dust';
import { AI_SUBJECT_RIM } from '../../ui/overlay/AIPanel';
import { SwipeRow } from '../../ui/core/SwipeRow';
import { doneSide, tomorrowSide } from '../task-fields/swipeSides';
import { startTaskTomorrow } from '../../lib/startTomorrow';

/** The board card's own spring (`TaskRow.tsx`), so a tick glides alike in both views. */
const ROW_GLIDE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.6 } as const;

/** The mockup's own breakpoint for this table, not the app's rail one. */
const TABLE_WIDE = '(min-width: 1080px)';

/* The last column holds two 34px buttons since BUILD-4 — the AI panel's,
   always visible, and the ⋯ menu beside it. */
const GRID_WIDE = '24px minmax(220px, 1fr) 96px 84px 54px 72px';
const GRID_TIGHT = '24px minmax(150px, 1fr) 88px 76px 48px 70px';

const MONO = {
  font: 'var(--type-numeric)',
  fontSize: 'var(--text-xs)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

/**
 * A one-line title that FADES out at the right edge instead of being cut with
 * an ellipsis — Shreekant asked for the fade (FIX-9). The fade is only drawn
 * while the text actually overflows: a mask on every title would dim the last
 * letters of short ones too, so the span measures itself.
 */
function FadingTitle({ children, style }: { children: ReactNode; style: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);
  const mask = overflowing ? 'linear-gradient(to right, #000 calc(100% - 40px), transparent)' : undefined;
  return (
    <span
      ref={ref}
      style={{ ...style, whiteSpace: 'nowrap', overflow: 'hidden', maskImage: mask, WebkitMaskImage: mask }}
    >
      {children}
    </span>
  );
}

function TableRow({
  task, wide, selected, selectMode, onSelect, onOpen, onDelete, onToggleDone, onAsk, isAskSubject,
  repeatCount = 1, listLabel,
}: {
  task: Task;
  wide: boolean;
  selected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onOpen: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onAsk?: (task: Task) => void;
  isAskSubject?: boolean;
  /** FIX-9 — see `TaskRow`'s prop of the same name. */
  repeatCount?: number;
  /** 29-1P9a (158): the list it is from, when the table is grouped by something else. */
  listLabel?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  /* 29-1P7b (163): the steps unfolded under the row, as on the board card. */
  const [stepsOpen, setStepsOpen] = useState(false);
  /* 29-1P7c: Framer's hover, which a finger never fires — it builds the
     quick actions (161) and draws the wires (164), as on the board card. */
  const [hovered, setHovered] = useState(false);
  const [quickBuilt, setQuickBuilt] = useState(false);
  const density = useDensity();
  const comfy = density === 'comfortable';
  const backlogTasks = useStore((s) => s.backlogTasks);
  const elapsed = useStore((s) => elapsedMinutes(s.focusLog, task.id));
  const setEmergencyBoost = useStore((s) => s.setEmergencyBoost);

  const done = task.status === 'completed';
  const live = task.status === 'in-progress';
  const scores = usePriorityScores();
  const reading = scores.read(task);
  const score = reading.score;
  const emergency = task.emergencyBoost ?? 0;
  const emergencyLapsed = emergency > 0 && reading.variables.emergency === 0;
  const sub = subtaskCount(task);
  const alloc = task.estimatedTime ?? 0;
  const blockingTasks = done ? [] : getBlockingTasks(backlogTasks, task);
  /* Item 19's lock, read the same way the board card reads it — one test and
     one sentence, so the two views of one task cannot disagree about whether it
     can be ticked or about what it is waiting for. */
  const lockReason = taskLockReason(backlogTasks, task);
  const locked = lockReason !== undefined;
  const repeat = repeatLabel(task, new Date(), resolveUserTimeZone());

  const wiring = hovered && !selectMode;
  useEffect(() => {
    if (!wiring) return;
    const { point, leave } = useWireStore.getState();
    point(task.id);
    return () => leave(task.id);
  }, [wiring, task.id]);

  const startNow = useStartNowItems(task.id);
  /* BIG-3 — the board card's switch, from the same hook. An ignored task has
     no score, so its cell says "Ignored" rather than a dash that reads as
     "not scored yet". */
  const ignoreItems = useIgnoreItems({ kind: 'task', id: task.id }, task.title, task.listId);
  const workedItems = useWorkedItems({ kind: 'task', id: task.id });
  const ignored = reading.ignored;
  const menuItems: MorphMenuItem[] = [
    /* No "Open task" (his BASE list, 2026-10-06): tapping the row opens it. */
    /* BUILD-2. Empty for a finished task; a blocked one offers what it waits on. */
    ...startNow,
    /* The same section the board card carries, from the same builder, so the
       two views of one task cannot offer different verbs. */
    ...(done ? [] : [{ divider: true }, ...emergencyMenuItems({
      level: emergency,
      lapsed: emergencyLapsed,
      onSet: (level) => setEmergencyBoost(task.id, level),
    })]),
    /* BIG-3, in a group of its own: placed anywhere above it sat under the
       Emergency or the "Blocked · start first" heading and read as part of it. */
    { divider: true },
    ...ignoreItems,
    ...workedItems,
    { divider: true },
    {
      value: 'delete',
      label: 'Delete task',
      icon: <Icon name="trash-2" size={18} />,
      tone: 'danger',
      confirm: {
        label: `Delete ${task.title}?`,
        hint: sub.total > 0
          ? `${sub.total} subtask${sub.total === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`
          : 'Recoverable from Trash for 30 days.',
        onConfirm: () => onDelete(task),
      },
    },
  ];

  /* The source's single sub-line: whichever ONE of these applies, in this
     order. A table row gets one line of prose, not four. */
  const subline = live
    ? <StatusPill status="running" size="sm">{alloc > 0 ? `Running · ${elapsed}/${alloc} min` : 'Running'}</StatusPill>
    : blockingTasks.length > 0
      ? (
        <BlockedLine
          on={blockingTasks[0].title}
          extra={blockingTasks.length - 1}
          title={`Blocked by: ${blockingTasks.map((t) => t.title).join(', ')}`}
          onPress={() => useWireStore.getState().pin(task.id)}
        />
      )
      : repeat
        ? <Fact icon="repeat" title={repeat}>{repeat}</Fact>
        : null;

  return (
    /* 29-1P6b (17): the board card's swipe, the same two verbs. */
    <SwipeRow
      radius="var(--r-xs)"
      right={selectMode ? null : doneSide(done, locked, (row) => pressTick(row.querySelector('.ag-check__box'), done, () => onToggleDone(task)))}
      left={selectMode ? null : tomorrowSide(done, () => startTaskTomorrow(task.id, task.title))}
    >
      {/* A `motion.div` since 29-1P4b for one thing only — idea 55's glide: a
         row ticked or unticked moves to its new place instead of jumping, and
         one hidden by Show done fades as the rest close up. `layout="position"`
         writes a transform while it moves and nothing else, and there is no
         `animate`, so the `[data-done]` / `[data-locked]` opacities in
         `screens.css` still reach this row (the board card's trap, avoided). */}
      <motion.div
        layout="position"
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ layout: ROW_GLIDE, opacity: { duration: 0.14 }, scale: { duration: 0.14 } }}
        className="ag-card ag-row"
        {...dustAttr('task', task.id)}
        data-ai-subject={isAskSubject ? 'true' : undefined}
        data-done={done ? 'true' : 'false'}
        data-locked={locked ? 'true' : 'false'}
        onHoverStart={() => { setHovered(true); setQuickBuilt(true); }}
        onHoverEnd={() => setHovered(false)}
        onClick={(e) => {
          if (pressedAControl(e)) return;
          if (selectMode) { onSelect(task.id); return; }
          onOpen(task);
        }}
        style={{
          display: 'grid', gridTemplateColumns: wide ? GRID_WIDE : GRID_TIGHT,
          alignItems: 'center', gap: 'var(--sp-5)',
          /* 29-1P7c (159): shorter rows in the denser looks. */
          minHeight: comfy ? 60 : density === 'compact' ? 46 : 40,
          padding: density === 'minimal' ? 'var(--sp-3) var(--sp-6)' : 'var(--sp-4) var(--sp-6)',
          /* The board card's guard, which this row lacked (FIX-9): nothing in a
             cell can push past the row's rounded edge. */
          overflow: 'hidden',
          /* FIX-9, with the board card: flatter corners, and running and
             selected told apart — running by the rippling pill, selected by an
             emerald rim, neither by a fill. `TaskRow.tsx` has the reasoning,
             and since V3-3 the rim itself (`SELECTED_RIM`, the design's). */
          borderRadius: 'var(--r-xs)',
          /* 29-1P7b (160): the board card's lime wash, under the same rule. */
          ...withStepWash(isAskSubject ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)', sub.done, sub.total),
          boxShadow: selected
            ? SELECTED_RIM
            : isAskSubject ? AI_SUBJECT_RIM : 'var(--glass-rim-1)',
          cursor: 'pointer',
          transition: `background-image var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass), min-height var(--dur-base) var(--ease-glide), padding var(--dur-base) var(--ease-glide), ${STEP_WASH_TRANSITION}`,
        }}
      >
        {selectMode ? (
          <button
            type="button"
            aria-pressed={selected}
            aria-label={selected ? `Deselect ${task.title}` : `Select ${task.title}`}
            onClick={(e) => { e.stopPropagation(); onSelect(task.id); }}
            style={{
              flex: '0 0 auto', width: 42, height: 42, margin: -9, padding: 0, border: 0,
              display: 'grid', placeItems: 'center', background: 'transparent', cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'grid', placeItems: 'center', width: 24, height: 24,
                borderRadius: 'var(--r-xs)',
                backgroundImage: selected ? 'var(--glass-tint-lime)' : 'var(--glass-well)',
                boxShadow: selected
                  ? 'var(--glass-rim-2), var(--job-lime-shine)'
                  : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
                color: 'var(--fg-1)',
              }}
            >
              {selected && <Icon name="check" size={14} />}
            </span>
          </button>
        ) : (
          <Tick
            done={done}
            locked={locked}
            label={lockReason ?? (done ? `Mark ${task.title} not done` : `Mark ${task.title} done`)}
            onToggle={() => onToggleDone(task)}
          />
        )}

        {/* No `gap` since 29-1P7c: the sub-line is a `Fold` carrying its own. */}
        <div style={{ minWidth: 0, display: 'grid' }}>
          {/* Red Alert rides the TITLE line, not the sub-line and not the Score
              column. The sub-line is the source's single line of prose and a
              row that is on red alert is very often the row that is blocked, so
              it would displace the more useful sentence; the Score column is a
              fixed 54px and cannot hold a second object. `compact` keeps the
              ripple and drops the word. */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
            <FadingTitle
              style={{
                flex: '0 1 auto', minWidth: 0,
                font: 'var(--type-body)', color: done ? 'var(--fg-3)' : 'var(--fg-1)',
                transition: 'color var(--dur-base) var(--ease-glass)',
              }}
            >
              {/* 29-1P4b: the line slides through on a tick. */}
              {task.milestone && <MilestoneMark />}
              <Strike on={done}>{task.title}</Strike>
            </FadingTitle>
            {repeatCount > 1 && <RepeatCount count={repeatCount} />}
            {/* 29-1P7a (idea 162): one badge at a time, Red Alert before an
                Emergency, the other behind "+1". The score is NOT folded in
                here, unlike on the board's card: in this view it is a column
                of its own, and a column with "+1" in some rows would stop
                reading as one. `compact` for both, and for the same reason:
                the Task column is `minmax(150px, 1fr)` at the tight grid and
                the title has first call on it. The glyph and the level
                survive; the word does not need to, since the tooltip says it. */}
            <BadgeFold
              gap={6}
              items={density === 'minimal' ? [] : [
                !done && reading.redAlert && { key: 'alert', node: <RedAlertBadge redAlert compact /> },
                !done && emergency > 0 && { key: 'emergency', node: <EmergencyMark level={emergency} lapsed={emergencyLapsed} compact /> },
              ]}
            />
          </span>
          {(subline || listLabel || sub.total > 0 || (task.avoidedCount ?? 0) > 0) && (<Fold open={comfy} gap="3px">
            {/* The source's single line of prose, plus the one measured fact that
               does not compete with it. `Avoided ×3` is four characters of mono
               at the end of a line that is otherwise a sentence — it does not
               displace the sentence, which is what putting it *into* the
               `subline` chain would have done. Clipped sideways only (29-1P7b):
               on a narrow Task column the step dots ran under the Due cell,
               and `clip` on x alone keeps their tall tap area, which a plain
               `hidden` would cut. In a Fold since 29-1P7c: the denser
               looks fold it away. */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0, overflowX: 'clip', overflowY: 'visible' }}>
              {/* 29-1P9a (158): grouped by date or Score, a row says which
                  list it is from, first on the line, quietly. */}
              {listLabel && (
                <span
                  title={`In ${listLabel}`}
                  style={{
                    flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    font: 'var(--type-caption)', color: 'var(--fg-4)',
                  }}
                >
                  {listLabel}
                </span>
              )}
              {subline}
              {/* 29-1P7b (ideas 12, 163): the board card's dots, and the same
                  press unfolds the steps under the row to tick. Beside the
                  sentence, not one of its choices — it used to be the last
                  of them, so a running, blocked or repeating task never
                  showed its steps and could not unfold them. */}
              {sub.total > 0 && (
                <StepTrack done={sub.done} total={sub.total} open={stepsOpen} onToggle={() => setStepsOpen((v) => !v)} title={task.title} style={{ flex: '0 0 auto' }} />
              )}
              <AvoidedMark count={task.avoidedCount} tone={done ? 'var(--fg-4)' : undefined} />
            </span>
          </Fold>)}
        </div>

        <span style={{ textAlign: 'right', minWidth: 0 }}>
          {/* 29-1P7a: the tiny calendar page, as on the board's card. */}
          {task.deadline && !done
            ? <DueDate deadline={task.deadline} style={{ justifyContent: 'flex-end', maxWidth: '100%' }} />
            : <span style={{ ...MONO, color: 'var(--fg-4)' }}>—</span>}
        </span>

        <span style={{ ...MONO, textAlign: 'right', color: done ? 'var(--fg-4)' : 'var(--fg-2)' }}>
          {alloc > 0 ? minutesLabel(alloc) : '—'}
        </span>

        <span style={{ display: 'grid', justifyItems: 'end' }}>
          {score > 0
            ? <ScoreDial value={score} max={scores.peak} alert={!done && reading.redAlert} warm={!done} size="sm" />
            : <span style={{ ...MONO, color: 'var(--fg-4)' }}>{ignored && !done ? 'Ignored' : '—'}</span>}
        </span>

        <span style={{ display: 'flex', justifySelf: 'end', gap: 2 }}>
        {/* BUILD-4 — always visible, unlike the ⋯ beside it; see the board card. */}
        {onAsk && !selectMode && (
          <IconButton
            size="sm"
            variant="plain"
            label={`Ask AI about ${task.title}`}
            aria-pressed={isAskSubject ? true : undefined}
            onClick={(e) => { e.stopPropagation(); onAsk(task); }}
            style={askInk(isAskSubject)}
          >
            <Icon name="sparkles" size={16} />
          </IconButton>
        )}
        <span
          className="ag-card-actions ag-quick-host"
          data-open={menuOpen ? 'true' : 'false'}
          style={{ display: 'flex' }}
        >
          {/* 29-1P7c (161): the board card's quick actions, the same rules. */}
          {quickBuilt && !done && !selectMode && (
            <QuickActions task={task} locked={locked} active={hovered} onToggleDone={onToggleDone} />
          )}
          <MorphMenu
            align="end"
            width={244}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            /* The table pane is `overflow-x: auto`, which is a scrollport, and
               an in-flow panel cannot escape one. MorphMenu's port note 4. */
            portal
            zIndex={Z.dropdown}
            trigger={
              <IconButton size="sm" variant="ghost" label={`Actions for ${task.title}`}>
                <Icon name="ellipsis" size={16} />
              </IconButton>
            }
            header={{ title: task.title, meta: score > 0 ? `score ${score.toFixed(1)}` : '' }}
            items={menuItems}
          />
        </span>
        </span>

        {/* The unfolded steps take the whole width of the row, starting under
            the title. A grid child of their own, so the row's columns above
            are untouched. */}
        <AnimatePresence initial={false}>
          {stepsOpen && comfy && sub.total > 0 && (
            <motion.div
              key="steps"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ gridColumn: '2 / -1', overflow: 'hidden' }}
            >
              <div
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-2)',
                  paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--line-faint)',
                }}
              >
                <SubtaskPreviewTree subtasks={task.subtasks ?? []} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </SwipeRow>
  );
}

export interface ListTableProps {
  lists: TaskList[];
  tasksByList: Record<string, Task[]>;
  /** FIX-9: finished occurrences folded into a row, by that row's task id. */
  repeatCounts?: Record<string, number>;
  selectedIds: Set<string>;
  selectMode: boolean;
  onSelectTask: (id: string) => void;
  onOpenTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onToggleTaskDone: (task: Task) => void;
  /** BUILD-4: open the AI panel on a task, or on a list. */
  onAskTask?: (task: Task) => void;
  onAskList?: (listId: string) => void;
  askSubject?: { kind: 'list' | 'task'; id: string } | null;
  /**
   * 29-1P6c, idea 91: these are the project's own Backburner, pulled down
   * above the table. Tinted indigo, an empty one still says so (rather than
   * vanishing like an empty working list), and a button tucks it away.
   */
  onTuck?: () => void;
  /**
   * 29-1P9a (idea 158): By list (as it always was), By due date or By Score
   * (his call: "By priority" is the Score). The Backburner's table is always
   * by list.
   */
  groupBy?: GroupBy;
  /** The table's own box, for the regroup glide (`regroupGlide.ts`). */
  rootRef?: RefObject<HTMLDivElement | null>;
}

/** One group's heading when grouped by date or Score: its dot, its name, how many. */
export function GroupHeading({ label, ink, count }: { label: string; ink: string | null; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: '0 var(--sp-6) var(--sp-2)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-label)', color: 'var(--fg-2)' }}>
        {ink && (
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', backgroundColor: ink }} />
        )}
        {label}
      </span>
      <span style={{ ...MONO, color: 'var(--fg-4)' }}>{count}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
    </div>
  );
}

export default function ListTable({
  lists, tasksByList, repeatCounts, selectedIds, selectMode, onSelectTask, onOpenTask, onDeleteTask, onToggleTaskDone,
  onAskTask, onAskList, askSubject, onTuck, groupBy = 'list', rootRef,
}: ListTableProps) {
  const wide = useMedia(TABLE_WIDE);
  const grid = wide ? GRID_WIDE : GRID_TIGHT;
  const scores = usePriorityScores();
  const by: GroupBy = onTuck ? 'list' : groupBy;
  useRegroupGlide(rootRef, by);

  /* 29-1P9a (158): every task once — one shared into a second list shows a
     row in both lists, but here it is one task in one group — sorted into the
     date or Score groups. Computed only while grouped that way. */
  const groups = useMemo(() => {
    if (by === 'list') return null;
    const seen = new Set<string>();
    const all: Task[] = [];
    for (const list of lists) {
      for (const t of tasksByList[list.id] ?? []) {
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        all.push(t);
      }
    }
    const byScore = byScoreDesc(scores);
    if (by === 'score') {
      return groupInto(SCORE_GROUPS, all, (t) => {
        const r = scores.read(t);
        return scoreGroupOf({
          done: t.status === 'completed', redAlert: r.redAlert, emergency: r.variables.emergency > 0,
          score: r.score, peak: scores.peak,
        });
      }, byScore);
    }
    const now = new Date(scores.now);
    const zone = resolveUserTimeZone();
    const dueAt = (t: Task) => parseStoredDate(t.deadline, zone)?.getTime() ?? Infinity;
    /* Soonest first inside a day or a week, the score breaking a tie. */
    return groupInto(DUE_GROUPS, all, (t) => dueGroupOf(t, now, zone), (a, b) => dueAt(a) - dueAt(b) || byScore(a, b));
  }, [by, lists, tasksByList, scores]);

  const row = (task: Task, listLabel?: string) => (
    <TableRow
      key={task.id}
      task={task}
      wide={wide}
      selected={selectedIds.has(task.id)}
      selectMode={selectMode}
      onSelect={onSelectTask}
      onOpen={onOpenTask}
      onDelete={onDeleteTask}
      onToggleDone={onToggleTaskDone}
      onAsk={onAskTask}
      isAskSubject={askSubject?.kind === 'task' && askSubject.id === task.id}
      repeatCount={repeatCounts?.[task.id]}
      listLabel={listLabel}
    />
  );

  return (
    <div
      ref={rootRef}
      className="ag-scroll-x"
      style={{
        display: 'grid', gap: 'var(--sp-7)', padding: 'var(--pad-card)',
        borderRadius: 'var(--r-card)',
        /* The board's pane exactly — floor, quiet sheen and rim; see
           `LIST_PANE_FLOOR` and `LIST_PANE_FILL` in `ListColumn`. */
        backgroundImage: onTuck ? `${PARKED_WASH}, ${LIST_PANE_FILL}` : LIST_PANE_FILL,
        backgroundColor: LIST_PANE_FLOOR,
        backdropFilter: 'var(--glass-bd-md-refract)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: LIST_PANE_SHADOW,
      }}
    >
      {/* The parked table sits above the main one, which carries the headings. */}
      {!onTuck && (
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 'var(--sp-5)', padding: '0 var(--sp-6)' }}>
        <span />
        <span className="ag-kicker">Task</span>
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Due</span>
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Allocated</span>
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Score</span>
        <span />
      </div>
      )}

      {groups && groups.map(({ spec, tasks }) => (
        <section key={`group:${spec.key}`} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <GroupHeading label={spec.label} ink={spec.ink} count={tasks.length} />
          <AnimatePresence initial={false}>
            {tasks.map((task) => row(task, getListTitle(lists, task.listId, task.listName)))}
          </AnimatePresence>
        </section>
      ))}

      {!groups && lists.map((list) => {
        /* Finished rows last, whatever they score (29-1P4b, idea 55): a tick
           sinks its row to the bottom of its list and the rest slide up. */
        const byScore = byScoreDesc(scores);
        const tasks = (tasksByList[list.id] ?? []).slice().sort((a, b) => (
          Number(a.status === 'completed') - Number(b.status === 'completed') || byScore(a, b)
        ));
        if (tasks.length === 0 && !onTuck) return null;
        const all = tasksByList[list.id] ?? [];
        const folded = all.reduce((n, t) => n + (repeatCounts?.[t.id] ?? 1) - 1, 0);
        const minutesLeft = workLeftMinutes(all);
        const value = taskListValueINR(all, list.id);

        return (
          <section key={list.id} {...dustAttr('list', list.id)} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: '0 var(--sp-6) var(--sp-2)' }}>
              <span style={{ font: 'var(--type-label)', color: onTuck ? 'var(--job-indigo)' : 'var(--fg-2)' }}>{list.title}</span>
              <span style={{ ...MONO, color: 'var(--fg-4)' }}>{doneCount(all) + folded}/{all.length + folded}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
              {minutesLeft > 0 && (
                <span style={{ ...MONO, color: 'var(--fg-4)' }}>{minutesLabel(minutesLeft)} left</span>
              )}
              {value > 0 && <span style={{ ...MONO, color: 'var(--fg-3)' }}>{formatINR(value)}</span>}
              {onTuck && (
                <IconButton size="sm" variant="ghost" label="Tuck the Backburner away" onClick={onTuck}>
                  <Icon name="chevron-up" size={15} />
                </IconButton>
              )}
              {onAskList && (
                <IconButton
                  size="sm"
                  variant="plain"
                  label={`Ask AI about ${list.title}`}
                  aria-pressed={askSubject?.kind === 'list' && askSubject.id === list.id ? true : undefined}
                  onClick={() => onAskList(list.id)}
                  style={askInk(askSubject?.kind === 'list' && askSubject.id === list.id)}
                >
                  <Icon name="sparkles" size={15} />
                </IconButton>
              )}
            </div>

            {tasks.length === 0 && (
              <LitLine
                as="p"
                text="**Nothing parked.** Move a task here from **its sheet**, or **drag one in**."
                style={{ padding: '0 var(--sp-6)', font: 'var(--type-caption)', color: 'var(--fg-3)' }}
              />
            )}
            <AnimatePresence initial={false}>
            {tasks.map((task) => row(task))}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
