/**
 * New Session — one task row (UI-14, RECONCILED against `screens/session.html`
 * at UI-31).
 *
 * ONE component serves both halves of the screen. That is the point of the
 * split: "Available" and "Today" were two copy-pasted 90-line blocks inside
 * `TaskSelection.tsx` that had already drifted — the available row showed a
 * "Blocked by" warning the queued row did not, the queued row showed a subtask
 * marker the available row did not, and the two lists animated in from
 * different directions. They are one anatomy with two verbs now, so a change
 * to the anatomy cannot land on only one side. The mockup composes its two
 * rows as separate `TaskCard`/`QueueRow` functions and they are 90% identical,
 * which is the same drift starting again; the shared component is production
 * structure and it stays.
 *
 * `side` is what differs, and it is only these things:
 *
 *   available — no position number, carries the "Blocked by" line (the thing
 *               you want to know BEFORE you commit), and its last menu action
 *               deletes the task.
 *   queued    — leads with its position in the queue, is a `SortableRow`
 *               handle, and its last action takes the task back out of today
 *               without touching the store of record.
 *
 * WHAT UI-31 TOOK FROM THE MOCKUP
 * -------------------------------
 * - **The `SelectDot`** — see that file. It replaced two different dead glyphs
 *   AND the row-wide `<button>`, and it is why the row is no longer a button:
 *   a real control cannot be nested inside one. UI-14 made the row a button
 *   because the left-hand list *"could not be reached from the keyboard at
 *   all"*; the dot answers that properly, since it is the same control on both
 *   sides and it announces its own state.
 * - **The material came down a rung.** `--r-md` and `--sp-5 --sp-6` on
 *   `--glass-fill-1 / --glass-rim-1` under `--glass-bd-sm`, lifting to
 *   `--glass-fill-2` and `--glass-rim-2, --glass-cast-2` on hover, plus the
 *   2px sideways nudge. It was `--r-card` on a permanent `--glass-fill-2 /
 *   rim-2, inner-1, cast-1` with `--glass-bd-md` — a resting level-2 pane for
 *   every one of forty rows, so nothing changed when you pointed at one.
 *   Byte-for-byte the material `project.html` gives `.trow`, which is what
 *   `project/TaskRow.tsx` already carries.
 * - **`ScoreDial size="sm"` beside the title**, in place of `ScoreChip` on the
 *   meta line. UI-14 put it on the meta line so a column of scores shared one
 *   x; the source answers from the other edge — the score belongs to the title
 *   it qualifies — and with the component the design system actually ships.
 *   Same swap UI-29 made on the board. `ScoreChip` is **deleted** since item
 *   16 — the surfaces it was left on no longer show a score at all — and the
 *   compact Red Alert pill rides beside the chip on this row.
 * - **The estimate is on the meta line**, in `--type-numeric`. It was nowhere
 *   on this screen, which is what made a queue of five tasks unreadable as a
 *   plan: the budget bar UI-31 added is the sum of exactly these numbers, and
 *   a total whose parts are invisible is a number you cannot check.
 * - **A queued row states its position.** Tabular, 16px wide, ahead of the
 *   dot — order is the whole point of the right-hand list and it was implicit
 *   in the row order alone.
 *
 * THINGS WORTH NOT RE-LEARNING
 *
 * 0. **BLOCKED IS A LOCK ON THIS SCREEN NOW (item 19), AND `side` NO LONGER
 *    DECIDES WHO SEES IT.** The note under `side` used to say the available
 *    row carries the "Blocked by" line as *"the thing you want to know BEFORE
 *    you commit"*, and the queued row did not. Both carry it now, because it
 *    stopped being a thing to know and became a thing that stops you: a locked
 *    row cannot be picked with the dot and cannot be ticked in Focus Mode, so
 *    a locked task sitting in TODAY is the case most worth seeing — it is
 *    reachable from Smart Start, which admits a blocker and its dependent as a
 *    group, and it stays locked until the blocker is actually finished.
 *
 *    **The available side grows one control: "Schedule anyway".** It is the
 *    same verb, the same `zap`, and the same sentence Smart Start's held-back
 *    rows use, because it is the same decision taken on a different screen —
 *    and without it, hand-picking would be a door around a lock that Smart
 *    Start makes you press a button to open. It adds the task to today AND
 *    unlocks it there (`scheduledAnyway`, on the queue copy only). One press,
 *    not a toggle: the row leaves the available list the moment it lands in
 *    today, and the dot on the queued side is how you take it back out.
 *
 * 1. **Blocked is neutral, and the two mockups disagree about that.**
 *    `session.html` sets it as an amber `Kicker`; `project.html` draws the
 *    neutral `BlockedLine` and states the rule beside it — *"Blocked is
 *    stated, not shouted … A red box on a task you cannot start is noise you
 *    can't act on."* A rule written down beats a screen that merely differs,
 *    and UI-29 already built that component, so this row imports it rather
 *    than growing a third rendering of one fact. It also retires the
 *    `StatusPill status="review"` this row used to spend on it.
 * 2. **The actions are `.ag-card-actions` on an `.ag-card`, not
 *    `opacity-0 group-hover:opacity-100`.** There is no hover on the tablet,
 *    which is half of what this app runs on, so the old classes made every
 *    row's controls permanently invisible there and let keyboard focus land on
 *    controls nobody could see. `screens.css` writes the touch and
 *    `:focus-within` cases — and so does the source, in the `@media (hover:
 *    none), (pointer: coarse)` rule `project.html` pairs with its own.
 *    Those actions are **one `MorphMenu`**, not the mockup's four hover
 *    `IconButton`s: `.ag-card-actions` animates opacity and not layout, so
 *    four held ~120px of every row's width whether or not you could see them,
 *    and on a narrow pane that is what pushed long titles into an ellipsis.
 *    One trigger holds 34px. All four of the mockup's verbs still resolve
 *    without leaving the row — view opens the sheet, rename turns the title
 *    into a field, add-subtask grows a well underneath, delete arms in place —
 *    which is what its own comment asks for.
 *    `data-open` on the wrapper keeps the trigger visible while its own panel
 *    is up — `ProjectCard`'s pattern, since the pointer is over the panel and
 *    not the row while a menu is open. **The panel is portalled** (`portal` +
 *    `Z.dropdown`): a project card sits on a page that scrolls, these rows sit
 *    in a list that scrolls inside a pane that must not grow, and an in-flow
 *    panel was cut off by that pane — 179px of 308 on a tablet. See MorphMenu's
 *    port note 4.
 * 3. **Deleting a task arms inside the menu (UI-15).** Deletion is soft and
 *    the Trash holds it for 30 days, but it should still take two deliberate
 *    actions — and `MorphMenu`'s contract is that a destructive item confirms
 *    IN PLACE rather than opening a dialog, because a second modal loses the
 *    subject the menu is about. The mockup arms a rose strip in the row's own
 *    slot for the same reason. Taking a task back OUT of today does not
 *    confirm: it writes nothing to the store of record.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Icon, IconButton, MorphMenu, ScoreDial, type MorphMenuItem } from '../../ui';
import { BlockedLine } from '../project/parts';
import { SelectDot } from './SelectDot';
import { taskFocusSeconds, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { RedAlertBadge } from '../task-fields/RedAlertBadge';
import { AvoidedMark, EmergencyMark } from '../task-fields/TaskMarks';
import { formatSpan } from '../../lib/timeSpan';
import { Z } from '../../lib/zLayers';
import { archiveTask } from '../../lib/archive';

/** See `QueueSubtaskTree`'s copy — same field, same two reasons it stays an `<input>`. */
const INLINE_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: '0 0 3px',
  border: 0,
  borderBottom: '1px solid var(--accent-hairline)',
  borderRadius: 0,
  outline: 'none',
  background: 'transparent',
  font: 'var(--type-title)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

export interface TaskRowProps {
  task: Task;
  /** Which list this row is in. See the header — it is the only difference. */
  side: 'available' | 'queued';
  /** Resolved through `getListTitle`, which is where the fallbacks live. */
  listTitle: string;
  /** Prerequisites that are not done yet. **Both sides** — see note 0. */
  blockedBy?: Task[];
  /**
   * Waiting on unfinished work and not overridden — `taskLockReason`'s
   * sentence, or absent. Kept separate from `blockedBy.length > 0` because a
   * task in today's queue can be blocked AND unlocked at once: that is exactly
   * what "Schedule anyway" produces, and such a row should still state what it
   * is waiting on without locking anything.
   */
  lockReason?: string;
  /**
   * Available side, locked rows only: add this task to today *and* unlock it
   * there. Absent on the queued side, where the task is already in.
   */
  onScheduleAnyway?: () => void;
  /** dnd-kit is mid-drag on this row. Queued side only. */
  isDragging?: boolean;
  /** Zero-based position in today's queue. Queued side only — the row prints `index + 1`. */
  index?: number;

  editing: boolean;
  editTitle: string;
  onEditTitleChange: (value: string) => void;
  /** Enter or blur. Writing the title back is the caller's job. */
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;

  /**
   * The `SelectDot`'s verb. Available: commit the task to today. Queued: take
   * it back out. Both sides pass one — it is the same control in two states.
   */
  onSelect: () => void;
  onDetails: () => void;
  /** Available side only — the queued row has no subtasks to add to. */
  onAddSubtask?: () => void;
  /** Available: delete the task. Queued: take it out of the queue. */
  onRemove: () => void;

  /** Whether the expanded area below the row is showing. */
  expanded: boolean;
  /** Omitted when there is nothing to expand — the chevron then does not render. */
  onToggleExpand?: () => void;
  /** The subtask tree and, on the available side, its inline add field. */
  children?: ReactNode;
}

export default function TaskRow({
  task,
  side,
  listTitle,
  blockedBy,
  lockReason,
  onScheduleAnyway,
  isDragging = false,
  index,
  editing,
  editTitle,
  onEditTitleChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onSelect,
  onDetails,
  onAddSubtask,
  onRemove,
  expanded,
  onToggleExpand,
  children,
}: TaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const scores = usePriorityScores();
  /* A queued row is a snapshot copy of a backlog task, and a subtask dragged
     into today is a proxy that is in no backlog at all — `read` answers for
     both, the proxy with its two graph variables at zero, which is the truth
     rather than an approximation. */
  const reading = scores.read(task);
  const score = reading.score;
  const queued = side === 'queued';
  const blocking = blockedBy ?? [];
  const locked = lockReason !== undefined;
  const subtaskCount = task.subtasks?.length ?? 0;
  const seconds = taskFocusSeconds(task);
  /* One test for "this row is being dealt with": pointed at, renamed, or its
     own menu is up. `.ag-card-actions` reveals the trigger off the same
     hover, so the two cannot disagree about which row is active. */
  const lifted = hover || menuOpen || editing;

  const heading = (
    <>
      {editing ? (
        <input
          autoFocus
          type="text"
          data-ag-field=""
          className="ag-field"
          value={editTitle}
          onChange={(e) => onEditTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit();
            if (e.key === 'Escape') onCancelEdit();
          }}
          onBlur={onCommitEdit}
          onClick={(e) => e.stopPropagation()}
          style={INLINE_FIELD}
        />
      ) : (
        /*
         * Two lines, never three: the title with the score it belongs to on
         * the first, everything that qualifies it on the second.
         *
         * UI-14 kept the score off this line — `.ag-card-actions` animates
         * opacity only, so a row's invisible controls still hold layout, and a
         * first attempt at a beside-the-title score ellipsised every long one.
         * The source puts it there anyway and UI-31 collapsed the five hover
         * buttons to one ⋯ trigger, which is where the room came from: the
         * `ScoreDial` chip is 22px wide-ish against the ~120px those buttons
         * used to hold. Same correction, and the same arithmetic, as UI-29 on
         * the project board.
         */
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
          {task.isSubtaskProxy && (
            <Icon
              name="corner-down-right"
              size={12}
              title="Individual subtask"
              style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}
            />
          )}
          <span
            title={task.title}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              font: 'var(--type-title)',
              color: 'var(--fg-1)',
            }}
          >
            {task.title}
          </span>
          <RedAlertBadge redAlert={reading.redAlert} compact />
          {/* **Read-only here, and that is deliberate.** The board's rows offer
              the flag from their ⋯ menu; these do not, because a queued row is
              a snapshot copy of a backlog task and the available side can be a
              subtask proxy — a write from this screen would have to decide
              which of the two it meant, and New Session's job is choosing what
              to do today rather than re-judging what matters. The mark still
              shows, because a flagged task arriving in today's queue is
              exactly what you want to see. */}
          <EmergencyMark
            level={task.emergencyBoost}
            lapsed={(task.emergencyBoost ?? 0) > 0 && reading.variables.emergency === 0}
            compact
          />
          {score > 0 && <ScoreDial value={score} max={scores.peak} alert={reading.redAlert} size="sm" />}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-4)',
          flexWrap: 'wrap',
          marginTop: 'var(--sp-2)',
          minWidth: 0,
        }}
      >
        <span
          style={{
            font: 'var(--type-kicker)',
            letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
            color: 'var(--fg-3)',
            whiteSpace: 'nowrap',
          }}
        >
          {listTitle}
          {task.isSubtaskProxy ? ' · Subtask' : ''}
        </span>
        {/*
          What this row costs the budget, in the mono face everything measured
          takes. `taskFocusSeconds` is the app's own authority for it — the
          allocation if one has been tuned, the task's standing estimate
          otherwise — so the number here is the one Focus Mode will count down,
          not a second reading of the same field.
        */}
        {seconds > 0 && (
          <span
            style={{
              font: 'var(--type-numeric)',
              fontSize: 'var(--text-xs)',
              color: queued ? 'var(--fg-3)' : 'var(--fg-4)',
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {formatSpan(seconds)}
          </span>
        )}
        {/* The task you keep pushing away, stated on the screen where you are
            deciding whether to pick it up again. */}
        <AvoidedMark count={task.avoidedCount} tone={queued ? 'var(--fg-3)' : 'var(--fg-4)'} />
        {blocking.length > 0 && (
          /* Neutral, and named — see note 1 at the top. The board's component,
             not a second rendering of the same fact. */
          <span style={{ display: 'flex', minWidth: 0 }}>
            <BlockedLine
              on={blocking[0].title}
              extra={blocking.length - 1}
              title={`Blocked by: ${blocking.map((t) => t.title).join(', ')}`}
            />
          </span>
        )}
        {/* The way past the lock, on the row the lock is on — see note 0.
            `zap` and the wording are Smart Start's, deliberately: one override,
            one name for it, whichever screen you happen to be building the day
            from. */}
        {locked && onScheduleAnyway && (
          <Button
            size="sm"
            variant="glass"
            iconLeft={<Icon name="zap" size={14} />}
            onClick={onScheduleAnyway}
            title="Add it to today even though it is waiting on something"
            style={{ flex: '0 0 auto' }}
          >
            Schedule anyway
          </Button>
        )}
      </div>
    </>
  );

  const body = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: 1, minWidth: 0 }}>
      {/* Order is the right-hand list's whole subject, so a queued row states
          its own. Tabular and fixed-width, or the rows below 9 shift. */}
      {queued && index != null && (
        <span
          aria-hidden="true"
          style={{
            font: 'var(--type-numeric)',
            fontSize: 'var(--text-xs)',
            color: 'var(--fg-4)',
            width: 16,
            flex: '0 0 auto',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {index + 1}
        </span>
      )}
      <SelectDot
        on={queued}
        locked={locked && !queued}
        onClick={onSelect}
        /* The app's one sentence, plus the one thing it cannot know: which
           screen you are on, and so what the way past it is called here. */
        label={
          locked && !queued && lockReason
            ? `${lockReason} Use Schedule anyway to put it in today regardless.`
            : queued ? `Remove ${task.title} from today` : `Add ${task.title} to today`
        }
      />
      <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {heading}
      </span>
    </div>
  );

  /*
   * The row's verbs, in the order you reach for them: look at it, rename it,
   * grow it, and only then the one that takes it away. `Add subtask` is
   * absent on the queued side (a queued row has nothing to add to) and the
   * expand row is absent when there is nothing under it — the same two
   * conditions the buttons carried, expressed as the props being undefined.
   */
  const items: MorphMenuItem[] = [
    { value: 'details', label: 'View details', icon: <Icon name="eye" size={18} />, onSelect: onDetails },
    { value: 'rename', label: 'Rename', icon: <Icon name="pencil" size={18} />, onSelect: onStartEdit },
    ...(onAddSubtask
      ? [{ value: 'add-subtask', label: 'Add subtask', icon: <Icon name="plus" size={18} />, onSelect: onAddSubtask }]
      : []),
    ...(onToggleExpand
      ? [{
        value: 'expand',
        label: expanded ? 'Hide subtasks' : 'Show subtasks',
        icon: <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />,
        meta: subtaskCount || undefined,
        onSelect: onToggleExpand,
      }]
      : []),
    { divider: true },
    /* BUILD-11 — the board row's pair. Backlog side only: a queued row may be
       a subtask's proxy, and a subtask archives with its parent. */
    ...(queued ? [] : [{
      value: 'archive',
      label: 'Archive task',
      icon: <Icon name="archive" size={18} />,
      confirm: {
        label: `Archive ${task.title}?`,
        hint: subtaskCount > 0
          ? `Out of every queue and Atlas, with its ${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'}. Kept for good.`
          : 'Out of every queue and Atlas. Kept for good.',
        action: 'Archive',
        onConfirm: () => { archiveTask(task.id); },
      },
    } satisfies MorphMenuItem]),
    queued
      ? {
        value: 'remove',
        label: 'Remove from today',
        icon: <Icon name="x" size={18} />,
        onSelect: onRemove,
      }
      : {
        value: 'delete',
        label: 'Delete task',
        icon: <Icon name="trash-2" size={18} />,
        tone: 'danger',
        confirm: {
          label: `Delete ${task.title}?`,
          hint: subtaskCount > 0
            ? `${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`
            : 'Recoverable from Trash for 30 days.',
          onConfirm: onRemove,
        },
      },
  ];

  return (
    <motion.div
      className="ag-card"
      /* Inspectable, and the same attribute the board's rows carry — the DIM
         is in `animate` below, for the reason written there. */
      data-locked={locked ? 'true' : 'false'}
      layout={!isDragging}
      /* Panes in this system arrive by CONDENSING, never by sliding in from
         off-screen (tokens/motion.css). The two lists used to disagree about
         this — one came in from below, the other from the right. */
      initial={{ opacity: 0, scale: 0.94 }}
      /* The mockup's `translateX(2px)` on hover, written as Framer's `x`
         rather than a CSS transform: `scale` here already writes
         `style.transform`, and the two would overwrite each other. */
      /* The locked dim rides in `animate` rather than on `screens.css`'s
         `.ag-row[data-locked]`, and it has to: this is a `motion.div` whose
         `animate` writes `style.opacity` INLINE, and an inline opacity beats
         any class. Same numbers as that rule — 0.62 at rest, all the way back
         the moment the row is `lifted` — because they are one treatment and
         the CSS is where it is written down. */
      animate={{
        opacity: locked && !lifted ? 0.62 : 1,
        scale: isDragging ? 1.02 : 1,
        x: lifted && !isDragging ? 2 : 0,
      }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      /* `.trow`'s material, which `project/TaskRow.tsx` already carries: a
         level-1 row that lifts on hover rather than a resting level-2 pane
         that cannot. The 2px nudge is the mockup's own. */
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '0 0 auto',
        borderRadius: 'var(--r-md)',
        padding: 'var(--sp-5) var(--sp-6)',
        backgroundImage: lifted ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        backdropFilter: 'var(--glass-bd-sm)',
        WebkitBackdropFilter: 'var(--glass-bd-sm)',
        boxShadow: isDragging
          ? 'var(--glass-rim-2), var(--glass-cast-3)'
          : lifted
            ? 'var(--glass-rim-2), var(--glass-cast-2)'
            : 'var(--glass-rim-1)',
        cursor: queued ? (isDragging ? 'grabbing' : 'grab') : undefined,
        transition: 'var(--t-hover)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        {body}

        <span
          className="ag-card-actions"
          data-open={menuOpen ? 'true' : 'false'}
          style={{ display: 'flex', flex: '0 0 auto' }}
        >
          <MorphMenu
            align="end"
            width={248}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            /* Both lists are their own scroller inside a pane that must not
               grow, so an in-flow panel is cut off by the list it belongs
               to — 179px of it on a tablet. `portal` is MorphMenu's port
               note 4, written for exactly this. */
            portal
            zIndex={Z.dropdown}
            trigger={
              <IconButton size="sm" variant="ghost" label={`Actions for ${task.title}`}>
                <Icon name="ellipsis" size={16} />
              </IconButton>
            }
            /* The panel covers the row it acts on, so the row is restated
               inside it — otherwise "Delete" is offered against nothing. */
            header={{
              title: task.title,
              meta: [
                listTitle,
                score > 0 ? `score ${score.toFixed(1)}` : null,
                reading.redAlert ? 'red alert' : null,
                subtaskCount > 0 ? `${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join('  ·  '),
            }}
            items={items}
          />
        </span>
      </div>

      <AnimatePresence>
        {expanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                marginTop: 'var(--sp-4)',
                marginLeft: 'var(--sp-3)',
                paddingLeft: 'var(--sp-4)',
                borderLeft: '1px solid var(--line-faint)',
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
