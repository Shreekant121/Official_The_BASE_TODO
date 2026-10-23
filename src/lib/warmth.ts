/**
 * Warmth — how close or how pressing something is, as a colour (29-1P7a).
 *
 * Two ramps, pure, no clock and no DOM. Each returns a 0–1 warmth and a CSS
 * colour for it, mixed **in oklab**: a straight line between two job colours.
 * In oklch the hue swings round the wheel on the way and lands on a third
 * job's colour (sky to coral went through violet, Atlas's).
 *
 * - **A deadline (idea 66)** warms from sky (a date) to coral (about to be
 *   missed). Built for the Dashboard's runway at 29-1P13 and moved here when
 *   every date chip took it; `lib/dashboard/blockData.ts` re-exports it.
 * - **A score (idea 33)** warms from the plain numeral through gold to orange,
 *   his call over the idea page's teal start (teal is Focus). Coral is NOT on
 *   this ramp: the chip goes coral only at Red Alert, which `ScoreDial`
 *   decides from `alert`, so coral stays as rare as the engine's own verdict.
 */

/**
 * How warm a deadline is, 0 (cold, two weeks off or more) to 1 (due now):
 * a block draws it from sky (dates) towards coral (urgent), so the colour
 * says how close it is before the eye reads the position.
 */
export function deadlineWarmth(daysAway: number, range = 14): number {
  const f = 1 - Math.max(0, Math.min(range, daysAway)) / range;
  return f * f;
}

/** The colour for a deadline's warmth: sky (a date) towards coral (urgent). */
export function warmthColour(warmth: number): string {
  const pct = Math.round(clamp01(warmth) * 100);
  return `color-mix(in oklab, var(--job-coral) ${pct}%, var(--job-sky))`;
}

/**
 * Where on the score ramp a score sits, 0–1, read against `peak` — the highest
 * open score in the app (`usePriorityScores().peak`), the same number a
 * chip's `/max` is drawn against. The score has no ceiling since item 16, so
 * "high" can only mean high against the rest of his work.
 *
 * The bottom third stays at 0: most of a board is ordinary work, and a board
 * where every chip glowed a little would say nothing. Warmth starts at 35% of
 * the peak and reaches 1 at the peak itself.
 */
export function scoreWarmth(score: number, peak: number): number {
  if (!(score > 0) || !(peak > 0)) return 0;
  return clamp01((score / peak - SCORE_COLD) / (1 - SCORE_COLD));
}

/** The share of the peak under which a score stays the plain numeral. */
export const SCORE_COLD = 0.35;

/**
 * The numeral's colour for a score's warmth: the chip's own white at 0, gold
 * by the middle, orange at the top. `null` at 0, so a caller keeps its own
 * resting ink rather than restating it.
 */
export function scoreWarmthColour(warmth: number): string | null {
  const w = clamp01(warmth);
  if (w <= 0) return null;
  if (w <= 0.5) {
    return `color-mix(in oklab, var(--job-gold-tag-fg) ${Math.round(w * 200)}%, var(--fg-1))`;
  }
  return `color-mix(in oklab, var(--job-orange-tag-fg) ${Math.round((w - 0.5) * 200)}%, var(--job-gold-tag-fg))`;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
