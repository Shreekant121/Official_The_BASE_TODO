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
 * - **The hue dot is 4px and flat.** Ours was 8px under a `0 0 6px` glow, and
 *   the mockup says why in as many words: the project's identity hue *"is
 *   rationed to a 4px dot and a hairline — never a card glow, because emerald
 *   has to stay the only colour that means anything."*
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
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Icon, IconButton, MorphMenu, Well, type MorphMenuItem } from '../../ui';
import BulkAddInput from '../BulkAddInput';
import TaskRow from './TaskRow';
import { Meter } from './parts';
import { doneCount, minutesLabel, workLeftMinutes } from './derive';
import { SortableGroup, SortableRow, type DragHandleProps } from '../SortableList';
import { parseBulkLines } from '../../lib/bulkAdd';
import { Z } from '../../lib/zLayers';
import { getListTitle, taskListValueINR, formatINR, type Task, type TaskList } from '../../store/useStore';
import { AI_SUBJECT_RIM } from '../../ui/overlay/AIPanel';

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
  listColor: string;
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
  onAddTask: (listId: string, titles: string[]) => void;
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
}

export default function ListColumn({
  listId, listTitle, listColor, taskLists, tasks, repeatCounts,
  selectedIds, selectMode, onSelectTask, onOpenTask, onDeleteTask, onToggleTaskDone,
  onAddTask, onDeleteList, onRenameList, onShareList, hasShortLink, hidden, onToggleHidden,
  listDragHandleProps, isListDragActive, isReceivingDrop,
  onAskList, onAskTask, askSubject,
}: ListColumnProps) {
  const isAskSubject = askSubject?.kind === 'list' && askSubject.id === listId;
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(listTitle);
  const [menuOpen, setMenuOpen] = useState(false);

  /** Bulk-capable: one title per line creates one task each, in order. */
  const handleAddTaskLines = (lines: string[]) => {
    if (lines.length === 0) { setAddingTask(false); return; }
    onAddTask(listId, lines);
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

  const menuItems: MorphMenuItem[] = [
    {
      value: 'rename',
      label: 'Rename list',
      icon: <Icon name="square-pen" size={18} />,
      onSelect: () => { setRenameValue(listTitle); setRenaming(true); },
    },
    {
      value: 'add',
      label: 'Add task',
      icon: <Icon name="plus" size={18} />,
      onSelect: () => setAddingTask(true),
    },
    ...(onAskList
      ? [{
        value: 'ask',
        label: 'Ask AI about this list',
        icon: <Icon name="sparkles" size={18} />,
        onSelect: () => onAskList(listId),
      } satisfies MorphMenuItem]
      : []),
    {
      value: 'share',
      label: 'Share list',
      icon: <Icon name="share-2" size={18} />,
      // A short link already exists for this list — `ProjectCard`'s cue.
      meta: hasShortLink ? <Icon name="link" size={14} /> : undefined,
      onSelect: () => onShareList(listId),
    },
    {
      value: 'hidden',
      label: hidden ? 'Show in shares' : 'Hide from shares',
      icon: <Icon name={hidden ? 'eye' : 'eye-off'} size={18} />,
      onSelect: () => onToggleHidden(listId),
    },
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

  return (
    <motion.div
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
        backgroundImage: isReceivingDrop ? LIST_PANE_FILL_RECEIVING : LIST_PANE_FILL,
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

          <span
            aria-hidden="true"
            style={{
              width: 4, height: 4, flex: '0 0 auto', borderRadius: 'var(--r-circle)',
              background: listColor,
            }}
          />

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
                borderBottom: '1px solid var(--accent-hairline)',
                paddingBottom: 2,
              }}
            />
          ) : (
            <h2
              style={{
                minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                font: 'var(--type-title)', fontSize: 'var(--text-md)',
                letterSpacing: 'var(--tracking-ui)', color: 'var(--fg-1)',
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
            <IconButton
              size="sm"
              variant="ghost"
              label={`Add a task to ${listTitle}`}
              onClick={() => setAddingTask(true)}
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
      >
        <SortableGroup id={listId}>
          <AnimatePresence>
            {tasks.map((task) => (
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
              </SortableRow>
            ))}
          </AnimatePresence>
        </SortableGroup>

        {/* Inline add — the same Well, field and button pair as New Session's
            two forms (UI-15), so the three agree about what adding looks like. */}
        <AnimatePresence>
          {addingTask && (
            <motion.div
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
                  <Button
                    size="sm"
                    variant="tint"
                    tone="accent"
                    disabled={!newTaskTitle.trim()}
                    onClick={() => handleAddTaskLines(parseBulkLines(newTaskTitle))}
                    iconLeft={<Icon name="plus" size={14} />}
                  >
                    Add task
                  </Button>
                </div>
              </Well>
            </motion.div>
          )}
        </AnimatePresence>

        {tasks.length === 0 && !addingTask && !isReceivingDrop && (
          /* One sentence, not a placeholder card. The footer below is already
             the thing to press. */
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: 'var(--sp-6) var(--sp-2)' }}>
            Nothing here.
          </p>
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
          onClick={() => setAddingTask(true)}
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
    </motion.div>
  );
}
