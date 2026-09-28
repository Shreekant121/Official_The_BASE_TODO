/**
 * How a score is *said* — the words on the importance dial, and the hue a
 * reading is tinted with.
 *
 * **`MAX_PRIORITY_SCORE`, `MAX_PRIORITY_SCORE_PARTS` and `SCORE_BANDS` are
 * gone (item 16).** All three were arithmetic about a ceiling that no longer
 * exists. The settled decision: *"Display — raw numbers. The score renders as
 * its real value however large. The ring fills against the highest score
 * currently on screen, since an absolute ceiling no longer exists, and colours
 * by `W`, not by the raw score."* The highest score on screen is
 * `usePriorityScores().peak`; the seven caps still have a sum, but it belongs
 * to the factor bar and lives in `lib/priority.ts` as `LINEAR_CEILING`, not
 * here.
 *
 * The 6/10 colour thresholds went with them. A fixed cut on a raw score cannot
 * survive a number that runs past 600 inside the danger zone and sits under 10
 * outside it, and `W` is already 0–1 — exactly what a colour ramp wants. It
 * also makes the colour and Red Alert the same fact rather than two facts that
 * can disagree.
 */
import { TUNING } from '../../lib/priority';

/**
 * The ten rungs of the importance dial, in words.
 *
 * Only the two ends are ever drawn — the retired `PersonalScorePicker` settled
 * that at UI-30 (*"a caption under every number is five times the ink for the
 * same information"*) and ten stops make it five times truer. The rest exist
 * for the per-stop `aria-label` and for the reading beside the field's label,
 * which is the one place a screen reader and a sighted reader get the same
 * sentence.
 *
 * It lives here rather than beside the control because a module that exports
 * both a component and a constant loses fast refresh — the same reason
 * `needs.ts` is its own file.
 */
export const HUMAN_OVERRIDE_WORDS = [
  'None', 'Trivial', 'Very low', 'Low', 'Modest',
  'Medium', 'Notable', 'High', 'Very high', 'Critical',
] as const;

/**
 * The score bands as hues, addressable by name.
 *
 * Lived in `ui/data/ScoreDial.tsx` as `DIAL_TONE_VAR` until UI-24, when that
 * component was reconciled down to the source's two-state chip and stopped
 * having a hue table at all. It belongs here anyway: `scoreTone` is what
 * decides a band, and every caller reaches for the two together.
 */
export type ScoreTone = 'accent' | 'cyan' | 'amber' | 'rose' | 'violet' | 'neutral';

export const SCORE_TONE_VAR: Record<ScoreTone, string> = {
  accent:  'var(--accent)',
  cyan:    'var(--hue-cyan)',
  amber:   'var(--hue-amber)',
  rose:    'var(--hue-rose)',
  violet:  'var(--hue-violet)',
  neutral: 'var(--fg-3)',
};

/**
 * The shoulder of the sigmoid — where a task stops being calm and starts
 * warming, about a day and a half before its threshold at `a = 1`.
 *
 * It is not a fourth tuning number in disguise. `TUNING.redAlertW` is the only
 * cut that decides anything; this one decides nothing but a hue, and it is
 * placed by the curve's own shape rather than chosen: 0.25 is one steepness
 * unit below the midpoint, the same distance on the other side as 0.75.
 */
const WARMING_W = 0.25;

/**
 * The hue a reading of this score is tinted with — **read off `W`, not off the
 * number**.
 *
 * Rose is Red Alert and nothing else, which is the whole point of colouring by
 * `W`: the badge and the tint are one fact said twice, and cannot drift apart
 * the way a raw-score cut and a sigmoid cut would. Amber is a task on the
 * shoulder of its curve — "this is coming" — and violet is a scored task that
 * is simply not urgent yet, which is the backburner hue and the right one for
 * it.
 *
 * An unscored task is `neutral`, which is the whole point of the resting
 * reading: no hue at all until someone has actually made a judgement. Emerald
 * is deliberately absent — `colors.css` rations it to mean LIVE, and a
 * priority is not a live state.
 */
export function scoreTone(score: number, w: number): ScoreTone {
  if (score <= 0) return 'neutral';
  if (w > TUNING.redAlertW) return 'rose';
  if (w > WARMING_W) return 'amber';
  return 'violet';
}
