/**
 * Where a priority score came from — one bar in its segments, and the legend
 * that names them (UI-30).
 *
 * **This replaces `ScoreBreakdownChips`, which is deleted.** That row said the
 * same things as a line of `Importance +6` pills; the design system's
 * answer is a bar plus a table, and it says three things the chips could not:
 * how much of the ceiling is spent, how big each contribution is *relative to
 * the others*, and — because a zero row is still drawn, greyed — which factors
 * are still sitting at nothing. The source carries it in both files that show
 * a breakdown (`screens/scoring.html:485` and `TaskSheet.jsx:717`), character
 * for character, so it is one component and both screens read it.
 *
 * **Whites, not a rainbow.** The source's own note on the bar: *"the hues in
 * this system are reserved for status."*
 *
 * ITEM 16 — FOUR SEGMENTS BECAME SEVEN, AND THE PENALTY BECAME TWO NOTES
 * ---------------------------------------------------------------------
 * The bar is a picture of the seven capped variables against the sum of their
 * caps, and nothing here computes any of them — `readScore` names what the
 * engine already returned.
 *
 * The hatched **penalty** row is gone with the penalty: no variable in the new
 * engine subtracts. Two rows took its place, and both exist because the score
 * printed above this bar is no longer the sum of the bar:
 *
 *   - **Danger zone.** Inside it, four of the seven multiply instead of
 *     adding, so a bar filling a fifth of its track can sit under a score of
 *     42. The row says so, and says how far in.
 *   - **Blocking.** The conductivity floor is not a term at all: when it bites
 *     it *replaces* the blend with what the worst thing waiting on this task
 *     is worth, times how cheap this one is. Seven numbers adding to 18 beside
 *     a score of 40 with nothing to explain it would be the screen lying twice
 *     over.
 *
 * The `flex-grow` transition is the source's and it is the point: pressing a
 * quadrant grows that segment out of the remainder rather than repainting the
 * bar, so you can see which part of the number you just moved.
 */
import { Points } from './Labelled';
import { formatScore } from '../../store/useStore';
import type { ScoreReading } from './scoreReadings';

/**
 * A legend row: dot, label, value, and the `/cap` column.
 *
 * `points` is a **contribution** and takes `Points`' signed treatment; `total`
 * is a resulting score and does not. The two bottom rows are totals, and a
 * "+42.3" beside "Blocking …" would read as forty-two points being added to
 * something rather than as what the task now scores.
 */
function Row({
  tone, label, points, total, right, faint, hatched,
}: {
  tone: string;
  label: string;
  points?: number;
  total?: number;
  right?: string;
  faint?: boolean;
  hatched?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
      <span
        aria-hidden="true"
        style={{
          width: 8, height: 8, borderRadius: 2, flex: '0 0 auto',
          background: hatched
            ? `repeating-linear-gradient(45deg, ${tone} 0 2px, transparent 2px 4px)`
            : tone,
        }}
      />
      <span
        style={{
          flex: 1, minWidth: 0, font: 'var(--type-caption)',
          color: faint ? 'var(--fg-4)' : 'var(--fg-2)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {points !== undefined
        ? <Points value={points} tone={faint ? 'var(--fg-4)' : 'var(--fg-1)'} />
        : (
          <span
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
              fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)', whiteSpace: 'nowrap',
            }}
          >
            {formatScore(total ?? 0)}
          </span>
        )}
      <span
        style={{
          font: 'var(--type-kicker)', color: 'var(--fg-4)',
          width: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {right ?? ''}
      </span>
    </div>
  );
}

export interface ScoreFactorBarProps {
  reading: ScoreReading;
  /**
   * The title of the task the conductivity floor came from. Optional because
   * only the screens that have the backlog to hand can resolve an id to a
   * title; without it the row still says the floor applied and by how much.
   */
  floorTitle?: string;
  /**
   * Lay the seven factor rows out in columns rather than one stack. The Score
   * screen's instrument is a short, wide strip since V3-5 (his call,
   * 2026-09-24: "make it horizontal as it should take less space"); the task
   * sheet's is a narrow column and keeps the stack. The two rows under the rule
   * and the closing sentence stay full width either way — they explain the
   * whole number, not one factor.
   */
  spread?: boolean;
}

export function ScoreFactorBar({ reading, floorTitle, spread = false }: ScoreFactorBarProps) {
  const remainder = Math.max(0, reading.ceiling - reading.linear);
  /*
   * The sentence under the bar exists to explain a score that is NOT the sum
   * of the bar. When the two round to the same number it explains nothing and
   * says one figure twice — which reads as a mistake rather than as a
   * reassurance. Compared as they are printed, not as they are held: a task
   * sitting at 10.47 against 10.52 has no gap a reader can see.
   */
  const differs = formatScore(reading.linear) !== formatScore(reading.score);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
      {/* One bar, one segment per factor that has earned anything. A well,
          not a pane: a progress track is something a value sits INSIDE. */}
      <div
        style={{
          display: 'flex', gap: 2, height: 10, padding: 2, borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          overflow: 'hidden',
        }}
      >
        {reading.factors.filter((f) => f.value > 0).map((f) => (
          <span
            key={f.key}
            style={{
              flex: `${f.value} 0 0`, minWidth: 3, borderRadius: 'var(--r-pill)',
              background: `oklch(1 0 0 / ${f.tone})`,
              transition: 'flex-grow var(--dur-slow) var(--ease-glass)',
            }}
          />
        ))}
        <span style={{ flex: `${remainder} 0 0` }} />
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <div
          style={{
            display: 'grid',
            gap: spread ? 'var(--sp-3) var(--sp-8)' : 'var(--sp-3)',
            /* Never more than four across: seven factors break 4 + 3, where
               five columns left a lonely pair on the second row. */
            gridTemplateColumns: spread ? 'repeat(auto-fill, minmax(max(180px, 22%), 1fr))' : undefined,
          }}
        >
          {reading.factors.map((f) => (
            <Row
              key={f.key}
              tone={`oklch(1 0 0 / ${f.tone})`}
              label={f.label}
              points={f.value}
              right={`/${f.max}`}
              faint={f.value === 0}
            />
          ))}
        </div>

        {/* The two things that make the score differ from the sum above. Both
            sit under a rule, because neither is a term in it. */}
        {(reading.compounding || reading.floor) && (
          <div
            style={{
              display: 'grid', gap: 'var(--sp-3)',
              paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--line-faint)',
            }}
          >
            {reading.compounding && (
              <Row
                tone="var(--hue-amber)"
                hatched
                label={reading.redAlert ? 'Danger zone — compounding' : 'Approaching the danger zone'}
                total={reading.compounding.score}
                right={`${Math.round(reading.compounding.W * 100)}%`}
              />
            )}
            {reading.floor && (
              <Row
                tone="var(--hue-rose)"
                label={floorTitle ? `Blocking "${floorTitle}"` : 'Blocking something worth more'}
                total={reading.floor.score}
                right={`×${reading.floor.coefficient.toFixed(1)}`}
              />
            )}
          </div>
        )}
      </div>

      {/* The number the bar cannot show, said once. Everything above adds to
          `linear`; this is what the app actually ranks on. */}
      {differs && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {formatScore(reading.linear)} of {reading.ceiling} added
          {' → '}
          <span style={{ color: 'var(--fg-2)' }}>{formatScore(reading.score)}</span> after
          {reading.floor ? ' the blocking floor' : ' the danger zone'}.
        </span>
      )}
    </div>
  );
}
