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
 * The two grids are the source's. Tags are the first column to go when it
 * gets narrow — they are the only one that is not a number with a heading —
 * and the cut is at 1080px, which is the mockup's own `wide`, not the app's
 * 960px rail breakpoint.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Icon, IconButton, MorphMenu, ScoreDial, StatusPill, useMedia, type MorphMenuItem,
} from '../../ui';
import { BlockedLine, Fact, RepeatCount, Tag, Tick } from './parts';
import { SELECTED_RIM } from './TaskRow';
import { LIST_PANE_FILL, LIST_PANE_FLOOR, LIST_PANE_SHADOW } from './ListColumn';
import {
  byScoreDesc, deadlineLabel, doneCount, elapsedMinutes, minutesLabel, repeatLabel,
  subtaskCount, workLeftMinutes,
} from './derive';
import { pressedAControl } from './cardPress';
import { Z } from '../../lib/zLayers';
import {
  useStore, formatINR, getBlockingTasks, taskLockReason, taskListValueINR,
  type Task, type TaskList,
} from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { RedAlertBadge } from '../task-fields/RedAlertBadge';
import { AvoidedMark, EmergencyMark } from '../task-fields/TaskMarks';
import { emergencyMenuItems } from '../task-fields/emergencyMenu';
import { useStartNowItems } from '../task-fields/startNowMenu';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { AI_SUBJECT_RIM } from '../../ui/overlay/AIPanel';

/** The mockup's own breakpoint for this table, not the app's rail one. */
const TABLE_WIDE = '(min-width: 1080px)';

/* The last column holds two 34px buttons since BUILD-4 — the AI panel's,
   always visible, and the ⋯ menu beside it. */
const GRID_WIDE = '24px minmax(220px, 1fr) auto 96px 84px 54px 72px';
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
  repeatCount = 1,
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
}) {
  const [menuOpen, setMenuOpen] = useState(false);
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
  const deadlineInfo = task.deadline && !done ? deadlineLabel(task.deadline) : null;
  const blockingTasks = done ? [] : getBlockingTasks(backlogTasks, task);
  /* Item 19's lock, read the same way the board card reads it — one test and
     one sentence, so the two views of one task cannot disagree about whether it
     can be ticked or about what it is waiting for. */
  const lockReason = taskLockReason(backlogTasks, task);
  const locked = lockReason !== undefined;
  const repeat = repeatLabel(task, new Date(), resolveUserTimeZone());

  const startNow = useStartNowItems(task.id);
  const menuItems: MorphMenuItem[] = [
    {
      value: 'open',
      label: 'Open task',
      icon: <Icon name="panel-right-open" size={18} />,
      meta: <Icon name="chevron-right" size={16} />,
      onSelect: () => onOpen(task),
    },
    /* BUILD-2. Empty for a finished task; a blocked one offers what it waits on. */
    ...startNow,
    /* The same section the board card carries, from the same builder, so the
       two views of one task cannot offer different verbs. */
    ...(done ? [] : emergencyMenuItems({
      level: emergency,
      count: scores.emergencyCount,
      lapsed: emergencyLapsed,
      onSet: (level) => setEmergencyBoost(task.id, level),
    })),
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
        />
      )
      : repeat
        ? <Fact icon="repeat" title={repeat}>{repeat}</Fact>
        : sub.total > 0
          ? <Fact icon="corner-down-right">{sub.done}/{sub.total} subtasks</Fact>
          : null;

  return (
    <div
      className="ag-card ag-row"
      data-ai-subject={isAskSubject ? 'true' : undefined}
      data-done={done ? 'true' : 'false'}
      data-locked={locked ? 'true' : 'false'}
      onClick={(e) => {
        if (pressedAControl(e)) return;
        if (selectMode) { onSelect(task.id); return; }
        onOpen(task);
      }}
      style={{
        display: 'grid', gridTemplateColumns: wide ? GRID_WIDE : GRID_TIGHT,
        alignItems: 'center', gap: 'var(--sp-5)',
        minHeight: 60, padding: 'var(--sp-4) var(--sp-6)',
        /* The board card's guard, which this row lacked (FIX-9): nothing in a
           cell can push past the row's rounded edge. */
        overflow: 'hidden',
        /* FIX-9, with the board card: flatter corners, and running and
           selected told apart — running by the rippling pill, selected by an
           emerald rim, neither by a fill. `TaskRow.tsx` has the reasoning,
           and since V3-3 the rim itself (`SELECTED_RIM`, the design's). */
        borderRadius: 'var(--r-xs)',
        backgroundImage: isAskSubject ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        boxShadow: selected
          ? SELECTED_RIM
          : isAskSubject ? AI_SUBJECT_RIM : 'var(--glass-rim-1)',
        cursor: 'pointer',
        transition: 'background-image var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass)',
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
              backgroundImage: selected ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
              boxShadow: selected
                ? 'var(--glass-rim-2), var(--glow-accent-sm)'
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

      <div style={{ minWidth: 0, display: 'grid', gap: 3 }}>
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
              textDecorationLine: done ? 'line-through' : 'none', textDecorationColor: 'var(--fg-4)',
            }}
          >
            {task.title}
          </FadingTitle>
          {repeatCount > 1 && <RepeatCount count={repeatCount} />}
          {!done && <RedAlertBadge redAlert={reading.redAlert} compact />}
          {/* `compact` here too, and for the same reason the pill is: the Task
              column is `minmax(150px, 1fr)` at the tight grid and the title has
              first call on it. The glyph and the level survive; the word does
              not need to, since the tooltip says it. */}
          {!done && <EmergencyMark level={emergency} lapsed={emergencyLapsed} compact />}
        </span>
        {(subline || (task.avoidedCount ?? 0) > 0) && (
          /* The source's single line of prose, plus the one measured fact that
             does not compete with it. `Avoided ×3` is four characters of mono
             at the end of a line that is otherwise a sentence — it does not
             displace the sentence, which is what putting it *into* the
             `subline` chain would have done. */
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            {subline}
            <AvoidedMark count={task.avoidedCount} tone={done ? 'var(--fg-4)' : undefined} />
          </span>
        )}
      </div>

      {wide && (
        <span style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'nowrap', overflow: 'hidden' }}>
          {(task.tags ?? []).map((tag) => <Tag key={tag}>#{tag}</Tag>)}
        </span>
      )}

      <span style={{ textAlign: 'right', minWidth: 0 }}>
        {deadlineInfo
          ? (deadlineInfo.urgent
            ? <StatusPill status="review" size="sm">{deadlineInfo.text}</StatusPill>
            : <span style={{ ...MONO, color: 'var(--fg-3)' }}>{deadlineInfo.text}</span>)
          : <span style={{ ...MONO, color: 'var(--fg-4)' }}>—</span>}
      </span>

      <span style={{ ...MONO, textAlign: 'right', color: done ? 'var(--fg-4)' : 'var(--fg-2)' }}>
        {alloc > 0 ? minutesLabel(alloc) : '—'}
      </span>

      <span style={{ display: 'grid', justifyItems: 'end' }}>
        {score > 0
          ? <ScoreDial value={score} max={scores.peak} alert={!done && reading.redAlert} size="sm" />
          : <span style={{ ...MONO, color: 'var(--fg-4)' }}>—</span>}
      </span>

      <span style={{ display: 'flex', justifySelf: 'end', gap: 2 }}>
      {/* BUILD-4 — always visible, unlike the ⋯ beside it; see the board card. */}
      {onAsk && !selectMode && (
        <IconButton
          size="sm"
          variant="ghost"
          label={`Ask AI about ${task.title}`}
          aria-pressed={isAskSubject ? true : undefined}
          onClick={(e) => { e.stopPropagation(); onAsk(task); }}
          style={{ color: isAskSubject ? 'var(--fg-1)' : 'var(--fg-3)' }}
        >
          <Icon name="sparkles" size={16} />
        </IconButton>
      )}
      <span
        className="ag-card-actions"
        data-open={menuOpen ? 'true' : 'false'}
      >
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
    </div>
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
}

export default function ListTable({
  lists, tasksByList, repeatCounts, selectedIds, selectMode, onSelectTask, onOpenTask, onDeleteTask, onToggleTaskDone,
  onAskTask, onAskList, askSubject,
}: ListTableProps) {
  const wide = useMedia(TABLE_WIDE);
  const grid = wide ? GRID_WIDE : GRID_TIGHT;
  const scores = usePriorityScores();

  return (
    <div
      className="ag-scroll-x"
      style={{
        display: 'grid', gap: 'var(--sp-7)', padding: 'var(--pad-card)',
        borderRadius: 'var(--r-card)',
        /* The board's pane exactly — floor, quiet sheen and rim; see
           `LIST_PANE_FLOOR` and `LIST_PANE_FILL` in `ListColumn`. */
        backgroundImage: LIST_PANE_FILL,
        backgroundColor: LIST_PANE_FLOOR,
        backdropFilter: 'var(--glass-bd-md-refract)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: LIST_PANE_SHADOW,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 'var(--sp-5)', padding: '0 var(--sp-6)' }}>
        <span />
        <span className="ag-kicker">Task</span>
        {wide && <span />}
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Due</span>
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Allocated</span>
        <span className="ag-kicker" style={{ textAlign: 'right' }}>Score</span>
        <span />
      </div>

      {lists.map((list) => {
        const tasks = (tasksByList[list.id] ?? []).slice().sort(byScoreDesc(scores));
        if (tasks.length === 0) return null;
        const all = tasksByList[list.id] ?? [];
        const folded = all.reduce((n, t) => n + (repeatCounts?.[t.id] ?? 1) - 1, 0);
        const minutesLeft = workLeftMinutes(all);
        const value = taskListValueINR(all, list.id);

        return (
          <section key={list.id} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: '0 var(--sp-6) var(--sp-2)' }}>
              <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>{list.title}</span>
              <span style={{ ...MONO, color: 'var(--fg-4)' }}>{doneCount(all) + folded}/{all.length + folded}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
              {minutesLeft > 0 && (
                <span style={{ ...MONO, color: 'var(--fg-4)' }}>{minutesLabel(minutesLeft)} left</span>
              )}
              {value > 0 && <span style={{ ...MONO, color: 'var(--fg-3)' }}>{formatINR(value)}</span>}
              {onAskList && (
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={`Ask AI about ${list.title}`}
                  aria-pressed={askSubject?.kind === 'list' && askSubject.id === list.id ? true : undefined}
                  onClick={() => onAskList(list.id)}
                  style={{ color: askSubject?.kind === 'list' && askSubject.id === list.id ? 'var(--fg-1)' : 'var(--fg-3)' }}
                >
                  <Icon name="sparkles" size={15} />
                </IconButton>
              )}
            </div>

            {tasks.map((task) => (
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
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
