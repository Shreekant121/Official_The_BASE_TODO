/**
 * Dragging the floating + into a list (29-1c1, idea 37: Things 3's Magic
 * Plus) — where it would land, pure, no DOM.
 *
 * His calls: the + drops onto **a list** (here) **or a day** (29-1c3, the
 * week strip); a gap opens where he points and the new task lands exactly
 * there; a tap instead is the capture sheet it always was.
 *
 * THE GAP MOVES WHAT IT IS MEASURED AGAINST. The gap is real layout: the rows
 * after it slide down to make room. Measured as they are drawn, the row under
 * the finger would jump below it the moment the gap opened, the aim would
 * move past it, the gap would follow, and it would flicker. So every row
 * after the gap is measured where it would be WITHOUT the gap — its drawn top
 * less the gap's drawn height, which is exact even while the gap is still
 * opening, because a half-open gap moves them by exactly its half height.
 */

export interface AimRow {
  id: string;
  /** Drawn top and height, in the same units as the pointer's y. */
  top: number;
  height: number;
  /** The row is drawn after the open gap, so the gap has pushed it down. */
  afterGap: boolean;
}

/**
 * The row the new task goes in front of, or `null` for the end of the list.
 * Rows are in the order they are drawn; the pointer is "before" a row while it
 * is above that row's middle.
 */
export function aimBefore(rows: readonly AimRow[], gapHeight: number, y: number): string | null {
  for (const row of rows) {
    const top = row.afterGap ? row.top - gapHeight : row.top;
    if (y < top + row.height / 2) return row.id;
  }
  return null;
}

/** Far enough for a press on the + to be a drag rather than a tap — the board's own mouse threshold. */
export const PLUS_DRAG_PX = 6;

export function isDrag(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > PLUS_DRAG_PX;
}
