/**
 * Project board — one list column.
 * RECONCILED (UI-29) against `ListPanel` in `design-system/screens/project.html`.
 *
 * Was `ListSection` inside `pages/ProjectView.tsx`; rebuilt on Aurora Glass at
 * UI-16 and given its `MorphMenu` at UI-17, both without the mockup. The
 * wiring is untouched by this pass. Dragging still belongs entirely to the
 * board — `SortableBoard`, `SortableGroup` and `SortableRow` in
 * `components/SortableList.tsx`. This card holds no drag state of its own: it
 * puts the list activator on its grip, stops animating its own layout while
 * the grid rearranges underneath it, and lights up when the board says a task
 * from elsewhere is over it. Adding a task still calls `onAddTask` once with
 * every non-empty line, in order, and deleting a list still goes through
 * `deleteTaskList` — i.e. through `applyDeletion` — and cleans up nothing
 * itself.
 *
 * WHAT THE MATERIAL WAS WRONG ABOUT
 * ---------------------------------
 * - **The header had a pane of its own.** Ours laid `--glass-fill-1` and an
 *   inset hairline across it, which is a second surface inside a surface.
 *   The mockup's header is *the same glass as the card*, separated by
 *   nothing but its inset — `--sp-6 --sp-6 --sp-5`.
 * - **The list is missing its two numbers.** *"Two numbers per list, and only
 *   two: how far in, and work left."* A `Meter` and `N min left` on a second
 *   header row. Ours showed how far in as `3/8` and never said how much work
 *   was left, which is the number that decides whether a column is worth
 *   opening today.
 * - **No hue dot.** The mockup's 4px project-colour dot went when projects
 *   lost their colour (OPT-4).
 * - **The grip hides at rest.** `.ag-card-grip`, the mockup's `.grip`:
 *   revealed on hover, on focus, and unconditionally on a touch screen. Ours
 *   was a permanent glyph in every column header.
 * - **The pane refracts.** `--glass-bd-md-refract`, with `--glass-bd-md` as
 *   the WebKit fallback, exactly as the source writes it. `<GlassFilters />`
 *   is already mounted app-wide.
 * - **The ⋯ trigger is a `chevron-down`.** An ellipsis on a *header* reads as
 *   "more of this row"; the chevron reads as "this panel has a menu", which
 *   is what it is.
 * - **`3/8` is mono, not an uppercase kicker** — same correction the task
 *   card's facts took, and for the same reason.
 * - **The footer is a permanent "Add task" strip.** Ours only offered one on
 *   an empty list, so adding a second task meant finding the small `+` in the
 *   header. And it is `.ag-addrow` — dashed — see below.
 *
 * DASHED IS THE SYSTEM'S ANSWER, AFTER ALL
 * ----------------------------------------
 * UI-16 replaced this footer's dashed outline with a ghost `Button`, on the
 * rule that *"Aurora Glass has no dashed anything"*. That rule was an
 * inference made with no mockup in the repo and the bundle contradicts it in
 * seven places — `project.html`, `home.html` (twice), `deadlines.html`,
 * `session.html`, `scoring.html` and `TaskSheet.jsx` all draw an empty slot
 * with `1px dashed`. It is how this system says *nothing here yet*, and what
 * distinguishes it from a disabled control (solid, dimmed). `.ag-addrow` in
 * `screens.css` is the source's rule, hover state included.
 *
 * THE ⋯ MENU IS A `MorphMenu` (UI-17)
 * -----------------------------------
 * Two things it needs that `ProjectCard`'s menu does not:
 *
 *   - **`portal` + `Z.dropdown`.** This card is `overflow: hidden` — that is
 *     what rounds it — so an in-flow panel is cut off by the card it hangs
 *     from, and the shorter the list the more of the panel goes. That is
 *     MorphMenu's port note 4, written for exactly this.
 *   - **Delete arms in place.** It used to fire on one press of a row sitting
 *     directly under "Share List", and deleting a list takes every task in it
 *     to the Trash. `MorphMenu`'s contract is that a destructive item confirms
 *     IN PLACE rather than opening a dialog — `ProjectCard` and
 *     `session/TaskRow` both already do this.
 *
 * The confirm counts only the tasks this list actually OWNS. A task shared in
 * from another list renders a row here but lives elsewhere, and
 * `planListDeletion` only cuts the cross-link for those — so counting them
 * would overstate what is lost by exactly the rows that survive.
 *
 * KEPT over the source: the rename field, the hidden-from-shares state and
 * its menu item, the ₹ roll-up (the mockup's `budget` is a static string),
 * the cross-list drop hint, the bulk-capable inline add with its commit
 * button, and the ⋯ menu's restated header. None of it exists in the
 * prototype and all of it is wired.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { askInk, Button, Icon, IconButton, LitLine, MorphMenu, Well, WhiteButton, type MorphMenuItem } from '../../ui';
import BulkAddInput from '../BulkAddInput';
import TaskRow from './TaskRow';
import { Meter } from './parts';
import { doneCount, minutesLabel, workLeftMinutes } from './derive';
import { SortableGroup, SortableRow, type DragHandleProps } from '../SortableList';
import { parseBulkLines } from '../../lib/bulkAdd';
import { Z } from '../../lib/zLayers';
import { dustAttr } from '../../lib/dust';
import { getListTitle, taskListValueINR, formatINR, type Task, type TaskList } from '../../store/useStore';
import { AI_SUBJECT_RIM } from '../../ui/overlay/AIPanel';
import { usePriorityScores } from '../../store/usePriorityScores';
import { IgnoredMark } from '../task-fields/TaskMarks';
import { useIgnoreItems } from '../task-fields/ignoreMenu';
import { useWorkedItems } from '../task-fields/workedMenu';
import { ignoreSentence, isOwnSwitch } from '../../lib/ignoredWork';
import { usePlusDrop } from '../../store/usePlusDrop';

/** Shared by the rename field and the add-task field — a line of glass with a
 *  hairline under it, never a boxed input inside a pane that is already one. */
const INLINE_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 0,
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

/** The opaque floor under a list pane — on the board here, and under the
 *  List view's pane in `ListTable`. 92% of the chrome void: enough that the
 *  page's emerald field cannot tint a column of tasks, while the pane still
 *  reads as glass by its fill and rim. */
export const LIST_PANE_FLOOR = 'color-mix(in oklch, var(--void-1) 92%, transparent)';

/** The pane's sheen, and its rim, both turned well down (Shreekant,
 *  2026-09-23: the white on the list "looks very bad"). V3's `--glass-fill-2`
 *  opens with `--glass-splay`, a white bloom in the top-left corner, and
 *  `--glass-shadow-pane` carries rim 2's 60%-white edge plus a white glow
 *  inside the top. On a near-opaque pane that is all a list shows of the
 *  glass, so it read as a white smear. What is left: the diagonal sheen at
 *  half strength with no splay, a 16% edge, and the cast underneath. */
export const LIST_PANE_FILL =
  'linear-gradient(135deg, oklch(1 0 0 / 0.05) 0%, oklch(1 0 0 / 0.01) 50%, oklch(1 0 0 / 0.03) 100%)';
/** 29-1P6c, idea 91: a project's Backburner pulled into view wears a faint
 *  indigo wash over the same pane, rest's colour (his call). */
export const PARKED_WASH =
  'linear-gradient(180deg, color-mix(in oklab, var(--job-indigo) 13%, transparent), color-mix(in oklab, var(--job-indigo) 5%, transparent))';
/** A task hovering over the list: one step up, still no splay. */
const LIST_PANE_FILL_RECEIVING =
  'linear-gradient(135deg, oklch(1 0 0 / 0.09) 0%, oklch(1 0 0 / 0.025) 50%, oklch(1 0 0 / 0.05) 100%)';
export const LIST_PANE_SHADOW =
  'inset 1px 1px 1px -0.5px oklch(1 0 0 / 0.16), inset -1px -1px 1px -0.5px oklch(1 0 0 / 0.08), var(--glass-cast-2)';

/** The mockup's `Mono` — a measured number, never uppercased. */
const MONO = {
  font: 'var(--type-numeric)',
  fontSize: 'var(--text-xs)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

export interface ListColumnProps {
  listId: string;
  listTitle: string;
  /** All lists in the project — used to resolve a shared task's primary list name live (never the stale denormalized `task.listName`). */
  taskLists: TaskList[];
  tasks: Task[];
  /** FIX-9: finished occurrences folded into a row, by that row's task id.
   *  The header still counts every one of them. */
  repeatCounts?: Record<string, number>;
  selectedIds: Set<string>;
  selectMode: boolean;
  onSelectTask: (id: string) => void;
  onOpenTask: (task: Task) => void;
  /** Straight through to `deleteBacklogTask` — a row's ⋯ menu confirms first. */
  onDeleteTask: (task: Task) => void;
  /** A row's `Tick`. Straight through to `updateBacklogTask`. */
  onToggleTaskDone: (task: Task) => void;
  /** `beforeTaskId`: where the floating + was dropped (29-1c1); absent = the end. */
  onAddTask: (listId: string, titles: string[], beforeTaskId?: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameList: (listId: string, title: string) => void;
  onShareList: (listId: string) => void;
  /** True when this list already has a SimpleURL short link (shows a small dot in the menu). */
  hasShortLink?: boolean;
  /** "Blinding": whether this list is currently hidden from shared/public views. */
  hidden?: boolean;
  onToggleHidden: (listId: string) => void;
  listDragHandleProps: DragHandleProps;
  isListDragActive: boolean;
  /** A task from another list is hovering here and will land here if dropped. */
  isReceivingDrop: boolean;
  /** BUILD-4: open the AI panel on this list, or on one of its tasks. */
  onAskList?: (listId: string) => void;
  onAskTask?: (task: Task) => void;
  /** What the open AI panel is about, if it is in this column. */
  askSubject?: { kind: 'list' | 'task'; id: string } | null;
  /**
   * 29-1P6c, idea 91: this is the project's own Backburner, pulled down into
   * view above the board. Tinted indigo, no grip (it is not one of the
   * board's lists to reorder), and a button that tucks it away again.
   */
  onTuck?: () => void;
  /**
   * 29-1P9a (idea 157, Trello): folded into a thin spine — its name written
   * sideways, its count and an upright lime bar — and the lists beside it
   * widen into the room. Flat, one line, where the board is one column.
   * A task held over a folded list opens it for as long as it is held.
   */
  folded?: boolean;
  onToggleFold?: (listId: string) => void;
}

/**
 * The folded list (157): a button the whole spine, which opens it again.
 * Its shape — upright beside other lists, a flat bar in one column — is all
 * CSS (`.ag-spine` in `screens.css`), so nothing here measures the board.
 */
export function Spine({ listId, listTitle, done, total, pct, onOpen }: {
  listId: string; listTitle: string; done: number; total: number; pct: number; onOpen: (listId: string) => void;
}) {
  return (
    <button
      type="button"
      className="ag-spine"
      aria-expanded={false}
      aria-label={`Open ${listTitle}, ${done} of ${total} done`}
      title={`Open ${listTitle}`}
      onClick={() => onOpen(listId)}
    >
      <Icon name="chevron-right" size={16} className="ag-spine__arrow" />
      <span className="ag-spine__name">{listTitle}</span>
      <span className="ag-spine__count" style={MONO}>{done}/{total}</span>
      <span className="ag-spine__meter" aria-hidden>
        <i style={{ '--spine-pct': `${pct}%` } as CSSProperties} />
      </span>
    </button>
  );
}

/**
 * Idea 37: the gap the floating + opens where it would land — a dashed lime
 * slot, as this system draws an empty place, sliding the rows under it down.
 * It opens by a Web Animation from a layout effect, once; it never loops.
 */
function PlusGap() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate([{ height: '0px', opacity: 0 }, { height: `${PLUS_GAP_PX}px`, opacity: 1 }], {
      duration: 180, easing: 'cubic-bezier(.2, .8, .2, 1)',
    });
  }, []);
  return (
    <div
      ref={ref}
      data-plus-gap=""
      aria-hidden="true"
      style={{
        height: PLUS_GAP_PX, borderRadius: 'var(--r-md)', overflow: 'hidden',
        border: '1.5px dashed var(--job-lime-line)', backgroundColor: 'var(--job-lime-wash)',
        display: 'grid', placeItems: 'center', color: 'var(--job-lime-text)',
      }}
    >
      <Icon name="plus" size={16} />
    </div>
  );
}

const PLUS_GAP_PX = 44;

export default function ListColumn({
  listId, listTitle, taskLists, tasks, repeatCounts,
  selectedIds, selectMode, onSelectTask, onOpenTask, onDeleteTask, onToggleTaskDone,
  onAddTask, onDeleteList, onRenameList, onShareList, hasShortLink, hidden, onToggleHidden,
  listDragHandleProps, isListDragActive, isReceivingDrop,
  onAskList, onAskTask, askSubject, onTuck, folded = false, onToggleFold,
}: ListColumnProps) {
  const isAskSubject = askSubject?.kind === 'list' && askSubject.id === listId;
  const [addingTask, setAddingTask] = useState(false);
  /* 29-1c1: the row the add field sits in front of, when the floating + was
     dropped there; `null` is the foot of the list, where it always was. */
  const [addBefore, setAddBefore] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  /* Idea 37: where the floating + is pointing in this list right now
     (`undefined` = not here; `null` = its end), and where it was let go. */
  const plusAim = usePlusDrop((s) => (s.aim?.listId === listId ? s.aim.beforeTaskId : undefined));
  useEffect(() => usePlusDrop.subscribe(({ landed, clearLanded }) => {
    if (landed?.listId !== listId) return;
    clearLanded();
    setAddBefore(landed.beforeTaskId);
    setNewTaskTitle('');
    setAddingTask(true);
  }), [listId]);
  const openAdd = () => { setAddBefore(null); setAddingTask(true); };
  /* A row it was to go in front of that has gone since sits it at the end. */
  const formBefore = addingTask && addBefore && tasks.some((t) => t.id === addBefore) ? addBefore : null;
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(listTitle);
  const [menuOpen, setMenuOpen] = useState(false);

  /** Bulk-capable: one title per line creates one task each, in order. */
  const handleAddTaskLines = (lines: string[]) => {
    if (lines.length === 0) { setAddingTask(false); return; }
    onAddTask(listId, lines, formBefore ?? undefined);
    setNewTaskTitle('');
    setAddingTask(false);
  };

  const handleRename = () => {
    if (renameValue.trim()) onRenameList(listId, renameValue.trim());
    setRenaming(false);
  };

  /* Occurrences folded out of sight are still work that was done: a row
     reading "×14" adds thirteen to both sides of the count. */
  const foldedExtra = tasks.reduce((n, t) => n + (repeatCounts?.[t.id] ?? 1) - 1, 0);
  const completedCount = doneCount(tasks) + foldedExtra;
  const totalCount = tasks.length + foldedExtra;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const minutesLeft = workLeftMinutes(tasks);
  const listValueINR = taskListValueINR(tasks, listId);
  /* What deleting this list would actually take with it. `planListDeletion`
     removes the tasks whose `listId` IS this list and only cuts the
     cross-link on the ones shared in from elsewhere — so those rows survive
     the delete and must not be counted in what it costs. */
  const ownedCount = tasks.filter((t) => t.listId === listId).length;
  /* 29-1P9a (157): folded — unless a task is held over it, which opens it
     until the task is let go or carried on, so a folded list still takes one. */
  const spine = folded && !!onToggleFold && !isReceivingDrop;

  /* BIG-3. The list's own switch is marked on its head; a project that ignores
     it says so on the project's own head instead. */
  const ignoreReason = usePriorityScores().ignored.listReason(listId);
  const ignoreItems = useIgnoreItems({ kind: 'list', id: listId }, listTitle);
  const workedItems = useWorkedItems({ kind: 'list', id: listId });

  const menuItems: MorphMenuItem[] = [
    {
      value: 'rename',
      label: 'Rename list',
      icon: <Icon name="square-pen" size={18} />,
      onSelect: () => { setRenameValue(listTitle); setRenaming(true); },
    },
    /* No "Add task" (the + beside the menu is it) and no "Ask AI" (the
       sparkles beside the + is it) — his BASE list, 2026-10-06. */
    {
      value: 'share',
      label: 'Share',
      icon: <Icon name="share-2" size={18} />,
      /* Share and Hide, two boxes in one row (OPT-10, his ask). */
      beside: true,
      // A short link already exists for this list — `ProjectCard`'s cue.
      meta: hasShortLink ? <Icon name="link" size={14} /> : undefined,
      onSelect: () => onShareList(listId),
    },
    {
      value: 'hidden',
      label: hidden ? 'Show' : 'Hide',
      icon: <Icon name={hidden ? 'eye' : 'eye-off'} size={18} />,
      onSelect: () => onToggleHidden(listId),
    },
    ...ignoreItems,
    ...workedItems,
    { divider: true },
    {
      value: 'delete',
      label: 'Delete list',
      icon: <Icon name="trash-2" size={18} />,
      tone: 'danger',
      confirm: {
        label: `Delete ${listTitle}?`,
        hint: ownedCount === 0
          ? 'Nothing in it yet.'
          : `${ownedCount} task${ownedCount === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`,
        onConfirm: () => onDeleteList(listId),
      },
    },
  ];

  /* Inline add — the same Well, field and button pair as New Session's two
     forms (UI-15), so the three agree about what adding looks like. At the foot
     of the list, or in front of the row the floating + was dropped on. */
  const addForm = (
    <motion.div
      key="plus-add-form"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      style={{ overflow: 'hidden' }}
      /* The self-dismiss guard rides the wrapper rather than the field,
         so pressing "Add" — which blurs the textarea — does not throw
         the form away before the click lands. */
      tabIndex={-1}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && !newTaskTitle.trim()) {
          setAddingTask(false);
        }
      }}
    >
      <Well pad="var(--sp-4) var(--sp-5)" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <Icon name="circle" size={16} style={{ color: 'var(--fg-4)' }} />
          <BulkAddInput
            autoFocus
            ariaLabel={`New task in ${listTitle}`}
            value={newTaskTitle}
            onChange={setNewTaskTitle}
            onSubmitLines={handleAddTaskLines}
            onCancel={() => { setAddingTask(false); setNewTaskTitle(''); }}
            placeholder="Task title… paste multiple lines to bulk-add"
            className="ag-field"
            style={{ ...INLINE_FIELD, fontSize: 'var(--text-sm)' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setAddingTask(false); setNewTaskTitle(''); }}
          >
            Cancel
          </Button>
          {/* The form's confirm: solid white since 29-1P2, as the board's own. */}
          <WhiteButton
            size="sm"
            disabled={!newTaskTitle.trim()}
            onClick={() => handleAddTaskLines(parseBulkLines(newTaskTitle))}
            icon={<Icon name="plus" size={14} />}
          >
            Add task
          </WhiteButton>
        </div>
      </Well>
    </motion.div>
  );

  return (
    <motion.div
      {...dustAttr('list', listId)}
      data-spine={spine ? '' : undefined}
      /* Idea 37: a list the floating + can be dropped into (`QuickCaptureFab`). */
      data-plus-list={spine ? undefined : listId}
      // `layout` off while a list is being dragged: the grid card is inside a
      // wrapper that dnd-kit transforms, and layout projection would measure
      // that transform and animate the card back out of it.
      layout={!isListDragActive}
      transition={{ layout: { type: 'spring', stiffness: 420, damping: 40, mass: 0.7 } }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 'var(--r-card)',
        backgroundImage: [onTuck ? PARKED_WASH : null, isReceivingDrop ? LIST_PANE_FILL_RECEIVING : LIST_PANE_FILL].filter(Boolean).join(', '),
        /* A near-solid floor under the glass (Shreekant, 2026-09-23: the
           page's green glow through V3's clear glass "looks really really
           bad on the task list"). The fill and rim still draw the pane;
           the field behind it no longer tints the tasks. */
        backgroundColor: LIST_PANE_FLOOR,
        /* Refracted, per the source. `<GlassFilters />` is mounted app-wide;
           Safari and Firefox fall back to the plain blur with no error, which
           is what the WebKit property spells out. */
        backdropFilter: 'var(--glass-bd-md-refract)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        /* The receiving ring is `--line-strong`, not a hue. A drop target is
           not one of the seven states, and emerald in particular would say a
           list is LIVE because a task is hovering over it. */
        boxShadow: isReceivingDrop
          ? `${LIST_PANE_SHADOW}, 0 0 0 2px var(--line-strong)`
          : LIST_PANE_SHADOW,
        transition: 'background-image var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass)',
      }}
    >
      {spine && onToggleFold ? (
        <Spine listId={listId} listTitle={listTitle} done={completedCount} total={totalCount} pct={pct} onOpen={onToggleFold} />
      ) : (<>
      {/* ── Header ─────────────────────────────────────────────────── */}
      {/* The same glass as the card — no fill of its own, no hairline under
          it. Two rows: who and how big, then how far in and what is left. */}
      <div
        className="ag-colhead"
        data-ai-subject={isAskSubject ? 'true' : undefined}
        style={{
          display: 'grid', gap: 'var(--sp-4)', flex: '0 0 auto',
          padding: 'var(--sp-6) var(--sp-6) var(--sp-5)',
          /* The AI panel's subject (BUILD-4): the header lifts to its own
             level-2 pane with the brighter rim — `ai-panel.html`'s list
             header. Never emerald. */
          ...(isAskSubject
            ? {
              margin: 'var(--sp-3) var(--sp-3) 0',
              padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
              borderRadius: 'var(--r-lg)',
              backgroundImage: 'var(--glass-fill-2)',
              boxShadow: AI_SUBJECT_RIM,
            }
            : {}),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
          {/* Grab here to reposition the whole list. NOT a <button>: the drag
              sensors let a press on one through instead of starting a drag
              (`SortableList.isInteractiveTarget`), so a button here could not be
              grabbed at all. dnd-kit's own `attributes` carry the role and
              tabIndex that make it reachable from the keyboard. */}
          {!onTuck && (
          <span
            {...listDragHandleProps}
            className="ag-card-grip"
            title="Drag to reorder list"
            style={{
              display: 'flex', flex: '0 0 auto', marginLeft: -6,
              color: 'var(--fg-4)', cursor: isListDragActive ? 'grabbing' : 'grab',
            }}
          >
            <Icon name="grip-vertical" size={16} />
          </span>
          )}

          {/* 29-1P9a (157): fold it away into a spine, Trello's arrow. */}
          {onToggleFold && (
            <IconButton
              size="sm"
              variant="ghost"
              label={`Fold ${listTitle} away`}
              title="Fold this list away"
              aria-expanded
              onClick={() => onToggleFold(listId)}
              style={{ flex: '0 0 auto', marginLeft: onTuck ? 0 : -4 }}
            >
              <Icon name="chevron-left" size={16} />
            </IconButton>
          )}

          {renaming ? (
            <input
              autoFocus
              type="text"
              data-ag-field=""
              className="ag-field"
              aria-label={`Rename ${listTitle}`}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              onBlur={handleRename}
              style={{
                ...INLINE_FIELD,
                fontSize: 'var(--text-md)',
                borderBottom: '1px solid var(--job-lime-line)',
                paddingBottom: 2,
              }}
            />
          ) : (
            <h2
              style={{
                minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                font: 'var(--type-title)', fontSize: 'var(--text-md)',
                letterSpacing: 'var(--tracking-ui)', color: onTuck ? 'var(--job-indigo)' : 'var(--fg-1)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {listTitle}
              </span>
              {hidden && (
                <Icon
                  name="eye-off"
                  size={13}
                  title="Hidden from shared links"
                  style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}
                />
              )}
              {ignoreReason && isOwnSwitch(ignoreReason, { kind: 'list', id: listId }) && (
                <IgnoredMark title={ignoreSentence(ignoreReason, { kind: 'list', id: listId })} />
              )}
            </h2>
          )}

          <span style={{ ...MONO, flex: '0 0 auto', color: 'var(--fg-4)' }}>
            {completedCount}/{totalCount}
          </span>

          <span style={{ flex: 1 }} />

          {listValueINR > 0 && (
            /* The same chip `ProjectCard` gives a project's budget, and the
               one the mockup gives a list's — a number, on neutral glass, in
               the mono face. */
            <span
              title="Total ₹ value of tasks in this list"
              style={{
                ...MONO,
                flex: '0 0 auto', fontSize: 'var(--text-2xs)', color: 'var(--fg-2)',
                padding: '3px var(--sp-4)', borderRadius: 'var(--r-pill)',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
              }}
            >
              {formatINR(listValueINR)}
            </span>
          )}

          {/* Always visible, and deliberately NOT `.ag-card-actions`: that class
              hides at rest and is revealed by `.ag-card:hover`, which this pane
              is not — it is a list header, i.e. chrome, not a card's overlay
              controls. The grip beside them is `.ag-card-grip`, which the
              mockup DOES hide, because it moves the whole column rather than
              acting on what is in it. */}
          <span style={{ display: 'flex', flex: '0 0 auto', gap: 2 }}>
            {onTuck && (
              <IconButton size="sm" variant="ghost" label="Tuck the Backburner away" onClick={onTuck}>
                <Icon name="chevron-up" size={16} />
              </IconButton>
            )}
            {/* The list's Ask, as a task row has its own (his BASE list). */}
            {onAskList && (
              <IconButton
                size="sm"
                variant="plain"
                label={`Ask AI about ${listTitle}`}
                aria-pressed={isAskSubject ? true : undefined}
                onClick={() => onAskList(listId)}
                style={askInk(isAskSubject)}
              >
                <Icon name="sparkles" size={16} />
              </IconButton>
            )}
            <IconButton
              size="sm"
              variant="ghost"
              label={`Add a task to ${listTitle}`}
              onClick={openAdd}
            >
              <Icon name="plus" size={16} />
            </IconButton>

            <MorphMenu
              align="end"
              width={244}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              /* This card is `overflow: hidden` — that is what rounds it — so
                 an in-flow panel is clipped by the very card it hangs from, and
                 a short list clips nearly all of it. `portal` is MorphMenu's
                 port note 4, written for exactly this. */
              portal
              zIndex={Z.dropdown}
              trigger={
                <IconButton size="sm" variant="ghost" label={`Actions for ${listTitle}`}>
                  <Icon name="chevron-down" size={16} />
                </IconButton>
              }
              /* The panel covers the list it acts on, so the list is restated
                 inside it — otherwise "Delete" is offered against nothing. */
              header={{
                title: listTitle,
                meta: [
                  `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
                  minutesLeft > 0 ? `${minutesLabel(minutesLeft)} left` : null,
                  listValueINR > 0 ? formatINR(listValueINR) : null,
                  hidden ? 'hidden from shares' : null,
                ].filter(Boolean).join('  ·  '),
              }}
              items={menuItems}
            />
          </span>
        </div>

        {/* Two numbers per list, and only two: how far in, and work left. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <span style={{ flex: 1 }}>
            <Meter pct={pct} />
          </span>
          <span style={{ ...MONO, color: 'var(--fg-4)' }}>
            {minutesLeft > 0 ? `${minutesLabel(minutesLeft)} left` : 'nothing left'}
          </span>
        </div>
      </div>

      {/* ── Cross-list drop hint ───────────────────────────────────── */}
      <AnimatePresence>
        {isReceivingDrop && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', flex: '0 0 auto' }}
          >
            <div
              className="ag-kicker"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 'var(--sp-3)', padding: '0 0 var(--sp-4)', color: 'var(--fg-2)',
              }}
            >
              <Icon name="plus" size={12} />
              Drop to move here
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Tasks ──────────────────────────────────────────────────── */}
      {/*
        `minmax(0, 1fr)`, never a bare `1fr`. A grid item's automatic minimum
        size is its MIN-CONTENT, so a row holding a nowrap chip — a long
        "Waiting on <task>" pill, say — refuses to shrink and pushes itself
        straight out of the card, which then clips it. Measured: a row 34px
        wider than the column it lives in. The old markup was `space-y-*` on a
        block container, where rows could never be wider than their parent in
        the first place; that is what this line buys back.
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--sp-3)',
          alignContent: 'start',
          padding: '0 var(--sp-5)',
        }}
        /* Idea 37: the rows the floating + aims between (`QuickCaptureFab`). */
        data-plus-rows=""
      >
        <SortableGroup id={listId}>
          <AnimatePresence>
            {tasks.flatMap((task) => [
              ...(plusAim === task.id ? [<PlusGap key="plus-gap" />] : []),
              ...(formBefore === task.id ? [addForm] : []),
              <SortableRow key={task.id} id={task.id}>
                {({ isDragging, isAnyDragging }) => (
                  <TaskRow
                    task={task}
                    selected={selectedIds.has(task.id)}
                    selectMode={selectMode}
                    onSelect={onSelectTask}
                    onOpen={onOpenTask}
                    onDelete={onDeleteTask}
                    onToggleDone={onToggleTaskDone}
                    isBeingDragged={isDragging}
                    isReceivingDrop={isReceivingDrop}
                    isSharedHere={task.listId !== listId}
                    primaryListTitle={task.listId !== listId ? getListTitle(taskLists, task.listId, task.listName) : undefined}
                    isAnyDragging={isAnyDragging}
                    onAsk={onAskTask}
                    isAskSubject={askSubject?.kind === 'task' && askSubject.id === task.id}
                    repeatCount={repeatCounts?.[task.id]}
                  />
                )}
              </SortableRow>,
            ])}
          </AnimatePresence>
        </SortableGroup>
        {plusAim === null && <PlusGap />}

        <AnimatePresence>
          {addingTask && formBefore === null && addForm}
        </AnimatePresence>

        {tasks.length === 0 && !addingTask && !isReceivingDrop && (
          /* One sentence, not a placeholder card. The footer below is already
             the thing to press. */
          <LitLine
            as="p"
            text="Nothing here yet. **Drag a task in**, or add one below."
            style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: 'var(--sp-6) var(--sp-2)' }}
          />
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      {/* Permanent, because adding the second task should not be harder than
          adding the first. Dashed, because that is how this system draws an
          empty slot — see the note at the top. No `margin-top: auto`: the
          board stopped stretching its columns to a common height at UI-29, so
          this sits under the last row rather than at the foot of a void. */}
      <div style={{ padding: 'var(--sp-5)' }}>
        <button
          type="button"
          className="ag-addrow"
          onClick={openAdd}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-3)',
            width: '100%', minHeight: 44, borderRadius: 'var(--r-pill)',
            cursor: 'pointer', font: 'var(--type-label)',
          }}
        >
          <Icon name="plus" size={16} />
          Add task
        </button>
      </div>
      </>)}
    </motion.div>
  );
}
