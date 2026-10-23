/**
 * Snap into place (29-2e3a, idea 125; macOS window snapping) — pure: no
 * React, no store, no clock. Dragging a task's block on the Calendar's hours:
 * where it lands, how hard the slot pulls it, and the deadline that leaves.
 *
 * HIS CALLS (2026-10-21)
 * ----------------------
 * - **The drop sets the deadline.** A block is BASE's Google Calendar block,
 *   `deadline − length` → `deadline`, so a block dropped with its top at 3pm
 *   runs from 3pm and is due when it ends: an hour's task, 4pm. One time per
 *   task, so the Calendar, Google and the score agree.
 * - **The slots are every 15 minutes**, Google Calendar's way: the block's top
 *   is pulled to the nearest quarter, that slot lights, and it clicks in there.
 * - **A task due before an event cannot be dragged**: it follows its event.
 * - Dragged from the hours here; a tray of undated tasks is 29-2e3b, the
 *   Dashboard's Today onto its Timeline 29-2e3c.
 *
 * THE SESSION'S CALLS
 * -------------------
 * - **A finished task stays put**: its block is the record of what was done,
 *   as his calendar keeps it, so it is not dragged (it still peeks on a hold).
 * - **The top snaps, not the end**: he aims with the top ("drop it at 3pm"),
 *   so a 25-minute task lands at 3:00-3:25 and is due 3:25.
 * - **The magnet is the idea page's**: inside half a slot of a quarter the
 *   block is pulled towards it, harder the nearer it is (`MAGNET`), so it
 *   leans into the slot under the finger before it is let go.
 * - A block may start at the last quarter of the day and end after midnight:
 *   its deadline is then the next day, as a block crossing midnight already is.
 */
import { addDays } from '../dashboard/hours';

/** A slot, in minutes (his call). */
export const SNAP_MIN = 15;
/** How much of the way to the slot the block is pulled at its centre (the idea page's 0.7). */
export const MAGNET = 0.7;

const DAY_MIN = 24 * 60;

/** Why a task's block will not move, or null when it will. */
export type DragRefusal = 'done' | 'event';

/** Whether a block can be picked up: never a finished task, never one following an event. */
export function dragRefusal(task: { status: string; eventId?: string }): DragRefusal | null {
  if (task.status === 'completed') return 'done';
  if (task.eventId) return 'event';
  return null;
}

/** What a block that will not move says over itself (or, on the Dashboard, its Today row) for a moment. */
export function refusalWords(why: DragRefusal, eventTitle?: string): string {
  return why === 'event' ? `Moves with ${eventTitle ?? 'its event'}` : 'Finished, so it stays';
}

/** The slot a block whose top is at `rawMin` lands in: the nearest quarter, inside the day. */
export function snapStart(rawMin: number): number {
  const q = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
  return Math.min(DAY_MIN - SNAP_MIN, Math.max(0, q));
}

/**
 * Where the block is drawn while held: the finger's minute, pulled towards
 * `slot` — not at all at half a slot away, `MAGNET` of the way on it.
 */
export function magnetPull(rawMin: number, slot: number): number {
  const d = slot - rawMin;
  const k = Math.max(0, 1 - Math.abs(d) / (SNAP_MIN / 2));
  return rawMin + d * k * MAGNET;
}

/** The deadline a block of `minutes` dropped at `start` on `day` leaves: its end, in the app's date string. */
export function droppedDeadline(day: string, start: number, minutes: number): string {
  const end = start + Math.max(1, Math.round(minutes));
  const onDay = addDays(day, Math.floor(end / DAY_MIN));
  const m = ((end % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${onDay}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

/** Which column of `count` equal columns, `left` to `left + width`, the point `x` is over; clamped to the ends. */
export function columnAt(x: number, left: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(((x - left) / width) * count)));
}

/**
 * How fast the hours scroll while a block is held near an edge, in pixels a
 * frame: nothing outside the `band`, up to `max` at the very edge, negative
 * near the top.
 */
export function edgeScroll(y: number, top: number, bottom: number, band: number, max: number): number {
  if (y < top + band) return -max * Math.min(1, (top + band - y) / band);
  if (y > bottom - band) return max * Math.min(1, (y - (bottom - band)) / band);
  return 0;
}

const pad = (n: number) => String(n).padStart(2, '0');
