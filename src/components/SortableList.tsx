import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
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
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';
import { parseScopedItemId, resolveBoardDrop, scopedItemId } from '../lib/boardDrop';
import { Z } from '../lib/zLayers';
import { cue } from '../lib/sound';
import { V3Scope, useMotion, useV3 } from '../ui';

/**
 * The app's drag-and-drop, on top of `dnd-kit`. Two containers, both
 * pointer-based, sharing every sensor and every rule:
 *
 * - `<SortableList>` — one flat list. Home's projects, Set Deadlines, New
 *   Session's queue.
 * - `<SortableBoard>` + `<SortableGroup>` — a grid of lists whose rows move
 *   *between* lists as well as within them. ProjectView, and nothing else;
 *   two boards side by side share one `<SortableBoardHost>` (BIG-5), so a row
 *   crosses from one project's board to the other's.
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

/**
 * Auto-scroll up and down only (2026-09-29). A card held near the right edge
 * of the screen pushed the page sideways — the held card's own overhang made
 * room to scroll into, so it kept going — and everything slid out from under
 * the pointer: measured, 819px of drift in 600ms, and a drop that landed on
 * nothing. None of these lists ever needs to scroll sideways.
 *
 * And a band of 10% of the screen, not dnd-kit's 20%: on the tablet the whole
 * middle of a card in the bottom row sat inside the 20% band, so resting on it
 * scrolled the page instead — the content moved under a still finger and
 * "Put inside" could never arm there.
 */
const VERTICAL_AUTOSCROLL = { threshold: { x: 0, y: 0.1 } };
/**
 * A grid card stays inside the visible part of the screen that scrolls
 * (2026-09-29). Left free, a card held near the bottom hung past the end of
 * the grid, which made room to scroll into, which carried the card further
 * down — measured, 719px of runaway on the tablet while a finger rested on the
 * bottom card, so "Put inside" could never arm there. Kept inside, the page
 * still scrolls to bring a card into view and stops at its real end.
 */
const IN_VIEW: Modifier[] = [restrictToFirstScrollableAncestor];

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

/** The row a dragged row would be dropped *into* on release (BIG-2), or null. */
const IntoTargetContext = createContext<string | null>(null);

/**
 * How much a row grows when it is picked up (2026-09-29). A project card is
 * big and sits in a grid, so it lifts clearly; a full-width row in a list
 * lifts by a hair, or it would poke past the list's own edges.
 */
const LiftContext = createContext(1.015);
const CARD_LIFT = 1.03;
const ROW_LIFT = 1.015;
/**
 * A card about to go inside another shrinks towards the finger, and the target
 * swells. Half size, measured against a bigger number first: at 0.9 the held
 * card still covered the whole middle of the target — its label, its name —
 * and the drop said nothing it could be seen saying.
 */
const INTO_SHRINK = 0.5;
const INTO_SWELL = 1.035;

/**
 * Where on the row it was picked up, from its own top-left (2026-09-29). The
 * lift and the shrink are drawn about this point, so the card grows and
 * shrinks around the finger holding it rather than around its own middle,
 * which would slide it out from under the finger.
 */
const GrabContext = createContext<{ x: number; y: number } | null>(null);

/*
 * PICK-UP AND DROP SOUNDS (29-1P3, idea 121). A soft low "tock" when a row is
 * picked up, a tiny click for each slot it passes — higher the further it has
 * gone — and a crisp tap where it lands, through `lib/sound.ts`. The buzz that
 * goes with each (122) is only for a finger: under a mouse there is a cursor
 * to say "you have it", which is why this file only ever buzzed on touch.
 */

function isTouchEvent(event: Event | null | undefined): boolean {
  return !!event && event.type.startsWith('touch');
}

/** The landing animations below are skipped for someone who asked for less motion. */
function prefersLessMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/*
 * SNAP INTO PLACE (idea 125, 29-1P6c; macOS window snapping). A board row is
 * carried by its ghost, so on release the ghost vanishes and the row appears
 * in its slot — and for a row dropped in ANOTHER list there was nothing to
 * glide at all: its sortable id is scoped to its list, so it mounts there as
 * a new row. The host leaves the ghost's last rect here, under the id the row
 * will have once it lands, and that row — the same one or a new one — glides
 * in from it on the springy curve, so the drop is pulled into its slot and
 * settles with a little give. Kept for one second: anything later is stale.
 */
let pendingLanding: { sortId: string; left: number; top: number; width: number; height: number; at: number } | null = null;

function takeLanding(sortId: string) {
  const landing = pendingLanding;
  if (!landing || landing.sortId !== sortId) return null;
  pendingLanding = null;
  return performance.now() - landing.at < 1000 ? landing : null;
}

/** Marks a row whose drop is animating it into another, so its own landing stays out of the way. */
const LANDING_INTO = 'into';

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
  /**
   * BIG-2 — dropping a row onto the middle of another puts it inside that one
   * rather than beside it (a project card into another project). Leave it out
   * and the list only reorders, exactly as before.
   */
  onDropInto?: (itemId: string, targetId: string) => void;
  children: ReactNode;
}

/**
 * How much of a card, from its middle outwards, means "into" rather than
 * "beside". Half each way: a 316px card gives a 158px target, and the outer
 * quarters on every side are its edges.
 */
const INTO_ZONE = 0.5;

/**
 * PHONE-STYLE ARRANGING (2026-09-29, his words: "only shift a card to the side
 * if I am dragging a card on the edge, just like phones").
 *
 * A grid that can nest (`onDropInto`) is arranged the way a phone's home
 * screen is, and not the way dnd-kit arranges by default:
 *
 * - **Moving, nothing shifts.** The default moved a card aside the moment the
 *   held one came near it, so the card he was aiming for slid away before he
 *   could reach its middle.
 * - **Rest on a card's edge** — the outer quarter on any side — for
 *   `EDGE_DWELL_MS` and it slides aside to make room.
 * - **Rest on its middle** for `INTO_DWELL_MS` and "Put inside" switches on.
 *
 * "Rest" means the pointer stays within `STILL_PX` for the whole wait: a hand
 * that has stopped wanders a few pixels, one that is travelling does not stay
 * inside it. Measured before this, a slow sweep spent 600ms inside a middle
 * card and nested into it on the way past.
 *
 * The zones are tested against where each card is **drawn** — what he is
 * looking at — which only works because nothing moves until he rests: a card
 * that slides aside leaves the pointer over the gap it made, where nothing
 * happens, so the answer never chases itself.
 *
 * A list without `onDropInto`, and any drag by keyboard, keeps dnd-kit's own
 * arranging: a keyboard drag has no pointer to rest.
 */
const EDGE_DWELL_MS = 200;
const INTO_DWELL_MS = 300;
const STILL_PX = 12;

type Zone = 'edge' | 'middle';

/** The row under the pointer, as drawn, and which part of it — or null over a gap. */
function rowUnder(
  container: HTMLElement | null,
  activeId: string | null,
  x: number,
  y: number,
): { id: string; zone: Zone; rect: DOMRect } | null {
  if (!container) return null;
  for (const el of Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-sort-id]'))) {
    const id = el.dataset.sortId;
    if (!id || id === activeId) continue;
    const rect = el.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    const padX = (rect.width * (1 - INTO_ZONE)) / 2;
    const padY = (rect.height * (1 - INTO_ZONE)) / 2;
    const middle = x >= rect.left + padX && x <= rect.right - padX && y >= rect.top + padY && y <= rect.bottom - padY;
    return { id, zone: middle ? 'middle' : 'edge', rect };
  }
  return null;
}

/**
 * Arranging is ours, not dnd-kit's: it is told the pointer is over the card the
 * last rest chose, or over the held card itself (no shift) when there is none.
 * Not "over nothing" — dnd-kit displaces no row at all without an `over`, so
 * a rested-on edge moved nothing until the drop.
 */
function restedOn(id: string): CollisionDetection {
  return ({ droppableContainers }) => {
    const container = droppableContainers.find((c) => String(c.id) === id);
    return container ? [{ id: container.id, data: { droppableContainer: container, value: 0 } }] : [];
  };
}

export function SortableList({ ids, onReorder, axis = 'y', className, style, onDropInto, children }: SortableListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  /** The card "put inside" is armed on — only once the pointer has rested on its middle. */
  const [intoId, setIntoId] = useState<string | null>(null);
  /** The card whose place the held one takes — only once the pointer has rested on its edge. */
  const [shiftTo, setShiftTo] = useState<string | null>(null);
  /** Phone-style arranging is on for this drag (a nesting grid, by pointer). */
  const [phone, setPhone] = useState(false);
  const sensors = useRowSensors();
  const motion = useMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [grab, setGrab] = useState<{ x: number; y: number } | null>(null);

  /* What the pointer is resting on, where the rest began, and its timer. */
  const pendingRef = useRef<{ key: string | null; timer: number | null; x: number; y: number }>({
    key: null, timer: null, x: 0, y: 0,
  });
  const touchRef = useRef(false);

  /*
   * Where the pointer really is, from the browser, for the length of a drag.
   * Not dnd-kit's `activatorEvent` plus `delta`: its delta also carries any
   * scrolling it did on its own near an edge of the screen, and measured, a
   * drop rested at x=1367 was reported at x=2186 — over nothing, so the
   * drop did nothing.
   */
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const stopTrackingRef = useRef<(() => void) | null>(null);
  /*
   * Every pointer move: start, keep or cancel a rest. Driven by the browser's
   * own events, not dnd-kit's `onDragMove`, which stops firing once the held
   * card is pinned against the edge of the screen (`IN_VIEW`) — measured, the
   * last move it reported was the far card's middle while the finger went on
   * to its edge, and the rest nested it.
   *
   * When a wait runs out, what is under the finger is checked again: the page
   * may have scrolled under a finger that never moved.
   */
  const settleRest = useCallback((itemId: string, x: number, y: number) => {
    const hit = rowUnder(containerRef.current, itemId, x, y);
    const key = hit ? `${hit.id}:${hit.zone}` : null;
    const pending = pendingRef.current;
    const moved = Math.hypot(x - pending.x, y - pending.y) > STILL_PX;

    // Same spot, and the hand is still resting: let the wait run on.
    if (key === pending.key && !moved) return;

    if (pending.timer !== null) window.clearTimeout(pending.timer);
    /* Off the armed middle: "put inside" goes. Still on it but moving: it
       stays armed — only a new rest can arm another. */
    setIntoId((armed) => (armed !== null && !(hit && hit.id === armed && hit.zone === 'middle') ? null : armed));
    pendingRef.current = {
      key,
      x,
      y,
      timer:
        hit === null
          ? null
          : window.setTimeout(() => {
              const now = pointerRef.current;
              const still = rowUnder(containerRef.current, itemId, now.x, now.y);
              if (!still || still.id !== hit.id || still.zone !== hit.zone) {
                pendingRef.current = { key: null, timer: null, x: now.x, y: now.y };
                return;
              }
              if (hit.zone === 'middle') {
                setIntoId(hit.id);
                cue('into', { buzzToo: touchRef.current });
              } else {
                setShiftTo(hit.id);
              }
            }, hit.zone === 'middle' ? INTO_DWELL_MS : EDGE_DWELL_MS),
    };
  }, []);

  const trackPointer = useCallback((itemId: string, from: { x: number; y: number } | null) => {
    stopTrackingRef.current?.();
    if (from) pointerRef.current = from;
    const onPointer = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      settleRest(itemId, e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      pointerRef.current = { x: t.clientX, y: t.clientY };
      settleRest(itemId, t.clientX, t.clientY);
    };
    window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
    window.addEventListener('touchmove', onTouch, { capture: true, passive: true });
    stopTrackingRef.current = () => {
      window.removeEventListener('pointermove', onPointer, { capture: true });
      window.removeEventListener('touchmove', onTouch, { capture: true });
      stopTrackingRef.current = null;
    };
  }, [settleRest]);
  useEffect(() => () => stopTrackingRef.current?.(), []);

  const clearDwell = useCallback(() => {
    if (pendingRef.current.timer !== null) window.clearTimeout(pendingRef.current.timer);
    pendingRef.current = { key: null, timer: null, x: 0, y: 0 };
  }, []);

  useEffect(() => clearDwell, [clearDwell]);

  const sorting = axis === 'y' ? verticalListSortingStrategy : rectSortingStrategy;

  /* In phone mode the rows are displaced towards `shiftTo` and nowhere else —
     never towards whatever dnd-kit would have guessed the pointer is over. */
  const collisionDetection = useMemo(
    () => (phone && activeId !== null ? restedOn(shiftTo ?? activeId) : closestCenter),
    [phone, activeId, shiftTo],
  );


  /** The slot the held row was last over, for the drag sounds (121). */
  const passedRef = useRef<string | null>(null);

  const handleDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    setActiveId(String(active.id));
    setShiftTo(null);
    const at = getEventCoordinates(activatorEvent);
    const slot = active.rect.current.initial;
    setGrab(at && slot ? { x: at.x - slot.left, y: at.y - slot.top } : null);
    touchRef.current = isTouchEvent(activatorEvent);
    const isPhone = !!onDropInto && !(activatorEvent instanceof KeyboardEvent);
    setPhone(isPhone);
    if (isPhone) trackPointer(String(active.id), at);
    passedRef.current = String(active.id);
    cue('pick', { buzzToo: touchRef.current });
  }, [onDropInto, trackPointer]);

  /* Each slot passed clicks, pitched by how far from where it started. */
  const handleDragOver = useCallback(({ active, over }: DragOverEvent) => {
    if (!over || String(over.id) === passedRef.current) return;
    passedRef.current = String(over.id);
    cue('pass', { step: ids.indexOf(String(over.id)) - ids.indexOf(String(active.id)), buzzToo: touchRef.current });
  }, [ids]);

  const flyInto = useCallback((active: DragEndEvent['active'], itemId: string, targetId: string) => {
    /*
     * The card flies into the one it was dropped on (2026-09-29). Without
     * this it jumped back to its old slot the instant the drag ended and faded
     * out there — the opposite direction from where it went. It is animated
     * from where it was released to the target's centre, shrinking and fading,
     * and moved in the store only once it has arrived.
     *
     * `initial` is the slot the card came from and `translated` where it was
     * drawn at release (dnd-kit's own rects); the target is measured where it
     * is drawn. The card's wrapper sits back in its slot as soon as the drag
     * state clears, so every offset is taken from that slot.
     */
    const container = containerRef.current;
    const node = container?.querySelector<HTMLElement>(`[data-sort-id="${window.CSS.escape(itemId)}"]`);
    const target = container?.querySelector<HTMLElement>(`[data-sort-id="${window.CSS.escape(targetId)}"]`);
    const slot = active.rect.current.initial;
    const drawn = active.rect.current.translated;
    if (!node || !target || !slot || !drawn || prefersLessMotion() || !onDropInto) {
      onDropInto?.(itemId, targetId);
      return;
    }
    const to = target.getBoundingClientRect();
    node.dataset.landing = LANDING_INTO;
    const origin = grab ? `${grab.x}px ${grab.y}px` : '50% 50%';
    const flight = node.animate(
      [
        {
          translate: `${drawn.left - slot.left}px ${drawn.top - slot.top}px`,
          scale: String(INTO_SHRINK), opacity: 1, transformOrigin: origin,
        },
        {
          translate: `${to.left + to.width / 2 - (slot.left + slot.width / 2)}px ${to.top + to.height / 2 - (slot.top + slot.height / 2)}px`,
          scale: '0.15', opacity: 0, transformOrigin: origin,
        },
      ],
      { duration: Math.round(motion.dur.slow * 1000), easing: cssBezier(motion.ease.exit), fill: 'forwards' },
    );
    flight.finished.then(() => onDropInto(itemId, targetId), () => onDropInto(itemId, targetId));
  }, [grab, motion, onDropInto]);

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    const itemId = String(active.id);
    const armed = intoId;
    const shifted = shiftTo;
    const wasPhone = phone;
    setActiveId(null);
    setIntoId(null);
    setShiftTo(null);
    setPhone(false);
    clearDwell();
    stopTrackingRef.current?.();
    cue('drop', { buzzToo: touchRef.current });

    if (wasPhone) {
      if (armed !== null) {
        flyInto(active, itemId, armed);
        return;
      }
      /* Let go on a card's edge without pausing: that is still "here", as a
         phone takes it. Let go on a middle that never armed, or over a gap:
         wherever the last rest put it. */
      const { x, y } = pointerRef.current;
      const hit = rowUnder(containerRef.current, itemId, x, y);
      const target = hit?.zone === 'edge' ? hit.id : shifted;
      const from = ids.indexOf(itemId);
      const to = target === null ? -1 : ids.indexOf(target);
      if (from === -1 || to === -1 || from === to) return;
      onReorder(arrayMove(ids, from, to));
      return;
    }

    if (!over || active.id === over.id) return;
    const from = ids.indexOf(itemId);
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }, [ids, onReorder, clearDwell, intoId, shiftTo, phone, flyInto]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setIntoId(null);
    setShiftTo(null);
    setPhone(false);
    clearDwell();
    stopTrackingRef.current?.();
  }, [clearDwell]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={axis === 'y' ? VERTICAL_ONLY : IN_VIEW}
      autoScroll={VERTICAL_AUTOSCROLL}
      measuring={MEASURE_ALWAYS}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <LiftContext.Provider value={axis === 'xy' ? CARD_LIFT : ROW_LIFT}>
        <GrabContext.Provider value={activeId ? grab : null}>
        <ActiveRowContext.Provider value={activeId}>
          <IntoTargetContext.Provider value={intoId}>
            <SortableContext items={ids} strategy={sorting}>
              {/* `data-sort-dragging` takes the frost off these rows while one
                  moves — `index.css` has the measurement. */}
              <div ref={containerRef} className={className} style={style} data-sort-dragging={activeId ? '' : undefined}>
                {children}
              </div>
            </SortableContext>
          </IntoTargetContext.Provider>
        </ActiveRowContext.Provider>
        </GrabContext.Provider>
      </LiftContext.Provider>
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

/** What one board hands the drag system it sits in (BIG-5). */
interface BoardRegistration {
  containerIds: readonly string[];
  itemsByContainer: Readonly<Record<string, readonly string[]>>;
  onReorderContainers: (orderedIds: string[]) => void;
  onReorderItems: (containerId: string, orderedIds: string[]) => void;
  onMoveItem: (itemId: string, toContainerId: string, beforeItemId: string | null) => void;
  renderItemOverlay: (itemId: string) => ReactNode;
}

interface BoardHostValue {
  register: (key: string, board: BoardRegistration) => () => void;
  activeId: string | null;
  activeItem: { containerId: string; itemId: string } | null;
  overContainerId: string | null;
}

const BoardHostContext = createContext<BoardHostValue | null>(null);

/** How far outside its own board's cards a held list card still counts as over them (px). */
const CARD_REACH_PX = 48;

/**
 * ONE DRAG FOR SEVERAL BOARDS (BIG-5).
 *
 * A row can only land on a droppable registered in its own `DndContext`, so
 * two boards side by side in two contexts could never pass a task between
 * them — exactly as two lists could not before the board shared one. This is
 * that context, lifted out of `SortableBoard`: it holds the gesture, the
 * collision rule and the ghost, and every `SortableBoard` inside it registers
 * its lists and its writes instead of owning a context of its own.
 *
 * A board outside any host wraps itself in one, so a single board is exactly
 * what it was. List ids are the store's own and unique across projects, which
 * is what lets one merged map answer "whose list is this?".
 *
 * **A list card still only reorders within its own board.** Moving a whole
 * list to another project is not something he asked for, and the card-reorder
 * write takes one board's full order, so a card is only ever tested against
 * its own board's cards.
 */
export function SortableBoardHost({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<((itemId: string) => ReactNode) | null>(null);
  const sensors = useRowSensors();
  const v3 = useV3();

  /* Registrations are read at event time, never rendered, so they live in a
     ref: a board re-registering on every render must not re-render the host. */
  const boards = useRef(new Map<string, BoardRegistration>());
  const register = useCallback((key: string, board: BoardRegistration) => {
    boards.current.set(key, board);
    return () => { boards.current.delete(key); };
  }, []);

  /** The board a list belongs to. */
  const boardOf = useCallback((containerId: string): BoardRegistration | undefined => {
    for (const board of boards.current.values()) {
      if (board.containerIds.includes(containerId)) return board;
    }
    return undefined;
  }, []);

  /** Every registered list's rows, as one board's map would hold them. */
  const allItems = useCallback((): Record<string, readonly string[]> => {
    const merged: Record<string, readonly string[]> = {};
    for (const board of boards.current.values()) Object.assign(merged, board.itemsByContainer);
    return merged;
  }, []);

  // A scoped id is a row, a bare one a list card, and that single distinction
  // is how one `DndContext` serves both gestures. It has to be one: a row
  // dropped into a *different* list must collide with droppables registered by
  // that list, and two contexts cannot see each other's droppables at all.
  const activeItem = useMemo(() => (activeId ? parseScopedItemId(activeId) : null), [activeId]);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggedId = String(args.active.id);

    // A list card only ever lands on another list card of its own board.
    // Without this filter it would collide with the task rows inside its
    // neighbours — which sit nearer the pointer than the cards do — and leave
    // `over` set to something no list can be reordered against.
    if (!parseScopedItemId(draggedId)) {
      const own = boardOf(draggedId)?.containerIds ?? [];
      const mine = args.droppableContainers.filter((c) => own.includes(String(c.id)));
      /* With another board on screen, a card held out over it is over nothing
         of its own: measured, `closestCenter` alone swapped it with whichever
         of its own cards was nearest the other board, and a list moved that
         was only being carried. Alone, a board keeps its old reach — a card
         dropped in a gap still lands on the nearest one. */
      if (boards.current.size > 1 && args.pointerCoordinates) {
        const { x, y } = args.pointerCoordinates;
        const rects = mine.map((c) => args.droppableRects.get(c.id)).filter((r) => r != null);
        const inside = rects.length > 0
          && x >= Math.min(...rects.map((r) => r.left)) - CARD_REACH_PX
          && x <= Math.max(...rects.map((r) => r.right)) + CARD_REACH_PX
          && y >= Math.min(...rects.map((r) => r.top)) - CARD_REACH_PX
          && y <= Math.max(...rects.map((r) => r.bottom)) + CARD_REACH_PX;
        if (!inside) return [];
      }
      return closestCenter({ ...args, droppableContainers: mine });
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
    const rows = (allItems()[overId] ?? []).map((itemId) => scopedItemId(overId, itemId));
    if (rows.length === 0) return collisions;
    const withinList = closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.id !== args.active.id && rows.includes(String(c.id)),
      ),
    });
    return withinList.length > 0 ? withinList : collisions;
  }, [boardOf, allItems]);

  /* The drag sounds (121): how many slots the held row has passed, and whether a finger holds it. */
  const travel = useRef({ over: null as string | null, slots: 0, touch: false });

  const handleDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    const id = String(active.id);
    setActiveId(id);
    travel.current = { over: id, slots: 0, touch: isTouchEvent(activatorEvent) };
    cue('pick', { buzzToo: travel.current.touch });
    /* The ghost is drawn by the board the row came from — each board knows
       its own tasks. Taken now, from the registration, and held in state. */
    const row = parseScopedItemId(id);
    const render = row ? boardOf(row.containerId)?.renderItemOverlay : undefined;
    setGhost(render ? () => render : null);
  }, [boardOf]);

  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    if (!over) { setOverContainerId(null); return; }
    const overId = String(over.id);
    setOverContainerId(parseScopedItemId(overId)?.containerId ?? overId);
    if (overId !== travel.current.over) {
      travel.current.over = overId;
      cue('pass', { step: ++travel.current.slots, buzzToo: travel.current.touch });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over, delta } = event;
    setActiveId(null);
    setOverContainerId(null);
    setGhost(null);
    cue('drop', { buzzToo: travel.current.touch });
    if (!over) {
      /* Let go over nothing: the row glides back home from the ghost (125). */
      const row = parseScopedItemId(String(active.id));
      const at = active.rect.current.translated;
      if (row && at) pendingLanding = { sortId: String(active.id), left: at.left, top: at.top, width: at.width, height: at.height, at: performance.now() };
      return;
    }

    const draggedId = String(active.id);
    const overId = String(over.id);
    const dragged = parseScopedItemId(draggedId);

    if (!dragged) {
      const board = boardOf(draggedId);
      if (!board) return;
      const ids = [...board.containerIds];
      const from = ids.indexOf(draggedId);
      const to = ids.indexOf(overId);
      if (from === -1 || to === -1 || from === to) return;
      board.onReorderContainers(arrayMove(ids, from, to));
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
      itemsByContainer: allItems(),
      from: dragged,
      over: { containerId: overItem?.containerId ?? overId, itemId: overItem?.itemId ?? null },
      releasedAtY,
      overCenterY: over.rect.top + over.rect.height / 2,
    });

    // Idea 125: where the ghost was let go, for the row to glide in from.
    // Set before the write, which is what mounts a row dropped in another list.
    // A drop that changes nothing glides home the same way.
    const landsIn = drop.kind === 'reorder' ? drop.containerId : drop.kind === 'move' ? drop.toContainerId : dragged.containerId;
    if (draggedRect) {
      const { left, top, width, height } = draggedRect;
      pendingLanding = { sortId: scopedItemId(landsIn, dragged.itemId), left, top, width, height, at: performance.now() };
    }

    // The board that owns the list written to does the writing — for a move
    // across boards, the one it lands on.
    if (drop.kind === 'reorder') boardOf(drop.containerId)?.onReorderItems(drop.containerId, drop.orderedIds);
    if (drop.kind === 'move') boardOf(drop.toContainerId)?.onMoveItem(drop.itemId, drop.toContainerId, drop.beforeItemId);
  }, [boardOf, allItems]);

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverContainerId(null);
    setGhost(null);
  }, []);

  const host = useMemo<BoardHostValue>(
    () => ({ register, activeId, activeItem, overContainerId }),
    [register, activeId, activeItem, overContainerId],
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
      <BoardHostContext.Provider value={host}>
        <LiftContext.Provider value={CARD_LIFT}>
          <ActiveRowContext.Provider value={activeId}>
            {children}
          </ActiveRowContext.Provider>
        </LiftContext.Provider>
      </BoardHostContext.Provider>

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
              {ghost?.(activeItem.itemId)}
            </DragOverlay>
          </V3Scope>
        ) : (
          <DragOverlay zIndex={Z.dragGhost} dropAnimation={null}>
            {ghost?.(activeItem.itemId)}
          </DragOverlay>
        ),
        document.body,
      )}
    </DndContext>
  );
}

export function SortableBoard(props: SortableBoardProps) {
  const host = useContext(BoardHostContext);
  return host
    ? <BoardSurface {...props} />
    : <SortableBoardHost><BoardSurface {...props} /></SortableBoardHost>;
}

/** One board's lists, inside whichever host it sits in. */
function BoardSurface({
  containerIds,
  itemsByContainer,
  onReorderContainers,
  onReorderItems,
  onMoveItem,
  renderItemOverlay,
  className,
  children,
}: SortableBoardProps) {
  const host = useContext(BoardHostContext);
  const key = useId();
  const register = host?.register;

  useLayoutEffect(() => {
    if (!register) return;
    return register(key, {
      containerIds, itemsByContainer, onReorderContainers, onReorderItems, onMoveItem, renderItemOverlay,
    });
  }, [register, key, containerIds, itemsByContainer, onReorderContainers, onReorderItems, onMoveItem, renderItemOverlay]);

  const activeItem = host?.activeItem ?? null;
  const overContainerId = host?.overContainerId ?? null;
  const board = useMemo<BoardContextValue>(
    () => ({ itemsByContainer, activeItem, overContainerId }),
    [itemsByContainer, activeItem, overContainerId],
  );

  return (
    <BoardContext.Provider value={board}>
      <SortableContext items={containerIds} strategy={rectSortingStrategy}>
        <div className={className} data-sort-dragging={host?.activeId ? '' : undefined}>{children}</div>
      </SortableContext>
    </BoardContext.Provider>
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
  /**
   * The row being dragged is over this one's middle, so releasing puts it
   * inside this one (`SortableList`'s `onDropInto`). Invite the drop.
   */
  isDropInto: boolean;
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

/** A motion token's bezier as the CSS `transition` spells it. */
function cssBezier([a, b, c, d]: readonly [number, number, number, number]): string {
  return `cubic-bezier(${a}, ${b}, ${c}, ${d})`;
}

export function SortableRow({ id, handle = false, className, children }: SortableRowProps) {
  const groupId = useContext(GroupContext);
  const sortableId = groupId === null ? id : scopedItemId(groupId, id);
  const motion = useMotion();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({
    id: sortableId,
    /* The rows making room slide on the app's own glass curve, not dnd-kit's
       stock 250ms `ease` — the same curve every other thing that moves uses. */
    transition: { duration: Math.round(motion.dur.base * 1000 * 1.2), easing: cssBezier(motion.ease.glass) },
  });
  const activeId = useContext(ActiveRowContext);
  const board = useContext(BoardContext);
  const intoId = useContext(IntoTargetContext);
  const lift = useContext(LiftContext);
  const grab = useContext(GrabContext);
  const isDropInto = intoId === id && groupId === null;

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
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const setRowRef = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node;
    setNodeRef(node);
    if (!handle) setActivatorNodeRef(node);
  }, [handle, setNodeRef, setActivatorNodeRef]);

  /*
   * THE LANDING (2026-09-29). A dropped row used to jump from under the
   * pointer to its slot in one frame — dnd-kit animates the rows that made
   * room, and never the one that was carried (its `animateLayoutChanges`
   * declines once the order has changed). So the row remembers where it was
   * last drawn while held, and when the drag ends it glides from there to
   * wherever it now sits, on `settle`: the one soft landing V3 gives a
   * release. Measured before: one frame from release to slot, old code too.
   *
   * Reading a rect here is only ever done while this row is being dragged,
   * one element per pointer move, never on a screen's way in.
   */
  const drawnAt = useRef<DOMRect | null>(null);
  const wasDragging = useRef(false);
  const drawnOnce = useRef(false);
  useLayoutEffect(() => {
    const node = nodeRef.current;
    const firstDraw = !drawnOnce.current;
    drawnOnce.current = true;
    if (isDragging) {
      if (node) drawnAt.current = node.getBoundingClientRect();
      wasDragging.current = true;
      return;
    }
    /* Idea 125: a board row lands from where its ghost was let go — this
       row if it stayed in its list, a newly drawn one if it moved to
       another (`pendingLanding`). Anything else lands from where it was
       last drawn while held, as before. */
    const ghost = wasDragging.current || firstDraw ? takeLanding(sortableId) : null;
    if (!ghost && !wasDragging.current) return;
    wasDragging.current = false;
    const before = ghost ?? drawnAt.current;
    drawnAt.current = null;
    if (!node || !before || node.dataset.landing === LANDING_INTO || prefersLessMotion()) return;
    const now = node.getBoundingClientRect();
    const dx = before.left + before.width / 2 - (now.left + now.width / 2);
    const dy = before.top + before.height / 2 - (now.top + now.height / 2);
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    node.animate(
      [
        { translate: `${dx}px ${dy}px`, scale: String(lift) },
        { translate: '0px 0px', scale: '1' },
      ],
      /* Pulled in with a little give (the springy curve) from a ghost; the
         one soft landing V3 gives a release otherwise. */
      ghost
        ? { duration: Math.round(motion.dur.slow * 1500), easing: cssBezier(motion.ease.springy) }
        : { duration: Math.round(motion.dur.slow * 1000), easing: cssBezier(motion.ease.settle) },
    );
  });

  return (
    <div
      ref={setRowRef}
      // The hook Session 7a's touch CSS hangs off. Those rules keyed off
      // `[draggable='true']`, the attribute React wrote for native HTML5 drag.
      // dnd-kit never sets it, so without this the selector would quietly stop
      // matching and the tablet's share sheet would come straight back.
      data-drag-row=""
      data-sort-id={sortableId}
      data-held={isDragging ? '' : undefined}
      className={className}
      style={{
        // Only the translation, never dnd-kit's scale: the grid strategy also
        // returns scaleX/scaleY when neighbouring cards differ in size, and
        // ProjectView's list cards differ a lot. Applying that scale squashes
        // a card's own text as it passes a taller one.
        //
        // On the `translate` property, not `transform` (2026-09-29). The
        // browser applies `translate`, then `scale`, then `transform`, so a
        // translation left in `transform` was multiplied by the pick-up scale
        // below — at the "put inside" shrink the held card was drawn halfway
        // between its old slot and the finger, over the wrong card.
        translate: transform ? `${Math.round(transform.x)}px ${Math.round(transform.y)}px` : undefined,
        /*
         * The pick-up and "put inside" feel (2026-09-29) ride on the separate
         * `scale` property, about the point the row was picked up by — and on
         * this wrapper, never on the card, whose `transform` Framer owns. A row
         * that is picked up grows a touch; one that is about to go inside
         * another shrinks towards the finger while the target swells, so the
         * drop says what it will do before it does it.
         */
        scale: isDragging ? String(intoId !== null ? INTO_SHRINK : lift) : isDropInto ? String(INTO_SWELL) : undefined,
        transformOrigin: isDragging && grab ? `${grab.x}px ${grab.y}px` : undefined,
        transition: [
          // dnd-kit spells its transition for `transform`; the same timing,
          // for the property the translation now lives on.
          transition ? transition.replace(/^transform\b/, 'translate') : null,
          `scale ${Math.round(motion.dur.base * 1000)}ms ${cssBezier(motion.ease.glass)}`,
        ].filter(Boolean).join(', '),
        position: 'relative',
        zIndex: isDragging ? 30 : undefined,
      }}
      {...(handle ? {} : attributes)}
      {...(handle ? {} : listeners)}
    >
      {children({ isDragging, isAnyDragging, isReceivingItem, handleProps, isDropInto })}
    </div>
  );
}
