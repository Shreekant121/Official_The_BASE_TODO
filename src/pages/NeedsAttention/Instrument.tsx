/**
 * Score — the instrument: one number, and the things that made it (UI-30).
 *
 * This is what UI-24 owed. `ScoreDial` was reconciled down to a chip that
 * session, on `ScoreDial.prompt.md`'s instruction — *"a small rectangle, not a
 * pill and not a ring … never glow it, never ring it"* — which left this
 * screen with no large reading of the number it exists to produce. The design
 * system's answer to that was never a bigger chip: it is this screen-level
 * block, `screens/scoring.html:459`, and the entry for it said so.
 *
 * **The pane changes material on Red Alert, and nothing else does.** Inside
 * the danger zone the whole card lifts to `--glass-tint-coral` and the numeral
 * goes coral (amber until 29-1P2c2: Red Alert is coral's job), on `--dur-slow` so it reads as the card warming rather
 * than as a repaint.
 *
 * It used to cut at a score of 10 — the same 10 `ScoreDial` and `scoreTone`
 * cut at. Item 16 deleted that number: the score now runs past 600 inside a
 * danger zone and sits under 10 outside one, so ten stopped being a place.
 * `ScoreBreakdown.redAlert` is what turns the chip in the commit bar and this
 * pane together now, and `TUNING.redAlertW` is the one place it is written
 * down.
 *
 * **The `/max` is the highest score on screen, not a ceiling.** There is no
 * ceiling; `usePriorityScores().peak` is what a raw number is read against.
 *
 * **This is the one surface that gets no `RedAlertBadge`, and that is the rule
 * rather than an omission.** The badge exists for places whose only reading of
 * the score is a 22px chip, where a number going amber says *something*
 * changed without saying which thing. Here the pane changes material, the
 * numeral changes colour and the factor bar carries a *Danger zone* row: a
 * fourth saying of one fact is noise, and a rose pill on amber glass is the
 * only place in the app two status hues would sit inside one another. The
 * commit bar two inches below has the badge, because its reading *is* a chip.
 *
 * The numeral is `--weight-light` at `--text-4xl`, which is the treatment
 * `readme.md` argues for by name on the focus countdown: *"light weight at
 * that size is deliberate — a bold countdown feels like a threat."* A priority
 * score is the same kind of reading.
 *
 * V3-5 — A SHORT, WIDE STRIP UNDER THE TITLE, AND STILL A NUMBER
 * --------------------------------------------------------------
 * It stood top-right beside the title as a 288px column ~345px tall, which
 * left a hole under a short title and pushed the fields down. **His call,
 * 2026-09-24: keep the layout, but make this horizontal "as it should take
 * less space"**, full width under the title. So the number and its `/ peak`
 * sit on the left, the bar and the seven factors (in columns — `spread`) on
 * the right, and the block wraps to number-over-factors when the two will not
 * sit side by side.
 * **The score stays this numeral, never a ring** — his standing instruction for
 * this screen. `Scoring.dc.html` puts a half-circle gauge behind its number;
 * he was asked the same day and said leave it out.
 */
import type { CSSProperties } from 'react';
import { Icon } from '../../ui';
import { formatScore } from '../../store/useStore';
import { ScoreFactorBar } from '../../components/task-fields/ScoreFactorBar';
import type { ScoreReading } from '../../components/task-fields/scoreReadings';

/** The ink for coral glass — the hue lifted to label lightness. */
const ALERT_INK = 'var(--job-coral-text)';

export default function Instrument({ reading, peak, floorTitle }: {
  reading: ScoreReading;
  peak: number;
  floorTitle?: string;
}) {
  const urgent = reading.redAlert;

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start',
        gap: 'var(--sp-6) var(--sp-9)',
        /* So the factors' 360px basis can never become this card's minimum
           width and push a phone-sized page sideways; it wraps instead. */
        minWidth: 0,
        padding: 'var(--pad-card)', borderRadius: 'var(--r-card)',
        backgroundImage: urgent ? 'var(--glass-tint-coral)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-shadow-pane)',
        transition: 'background-image var(--dur-slow) var(--ease-glass)',
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: '0 0 auto' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
            whiteSpace: 'nowrap',
            color: urgent ? ALERT_INK : 'var(--fg-3)',
          }}
        >
          <Icon name="target" size={13} />
          Priority score
        </span>
        <span style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-4)' }}>
          <span
            style={{
              font: 'var(--font-mono)', fontWeight: 'var(--weight-light)',
              fontSize: 'var(--text-4xl)', lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-display)', fontVariantNumeric: 'tabular-nums',
              color: urgent ? 'var(--job-coral-tag-fg)' : 'var(--fg-1)',
              transition: 'color var(--dur-slow) var(--ease-glass)',
            }}
          >
            {formatScore(reading.score)}
          </span>
          <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)', paddingBottom: 6, whiteSpace: 'nowrap' }}>
            / {formatScore(peak)}
          </span>
        </span>
      </div>

      {/* 360px before it wraps under the number: two factor columns at the
          legend's 180px minimum, which is the narrowest that still reads as a
          strip rather than a list. */}
      <div style={{ flex: '1 1 360px', minWidth: 0, paddingTop: 'var(--sp-2)' }}>
        <ScoreFactorBar reading={reading} floorTitle={floorTitle} spread />
      </div>
    </div>
  );
}
