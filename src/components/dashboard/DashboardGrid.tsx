/**
 * The Dashboard's grid (BIG-6, 29-1a): Android home-screen widgets, his call.
 *
 * WHAT HE DOES WITH IT
 * --------------------
 * - **Long-press any block, or press Edit**, and the grid is in edit mode.
 * - **Drag a block** and the others move aside; let go and it stays.
 * - **Pull its corner** and it snaps to whole cells as it passes the middle of
 *   one; the others move aside for that too.
 * - **✕** removes it, **⚙** opens its settings (size, move, and what it shows).
 * Nothing wobbles: an endless wobble breaks Performance rule 1.
 *
 * HOW IT IS BUILT, AND WHY NOT `SortableList`
 * -------------------------------------------
 * `CLAUDE.md` makes dragging one system on dnd-kit, and this is on dnd-kit —
 * its sensors, its `DragOverlay` — but not on `SortableList`. That component
 * arranges rows and equal cards; this grid holds blocks of different sizes,
 * where where-a-drop-lands is the packing arithmetic in
 * `lib/dashboard/layout.ts` (pure, tested), not dnd-kit's sorting strategies,
 * which assume items the same size. So dnd-kit reports the pointer, `dropIndexAt`
 * answers, and the preview order is re-packed; the blocks glide there with
 * Framer's `layout`, which is on only while editing so the screen's way in
 * measures nothing (Performance rule 6).
 *
 * A drag or a resize writes only a **preview**; the store — and so the
 * device and the cloud — is written once, when the finger lifts.
 *
 * DRAGGING ONE IN FROM THE SHELF (idea 146, 29-1P13)
 * --------------------------------------------------
 * In edit mode every kind of widget sits on a shelf along the bottom, in the
 * same `DndContext`. Lifted off it, a widget joins the preview as soon as the
 * pointer is over the grid, at the size it will have, and the others move
 * aside for it exactly as for a block already there; let go over the grid and
 * it is added at that place, in one write. Let go back over the shelf and
 * nothing happens. A tap on a shelf tile still adds it at the end.
 */
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useSensor, useSensors,
  type DragMoveEvent, type DragStartEvent, type Modifier,
} from '@dnd-kit/core';
import { cue } from '../../lib/sound';
import { prefersReducedMotion } from '../../ui/overlay/sheetMotion';
import { Icon, LayeredIcon, SoftIconButton, useMotion, useTilt, useV3, v3Attr } from '../../ui';
import { useDashboardStore } from '../../store/useDashboardStore';
import {
  BLOCK_KINDS, BLOCK_SPECS, blockLook, columnsFor, dropIndexAt, moveBlock, packBlocks, resizedSize, rowsUsed,
  type BlockKind, type DashboardBlock, type GridMetrics,
} from '../../lib/dashboard/layout';
import type { Task } from '../../store/useStore';
import type { DashSheet } from './blocks';
import { BLOCK_COMPONENTS, BLOCK_ICONS, BLOCK_TINTS } from './registry';
import { BlockContext, type BlockMood } from './blockContext';
import { cubic, usePlayOnChange } from './motionOnce';
import { paneStyle } from './paneStyle';
import { Z } from '../../lib/zLayers';

const ROW = 176;
const GAP = 16;
const LONG_PRESS_MS = 480;
/** The id a widget lifted off the shelf wears until it is dropped. */
const NEW_ID = '__new-widget__';
const SHELF_PREFIX = 'shelf:';
/*
 * SNAP INTO PLACE (idea 125, 29-1P6c; macOS window snapping). The held copy is
 * pulled toward the dashed slot it will land in once it is this close, harder
 * the closer it gets, and the slot lights up as it takes hold; let go and the
 * block glides from the copy into the slot with a little give. No fiddly
 * aiming: the packing already decides the slot, this makes it felt.
 */
const MAGNET_PX = 110;
/** At the slot's very centre, this share of the gap is closed for you. */
const MAGNET_PULL = 0.7;

interface GridProps {
  editing: boolean;
  onStartEditing: () => void;
  onSettings: (blockId: string) => void;
  onOpenTask: (task: Task) => void;
  onOpenOverdue: () => void;
  onOpenSheet: (sheet: DashSheet) => void;
  /** A block just added: scrolled into view once it is drawn. */
  revealId: string | null;
  /** A widget added from the shelf, by a tap or a drop. */
  onAdded: (id: string) => void;
}

/** A first guess at the grid's width, so the first frame is not one column wide. */
function guessWidth(): number {
  if (typeof window === 'undefined') return 1024;
  const w = window.innerWidth;
  return w >= 900 ? w - 200 : w - 32;
}

export default function DashboardGrid({ editing, onStartEditing, onSettings, onOpenTask, onOpenOverdue, onOpenSheet, revealId, onAdded }: GridProps) {
  const stored = useDashboardStore((s) => s.blocks);
  const [preview, setPreview] = useState<DashboardBlock[] | null>(null);
  const previewRef = useRef<DashboardBlock[] | null>(null);
  const blocks = preview ?? stored;

  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(guessWidth);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    /* An observer, not a read on the way in: its answer arrives after layout
       rather than forcing one (Performance rule 6). */
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const columns = columnsFor(width);
  const metrics: GridMetrics = useMemo(
    () => ({ columns, cell: (width - GAP * (columns - 1)) / columns, row: ROW, gap: GAP }),
    [columns, width],
  );
  const placements = useMemo(() => packBlocks(blocks, columns), [blocks, columns]);
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks]);
  const rows = Math.max(1, rowsUsed(placements));

  const setBoth = (next: DashboardBlock[] | null) => { previewRef.current = next; setPreview(next); };

  // ── Drag ────────────────────────────────────────────────────────────────
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [heldId, setHeldId] = useState<string | null>(null);
  /** A widget lifted off the shelf: its kind. */
  const [newKind, setNewKind] = useState<BlockKind | null>(null);
  const origin = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const shelfRef = useRef<HTMLDivElement>(null);

  /* 125: the dashed slot the held block will land in, whether the packing has
     moved it yet (until then the copy is still over its own slot, and a pull
     there would only make the pick-up feel stuck), whether the copy is close
     enough to be pulled, and where the copy was last drawn, for the glide. */
  const slotEl = useRef<HTMLElement | null>(null);
  const slotMoved = useRef(false);
  const near = useRef(false);
  const drawnAt = useRef<{ x: number; y: number } | null>(null);
  const landingRef = useRef<{ id: string; x: number; y: number } | null>(null);
  /* Where the copy started: the overlay is drawn from the picked-up node's
     FIRST rect plus the drag, so that rect is kept from the first call. Not
     `activeNodeRect` on later calls: dnd-kit re-measures it as the block's
     own slot moves through the preview — measured, it put the copy 570px
     off once the slot had moved a column. */
  const startRect = useRef<{ cx: number; cy: number } | null>(null);

  const magnet: Modifier = useCallback(({ transform, activeNodeRect }) => {
    if (!startRect.current && activeNodeRect) {
      startRect.current = { cx: activeNodeRect.left + activeNodeRect.width / 2, cy: activeNodeRect.top + activeNodeRect.height / 2 };
    }
    const start = startRect.current;
    if (!start) return transform;
    const cx = start.cx + transform.x;
    const cy = start.cy + transform.y;
    const slot = slotMoved.current ? slotEl.current?.getBoundingClientRect() : undefined;
    let k = 0;
    let sx = cx;
    let sy = cy;
    if (slot && slot.width > 0) {
      sx = slot.left + slot.width / 2;
      sy = slot.top + slot.height / 2;
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < MAGNET_PX) k = (1 - d / MAGNET_PX) * MAGNET_PULL;
    }
    /* The slot lights as it takes hold: a flag on its element rather than
       state, so the grid does not re-render, and one click as it does. */
    const isNear = k > 0;
    if (isNear !== near.current) {
      near.current = isNear;
      if (slotEl.current) {
        if (isNear) slotEl.current.dataset.near = '';
        else delete slotEl.current.dataset.near;
      }
      if (isNear) cue('detent');
    }
    drawnAt.current = { x: cx + (sx - cx) * k, y: cy + (sy - cy) * k };
    return { ...transform, x: transform.x + (sx - cx) * k, y: transform.y + (sy - cy) * k };
  }, []);
  const magnetModifiers = useMemo(() => [magnet], [magnet]);

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    slotEl.current = null;
    slotMoved.current = false;
    near.current = false;
    drawnAt.current = null;
    startRect.current = null;
    const ev = e.activatorEvent as PointerEvent;
    origin.current = { x: ev.clientX, y: ev.clientY };
    if (id.startsWith(SHELF_PREFIX)) {
      /* Off the shelf: not in the preview until the pointer reaches the grid. */
      setNewKind(id.slice(SHELF_PREFIX.length) as BlockKind);
      setHeldId(NEW_ID);
    } else {
      setHeldId(id);
    }
    setBoth([...stored]);
  };
  const onDragMove = (e: DragMoveEvent) => {
    const grid = gridRef.current;
    let current = previewRef.current;
    if (!grid || !current || !heldId) return;
    const x = origin.current.x + e.delta.x;
    const y = origin.current.y + e.delta.y;
    if (newKind) {
      const shelf = shelfRef.current?.getBoundingClientRect();
      const overShelf = !!shelf && y >= shelf.top - 8;
      const inPreview = current.some((b) => b.id === NEW_ID);
      if (overShelf) {
        if (inPreview) setBoth(current.filter((b) => b.id !== NEW_ID));
        return;
      }
      if (!inPreview) {
        const spec = BLOCK_SPECS[newKind];
        current = [...current, { id: NEW_ID, kind: newKind, w: spec.defaultW, h: spec.defaultH }];
        setBoth(current);
      }
    }
    /* 125: the slot is the held block's own frame in the preview, found
       once per block; a shelf widget's slot exists from its first move. */
    if (slotEl.current?.dataset.blockId !== heldId) {
      slotEl.current = grid.querySelector<HTMLElement>(`[data-block-id="${heldId}"]`);
    }
    if (newKind) slotMoved.current = true;
    const rect = grid.getBoundingClientRect();
    const index = dropIndexAt(current, heldId, x - rect.left, y - rect.top, metrics);
    if (index === null) return;
    const next = moveBlock(current, heldId, index);
    if (next.some((b, i) => b.id !== current[i].id)) {
      setBoth(next);
      slotMoved.current = true;
    }
  };
  const endDrag = () => {
    if (slotEl.current) delete slotEl.current.dataset.near;
    slotEl.current = null;
    near.current = false;
    setHeldId(null); setNewKind(null); setBoth(null);
  };
  const onDragEnd = () => {
    const current = previewRef.current;
    if (current && newKind) {
      const index = current.findIndex((b) => b.id === NEW_ID);
      if (index >= 0) onAdded(useDashboardStore.getState().addBlock(newKind, undefined, index));
    } else if (current && heldId) {
      const index = current.findIndex((b) => b.id === heldId);
      if (index !== stored.findIndex((b) => b.id === heldId)) useDashboardStore.getState().moveBlock(heldId, index);
      /* 125: the block glides home from where its copy was let go. A widget
         new off the shelf has its own arrival instead. */
      if (drawnAt.current) landingRef.current = { id: heldId, ...drawnAt.current };
      cue('drop');
    }
    endDrag();
  };
  const onDragCancel = endDrag;

  // ── Resize ──────────────────────────────────────────────────────────────
  const startResize = (block: DashboardBlock, e: ReactPointerEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget;
    /* Keeps the drag when the finger leaves the little corner. It can throw
       for a pointer the browser no longer tracks; the resize works without it. */
    try { handle.setPointerCapture(e.pointerId); } catch { /* listen without capture */ }
    const sx = e.clientX;
    const sy = e.clientY;
    const start = { w: block.w, h: block.h };
    let last = start;
    setBoth([...stored]);

    const move = (ev: PointerEvent) => {
      const size = resizedSize(block.kind, start, ev.clientX - sx, ev.clientY - sy, metrics);
      if (size.w === last.w && size.h === last.h) return;
      last = size;
      setBoth((previewRef.current ?? stored).map((b) => (b.id === block.id ? { ...b, ...size } : b)));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      if (last.w !== start.w || last.h !== start.h) useDashboardStore.getState().resizeBlock(block.id, last.w, last.h);
      setBoth(null);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  // ── A block just added comes into view ──────────────────────────────────
  useLayoutEffect(() => {
    if (!revealId) return;
    gridRef.current?.querySelector(`[data-block-id="${revealId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [revealId]);

  /* Idea 13 (29-1P5c): the edge of the block under the mouse lights up where
     it points, in the Dashboard's light. A mouse only (`dashboard.css` draws
     nothing without one), at most once a frame, and written straight onto the
     block's glow layer — never onto the block, whose whole tree would restyle. */
  const glowFrame = useRef(0);
  const followGlow = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || glowFrame.current) return;
    const glow = (e.target as Element).closest('.dash-block')?.querySelector<HTMLElement>(':scope > .dash-glow');
    if (!glow) return;
    const { clientX, clientY } = e;
    glowFrame.current = requestAnimationFrame(() => {
      glowFrame.current = 0;
      const r = glow.getBoundingClientRect();
      glow.style.setProperty('--gx', `${clientX - r.left}px`);
      glow.style.setProperty('--gy', `${clientY - r.top}px`);
    });
  };
  useEffect(() => () => cancelAnimationFrame(glowFrame.current), []);

  const held = heldId ? placements.find((p) => p.id === heldId) : undefined;
  const heldBlock = heldId ? byId.get(heldId) : undefined;
  const v3 = useV3();
  /* The Dashboard is a kept screen, and a portal is not hidden with it: left
     in edit mode, its shelf stayed over the next screen (found 29-1c1). Hidden
     in a layout-effect cleanup, which `<Activity>` runs (CLAUDE.md, 29-1P5c). */
  const portalRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = portalRef.current;
    if (!el) return;
    el.style.display = 'contents';
    return () => { el.style.display = 'none'; };
  }, []);

  const body = (block: DashboardBlock, w: number, h: number): ReactNode => {
    const Block = BLOCK_COMPONENTS[block.kind];
    return <Block block={block} w={w} h={h} onOpenTask={onOpenTask} onOpenOverdue={onOpenOverdue} onOpenSheet={onOpenSheet} renderBlock={body} />;
  };

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div
        ref={gridRef}
        className="dash-grid"
        onContextMenu={(e) => { if (!editing) e.preventDefault(); }}
        onPointerMove={editing ? undefined : followGlow}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, ${ROW}px)`,
          gap: GAP,
        }}
      >
        {placements.map((p, order) => {
          const block = byId.get(p.id)!;
          return (
            <BlockFrame
              key={p.id}
              block={block}
              w={p.w}
              h={p.h}
              x={p.x}
              y={p.y}
              order={order}
              editing={editing}
              ghost={p.id === heldId}
              landingRef={landingRef}
              onLongPress={onStartEditing}
              onSettings={() => onSettings(p.id)}
              onRemove={() => useDashboardStore.getState().removeBlock(p.id)}
              onResizeStart={(e) => startResize(block, e)}
            >
              {body(block, p.w, p.h)}
            </BlockFrame>
          );
        })}
      </div>

      {/* Portalled: every glass pane has a backdrop-filter, which would make it
          the containing block of a fixed overlay. The portal root carries the
          V3 scope, or the lifted copy would draw in the old material. */}
      {createPortal(
        <div ref={portalRef} {...v3Attr(v3)} style={{ display: 'contents' }}>
          <DragOverlay dropAnimation={null} modifiers={magnetModifiers}>
            {newKind ? (
              <ShelfTile kind={newKind} lifted />
            ) : held && heldBlock ? (() => {
              const pane = paneStyle(heldBlock);
              const { look, colour } = blockLook(heldBlock);
              return (
                <div
                  className={pane.lamp ? 'dash-lamp' : undefined}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    width: held.w * metrics.cell + (held.w - 1) * GAP,
                    height: held.h * ROW + (held.h - 1) * GAP,
                    transform: 'scale(1.03)', transformOrigin: 'center',
                    ...pane.style,
                    boxShadow: ['var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-3)', pane.edge].filter(Boolean).join(', '),
                    cursor: 'grabbing',
                  }}
                >
                  <BlockContext.Provider value={{ setMood: null, look, colour }}>
                    <div style={{ height: '100%', pointerEvents: 'none' }}>{body(heldBlock, held.w, held.h)}</div>
                  </BlockContext.Provider>
                </div>
              );
            })() : null}
          </DragOverlay>
          {editing && (
            <div ref={shelfRef} className="dash-shelf" role="toolbar" aria-label="Widgets to add" style={{ zIndex: Z.nav }}>
              <span className="dash-shelf-hint">Drag one into place, or tap to add it at the end</span>
              <div className="dash-shelf-row ag-scroll">
                {BLOCK_KINDS.map((kind) => (
                  <ShelfTile
                    key={kind}
                    kind={kind}
                    held={newKind === kind}
                    onAdd={() => onAdded(useDashboardStore.getState().addBlock(kind))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </DndContext>
  );
}

/** One widget on the shelf (idea 146): its icon and name; lifted, the copy under the finger. */
function ShelfTile({ kind, lifted, held, onAdd }: { kind: BlockKind; lifted?: boolean; held?: boolean; onAdd?: () => void }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `${SHELF_PREFIX}${kind}`, disabled: lifted });
  const spec = BLOCK_SPECS[kind];
  return (
    <button
      ref={lifted ? undefined : setNodeRef}
      type="button"
      className="dash-shelf-tile ag-licon-host"
      data-lifted={lifted || undefined}
      aria-label={`Add ${spec.title}`}
      title={spec.blurb}
      onClick={onAdd}
      {...(lifted ? {} : listeners)}
      {...(lifted ? {} : attributes)}
      style={{ opacity: held ? 0.35 : 1 }}
    >
      <span className="dash-shelf-icon"><LayeredIcon icon={<Icon name={BLOCK_ICONS[kind]} size={17} />} colour={BLOCK_TINTS[kind]} size={36} /></span>
      <span className="dash-shelf-name">{spec.title}</span>
      <span className="dash-shelf-size" aria-hidden="true">{spec.defaultW}×{spec.defaultH}</span>
    </button>
  );
}

interface FrameProps {
  block: DashboardBlock;
  w: number;
  h: number;
  x: number;
  y: number;
  /** Place in reading order, for the arrival's stagger. */
  order: number;
  editing: boolean;
  ghost: boolean;
  /** 125: where a dropped block's copy was let go (its centre), taken by the block it names. */
  landingRef: { current: { id: string; x: number; y: number } | null };
  onLongPress: () => void;
  onSettings: () => void;
  onRemove: () => void;
  onResizeStart: (e: ReactPointerEvent<HTMLElement>) => void;
  children: ReactNode;
}

function BlockFrame({ block, w, h, x, y, order, editing, ghost, landingRef, onLongPress, onSettings, onRemove, onResizeStart, children }: FrameProps) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: block.id, disabled: !editing });
  const m = useMotion();

  /* The frame's element, for dnd-kit, for a block to write its mood onto
     (`blockContext.ts`), and for the arrival below. */
  const frameRef = useRef<HTMLElement | null>(null);
  /* A block's layout effect runs before React attaches this frame's ref (a
     child commits first), so the mood it reports is kept and also written
     when the element arrives. */
  const moodRef = useRef<BlockMood | null>(null);
  const setRefs = useCallback((el: HTMLElement | null) => {
    frameRef.current = el;
    if (el && moodRef.current) el.dataset.mood = moodRef.current;
    setNodeRef(el);
  }, [setNodeRef]);
  const { look, colour } = blockLook(block);
  const setMood = useCallback((mood: BlockMood | null) => {
    moodRef.current = mood;
    const el = frameRef.current;
    if (!el) return;
    if (mood) el.dataset.mood = mood;
    else delete el.dataset.mood;
  }, []);
  const context = useMemo(() => ({ setMood, look, colour }), [setMood, look, colour]);
  const pane = paneStyle(block);
  /* Idea 25 (29-1P6c): the block leans toward the mouse, laptop only, and
     never in edit mode, where Framer's `layout` owns its transform. Its
     light is the glow above (idea 13), already following the mouse. */
  useTilt(frameRef, { enabled: !editing });

  /* Idea 125: dropped, the block glides from its copy into the slot with a
     little give, on `translate` and `scale` (Framer's `layout` owns its
     `transform` in edit mode). Only on the render where it stops being the
     ghost, and only if the landing names it. */
  const wasGhost = useRef(false);
  useLayoutEffect(() => {
    const was = wasGhost.current;
    wasGhost.current = ghost;
    const from = landingRef.current;
    if (ghost || !was || !from || from.id !== block.id) return;
    landingRef.current = null;
    const el = frameRef.current;
    if (!el || prefersReducedMotion()) return;
    const r = el.getBoundingClientRect();
    const dx = from.x - (r.left + r.width / 2);
    const dy = from.y - (r.top + r.height / 2);
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    el.animate(
      [{ translate: `${dx}px ${dy}px`, scale: '1.03' }, { translate: '0px 0px', scale: '1' }],
      { duration: Math.round(m.dur.slow * 1500), easing: cubic(m.ease.springy) },
    );
  }, [ghost, landingRef, block.id, m]);

  /* Idea 56: on the first open the blocks rise and fade in, one after
     another in reading order; never again on the way back (`motionOnce.ts`).
     A widget added later arrives the same way. */
  usePlayOnChange(frameRef, 'arrived', (el) =>
    el.animate([{ opacity: 0, translate: '0 14px', scale: '0.96' }], {
      duration: m.dur.sheet * 1700, easing: cubic(m.ease.glide), delay: Math.min(order, 12) * 45, fill: 'backwards',
    }),
  );

  /* Long-press to edit, like a phone's home screen. A press that turned into
     a long-press does not also count as a tap on what is under the finger. */
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressAt.current = null;
  };
  useEffect(() => cancelPress, []);

  const pressHandlers = editing
    ? {}
    : {
        onPointerDown: (e: ReactPointerEvent) => {
          if (e.button !== 0) return;
          /* 29-1P6b: holding a task in a block peeks at it (`lib/peek.ts`);
             holding anywhere else in the block still starts editing, and so
             does the header's Edit. */
          if (e.target instanceof Element && e.target.closest('[data-peek]')) return;
          /* 29-2e3c: nor does holding a task that moves onto the Timeline's
             hours (`useBlockDrag`): the drag stops its moves before they
             reach here, so this timer would never be cancelled. */
          if (e.target instanceof Element && e.target.closest('[data-drag-row]')) return;
          /* 29-1c1: holding inside a text box selects words, as it does
             everywhere else on the tablet; it is not a hold on the block. */
          if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable]')) return;
          fired.current = false;
          pressAt.current = { x: e.clientX, y: e.clientY };
          pressTimer.current = setTimeout(() => {
            fired.current = true;
            pressTimer.current = null;
            onLongPress();
          }, LONG_PRESS_MS);
        },
        onPointerMove: (e: ReactPointerEvent) => {
          const at = pressAt.current;
          if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 8) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onClickCapture: (e: ReactMouseEvent) => {
          if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; }
        },
      };

  return (
    <motion.div
      ref={setRefs}
      data-block-id={block.id}
      data-editing={editing || undefined}
      className={['dash-block', pane.lamp && 'dash-lamp', !editing && 'ag-tilt'].filter(Boolean).join(' ')}
      layout={editing ? 'position' : false}
      transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      {...(editing ? listeners : {})}
      {...(editing ? attributes : {})}
      {...pressHandlers}
      aria-roledescription={editing ? 'Movable widget' : undefined}
      style={{
        gridColumn: `${x + 1} / span ${w}`,
        gridRow: `${y + 1} / span ${h}`,
        position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden',
        ...pane.style,
        boxShadow: [
          'var(--glass-shadow-pane)',
          pane.edge,
          editing ? '0 0 0 1.5px oklch(0.86 0.17 128 / 0.45)' : null,
        ].filter(Boolean).join(', '),
        touchAction: editing ? 'none' : undefined,
        cursor: editing ? 'grab' : undefined,
        userSelect: editing ? 'none' : undefined,
      }}
      /* The dashed slot a held block will land in, and its light as the
         copy is pulled in (125): `dashboard.css`. */
      data-ghost={ghost || undefined}
    >
      {/* In edit mode what is inside is looked at, not pressed — and dimmed,
          so the ✕, the sliders and the corner read over it. Grey when the
          block has nothing left (idea 145). Both in `dashboard.css`. */}
      <div className="dash-block-body" data-editing={editing || undefined}>
        <BlockContext.Provider value={context}>{children}</BlockContext.Provider>
      </div>
      {/* Idea 13: the glow that follows the mouse (`DashboardGrid`'s `followGlow`). */}
      {!editing && <span className="dash-glow" aria-hidden="true" />}

      {editing && !ghost && (
        <>
          <EditButton label="Remove widget" icon="x" onClick={onRemove} style={{ top: 10, left: 10 }} />
          <EditButton label="Widget settings" icon="sliders-horizontal" onClick={onSettings} style={{ top: 10, right: 10 }} />
          <span
            role="presentation"
            onPointerDown={onResizeStart}
            title="Drag to resize"
            style={{
              position: 'absolute', right: 6, bottom: 6, width: 30, height: 30, zIndex: 2,
              display: 'grid', placeItems: 'center', borderRadius: 'var(--r-xs)', cursor: 'nwse-resize',
              backgroundImage: 'var(--soft-fill)', boxShadow: 'var(--soft-raised)', touchAction: 'none',
              color: 'var(--hue-lime)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M13 5 L5 13 M13 9 L9 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        </>
      )}
    </motion.div>
  );
}

function EditButton({ label, icon, onClick, style }: { label: string; icon: 'x' | 'sliders-horizontal'; onClick: () => void; style: CSSProperties }) {
  return (
    <SoftIconButton
      size="sm"
      label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ position: 'absolute', zIndex: 2, color: 'var(--fg-1)', ...style }}
    >
      <Icon name={icon} size={15} />
    </SoftIconButton>
  );
}
