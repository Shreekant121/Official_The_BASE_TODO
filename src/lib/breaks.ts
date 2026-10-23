/**
 * A real break (29-1P11a, idea 104) — the arithmetic, pure and tested.
 *
 * His calls (2026-10-15): a break is offered **in pomodoro mode only**, its
 * lengths are **his own numbers in Settings** (the focus block, the short
 * break, the long one), the "one small thing" comes from **his own list**,
 * seeded with hundreds he can edit, and **break time does not count** toward
 * his hours — the run is paused through it, so nothing is banked.
 *
 * WHEN A BREAK IS OFFERED
 * -----------------------
 * When a focus block ends: `focusMinutes` after he last pressed play
 * (`useFocusRun.runningSince`). Derived from that anchor and the clock, never
 * advanced by a timer, for the reason the run derives its countdowns the same
 * way — a timer behind a locked tablet stops, and would come back believing it
 * was still early in the block. A pause re-anchors it (play sets a new
 * `runningSince`), and so do "Keep going" and the end of a break: each starts
 * a fresh block. Every fourth break in a session is the long one, the card's
 * own rule (Pomofocus's).
 *
 * This replaced BUILD-1's `noiseSchedule.ts`. Before it, pomodoro mode only
 * faded the brown noise out for the break while the task's clock ran on; now
 * the break is real, so the sound simply follows the run, which is paused
 * while he rests.
 *
 * THE IDEAS
 * ---------
 * The seed lives in code (`breakIdeaSeed.ts`); what he changed is all that is
 * stored — the seed ids he removed and the ideas he added — so hundreds of
 * ideas cost a few bytes until he edits them, and a seed idea improved in a
 * later build reaches him unless he removed it.
 */
import type { NoisePrefs } from './brownNoise';

/** Every fourth break is the long one. */
export const LONG_BREAK_EVERY = 4;

/** Epoch ms the focus block that began at `runningSince` ends. */
export function blockEndsAt(prefs: Pick<NoisePrefs, 'focusMinutes'>, runningSince: number): number {
  return runningSince + Math.max(1, Math.round(prefs.focusMinutes)) * 60_000;
}

/** Is the `nth` break of a session (1-based) the long one? */
export function isLongBreak(nth: number): boolean {
  return nth > 0 && nth % LONG_BREAK_EVERY === 0;
}

/** Minutes for a break, short or long, from his numbers. */
export function breakMinutes(prefs: Pick<NoisePrefs, 'breakMinutes' | 'longBreakMinutes'>, long: boolean): number {
  return Math.max(1, Math.round(long ? prefs.longBreakMinutes : prefs.breakMinutes));
}

/** "+2 min" on the break card. */
export const BREAK_ADD_SECONDS = 120;

export interface BreakIdea {
  id: string;
  text: string;
}

/** What he changed about the seed list. Absent fields are empty. */
export interface BreakIdeaEdits {
  /** Seed ids he removed. */
  hidden: string[];
  /** His own ideas, newest first. */
  added: BreakIdea[];
}

export const NO_EDITS: BreakIdeaEdits = { hidden: [], added: [] };

/** The longest idea kept; a sentence to read in a breath, not a note. */
export const IDEA_MAX = 140;

/** One line, trimmed, inner whitespace collapsed, capped. Empty means nothing to add. */
export function cleanIdea(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, IDEA_MAX);
}

/** A stored document, read defensively: anything malformed is dropped, not trusted. */
export function readEdits(raw: unknown): BreakIdeaEdits {
  if (!raw || typeof raw !== 'object') return NO_EDITS;
  const r = raw as { hidden?: unknown; added?: unknown };
  const hidden = Array.isArray(r.hidden) ? r.hidden.filter((id): id is string => typeof id === 'string') : [];
  const added = Array.isArray(r.added)
    ? r.added.filter((i): i is BreakIdea => !!i && typeof (i as BreakIdea).id === 'string'
      && typeof (i as BreakIdea).text === 'string' && cleanIdea((i as BreakIdea).text) !== '')
    : [];
  return { hidden, added };
}

/** His list: his own first, then the seed less what he removed. */
export function ideasOf(seed: readonly BreakIdea[], edits: BreakIdeaEdits): BreakIdea[] {
  const hidden = new Set(edits.hidden);
  return [...edits.added, ...seed.filter((i) => !hidden.has(i.id))];
}

/** Adds one idea at the top. A duplicate of one already showing (any case) changes nothing. */
export function addIdea(
  seed: readonly BreakIdea[], edits: BreakIdeaEdits, text: string, id: string,
): BreakIdeaEdits {
  const clean = cleanIdea(text);
  if (!clean) return edits;
  const same = (i: BreakIdea) => i.text.toLowerCase() === clean.toLowerCase();
  if (ideasOf(seed, edits).some(same)) return edits;
  /* A seed idea he removed and typed back in comes back as itself. */
  const seedTwin = seed.find(same);
  if (seedTwin) return { ...edits, hidden: edits.hidden.filter((h) => h !== seedTwin.id) };
  return { ...edits, added: [{ id, text: clean }, ...edits.added] };
}

/** Removes one: his own is deleted, a seed one is hidden (and can be put back). */
export function removeIdea(seed: readonly BreakIdea[], edits: BreakIdeaEdits, id: string): BreakIdeaEdits {
  if (edits.added.some((i) => i.id === id)) return { ...edits, added: edits.added.filter((i) => i.id !== id) };
  if (seed.some((i) => i.id === id) && !edits.hidden.includes(id)) return { ...edits, hidden: [...edits.hidden, id] };
  return edits;
}

/** "Put back the ones I removed": the seed whole again, his own untouched. */
export function restoreSeed(edits: BreakIdeaEdits): BreakIdeaEdits {
  return edits.hidden.length === 0 ? edits : { ...edits, hidden: [] };
}

/**
 * The next idea to show, never the one showing. `roll` is 0-1 (a
 * `Math.random()` at the call site; a fixed number in a test or a shot).
 */
export function pickIdea(ideas: readonly BreakIdea[], roll: number, notId?: string): BreakIdea | null {
  const pool = ideas.length > 1 && notId ? ideas.filter((i) => i.id !== notId) : ideas;
  if (pool.length === 0) return null;
  const at = Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)));
  return pool[at];
}

/** "4:05" — the break's own clock: minutes and seconds, never below zero. */
export function breakClock(secondsLeft: number): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
