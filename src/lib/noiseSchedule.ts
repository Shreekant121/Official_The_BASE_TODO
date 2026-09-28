/**
 * WHEN the noise plays. `brownNoise.ts` is what it sounds like; this is the
 * other half of BUILD-1's Settings panel — the "When it plays" card's two
 * modes, as arithmetic.
 *
 * Pure, and separate from both the store and the audio graph, because it is
 * the one part of the feature with an answer that can be wrong rather than
 * merely inaudible: a boundary off by a cycle plays an hour of noise through
 * a break, and nobody reviewing a diff would see it.
 *
 * MODE `task` — the sound simply follows the session. One decision, no clock.
 *
 * MODE `pomodoro` — `focusMinutes` on, `breakMinutes` off, repeating, and it
 * runs **beside** the task's own countdown rather than replacing it. That is
 * the item's word: *"the task timer is the product, this only decides when
 * there is sound."* Nothing here touches a task, a queue or a deadline.
 *
 * The phase is derived from the anchor and the clock rather than advanced by a
 * timer, for the reason `useFocusRun` derives its countdowns the same way: a
 * timer that stops running behind a locked screen leaves the phase wherever it
 * was when the tablet went dark, and it would come back mid-break believing it
 * was still in the first minute of a focus block.
 */
import type { NoisePrefs } from './brownNoise';

export interface NoisePhase {
  /** Is this a stretch that should have sound in it? */
  on: boolean;
  /**
   * Epoch ms at which `on` flips, or `null` when it never does.
   *
   * The caller sets one timer for this moment instead of polling. In `task`
   * mode there is nothing to wait for, which is what `null` says.
   */
  until: number | null;
}

const SOUND_ON: NoisePhase = { on: true, until: null };

/**
 * Where the cycle is, given when he pressed play.
 *
 * `runningSince` is the anchor — see `useFocusRun`'s header for why it is not
 * the same field as the focus log's open stretch.
 */
export function noisePhaseAt(prefs: NoisePrefs, runningSince: number, now: number): NoisePhase {
  if (prefs.mode !== 'pomodoro') return SOUND_ON;

  const focus = Math.max(1, Math.round(prefs.focusMinutes)) * 60_000;
  const rest = Math.max(1, Math.round(prefs.breakMinutes)) * 60_000;
  const cycle = focus + rest;

  /* A clock that went backwards (an NTP correction, or a device whose date was
     wrong until it found the network) would otherwise produce a negative
     modulus and start the session in the middle of a break. */
  const elapsed = Math.max(0, now - runningSince);
  const into = elapsed % cycle;

  return into < focus
    ? { on: true, until: now + (focus - into) }
    : { on: false, until: now + (cycle - into) };
}
