/**
 * While you work (29-1P10b): the three moments Focus has in the middle of a
 * task, as arithmetic. Pure: no store, no clock, no DOM. `useFocusRun` holds
 * the state, `FocusRunHost` watches the tab, and the cards are in
 * `components/FocusMoments.tsx`.
 *
 *   - **Flow (idea 102).** A clock past zero is not "over", it is "in flow":
 *     gold, counting up, with Wrap up beside it. His calls, 2026-10-15: on
 *     **both** clocks (the task's and the session's, confirmed again
 *     2026-10-15 over the "b" he first wrote), the session's end rings the
 *     chime **softly, once**, and Wrap up opens Mark done.
 *   - **Halfway (idea 103).** "Halfway. Still on it?" when the TASK's clock
 *     passes half its time, for tasks of 20 minutes or more. Silent; it shows
 *     for ten seconds and goes if he does not answer.
 *   - **Away (idea 101).** "You were away 4 min", on the tablet only. His
 *     calls: switching to another app for 2 minutes or more shows the card; a
 *     screen lock is not away, and shows it only if he was gone longer than
 *     the task had left. The browser cannot say which of the two it was, so
 *     BASE guesses from his last touch (his pick, 2026-10-15): a finger on the
 *     screen just before the tab went is a swipe home or a tap into another
 *     app; no touch is the power button.
 */

/** Tasks shorter than this never ask halfway (idea 103's card: "20 minutes or more"). */
export const HALFWAY_MIN_SECONDS = 20 * 60;
/** How long the halfway note stays when he does not answer it. */
export const HALFWAY_SHOW_SECONDS = 10;

/**
 * Is the halfway note showing? Read straight off the task clock, so the
 * note's ten seconds are a window on the clock rather than a timer of their
 * own: it appears as the clock passes half, and is gone ten seconds later
 * with nothing to clean up. `0` to `1` is how much of the window is left,
 * for the draining bar; `null` is not showing.
 */
export function halfwayLeft(allocated: number, secondsLeft: number): number | null {
  if (allocated < HALFWAY_MIN_SECONDS) return null;
  const half = allocated / 2;
  const past = half - secondsLeft;
  if (past < 0 || past >= HALFWAY_SHOW_SECONDS) return null;
  return 1 - past / HALFWAY_SHOW_SECONDS;
}

/** A touch this close before the tab went means he left on purpose, into another app. */
export const TOUCH_BEFORE_LEAVE_MS = 2000;
/** Away from an app switch: the card from 2 minutes (his call). */
export const AWAY_MIN_MS = 2 * 60 * 1000;

export type AwayKind = 'switch' | 'lock';

/** Which kind of leaving it looked like. `lastTouchAt` 0 is never touched. */
export function awayKind(lastTouchAt: number, hiddenAt: number): AwayKind {
  return lastTouchAt > 0 && hiddenAt - lastTouchAt <= TOUCH_BEFORE_LEAVE_MS ? 'switch' : 'lock';
}

/**
 * Does he get the card? An app switch from two minutes; a lock only once he
 * was gone longer than the task had left when he went (and never under two
 * minutes, for a task already past its time).
 */
export function awayCardDue(kind: AwayKind, awayMs: number, taskLeftAtHide: number): boolean {
  if (awayMs < AWAY_MIN_MS) return false;
  return kind === 'switch' || awayMs > taskLeftAtHide * 1000;
}

/** "4 min", "1 h 5 min": the card's own count, never seconds. */
export function awayWords(awayMs: number): string {
  const minutes = Math.max(1, Math.round(awayMs / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
