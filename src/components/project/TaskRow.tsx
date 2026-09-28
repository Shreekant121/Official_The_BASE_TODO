/**
 * Project board — one task card.
 * RECONCILED (UI-29) against `TaskCard` in `design-system/screens/project.html`
 * and `design-system/components/data/TaskRow.{jsx,d.ts,prompt.md}`.
 *
 * Built at UI-16 from the tokens and from `session/TaskRow`'s anatomy, with
 * the menu folded in at UI-17 — both before the handoff bundle existed. This
 * is the diff against the real thing.
 *
 * WHAT THE MATERIAL WAS WRONG ABOUT
 * ---------------------------------
 * - **The row had no way to finish a task.** The design system's own
 *   `TaskRow.d.ts` leads with `onToggle` — *"Supplying this renders the
 *   completion box"* — and the mockup's card opens with a 24px `Tick`. Ours
 *   opened with a *read-only status glyph*, so the only way to complete
 *   something from the board was to open its sheet, and there was no keyboard
 *   path to it at all. The glyph is gone; `Tick` is the leading 24px column
 *   and it writes through `updateBacklogTask`, which is the app's one status
 *   path and therefore the one that spawns a repeat's successor.
 * - **A running task did not look running.** `.trow[data-live]` is
 *   `--glass-tint-accent` over `--glass-rim-2, --glow-accent-sm` — the whole
 *   card emits. UI-16 rationed emerald to a 16px glyph, on the argument that
 *   emerald means LIVE and only the live row may have it. The argument was
 *   right and the conclusion was one size too small: this IS that row, and
 *   `readme.md` reserves glow for exactly *"objects that are live, selected,
 *   running or overrun"*.
 * - **A done row dims, and comes back on hover.** `opacity: 0.48`, `0.74`
 *   hovered (`.ag-row` in `screens.css`). Ours only greyed the title, so a
 *   column of finished work read at full strength. **The numbers are restated
 *   in `animate`/`whileHover` below and the CSS rule does nothing here** —
 *   this is a `motion.div`, and inline opacity beats a class. Setting
 *   `data-done` was all this card did for its first port, which looked like
 *   the fix and was not.
 * - **`--r-md` and `--sp-5 --sp-6`**, against `--r-sm` and `--sp-4 --sp-5`.
 * - **The score is a `ScoreDial`, beside the title.** UI-14 put `ScoreChip`
 *   first on the meta line so a column of scores shares an x; the mockup gets
 *   the same alignment from the *other* edge, right of the title, and uses
 *   the component the design system ships. `ScoreChip` is **deleted** since
 *   item 16 — every place it was still standing (`SharePage`, the two subtask
 *   trees) is a place that no longer shows a score at all.
 * - **Red Alert sits beside the chip** (item 16). The chip warms to amber and
 *   the pill says which fact warmed it; a number changing colour on its own
 *   says something changed without saying what.
 * - **Blocked is neutral, not amber** — see `BlockedLine` in `parts.tsx`.
 * - **Facts are mono, not uppercase** — see `Fact` in `parts.tsx`. That also
 *   retired `Meta`'s `prose` escape hatch and the separate series
 *   `StatusPill`: a repeat and its position are one fact, and
 *   `derive.repeatLabel` writes them as the one string the mockup shows.
 * - **Tags are chips on a well**, on their own row, not `#tag` in the meta
 *   line behind a tag glyph.
 * - **The whole card is the door.** The mockup's `pick` ignores presses that
 *   land on a control and opens the sheet from anywhere else — ours only
 *   opened from the middle column, so the padding around the title did
 *   nothing.
 *
 * THE GRIP IS GONE FROM THE CARD
 * ------------------------------
 * The mockup's cards render none, and its `.grip` rule (ported as
 * `.ag-card-grip`) applies to the *list header's* handle. Ours held a
 * permanent 16px glyph plus a `--sp-4` gap on every row of a half-page
 * column, and it was never a handle in the first place — the whole card is
 * the drag target here, and `cursor: grab` is the affordance. Same
 * accounting UI-17 used to collapse two `IconButton`s into one ⋯.
 *
 * THE ROW IS NOT A BUTTON, AND CANNOT BECOME ONE
 * ----------------------------------------------
 * UI-14 made New Session's available row a real `<button>` so the keyboard
 * could reach it. That fix is unavailable here and the reason is the same one
 * that made it work there: `SortableList`'s sensors deliberately let a press
 * on a `button` through instead of starting a drag, so a row that IS a button
 * stops being draggable — and on this board the whole row is the drag handle.
 * The keyboard paths are the `Tick` and the ⋯ menu in `.ag-card-actions`,
 * both of which are buttons precisely because they must not start a drag.
 *
 * THE ROW'S CONTROLS ARE ONE `MorphMenu` (UI-17)
 * ----------------------------------------------
 * UI-16 gave the row an "Open" and a subtask-disclosure `IconButton`. They are
 * one ⋯ trigger now, which is the move UI-15 made on New Session's row and for
 * the same measured reason: `.ag-card-actions` animates opacity and not layout,
 * so those two held ~70px of every row's width whether or not you could see
 * them, on a board whose columns are half a page wide.
 *
 * The menu carries a third item the two buttons never could — **Delete task,
 * arming in place.** Without it the menu degenerates to a single row on any
 * task with no subtasks, and more to the point deleting a task on this board
 * meant either opening its sheet or turning on select mode and using the bulk
 * bar; there was no way to do it from the keyboard at all. It goes through
 * `deleteBacklogTask` like every other delete in the app, and it confirms in
 * place because that is `MorphMenu`'s contract — `ProjectCard` and
 * `session/TaskRow` both already do exactly this.
 *
 * The panel is portalled (`portal` + `Z.dropdown`). A list card is
 * `overflow: hidden` — that is what rounds it — so an in-flow panel is cut
 * off by the column the row sits in. MorphMenu's port note 4.
 *
 * KEPT over the source, all of it production the prototype has no equivalent
 * for: the drag wiring (`isBeingDragged` dims to 0.3, `layout` off while any
 * row on the board moves — see the dragging section of `CLAUDE.md`), the
 * cover image, the assignee avatar, the "shared here from" chip, the subtask
 * disclosure and `SubtaskPreviewTree`, the delete confirm, and the select-mode
 * checkbox, which the mockup does without because it never has to be reached
 * from a keyboard.
 *
 * ONE BUG WORTH NOT RE-LEARNING
 * -----------------------------
 * **A cover image darkened the whole card, not the image.** The scrim over it
 * was `absolute inset-0` inside a parent that was never `position: relative`,
 * so it resolved against the nearest positioned ancestor — which is
 * `SortableRow`'s wrapper, i.e. the entire row — and every task with a cover
 * sat under a gradient down to its last tag. The cover is `ProjectCard`'s
 * treatment now: desaturated and dimmed in the image's own filter, contained
 * by its own box, no overlay at all.
 *
 * V3 (V3-3) — RECONCILED AGAINST `screens/Task Row States.dc.html`
 * -----------------------------------------------------------------
 * FIX-9 built this card on 2026-09-22 and its design landed the next day.
 * The design is one compact row in five states; this card carries far more
 * (score, Red Alert, facts, tags, cover, Ask), and V3 changes no features, so
 * the card kept its anatomy and took the design's STATES:
 *   - **Hovered: the fill brightens one step, the cast lifts, it moves 2px
 *     right, the actions arrive.** It did nothing on hover before but reveal
 *     the ⋯. The fill and rim are React state rather than CSS `:hover` because
 *     both are inline (they depend on five other facts), and an inline value
 *     beats any rule — the same trap the dims below already document.
 *   - **Selected: the design's emerald hairline** inside the edge, over rim 2.
 *     Thinner than FIX-9's 1.5px of full accent; it is still a rim and never
 *     a fill, which is the half FIX-9 settled.
 *   - **Blocked: no rim light, no cast, no hover lift**, on a fainter fill,
 *     and a lock in the tick's box (`parts.tsx`). Item 19's opacity pair
 *     stays, and hovering still brings the card all the way back — opening a
 *     blocked task is how you fix what it waits on.
 *   - **Done: the check is an emerald stroke, no fill** (`parts.tsx`), and a
 *     folded repeat's "×14" is the design's hairline pill with the repeat
 *     glyph (`RepeatCount`).
 * KEPT, from FIX-9 and by his word: `--r-xs` rather than the design's `--r-md`,
 * the two-line clamp, the anchored avatar, and **running as the rippling
 * pill** — the design swaps the pill for an orbiting dot and a clock, and
 * Shreekant chose on 2026-09-23 to keep the pill.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CoverImage, Icon, IconButton, MorphMenu, ScoreDial, StatusPill, useMotion, type MorphMenuItem,
} from '../../ui';
import SubtaskPreviewTree from './SubtaskPreviewTree';
import { BlockedLine, Fact, Meter, RepeatCount, Tag, Tick } from './parts';
import {
  deadlineLabel, doneLabel, elapsedMinutes, minutesLabel, repeatLabel, subtaskCount,
} from './derive';
import { pressedAControl } from './cardPress';
import { Z } from '../../lib/zLayers';
import { useStore, getBlockingTasks, taskLockReason, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { RedAlertBadge } from '../task-fields/RedAlertBadge';
import { AvoidedMark, EmergencyMark } from '../task-fields/TaskMarks';
import { emergencyMenuItems } from '../task-fields/emergencyMenu';
import { useStartNowItems } from '../task-fields/startNowMenu';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { useAuth } from '../../contexts/AuthContext';
import { archiveTask } from '../../lib/archive';
import { AI_SUBJECT_RIM } from '../../ui/overlay/AIPanel';

export interface TaskRowProps {
  task: Task;
  selected: boolean;
  selectMode: boolean;
  onSelect: (id: string) => void;
  onOpen: (task: Task) => void;
  /** Straight through to `deleteBacklogTask` — the ⋯ menu confirms first. */
  onDelete: (task: Task) => void;
  /** The `Tick`. Writes through `updateBacklogTask`, the app's one status path. */
  onToggleDone: (task: Task) => void;
  /** This row is the one being carried. */
  isBeingDragged: boolean;
  /** A task from another list is hovering over this one, so every row in it
   *  reads as part of the drop target rather than only the card's border. */
  isReceivingDrop: boolean;
  /** True when this row is showing a task shared in from another list ("hive mind" link) */
  isSharedHere?: boolean;
  /** Live-resolved title of the task's primary list — shown only when `isSharedHere`, so it's clear which list it actually belongs to. Always up to date with renames since it's resolved from `taskLists`, never the denormalized `task.listName`. */
  primaryListTitle?: string;
  /**
   * Some task on this board is being dragged. Framer's `layout` has to be off
   * while one is: dnd-kit writes the gap-opening transform onto each row's
   * wrapper, and layout projection measures that transform and animates the row
   * straight back out of it.
   */
  isAnyDragging: boolean;
  /**
   * BUILD-4: open the AI panel on this task. A visible button on every row
   * rather than a ⋯ item — Shreekant's call over the mockup's (2026-09-16).
   */
  onAsk?: (task: Task) => void;
  /** This task is what the open AI panel is about. A brighter rim, never emerald. */
  isAskSubject?: boolean;
  /**
   * FIX-9: how many finished occurrences of this repeat the row stands for —
   * `foldFinishedRepeats` in `derive.ts`. Shown as "×14" after the title when
   * more than one.
   */
  repeatCount?: number;
}

/** Selected (V3-3, `Task Row States.dc.html` state 03): *"Emerald rim only.
 *  Fill stays neutral. No glow."* Inset, because FIX-9 found the list card
 *  clipping anything drawn outside a row; the design's own outer ring is a
 *  10% hairline that clipping would only make uneven. `ListTable` shares it. */
export const SELECTED_RIM = 'var(--glass-rim-2), inset 0 0 0 1px var(--accent-hairline)';

/** Blocked (state 05): *"No rim light, no cast, no hover."* The design's own
 *  fill, a shade under `--glass-fill-1`, and one faint line for an edge. */
const BLOCKED_FILL = 'linear-gradient(155deg, oklch(1 0 0 / 0.028) 0%, oklch(1 0 0 / 0.008) 100%)';

export default function TaskRow({
  task, selected, selectMode, onSelect, onOpen, onDelete, onToggleDone,
  isBeingDragged, isReceivingDrop, isSharedHere, primaryListTitle, isAnyDragging,
  onAsk, isAskSubject, repeatCount = 1,
}: TaskRowProps) {
  const { user } = useAuth();
  const motionTokens = useMotion();
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /* Framer's hover, which already ignores a finger — the tablet has no hover
     and a tap must not leave a card lifted. */
  const [hovered, setHovered] = useState(false);
  const backlogTasks = useStore((s) => s.backlogTasks);
  /* A number, so the selector is `Object.is`-stable and a row only re-renders
     when its own logged time actually moves. */
  const elapsed = useStore((s) => elapsedMinutes(s.focusLog, task.id));

  const setEmergencyBoost = useStore((s) => s.setEmergencyBoost);

  const scores = usePriorityScores();
  const reading = scores.read(task);
  const score = reading.score;
  const subCount = subtaskCount(task);
  /* The stored level against what the engine scored it at: a flag whose anchor
     date has gone by is still on the task and is no longer counting, and the
     mark says so rather than showing a number that does nothing. */
  const emergency = task.emergencyBoost ?? 0;
  const emergencyLapsed = emergency > 0 && reading.variables.emergency === 0;
  // A2 — a finished task can't be late, so no deadline countdown / "Overdue" flag once it's completed.
  const done = task.status === 'completed';
  const live = task.status === 'in-progress';
  const deadlineInfo = task.deadline && !done ? deadlineLabel(task.deadline) : null;
  const isAssignedToMe = task.assignee && task.assignee === user?.uid;
  /* D2 — prerequisites still incomplete, and since item 19 that is a LOCK
     rather than a warning: the row greys, the Tick refuses, and the blocker
     stays named so you know what to go and finish. `isTaskLocked` is the app's
     one test for it — it also answers for "Schedule anyway", which this row
     never sets but can be looking at, since today's queue and the board show
     the same task. The board reads the backlog, which is where a blocker's
     completion lives. */
  const blockingTasks = done ? [] : getBlockingTasks(backlogTasks, task);
  const lockReason = taskLockReason(backlogTasks, task);
  const locked = lockReason !== undefined;
  const repeat = repeatLabel(task, new Date(), resolveUserTimeZone());
  const alloc = task.estimatedTime ?? 0;

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
    ...(subCount.total > 0
      ? [{
        value: 'subtasks',
        label: expanded ? 'Hide subtasks' : 'Show subtasks',
        icon: <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />,
        meta: `${subCount.done}/${subCount.total}`,
        onSelect: () => setExpanded((v) => !v),
      } satisfies MorphMenuItem]
      : []),
    /* The flag, in the two places item 17 puts it. A finished task is not an
       emergency and cannot become one — the same reason its Red Alert badge
       and its deadline countdown are suppressed. */
    ...(done ? [] : emergencyMenuItems({
      level: emergency,
      count: scores.emergencyCount,
      lapsed: emergencyLapsed,
      onSet: (level) => setEmergencyBoost(task.id, level),
    })),
    { divider: true },
    /* BUILD-11 — above Delete, never red. Straight to `lib/archive.ts` rather
       than up through the board: nothing above the row has anything to add. */
    {
      value: 'archive',
      label: 'Archive task',
      icon: <Icon name="archive" size={18} />,
      confirm: {
        label: `Archive ${task.title}?`,
        hint: subCount.total > 0
          ? `Out of every queue and Atlas, with its ${subCount.total} subtask${subCount.total === 1 ? '' : 's'}. Kept for good.`
          : 'Out of every queue and Atlas. Kept for good.',
        action: 'Archive',
        onConfirm: () => { archiveTask(task.id); },
      },
    },
    {
      value: 'delete',
      label: 'Delete task',
      icon: <Icon name="trash-2" size={18} />,
      tone: 'danger',
      confirm: {
        label: `Delete ${task.title}?`,
        hint: subCount.total > 0
          ? `${subCount.total} subtask${subCount.total === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`
          : 'Recoverable from Trash for 30 days.',
        onConfirm: () => onDelete(task),
      },
    },
  ];

  /* The mockup's `pick`: the card is the door into the sheet, except in select
     mode, where it is the selection target. Controls keep their own jobs —
     `cardPress.ts` explains why that test is not a one-liner here. */
  const pick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (pressedAControl(e)) return;
    if (selectMode) { onSelect(task.id); return; }
    onOpen(task);
  };

  /* The design's hover lift (state 02). Never while something on the board
     is being carried — the rows under the pointer are drop slots then, not
     cards — and never on a blocked card, which the design gives no hover. */
  const lifted = hovered && !isAnyDragging && !locked;
  /* A blocked card is unlit at rest and comes all the way back on hover,
     which is item 19's pair restated in surfaces as well as opacity. */
  const unlit = locked && !hovered;

  return (
    <motion.div
      className="ag-card ag-row"
      data-ai-subject={isAskSubject ? 'true' : undefined}
      data-done={done ? 'true' : 'false'}
      /* `screens.css` carries the pair, resting and hover — see the rule. */
      data-locked={locked ? 'true' : 'false'}
      layout={!isAnyDragging}
      onClick={pick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      initial={{ opacity: 0, scale: 0.96 }}
      /* BOTH row dims are HERE and not on `screens.css`'s
         `.ag-row[data-done]` / `.ag-row[data-locked]`, and they have to be:
         `animate` writes `style.opacity` inline and an inline opacity beats
         any class. Same numbers as those rules — that is where the treatment
         is written down, and both attributes stay on the wrapper so the two
         agree and so the state is inspectable. `whileHover` is the other half
         of each pair.

         **`data-done` was inert on this card from the day it was ported** —
         a completed task measured `opacity: 1` here and `0.48` two feet away
         in `ListTable`, which is a plain `div` and does read the rule. Item 19
         found it while restating the locked numbers for the same reason and
         left it; this is that job.

         The two states rest at different depths and return to different
         places, deliberately. A done row is over: 0.48, back to 0.74, enough
         to read if you go looking. A locked row is the one thing on the board
         you may have to act on — opening it is how you fix the dependency —
         so it rests lighter and comes back all the way.

         `locked` is tested first to match the CSS, where `[data-locked]` is
         written second and wins on equal specificity. The branch is unreachable
         either way: `isTaskLocked` returns false for a completed task, so the
         two are never both true. */
      animate={{
        opacity: isBeingDragged ? 0.3 : locked ? 0.62 : done ? 0.48 : 1,
        scale: isBeingDragged ? 0.98 : 1,
      }}
      whileHover={
        isBeingDragged ? undefined
          : locked ? { opacity: 1 }
            : isAnyDragging ? (done ? { opacity: 0.74 } : undefined)
              : done ? { opacity: 0.74, x: 2 }
                : { x: 2 }
      }
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{
        layout: { type: 'spring', stiffness: 520, damping: 42, mass: 0.6 },
        opacity: { duration: motionTokens.dur.fast, ease: motionTokens.ease.glass },
        scale: { duration: motionTokens.dur.fast, ease: motionTokens.ease.glass },
        x: { duration: motionTokens.dur.fast, ease: motionTokens.ease.glass },
      }}
      style={{
        overflow: 'hidden',
        /* `--r-xs`, not the mockup's `--r-md` (FIX-9). Shreekant: "instead of
           no edges rectangle, make it very less rounded, so that the task can
           be seen better". At 20px a short card read as a pill. */
        borderRadius: 'var(--r-xs)',
        /* Level 1, because the row sits INSIDE the list card's level-2 pane —
           the same step-down `TaskDetailPanel` takes for the groups inside a
           sheet. No backdrop-filter of its own: there is already one behind it,
           and a second costs a full-size blur per row for nothing.

           RUNNING AND SELECTED ARE NO LONGER ONE LOOK (FIX-9). Both used to be
           the mockup's emerald tint plus glow, so a running task was
           pixel-identical to a tapped one, and Shreekant filed it three times.
           Neither fills the card now. **Running is motion**: the rippling
           `running` StatusPill in the body below, and no background change.
           **Selected is a rim**: a hairline of emerald inside the edge (inset,
           because the list card clips anything outside the row). His words on
           the old fill: it "looks super bad and not part of the software".
           A drop target stays on the neutral step up, and so does a hovered
           card (V3-3) — the design's "fill brightens one step". */
        backgroundImage: isReceivingDrop || isAskSubject || lifted ? 'var(--glass-fill-2)'
          : unlit ? BLOCKED_FILL
            : 'var(--glass-fill-1)',
        /* The AI panel's subject is marked by rim alone (BUILD-4), and only
           when the row is not selected: selection is the louder fact. A
           hovered card's cast lifts with its fill; a blocked one has no rim
           light at all, one faint line for an edge. */
        boxShadow: selected ? SELECTED_RIM
          : isAskSubject ? AI_SUBJECT_RIM
            : lifted ? 'var(--glass-rim-2), var(--glass-cast-2)'
              : unlit ? 'inset 0 0 0 1px var(--line-faint)'
                : 'var(--glass-rim-1)',
        cursor: isBeingDragged ? 'grabbing' : 'grab',
        transition: 'background-image var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass)',
      }}
    >
      {/* Cover image — full colour behind the glass, contained by its own box.
          Desaturated until FIX-3, and it goes with the project covers rather
          than apart from them: a board draws project covers and task covers at
          the same time, so two strengths on one screen would read as two
          different photographs. See `ProjectCard.tsx` for the decision. */}
      {task.imageUrl && (
        <div
          className="ag-cover"
          style={{ position: 'relative', height: 144, overflow: 'hidden', boxShadow: 'inset 0 -1px 0 0 var(--line-faint)' }}
        >
          <CoverImage src={task.imageUrl} />
        </div>
      )}

      <div
        style={{
          display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)',
          columnGap: 'var(--sp-5)', rowGap: 'var(--sp-4)',
          /* One step more vertical room than the mockup's (FIX-9). */
          padding: 'var(--sp-6) var(--sp-6)',
        }}
      >
        {selectMode ? (
          /* The mockup selects by pressing the card and shows it with the
             emerald tint alone. A tint is not reachable from a keyboard and
             not announced by a screen reader, so the box stays — in the same
             24px slot the Tick occupies, so nothing shifts when select mode
             turns on. */
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
            /* A disabled control that still said "Mark done" would be lying
               about what pressing it does, so a locked tick names what it is
               waiting for instead. The app's one sentence for that — see
               `taskLockReason` — and it is what the `title` shows on hover. */
            label={
              lockReason ?? (done ? `Mark ${task.title} not done` : `Mark ${task.title} done`)
            }
            onToggle={() => onToggleDone(task)}
          />
        )}

        {/* `minmax(0, 1fr)`, not the implicit `auto` track (FIX-9). An auto
            track grows to its widest child's min-content, and the badge
            cluster's is wider than a board column — so the description, the
            facts and the tags were laid out past the card's right edge and
            clipped mid-word ("one c"). Same trap `ListColumn` notes. */}
        <div style={{ minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-3)' }}>
          {/* FIX-9: the title used to share one unwrapping line with up to
              six things — the shared chip, Red Alert, the Emergency mark, the
              dial, Ask and ⋯ — so in a narrow column it was squeezed to one
              word a line. The line wraps now: the title asks for 9em before it
              gives way, and when it cannot have that the cluster drops below
              it rather than the title breaking. The title itself is clamped to
              two lines, and its full text is its tooltip. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 'var(--sp-4)', rowGap: 'var(--sp-3)' }}>
            <h3
              className="ag-clamp-2"
              title={task.title}
              style={{
                flex: '1 1 9em', minWidth: 0,
                font: 'var(--type-body)', letterSpacing: 'var(--tracking-ui)',
                overflowWrap: 'anywhere',
                color: done ? 'var(--fg-3)' : 'var(--fg-1)',
                textDecorationLine: done ? 'line-through' : 'none',
                textDecorationColor: 'var(--fg-4)',
              }}
            >
              {task.title}
              {/* An atomic inline box, so the title's line-through does not
                  reach it — the count is a record, not part of what is done. */}
              {repeatCount > 1 && (
                <span style={{ display: 'inline-flex', marginLeft: 'var(--sp-3)' }}>
                  <RepeatCount count={repeatCount} />
                </span>
              )}
            </h3>

            <span
              style={{
                display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end',
                alignItems: 'flex-start', gap: 'var(--sp-4)',
                marginLeft: 'auto', minWidth: 0, maxWidth: '100%',
              }}
            >

            {/* Red Alert reads beside the score, not in place of it: the chip
                says how much and the pill says why it is amber. A finished
                task cannot be late, so neither shows on one. */}
            {!done && <RedAlertBadge redAlert={reading.redAlert} style={{ marginTop: 1 }} />}

            {/* Beside it, not instead of it, and never rippling — the pill is
                what the engine concluded, this is what you declared. See
                `TaskMarks.tsx` for why they share a hue. */}
            {!done && <EmergencyMark level={emergency} lapsed={emergencyLapsed} style={{ marginTop: 1 }} />}

            {score > 0 && (
              <ScoreDial
                value={score}
                max={scores.peak}
                alert={!done && reading.redAlert}
                size="sm"
                style={{ marginTop: 1 }}
              />
            )}

            {/*
              `.ag-card-actions`, not `group-hover`: there is no hover on the
              tablet and no `:focus-within` in a hover utility, so these were
              invisible on half of what this app runs on and the keyboard's
              focus ring landed on controls nobody could see. `screens.css`
              covers both cases, and `data-open` keeps the trigger lit while
              its own panel is up — the pointer is over the panel then, not
              over the row.
            */}
            {/* BUILD-4. Outside `.ag-card-actions` on purpose: that class
                hides at rest, and this is the one control on the row he asked
                to always see. Hidden in select mode, where a press on the
                card means "pick this". */}
            {onAsk && !selectMode && (
              <span style={{ display: 'flex', flex: '0 0 auto', marginTop: -4 }}>
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
              </span>
            )}

            <span
              className="ag-card-actions"
              data-open={menuOpen ? 'true' : 'false'}
              style={{ display: 'flex', flex: '0 0 auto', marginTop: -4 }}
            >
              <MorphMenu
                align="end"
                width={244}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                /* A list card is `overflow: hidden` — that is what rounds it —
                   so an in-flow panel is cut off by the column this row sits
                   in. MorphMenu's port note 4. */
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
                    primaryListTitle,
                    score > 0 ? `score ${score.toFixed(1)}` : null,
                    subCount.total > 0 ? `${subCount.done}/${subCount.total} subtasks` : null,
                  ].filter(Boolean).join('  ·  '),
                }}
                items={menuItems}
              />
            </span>
            </span>
          </div>

          {isSharedHere && (
            /* Not a StatusPill: being linked in from another list is not one
               of the seven states, it is a fact about where the task lives.
               It takes the glass-fill-1 chip the rest of the app spends on a
               list's name.

               Its own line, under the title, and not in the badge cluster
               above, where it lived until 2026-09-24: one more chip there
               wrapped the cluster in a board column, and the ⋯ trigger —
               invisible at rest but still laid out — was left alone on a
               second line, a blank band through the card that only a
               shared-in task had. */
            <span
              title={primaryListTitle ? `Shared here from "${primaryListTitle}"` : 'This task is shared here from another list'}
              className="ag-kicker"
              style={{
                justifySelf: 'start', minWidth: 0, maxWidth: '100%',
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
                padding: '2px var(--sp-4)', borderRadius: 'var(--r-pill)',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                color: 'var(--fg-3)',
              }}
            >
              <Icon name="link-2" size={11} style={{ color: 'inherit' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {primaryListTitle || 'Shared'}
              </span>
            </span>
          )}

          {task.description && (
            <p
              className="ag-clamp-2"
              /* `anywhere`, as the title does: a pasted link is one word, and
                 without it the line ran past the card's edge and was cut. */
              style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', lineHeight: 'var(--leading-normal)', overflowWrap: 'anywhere' }}
            >
              {task.description}
            </p>
          )}

          {/* Running: the pill, the reading and the meter, as one block. The
              elapsed figure is the focus log's, summed — see `derive.ts`. */}
          {live && (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                <StatusPill status="running" size="sm">Running</StatusPill>
                <span
                  className="ag-tnum"
                  style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--accent)' }}
                >
                  {alloc > 0 ? `${elapsed} / ${alloc} min` : minutesLabel(elapsed)}
                </span>
              </div>
              {alloc > 0 && <Meter pct={(elapsed / alloc) * 100} height={4} />}
            </div>
          )}

          {blockingTasks.length > 0 && (
            <span style={{ display: 'flex', minWidth: 0 }}>
              <BlockedLine
                on={blockingTasks[0].title}
                extra={blockingTasks.length - 1}
                title={`Blocked by: ${blockingTasks.map((t) => t.title).join(', ')}`}
              />
            </span>
          )}

          {/* Measured facts, always in this order: when · how long · how far · how often.
              The avatar is NOT one of them any more (FIX-9): it rode the end
              of this wrapping line, so it landed wherever the last fact
              happened to end and was clipped at the card's edge when the line
              was full. It has its own column now, anchored bottom-right. */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-4)', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap', minWidth: 0 }}>
            {done && task.completedAt && (
              /* FIX-9: stamped on every completion since 19A, never shown. */
              <Fact icon="check" tone="var(--fg-3)" title={new Date(task.completedAt).toLocaleString()}>
                {doneLabel(task.completedAt, new Date())}
              </Fact>
            )}
            {deadlineInfo && (
              deadlineInfo.urgent
                ? <StatusPill status="review" size="sm">{deadlineInfo.text}</StatusPill>
                : <Fact icon="calendar">{deadlineInfo.text}</Fact>
            )}
            {!live && alloc > 0 && (
              <Fact icon="clock" tone={done ? 'var(--fg-4)' : 'var(--fg-3)'}>{minutesLabel(alloc)}</Fact>
            )}
            {subCount.total > 0 && (
              <Fact icon="corner-down-right">{subCount.done}/{subCount.total}</Fact>
            )}
            {repeat && <Fact icon="repeat" title={repeat}>{repeat}</Fact>}
            {/* How often you have pushed this away — a measured fact about the
                task, in the same face as the four beside it. */}
            <AvoidedMark count={task.avoidedCount} tone={done ? 'var(--fg-4)' : undefined} />
          </div>

            {task.assignee && (
              /* No counterpart in the mockup — the prototype keeps the
                 assignee for the sheet. */
              <span
                title={isAssignedToMe ? 'Assigned to you' : 'Assigned'}
                style={{ flex: '0 0 auto', display: 'flex' }}
              >
                {isAssignedToMe && user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    style={{
                      width: 20, height: 20, borderRadius: 'var(--r-circle)',
                      boxShadow: 'var(--glass-rim-1)', display: 'block',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      display: 'grid', placeItems: 'center', width: 20, height: 20,
                      borderRadius: 'var(--r-circle)',
                      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                      color: 'var(--fg-3)',
                    }}
                  >
                    <Icon name="user-circle" size={12} />
                  </span>
                )}
              </span>
            )}
          </div>

          {subCount.total > 0 && !live && (
            <Meter pct={(subCount.done / subCount.total) * 100} tone="var(--fg-3)" />
          )}

          {task.tags && task.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              {task.tags.map((tag) => <Tag key={tag}>#{tag}</Tag>)}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {expanded && subCount.total > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            {/* `minmax(0, 1fr)` for the reason the body's grid above has it:
                an implicit track grew to the longest unbroken word in a
                subtask's title, and every row in the tree ran past the card's
                right edge instead of ellipsizing. */}
            <div
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-2)',
                margin: '0 var(--sp-6) var(--sp-5) var(--sp-11)',
                paddingTop: 'var(--sp-3)',
                borderTop: '1px solid var(--line-faint)',
              }}
            >
              <SubtaskPreviewTree subtasks={task.subtasks ?? []} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * The preview that follows the pointer while a row is dragged.
 *
 * Level-3 glass and the thick shadow, because this is the one surface in the
 * app that is genuinely off the page — it is portalled to `<body>` and floats
 * over every list at once. It replaces the last `liquid-glass-elevated` on
 * this screen.
 */
export function TaskDragGhost({ title }: { title: string }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
        maxWidth: 280, padding: 'var(--sp-4) var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-3)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-3), var(--glass-inner-2), var(--glass-cast-3)',
        cursor: 'grabbing',
      }}
    >
      <Icon name="grip-vertical" size={16} style={{ color: 'var(--fg-3)' }} />
      <span
        style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          font: 'var(--type-title)', fontSize: 'var(--text-md)', color: 'var(--fg-1)',
        }}
      >
        {title}
      </span>
    </div>
  );
}
