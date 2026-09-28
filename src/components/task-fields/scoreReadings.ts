/**
 * What the priority score is made of, in words and as a factor table (UI-30).
 *
 * `screens/scoring.html` opens with its model written out — *"five factors in,
 * one number out"* — and then states each one twice: as a hint under the field
 * it is derived from, and as a row in the `Instrument`. This is the second of
 * those, and the shape is still the source's.
 *
 * **ITEM 16 — THE NUMBERS ARE NOW THE ENGINE'S, AND THERE ARE SEVEN OF THEM.**
 * Until this session every value here came from `computePriorityScore`, and
 * the note at the top of this file said so at length: the mockup's model was
 * not the app's, rewriting the score was paused, so the shape was the
 * source's and the arithmetic was `useStore`'s. The rewrite is no longer
 * paused. `readScore` takes a `ScoreBreakdown` straight from
 * `lib/priority.ts` and does nothing but name and order what is already in
 * it — it computes nothing, which is the property worth keeping: two readings
 * of one score cannot disagree if only one of them does arithmetic.
 *
 * **The bar is drawn against the linear ceiling, and the numeral beside it is
 * not.** The seven variables add to at most 35 and that is what the segments
 * and the `/cap` column mean. The *score* has no ceiling — inside the danger
 * zone four of the seven multiply — so the score is printed raw, against the
 * highest score on screen. The `compounding` row is what joins the two: it is
 * the one place the screen says "this is 42 because it is compounding, and
 * these seven are what it is compounding from".
 *
 * `deadlineReading` came from `TaskDetailPanel.tsx`, where UI-26 put it; the
 * scoring screen states the same phrase under its Deadline field, so it is
 * shared rather than copied.
 */
import { LINEAR_CEILING, TUNING, type ScoreBreakdown } from '../../lib/priority';

const DAY = 86_400_000;

/**
 * The deadline, in words, plus whether it is close enough to say so in amber.
 *
 * The six bands are the source's copy; the points beside them are ours. Amber
 * is the top step — overdue, or inside the day.
 *
 * Note this measures to the **deadline**, while the score measures to the
 * **latest start** (`deadline − duration`). That is not a disagreement: this
 * phrase answers "when is this due", which is the field it sits under, and the
 * factor table answers what the score did with it.
 */
export function deadlineReading(iso: string, now: number): { phrase: string; urgent: boolean } {
  if (!iso) return { phrase: 'No deadline set', urgent: false };
  const days = (new Date(iso).getTime() - now) / DAY;
  if (days < 0) return { phrase: `Overdue by ${Math.ceil(-days)}d`, urgent: true };
  if (days <= 1) return { phrase: 'Due within a day', urgent: true };
  if (days <= 7) return { phrase: `Due in ${Math.ceil(days)}d`, urgent: false };
  if (days <= 21) return { phrase: `Due in ${Math.ceil(days)}d`, urgent: false };
  if (days <= 60) return { phrase: `Due in ${Math.round(days / 7)}w`, urgent: false };
  return { phrase: `Due in ${Math.round(days / 30)} months`, urgent: false };
}

/**
 * What the estimate does to the score, in words.
 *
 * **Three bands now, and none of them subtracts.** The old scorer docked a
 * long task half a point and a very long one a full point; a capped variable
 * in a product cannot do that, so the new one simply stops rewarding length —
 * *"there are no negative rungs any more"* (`TUNING.duration`). The source's
 * own sentence about the penalty went with the penalty.
 *
 * The estimate is also spent twice over now, and the second time is the one
 * that matters: it sets **Latest start**, `deadline − duration`, which is what
 * every deadline-shaped variable in the score is measured to. A two-hour task
 * due at six is urgent at four; a fifteen-minute one is not.
 */
export function durationReading(input: { estimatedTime?: number; allocatedTime?: number }): string {
  const minutes =
    input.allocatedTime && input.allocatedTime > 0
      ? input.allocatedTime / 60
      : input.estimatedTime && input.estimatedTime > 0
        ? input.estimatedTime
        : undefined;
  if (minutes === undefined) {
    return `Unset counts as ${TUNING.defaultTaskMinutes} min — the neutral guess. It also sets the latest start.`;
  }
  if (minutes < TUNING.duration.microMinutes) {
    return 'Under half an hour — a quick win, so it takes the full duration point.';
  }
  if (minutes <= TUNING.duration.standardMinutes) {
    return 'A standard block — half the duration point, and half a day of latest start.';
  }
  return 'Over two hours — no quick-win point, and the latest start moves this far back from the deadline.';
}

export interface ScoreFactor {
  key: string;
  label: string;
  value: number;
  max: number;
  /** White alpha for this factor's segment and its legend dot. */
  tone: number;
}

export interface ScoreReading {
  /** The score the app ranks and displays. Raw — no ceiling. */
  score: number;
  /** All seven added. This is what the bar's segments fill, out of `LINEAR_CEILING`. */
  linear: number;
  /** The ceiling the bar's remainder is measured against. 35. */
  ceiling: number;
  /** Every factor, in the order the settled decisions table lists them. */
  factors: ScoreFactor[];
  /** The sigmoid, 0–1. */
  W: number;
  redAlert: boolean;
  /**
   * What the danger zone did, when it did anything. `null` outside it, so the
   * calm case draws exactly the table it always drew.
   */
  compounding: { W: number; score: number } | null;
  /**
   * The conductivity floor, when it actually lifted this task — *"this scores
   * 40 because it is holding up the launch"*, which `lib/priority.ts` calls
   * the single most explainable thing the engine says.
   *
   * It has to be its own row rather than an eighth factor because it is a
   * **floor, not a term**: when it bites, the seven below add to something
   * smaller and the score is not their sum at all. A table that quietly showed
   * seven numbers adding to 18 beside a score of 40 would be lying twice over.
   */
  floor: { fromId: string; coefficient: number; score: number } | null;
}

/**
 * The whites, descending by roughly an eighth a step across seven rows.
 *
 * The source's own ramp was four rungs (0.62 / 0.44 / 0.30 / 0.19) for four
 * factors; seven need seven, and the two ends are kept exactly where the
 * source put them so the bar's darkest and lightest segments are unchanged.
 * **Whites, not a rainbow** — the source's note on its own bar: *"the hues in
 * this system are reserved for status."*
 */
const TONES = [0.62, 0.54, 0.46, 0.38, 0.31, 0.25, 0.19];

/** Below this the blend is the linear sum to within a rounding error, and the row would be noise. */
const COMPOUNDING_FLOOR = 0.01;

/**
 * Factor values are rounded for display and the bar is drawn from the rounded
 * number.
 *
 * Five of the seven are continuous — Bottleneck is `2.5 log₁₀(1 + n)`, which
 * for one blocked task is 0.7525749891599529 — and `Points` prints whatever it
 * is given. A legend column of full-precision floats is unreadable, and a
 * segment sized by the rounded value differs from one sized by the raw value
 * by less than a pixel at this width.
 */
const shown = (value: number): number => Math.round(value * 10) / 10;

/**
 * One number, and the things that made it. Pure naming — every value is read
 * straight off the breakdown.
 */
export function readScore(breakdown: ScoreBreakdown): ScoreReading {
  const v = breakdown.variables;
  const caps = TUNING.caps;

  const factors: ScoreFactor[] = [
    { key: 'humanOverride', label: 'Importance', value: v.humanOverride,      max: caps.humanOverride },
    { key: 'deadline',      label: 'Deadline',   value: v.deadlineProximity,  max: caps.deadlineProximity },
    { key: 'bottleneck',    label: 'Bottleneck', value: v.bottleneck,         max: caps.bottleneck },
    { key: 'duration',      label: 'Duration',   value: v.duration,           max: caps.duration },
    { key: 'emergency',     label: 'Emergency',  value: v.emergency,          max: caps.emergency },
    { key: 'escalator',     label: 'Overdue',    value: v.escalator,          max: caps.escalator },
    { key: 'avoided',       label: 'Avoided',    value: v.avoided,            max: caps.avoided },
  ].map((f, i) => ({ ...f, value: shown(f.value), tone: TONES[i] }));

  return {
    score: breakdown.score,
    linear: breakdown.linear,
    ceiling: LINEAR_CEILING,
    factors,
    W: breakdown.W,
    redAlert: breakdown.redAlert,
    compounding:
      breakdown.W > COMPOUNDING_FLOOR
        ? { W: breakdown.W, score: breakdown.score }
        : null,
    floor:
      breakdown.conductivity.applied && breakdown.conductivity.from
        ? {
          fromId: breakdown.conductivity.from,
          coefficient: breakdown.conductivity.coefficient,
          score: breakdown.score,
        }
        : null,
  };
}
