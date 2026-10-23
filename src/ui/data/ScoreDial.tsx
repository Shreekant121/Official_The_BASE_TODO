/**
 * Aurora Glass — ScoreDial
 *
 * RECONCILED against the real `ScoreDial.jsx` at UI-24.
 * ---------------------------------------------------------------------
 * Derived at UI-9 from `ProgressRing` and the tokens, because the design
 * project was unreachable for eight sessions. UI-21 landed the handoff
 * bundle; UI-24 diffed this file against
 * `design-system/components/data/ScoreDial.*` and found the derivation had
 * built **the wrong object**.
 *
 * **IT IS A CHIP, NOT A DIAL.** The derived version was a 120px SVG gauge:
 * a 270° arc with the gap at the bottom, band ticks cut into the track, an
 * emitting stroke and the numeral in the middle. The real component is a
 * 22–40px rectangle with a number in it. `ScoreDial.prompt.md` does not
 * leave this open:
 *
 *   *"A small **rectangle**, not a pill and not a ring: pills are controls
 *   in this system and rings read as progress. This is a value sitting in
 *   a slot, and the slot carries the colour so the numeral stays legible
 *   at 11px."* … *"Never glow it, never ring it. Glow means live; a score
 *   is a measurement."*
 *
 * and the bundle is unanimous behind it — **eleven call sites across six
 * screens and `TaskSheet`, every one of them `size="sm"` or `size="lg"`,
 * not one passing a pixel diameter.** The derivation's argument (a ring
 * shows a fraction of a whole, a dial shows a reading on a scale) was a
 * sound rebuttal to `ProgressRing` and a wrong answer to what this
 * component is: the design system's reply to "the score is the subject of
 * this screen" is `size="lg" showMax` plus the scoring screen's own
 * factor-bar `Instrument` — a SCREEN-level block, owed to UI-30 — not a
 * bigger version of the chip.
 *
 * IMPROVEMENTS.md's UI-24 entry asked for the 270° sweep and the ticks to
 * be kept. That note predates anyone opening `ScoreDial.prompt.md`;
 * Shreekant was shown the conflict and chose the source. The queue entry
 * is amended to match.
 *
 * **TWO STATES, NOT FOUR.** The chip is a carved well with a white numeral
 * until the score reaches `threshold` (10), and an amber pane with an
 * amber numeral at or above it (coral in this app since 29-1P2c2). `prompt.md`: *"Two states, no score-band
 * rainbow."* The app's four-band model (rose / amber / violet / neutral)
 * still exists and is still right for the places that tint a second,
 * smaller reading of the same number — it just is not this component's
 * job. It moved to `components/task-fields/scoreDisplay.ts` as
 * `SCORE_TONE_VAR`, beside `scoreTone`, which is the only thing that reads
 * it. That is also where `DIAL_TONE_VAR` went; nothing here exports a hue
 * table any more, because the chip has one colour and a threshold.
 *
 * WHAT WENT WITH THE DIAL
 * -----------------------
 * `size` is `sm | md | lg`, not a pixel diameter. `thickness`, `ticks`,
 * `tone` and `format` are gone — `format` because the app's `formatScore`
 * is `toFixed(1)`, which is what the source hardcodes, so the prop was
 * buying a callback to do nothing. `SCORE_BANDS` survived UI-24 and did not
 * survive item 16 — `scoreTone` cuts on `W` now, not on a raw score.
 *
 * KEPT, deliberately, over the real file: nothing. The prototype has no
 * portal, focus trap or controlled state to protect here — it is a span
 * with a number in it, and the production version is the same span.
 *
 * ITEM 16 — STILL TWO STATES, BUT SOMETHING ELSE DECIDES WHICH
 * ---------------------------------------------------------
 * `threshold` is gone and `alert` replaces it. The chip's two states are
 * exactly the states `prompt.md` specifies and the amber is the same amber;
 * what changed is that the cut is no longer a number this component holds.
 *
 * The old rule was `value >= 10` — a fixed cut on a raw score, which the
 * settled decisions delete along with `MAX_PRIORITY_SCORE`: the score now runs
 * past 600 inside a task's danger zone and sits under 10 outside it, so ten is
 * no longer a place. The chip warms on `W`, the sigmoid the whole engine is
 * built on, which is also what fires the Red Alert badge — *"it makes Red
 * Alert and the colour the same fact"*. A caller passes
 * `alert={breakdown.redAlert}` and nothing here has an opinion about scoring.
 *
 * `max` changed meaning for the same reason and kept its name: it is the
 * highest score currently on screen (`usePriorityScores().peak`), not a
 * ceiling, because there is no longer a ceiling to draw against. It is only
 * ever seen under `showMax`.
 *
 * 29-1P7a — IT WARMS (idea 33), AND RED ALERT IS STILL THE ONLY CORAL
 * -------------------------------------------------------------------
 * `prompt.md`'s "no score-band rainbow" is overruled by his own pick: a score
 * warms as it rises, the numeral going from white through gold to orange,
 * with a hairline of the same colour inside the slot. **His call, 2026-10-13:
 * grey → gold → orange → coral, no teal** (teal is Focus). The first three are
 * `lib/warmth.ts`'s `scoreWarmth`, read against `max` — the highest open score
 * in the app — so only work near the top glows and an ordinary board stays
 * quiet. Coral is not on that ramp: it is still `alert`, the engine's Red
 * Alert, so it stays as rare as the verdict it stands for. It is still a
 * number and never a ring; the slot never glows (a glow means live).
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { scoreWarmth, scoreWarmthColour } from '../../lib/warmth';

/** [height, numeral size, horizontal padding] — the real file's table. */
const DIMS = {
  sm: [22, 'var(--text-2xs)', 'var(--sp-3)'],
  md: [28, 'var(--text-sm)', 'var(--sp-4)'],
  lg: [40, 'var(--text-xl)', 'var(--sp-5)'],
} as const;

export type ScoreDialSize = keyof typeof DIMS;

export interface ScoreDialProps extends HTMLAttributes<HTMLSpanElement> {
  /** The composite priority score, e.g. 7.5. Rendered to one decimal, always mono. */
  value?: number;
  /**
   * What the number is read against under `showMax`. Since item 16 this is
   * the highest score on screen rather than a ceiling — the model has none.
   */
  max?: number;
  /** sm — inside a task row. md — beside a title in a header. lg — where the score is the subject. */
  size?: ScoreDialSize;
  /**
   * Red Alert. The chip and its numeral go coral; otherwise they stay
   * neutral. Pass `ScoreBreakdown.redAlert` — this component does not decide
   * it, and there is no number here to decide it from.
   */
  alert?: boolean;
  /** Show "/{max}" beside the numeral. Only on `lg`, where there is room to read it. */
  showMax?: boolean;
  /** Uppercase mono suffix inside the chip. Omit inside dense rows. */
  label?: ReactNode;
  /**
   * Warm the numeral by how high the score sits against `max` (idea 33).
   * Off for a finished task's chip: done work is over and does not press.
   */
  warm?: boolean;
}

export function ScoreDial({
  value = 0,
  max = 0,
  size = 'sm',
  alert = false,
  showMax = false,
  label,
  warm = true,
  className = '',
  style,
  ...rest
}: ScoreDialProps) {
  const [h, fontSize, pad] = DIMS[size] ?? DIMS.sm;
  const warmInk = !alert && warm ? scoreWarmthColour(scoreWarmth(value, max)) : null;

  return (
    <span
      className={className}
      title={max > 0 ? `${value.toFixed(1)}, highest on screen ${max.toFixed(1)}` : value.toFixed(1)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        flex: '0 0 auto',
        height: h,
        padding: `0 ${pad}`,
        /* Not `--r-pill`: at pill radius it reads as a tappable control. */
        borderRadius: 'var(--r-xs)',
        /* Red Alert is coral's job since 29-1P2c2 (it was amber). */
        backgroundImage: alert ? 'var(--glass-tint-coral)' : 'var(--glass-well)',
        boxShadow: alert ? 'var(--glass-rim-1)'
          : warmInk ? `var(--glass-well-shadow), inset 0 0 0 1px color-mix(in oklab, ${warmInk} 34%, transparent)`
            : 'var(--glass-well-shadow)',
        font: 'var(--type-numeric)',
        fontSize,
        fontVariantNumeric: 'tabular-nums',
        color: alert ? 'var(--job-coral-tag-fg)' : warmInk ?? 'var(--fg-1)',
        whiteSpace: 'nowrap',
        transition: 'background var(--dur-base) var(--ease-glass), color var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      {value.toFixed(1)}
      {showMax && (
        <span
          style={{
            font: 'var(--type-kicker)',
            color: alert ? 'var(--job-coral-tag-fg)' : 'var(--fg-4)',
            opacity: alert ? 0.72 : 1,
          }}
        >
          /{max.toFixed(1)}
        </span>
      )}
      {label && (
        <span
          style={{
            font: 'var(--type-kicker)',
            /* Kicker case: uppercase outside V3, as written inside it (V3-4). */
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
            letterSpacing: 'var(--tracking-kicker)',
            color: 'var(--fg-3)',
            marginLeft: 2,
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
