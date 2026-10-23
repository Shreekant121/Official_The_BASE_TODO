/**
 * When a Start is a slide instead of a press (29-1P2, BIG-15). The design
 * system keeps `SlideToStart` for "committing to something big", and his call
 * on 2026-10-06 is that **any session of 90 minutes or more** is big — New
 * Session's Start included, which he knows is nearly always.
 *
 * One number for every Start that can be either, so the Dashboard's block and
 * Set Deadlines cannot disagree about where the line is.
 */
import { durationMinutes } from './priority';

export const SLIDE_FROM_MINUTES = 90;

/** The planned length of a session, in minutes: each task's own time, as Focus reads it. */
export function sessionMinutes(tasks: readonly { estimatedTime?: number; allocatedTime?: number }[]): number {
  return tasks.reduce((sum, t) => sum + durationMinutes(t), 0);
}

export function startsBySlide(minutes: number): boolean {
  return minutes >= SLIDE_FROM_MINUTES;
}
