/**
 * Buzzes you can tell apart (29-1P3, idea 122 of round 8).
 *
 * Each kind of moment has its own rhythm — one tiny tap for a tick, two for
 * done, a rising pulse when a session ends, a stutter for an error — so after a
 * week he knows what happened without looking. The rhythms are the ideas
 * page's, in milliseconds of on / off / on.
 *
 * `SortableList` used to call `navigator.vibrate` itself; its pick-up and
 * "it will go inside" buzzes are `pick` and `into` here now. **Nothing calls
 * `buzz` but `lib/sound.ts`'s `cue`** (and Settings' Test buzz), which is where
 * the one switch in Settings → App is read — sound and buzz together, his call.
 *
 * Whether his tablet can buzz at all is not known (2026-10-07: "not sure").
 * Settings has a Test buzz button for that. A device with no motor, or a
 * browser that refuses, gets nothing and is no worse off — the call is wrapped
 * because some browsers throw rather than return false. Chromium also ignores
 * a vibrate before the page's first press, which is the right rule anyway.
 */
const PATTERNS = {
  tick: [12],
  done: [15, 70, 25],
  start: [20, 60, 10],
  sessionEnd: [40, 90, 60, 90, 120],
  error: [35, 45, 35, 45, 35],
  nudge: [8, 50, 8],
  delete: [25],
  /* 29-1P4a: something put back — the idea page's double tap. */
  undo: [10, 40, 10],
  /* The drag set: picked up, each slot passed, dropped, and "it will go inside". */
  pick: [10],
  pass: [4],
  drop: [12],
  into: [12],
  /* A slider's or knob's whole step. */
  detent: [6],
  /* 29-1P6b: a notice flicked away (126) - the idea page's one short tap. */
  toss: [10],
} satisfies Record<string, number[]>;

export type BuzzName = keyof typeof PATTERNS;

/** True where the browser offers a motor at all — it cannot say whether one exists. */
export function canBuzz(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function buzz(name: BuzzName): void {
  try {
    navigator.vibrate?.(PATTERNS[name]);
  } catch {
    /* No motor, or the browser refuses: nothing to do. */
  }
}
