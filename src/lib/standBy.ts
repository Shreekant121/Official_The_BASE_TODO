/*
 * The StandBy clock (29-1P10c, idea 100) — when Focus becomes a bedside
 * clock, and whether it is night. Pure: the clock and the touch are arguments.
 *
 * His calls (2026-10-15): it turns on by itself when the tablet is held
 * sideways with Focus running; tablet only; night is the Dashboard's night
 * (`hourPhaseAt`, the greeting's hours: nine at night to five).
 *
 * The session's call, since nobody said how to get the screen back: a tap
 * puts the full Focus screen back, and StandBy returns by itself a minute
 * after the last touch. So it does not cover a subtask list he is ticking,
 * and a tablet propped up and left alone always ends on the clock.
 */
import { hourPhaseAt } from './screenLight';

/** How long after his last touch StandBy comes back. */
export const STANDBY_IDLE_MS = 60_000;

export interface StandByFacts {
  /** A finger, not a mouse, on a screen at least tablet-tall when sideways. */
  tablet: boolean;
  landscape: boolean;
  /** The clock is counting (not paused, not in the opening breath). */
  running: boolean;
  /** Something he opened is in front of Focus: Mark done's question, the task sheet, Capture, Switch. */
  busy: boolean;
  now: number;
  /** When he last touched the screen, ms. */
  lastTouch: number;
}

export function standByShown(f: StandByFacts): boolean {
  if (!f.tablet || !f.landscape || !f.running || f.busy) return false;
  return f.now - f.lastTouch >= STANDBY_IDLE_MS;
}

/** Dim red, by the greeting's night. */
export function standByNight(now: number): boolean {
  return hourPhaseAt(new Date(now)) === 'night';
}
