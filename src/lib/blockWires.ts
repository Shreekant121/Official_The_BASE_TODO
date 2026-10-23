/**
 * See what blocks what (idea 164, 29-1P7c, BIG-15; Figma's connectors,
 * Linear). Point at a locked card and a dotted line draws to the task it
 * waits on, which lights up; point at a task that holds others back and its
 * lines draw out to them. Across two side-by-side projects too.
 *
 * This file is the two halves that are not drawing: **which task is being
 * pointed at** (a tiny in-memory store, never persisted or synced — it is a
 * pointer, not data), and **the shape of one wire** (`wirePath`, pure,
 * tested). `components/project/BlockWires.tsx` reads both and draws.
 *
 * Rows report themselves; they never work out the graph. The host asks the
 * store's backlog who waits on whom (`relationsOf`, pure), once per pointing,
 * so forty rows on a board do not each scan the backlog on every render.
 */
import { create } from 'zustand';
import type { Task } from '../store/useStore';

/* ── Who is being pointed at ─────────────────────────────────────────── */

/** How long the pointer rests on a card before its wires draw — a sweep across the board draws nothing. */
export const WIRE_DWELL_MS = 120;

interface WireState {
  /** The task whose wires are drawn, or null. */
  at: string | null;
  /** Drawn by a tap (the tablet: "Waiting on …" pressed), so the pointer leaving does not clear it. */
  pinned: boolean;
  /** The pointer rested on a card. */
  point: (id: string) => void;
  /** The pointer left it. */
  leave: (id: string) => void;
  /** A tap on a card's "Waiting on …": draws it, or clears it if it is the one drawn. */
  pin: (id: string) => void;
  clear: () => void;
}

let dwell: ReturnType<typeof setTimeout> | null = null;
const stopDwell = () => { if (dwell) { clearTimeout(dwell); dwell = null; } };

export const useWireStore = create<WireState>((set, get) => ({
  at: null,
  pinned: false,
  point: (id) => {
    stopDwell();
    if (get().pinned) return;
    dwell = setTimeout(() => { dwell = null; set({ at: id, pinned: false }); }, WIRE_DWELL_MS);
  },
  leave: (id) => {
    stopDwell();
    const s = get();
    if (s.at === id && !s.pinned) set({ at: null });
  },
  pin: (id) => {
    stopDwell();
    const s = get();
    set(s.at === id && s.pinned ? { at: null, pinned: false } : { at: id, pinned: true });
  },
  clear: () => {
    stopDwell();
    if (get().at !== null || get().pinned) set({ at: null, pinned: false });
  },
}));

/* ── Who waits on whom ───────────────────────────────────────────────── */

export interface WireEnd {
  /** The task that must be finished first. */
  blocker: string;
  /** The task waiting on it. */
  blocked: string;
}

/**
 * Every unfinished link touching `id`: what it waits on, and what waits on
 * it. A link counts only while the blocker is unfinished and the blocked
 * task is too — the same reading as `getBlockingTasks`, so a line is drawn
 * exactly where a card says "Waiting on". Pure.
 */
export function relationsOf(backlog: readonly Task[], id: string): WireEnd[] {
  const byId = new Map(backlog.map((t) => [t.id, t]));
  const self = byId.get(id);
  if (!self) return [];
  const open = (t: Task | undefined): t is Task => !!t && t.status !== 'completed';
  const out: WireEnd[] = [];
  if (open(self)) {
    for (const dep of self.dependsOn ?? []) {
      if (open(byId.get(dep))) out.push({ blocker: dep, blocked: id });
    }
    for (const t of backlog) {
      if (t.id !== id && open(t) && t.dependsOn?.includes(id)) out.push({ blocker: id, blocked: t.id });
    }
  }
  return out;
}

/* ── The shape of one wire ───────────────────────────────────────────── */

export interface Box { left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }

/** How far a wire between two cards in one column bows out past their right edges. */
const BOW = 36;
/** Wire ends sit this far inside a card's edge, so the dot reads as on the card. */
const INSET = 6;

/**
 * A wire from `from` (the blocker) to `to` (the task waiting on it), as an SVG
 * cubic, with where its end dot and its label go. Side by side — two
 * columns, or two boards — it runs from the facing edges, as the idea card
 * draws it. One above the other in the same column, facing edges do not
 * exist, so it leaves and re-enters on the right and bows out past both — or
 * on the left, when the bow would leave `viewRight` (List view's rows are the
 * page's whole width, and a wire bowed off the screen with its words). Pure.
 */
export function wirePath(from: Box, to: Box, viewRight = Infinity): { d: string; end: Point; label: Point } {
  const fy = (from.top + from.bottom) / 2;
  const ty = (to.top + to.bottom) / 2;
  let p0: Point; let p1: Point; let p2: Point; let p3: Point;
  if (from.right <= to.left || to.right <= from.left) {
    const rightward = from.right <= to.left;
    p0 = { x: rightward ? from.right - INSET : from.left + INSET, y: fy };
    p3 = { x: rightward ? to.left + INSET : to.right - INSET, y: ty };
    const mx = (p0.x + p3.x) / 2;
    p1 = { x: mx, y: fy };
    p2 = { x: mx, y: ty };
  } else {
    const bow = Math.max(BOW, Math.abs(ty - fy) * 0.18);
    const right = Math.max(from.right, to.right) + bow;
    const onRight = right <= viewRight - BOW;
    const out = onRight ? right : Math.min(from.left, to.left) - bow;
    p0 = { x: onRight ? from.right - INSET : from.left + INSET, y: fy };
    p3 = { x: onRight ? to.right - INSET : to.left + INSET, y: ty };
    p1 = { x: out, y: fy };
    p2 = { x: out, y: ty };
  }
  const r = (n: number) => Math.round(n * 10) / 10;
  /* The curve's own midpoint, t = ½: (p0 + 3p1 + 3p2 + p3) / 8. */
  const label = { x: r((p0.x + 3 * p1.x + 3 * p2.x + p3.x) / 8), y: r((p0.y + 3 * p1.y + 3 * p2.y + p3.y) / 8) };
  return {
    d: `M${r(p0.x)} ${r(p0.y)} C${r(p1.x)} ${r(p1.y)}, ${r(p2.x)} ${r(p2.y)}, ${r(p3.x)} ${r(p3.y)}`,
    end: { x: r(p3.x), y: r(p3.y) },
    label,
  };
}
