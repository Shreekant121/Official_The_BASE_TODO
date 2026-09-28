import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
  type MouseSensorOptions,
  type TouchSensorOptions,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import { parseScopedItemId, resolveBoardDrop, scopedItemId } from '../lib/boardDrop';
import { Z } from '../lib/zLayers';
import { V3Scope, useV3 } from '../ui';

/**
 * The app's drag-and-drop, on top of `dnd-kit`. Two containers, both
 * pointer-based, sharing every sensor and every rule:
 *
 * - `<SortableList>` — one flat list. Home's projects, Set Deadlines, New
 *   Session's queue.
 * - `<SortableBoard>` + `<SortableGroup>` — a grid of lists whose rows move
 *   *between* lists as well as within them. ProjectView, and nothing else.
 *
 * Both replaced native HTML5 drag events, which worked with a mouse and not at
 * all with a finger: a touch never fires `dragstart`/`dragover`/`drop`. The one
 * native drag left in the app is New Session's subtask → queue gesture
 * (`components/session/QueueSubtaskTree.tsx`), a different shape — a copy onto a
 * single target, not a reorder — which neither of these serves.
 *
 * Rows are `<SortableRow>` in both, because a hook cannot do this job:
 * `useSortable` has to be called *inside* each row, and a parent cannot call a
 * hook per item in a `.map()`:
 *
 *     <SortableList ids={ids} onReorder={onReorder} className="...">
 *       {rows.map((row) => (
 *         <SortableRow key={row.id} id={row.id}>
 *           {({ isDragging, isAnyDragging }) => <motion.div ... />}
 *         </SortableRow>
 *       ))}
 *     </SortableList>
 *
 * `SortableRow` renders a plain `<div>` wrapper around whatever the render
 * prop returns, and **that wrapper is where the transform lives**. This is not
 * incidental: every row in this app is a `motion.div` whose `animate` writes
 * `x`/`scale`, and Framer Motion sets `style.transform` wholesale rather than
 * merging into it. Put dnd-kit's transform on the same element and whichever
 * wrote last wins — the row either stops following the pointer or stops
 * animating. On separate elements there is no contest.
 *
 * The corollary is the `isAnyDragging` flag handed to the render prop: a row
 * that uses Framer's `layout` prop must switch it off while a drag is in
 * progress (`layout={!isAnyDragging}`), or layout projection measures the
 * wrapper's transform and animates the row straight back out of it.
 */

/** Long-press before a touch drag begins — long enough that a scroll flick is
 *  never mistaken for a grab, short enough to still feel like picking up. */
const LONG_PRESS_MS = 200;

/** How far a finger may wander during that press before it counts as a scroll
 *  instead (px). Generous and the list stops scrolling; tiny and a drag
 *  started by a not-quite-still thumb never begins. */
const TOUCH_TOLERANCE_PX = 6;

/** Mouse travel before a drag starts. This is what lets a project card be both
 *  draggable and clickable: below it, the gesture is still a click. */
const MOUSE_ACTIVATION_PX = 6;

const VERTICAL_ONLY: Modifier[] = [restrictToVerticalAxis];
const UNRESTRICTED: Modifier[] = [];

/**
 * These rows change size while a drag is in flight — a subtask tree expands, a
 * Framer spring is still settling — and the default measuring strategy takes
 * each droppable's rect once, on drag start. Rows would then be tested against
 * stale boxes and the drop would land a slot out.
 */
const MEASURE_ALWAYS = { droppable: { strategy: MeasuringStrategy.Always } };

const TAGS_THAT_OWN_THE_POINTER = new Set([
  'button', 'input', 'textarea', 'select', 'option', 'a', 'label',
]);

/**
 * Every row in this app has working controls inside it — the hh/mm boxes on
 * Set Deadlines, a row's own edit/remove buttons, a project card's ⋯ menu. A
 * sensor that fired on any pointer-down inside the row would eat them:
 * pressing into the hours field and dragging across the digits would pick the
 * task up instead of selecting the text. Session 7a went out of its way to
 * keep those six inputs selectable; this is the other half of that promise.
 *
 * The walk stops at the row wrapper rather than at `<body>`, so a press on an
 * ordinary part of the row still starts a drag.
 *
 * It walks from `Element`, NOT from `HTMLElement`, and that is not tidying.
 * An icon-only button contains an `<svg>`, and an `SVGElement` is not an
 * `HTMLElement` — so a press that landed on the glyph rather than on the ring
 * of padding around it started the walk at `null`, fell straight through to
 * `false`, and picked the whole row up. Every control in this app whose entire
 * content is a Lucide glyph was affected: ProjectView's row actions, New
 * Session's ⋯ trigger, Set Deadlines' steppers. Measured by dragging from a
 * row's own disclosure button and watching the list reorder underneath it.
 */
function isInteractiveTarget(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null;
  while (node) {
    if (node.hasAttribute('data-drag-row')) return false;
    if (TAGS_THAT_OWN_THE_POINTER.has(node.tagName.toLowerCase())) return true;
    if (node instanceof HTMLElement && node.isContentEditable) return true;
    node = node.parentElement;
  }
  return false;
}

class RowMouseSensor extends MouseSensor {
  static activators = [
    {
      eventName: 'onMouseDown' as const,
      handler: ({ nativeEvent: event }: ReactMouseEvent, { onActivation }: MouseSensorOptions) => {
        if (event.button !== 0) return false;
        if (isInteractiveTarget(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

class RowTouchSensor extends TouchSensor {
  static activators = [
    {
      eventName: 'onTouchStart' as const,
      handler: ({ nativeEvent: event }: ReactTouchEvent, { onActivation }: TouchSensorOptions) => {
        if (event.touches.length > 1) return false;
        if (isInteractiveTarget(event.target)) return false;
        onActivation?.({ event });
        return true;
      },
    },
  ];
}

/**
 * MouseSensor and TouchSensor rather than the combined PointerSensor, because
 * the two need *different* activation constraints and a PointerSensor carries
 * only one: a mouse should commit after a few pixels of travel, a finger only
 * after a deliberate press.
 */
function useRowSensors() {
  return useSensors(
    useSensor(RowMouseSensor, { activationConstraint: { distance: MOUSE_ACTIVATION_PX } }),
    useSensor(RowTouchSensor, {
      activationConstraint: { delay: LONG_PRESS_MS, tolerance: TOUCH_TOLERANCE_PX },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/** dnd-kit id of the row being dragged in the nearest enclosing container, or null. */
const ActiveRowContext = createContext<string | null>(null);

/** Set by `SortableGroup` — the list a row belongs to, or null in a flat list. */
const GroupContext = createContext<string | null>(null);

interface BoardContextValue {
  itemsByContainer: Readonly<Record<string, readonly string[]>>;
  /** The row being dragged, or null — including while a whole list is dragged. */
  activeItem: { containerId: string; itemId: string } | null;
  /** Which list the pointer is over, list id or row's list alike. */
  overContainerId: string | null;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// ─── SortableList — one flat list ────────────────────────────────────────────

interface SortableListProps {
  /** Row ids in their current visual order. Must match the rendered rows. */
  ids: string[];
  /** Called with the full new order — never with indices. */
  onReorder: (orderedIds: string[]) => void;
  /**
   * `'y'` (default) — a single column: the drag is pinned to the vertical axis
   * and rows slide up and down past each other.
   * `'xy'` — a CSS grid whose cards sit side by side (Home's projects), where
   * sideways movement means something.
   */
  axis?: 'y' | 'xy';
  className?: string;
  /** Inline style for the container. Aurora Glass screens style with tokens
   *  rather than utilities, and this container is often the scroller itself. */
  style?: CSSProperties;
  children: ReactNode;
}

export function SortableList({ ids, onReorder, axis = 'y', className, style, children }: SortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useRowSensors();

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }, [ids, onReorder]);

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={axis === 'y' ? VERTICAL_ONLY : UNRESTRICTED}
      measuring={MEASURE_ALWAYS}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <ActiveRowContext.Provider value={activeId}>
        <SortableContext
          items={ids}
          strategy={axis === 'y' ? verticalListSortingStrategy : rectSortingStrategy}
        >
          <div className={className} style={style}>{children}</div>
        </SortableContext>
      </ActiveRowContext.Provider>
    </DndContext>
  );
}

// ─── SortableBoard — a grid of lists, rows moving between them ───────────────

interface SortableBoardProps {
  /** List ids in their current visual order. */
  containerIds: string[];
  /** Each list's row ids, in their current visual order. */
  itemsByContainer: Readonly<Record<string, readonly string[]>>;
  /** Whole-list reorder, with the full new order. */
  onReorderContainers: (orderedIds: string[]) => void;
  /** A row moved within its own list, with that list's full new order. */
  onReorderItems: (containerId: string, orderedIds: string[]) => void;
  /** A row moved into another list. `beforeItemId` null means the end of it. */
  onMoveItem: (itemId: string, toContainerId: string, beforeItemId: string | null) => void;
  /**
   * The pointer-following preview of a row being dragged.
   *
   * A row has to be *previewed* rather than simply carried, because a list card
   * clips its own contents — `overflow-hidden` is what rounds its corners — so a
   * row dragged towards another list would be cut off at the edge of the one it
   * came from, and cross-list drag is the whole point. dnd-kit's `DragOverlay`
   * draws it outside every list instead, and is portalled to `<body>` because a
   * `backdrop-filter` anywhere up the tree (every glass surface here has one)
   * makes that ancestor the containing block for `position: fixed` and would
   * clip it all over again.
   */
  renderItemOverlay: (itemId: string) => ReactNode;
  className?: string;
  children: ReactNode;
}

export function SortableBoard({
  containerIds,
  itemsByContainer,
  onReorderContainers,
  onReorderItems,
  onMoveItem,
  renderItemOverlay,
  className,
  children,
}: SortableBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const sensors = useRowSensors();
  const v3 = useV3();

  // A scoped id is a row, a bare one a list card, and that single distinction
  // is how one `DndContext` serves both gestures. It has to be one: a row
  // dropped into a *different* list must collide with droppables registered by
  // that list, and two contexts cannot see each other's droppables at all.
  const activeItem = useMemo(() => (activeId ? parseScopedItemId(activeId) : null), [activeId]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggedId = String(args.active.id);

    // A list card only ever lands on another list card. Without this filter it
    // would collide with the task rows inside its neighbours — which sit nearer
    // the pointer than the cards do — and leave `over` set to something no list
    // can be reordered against.
    if (!parseScopedItemId(draggedId)) {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => !parseScopedItemId(String(c.id))),
      });
    }

    const hits = pointerWithin(args);
    const collisions = hits.length > 0 ? hits : rectIntersection(args);
    const first = getFirstCollision(collisions, 'id');
    if (first == null) return collisions;

    const overId = String(first);
    if (parseScopedItemId(overId)) return collisions;

    // The pointer is inside a list but not over any of its rows — its header,
    // the gap below the last row, a tall card's empty bottom half. Re-aim at
    // the nearest row of *that* list, so the drop lands where the pointer is
    // pointing instead of always at the end. An empty list has no row to re-aim
    // at and stays the target itself, which is what `resolveBoardDrop` reads as
    // "append" — the only way a task can be dropped into an empty list at all.
    const rows = (itemsByContainer[overId] ?? []).map((itemId) => scopedItemId(overId, itemId));
    if (rows.length === 0) return collisions;
    const withinList = closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id !== args.active.id && rows.includes(String(c.id)),
      ),
    });
    return withinList.length > 0 ? withinList : collisions;
  }, [itemsByContainer]);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
  }, []);

  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    if (!over) { setOverContainerId(null); return; }
    const overId = String(over.id);
    setOverContainerId(parseScopedItemId(overId)?.containerId ?? overId);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setOverContainerId(null);
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);
    const dragged = parseScopedItemId(draggedId);

    if (!dragged) {
      const from = containerIds.indexOf(draggedId);
      const to = containerIds.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return;
      onReorderContainers(arrayMove(containerIds, from, to));
      return;
    }

    // Where the drop was *aimed*, which is the pointer and not the preview: the
    // preview keeps whatever offset the row was grabbed at, so a row picked up
    // by its bottom edge floats above the finger. `pointerWithin` already chose
    // `over` from the pointer, and the same coordinate has to decide which half
    // of that row this landed in, or the two answers disagree by a slot. A
    // keyboard move has no pointer and falls back to the preview's own centre.
    const activatorAt = getEventCoordinates(event.activatorEvent);
    const draggedRect = active.rect.current.translated;
    const releasedAtY = activatorAt
      ? activatorAt.y + delta.y
      : draggedRect ? draggedRect.top + draggedRect.height / 2 : over.rect.top;

    const overItem = parseScopedItemId(overId);
    const drop = resolveBoardDrop({
      itemsByContainer,
      from: dragged,
      over: { containerId: overItem?.containerId ?? overId, itemId: overItem?.itemId ?? null },
      releasedAtY,
      overCenterY: over.rect.top + over.rect.height / 2,
    });

    if (drop.kind === 'reorder') onReorderItems(drop.containerId, drop.orderedIds);
    if (drop.kind === 'move') onMoveItem(drop.itemId, drop.toContainerId, drop.beforeItemId);
  }, [containerIds, itemsByContainer, onReorderContainers, onReorderItems, onMoveItem]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverContainerId(null);
  }, []);

  const board = useMemo<BoardContextValue>(
    () => ({ itemsByContainer, activeItem, overContainerId }),
    [itemsByContainer, activeItem, overContainerId],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={MEASURE_ALWAYS}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <BoardContext.Provider value={board}>
        <ActiveRowContext.Provider value={activeId}>
          <SortableContext items={containerIds} strategy={rectSortingStrategy}>
            <div className={className}>{children}</div>
          </SortableContext>
        </ActiveRowContext.Provider>
      </BoardContext.Provider>

      {/*
        Mounted for a row and never for a list card. An overlay that exists at
        all stops dnd-kit displacing the thing being dragged (`useSortable`'s
        `shouldDisplaceDragSource`), and a list card is *meant* to travel with
        the pointer itself — so an always-mounted overlay with nothing in it
        would still register a rect and quietly freeze every card in place.
      */}
      {activeItem && createPortal(
        /* The ghost is portalled out of the board's DOM, so a board inside a
           `<V3Scope>` re-enters it here or the row changes look mid-drag. */
        v3 ? (
          <V3Scope>
            <DragOverlay zIndex={Z.dragGhost} dropAnimation={null}>
              {renderItemOverlay(activeItem.itemId)}
            </DragOverlay>
          </V3Scope>
        ) : (
          <DragOverlay zIndex={Z.dragGhost} dropAnimation={null}>
            {renderItemOverlay(activeItem.itemId)}
          </DragOverlay>
        ),
        document.body,
      )}
    </DndContext>
  );
}

interface SortableGroupProps {
  /** The list id. Its rows come from the board's `itemsByContainer`. */
  id: string;
  children: ReactNode;
}

/**
 * One list's rows inside a `SortableBoard`. Renders no DOM of its own, because
 * the caller's card is already both the surface that highlights and the
 * droppable a row lands on when it misses every row; a wrapper here would put a
 * second box around every grid item for nothing.
 *
 * A row's dnd-kit id is scoped to its list (`lib/boardDrop.ts`), which
 * `SortableRow` reads off this context and applies for itself: a task shared
 * into a second list renders a row in both, and two draggables with the same id
 * inside one `DndContext` silently collide.
 */
export function SortableGroup({ id, children }: SortableGroupProps) {
  const board = useContext(BoardContext);
  const items = board?.itemsByContainer[id];
  const scoped = useMemo(() => (items ?? []).map((itemId) => scopedItemId(id, itemId)), [id, items]);

  return (
    <GroupContext.Provider value={id}>
      <SortableContext items={scoped} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </GroupContext.Provider>
  );
}


// ─── SortableRow — one row, in either container ──────────────────────────────

/** dnd-kit's activator bundle — the ARIA `attributes` plus the pointer and
 *  keyboard `listeners` — ready to spread onto a drag handle. */
export type DragHandleProps = HTMLAttributes<HTMLElement> & {
  ref?: (element: HTMLElement | null) => void;
};

export interface SortableRowState {
  /** This row is the one being dragged. */
  isDragging: boolean;
  /** Some row at this row's own level is being dragged — turn `layout` off. */
  isAnyDragging: boolean;
  /**
   * A row from *another* list is hovering over this one, which makes this list
   * where it lands if the pointer is released — highlight, and invite the drop.
   *
   * Only ever true for a list card on a `SortableBoard`; a flat list has nothing
   * to receive from and a task row is not somewhere a task can land. The card
   * cannot work this out for itself, because the pointer is almost always over
   * one of its *rows* rather than its own edges — a card watching only its own
   * hover state would never light up at all.
   */
  isReceivingItem: boolean;
  /** Populated only when `handle` is set; spread onto the grip element. */
  handleProps: DragHandleProps;
}

interface SortableRowProps {
  id: string;
  /**
   * When set, the row is grabbed by a dedicated handle (ProjectView's list
   * grip) rather than anywhere on the row. The render prop then has to spread
   * `handleProps` onto that handle, or nothing can start the drag.
   */
  handle?: boolean;
  /** Class for the wrapper. Needed in CSS grids, where the wrapper — not the
   *  card inside it — is the grid item, so the card needs `h-full` to keep
   *  stretching to the row height the way it did before the wrapper existed. */
  className?: string;
  children: (state: SortableRowState) => ReactNode;
}

const NO_HANDLE: DragHandleProps = {};

export function SortableRow({ id, handle = false, className, children }: SortableRowProps) {
  const groupId = useContext(GroupContext);
  const sortableId = groupId === null ? id : scopedItemId(groupId, id);
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id: sortableId });
  const activeId = useContext(ActiveRowContext);
  const board = useContext(BoardContext);

  // Only a drag at this row's own level counts. On a board, list cards and the
  // task rows inside them are all `SortableRow`s in one context, and a task
  // being dragged must not switch the *cards'* layout animation off — the grid
  // still has to reflow around a card whose list is about to lose or gain a row.
  const isAnyDragging =
    activeId !== null && (parseScopedItemId(activeId) !== null) === (groupId !== null);

  const isReceivingItem =
    groupId === null &&
    board?.activeItem != null &&
    board.activeItem.containerId !== id &&
    board.overContainerId === id;

  const handleProps = handle
    ? ({ ref: setActivatorNodeRef, ...attributes, ...listeners } as DragHandleProps)
    : NO_HANDLE;

  /*
   * Without a dedicated handle, the wrapper IS the activator — and saying so is
   * load-bearing for the keyboard.
   *
   * `KeyboardSensor`'s activator fires on any `onKeyDown` that bubbles to the
   * element carrying its listeners, and it only bows out when
   * `active.activatorNode.current` is set AND the event landed somewhere else
   * (`core.cjs`, the `keyboardCodes.start` branch). Leave the activator node
   * unset and that guard is skipped, so Enter on ANY button inside a row —
   * ProjectView's "Open task", its subtask chevron, its select-mode checkbox,
   * New Session's ⋯ trigger — was `preventDefault`ed and started a keyboard
   * drag instead of pressing the button. The mouse and touch sensors never had
   * this problem because `isInteractiveTarget` already turns them away.
   *
   * Pointing the activator at the wrapper restores the intended split: Enter on
   * the row (which dnd-kit's own `attributes` make focusable and
   * `role="button"`) still starts a drag; Enter on a control inside it presses
   * the control.
   */
  const setRowRef = useCallback((node: HTMLDivElement | null) => {
    setNodeRef(node);
    if (!handle) setActivatorNodeRef(node);
  }, [handle, setNodeRef, setActivatorNodeRef]);

  return (
    <div
      ref={setRowRef}
      // The hook Session 7a's touch CSS hangs off. Those rules keyed off
      // `[draggable='true']`, the attribute React wrote for native HTML5 drag.
      // dnd-kit never sets it, so without this the selector would quietly stop
      // matching and the tablet's share sheet would come straight back.
      data-drag-row=""
      className={className}
      style={{
        // `Translate`, not `Transform`: the grid strategy also returns
        // scaleX/scaleY when neighbouring cards differ in size, and
        // ProjectView's list cards differ a lot. Applying that scale squashes
        // a card's own text as it passes a taller one.
        transform: CSS.Translate.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 30 : undefined,
      }}
      {...(handle ? {} : attributes)}
      {...(handle ? {} : listeners)}
    >
      {children({ isDragging, isAnyDragging, isReceivingItem, handleProps })}
    </div>
  );
}
