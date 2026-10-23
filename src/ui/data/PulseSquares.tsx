/**
 * The pulse: two weeks of work as a row of squares (29-1P8b, idea 151).
 *
 * His pick, 2026-10-13, over bars and a line (`docs/design/card-pulse-and-
 * health.html`, option B): one square a day, oldest on the left and today on
 * the right, brighter lime the more was done that day — GitHub's
 * contribution graph, and the same picture as the year of squares coming in
 * 29-3, so it is learnt once. Lime because done is lime's job. A day with
 * nothing done is a pressed-in grey square, so a project that stalled reads
 * as a grey run at a glance.
 *
 * Pointing at a square says its day in the caption ("Tue 7 Oct · 3 done").
 * Only this component re-renders for it, never the card around it.
 *
 * It draws what it is handed: `lib/stats.ts`'s `doneByDay` is the counter.
 * Nothing moves at rest.
 */
import { useState, type CSSProperties } from 'react';

export interface PulseSquaresProps {
  /** Oldest first, today last; `day` is `YYYY-MM-DD`. */
  days: readonly { day: string; count: number }[];
  /** The caption's left half while nothing is pointed at. */
  label?: string;
  /**
   * A square's side in px. Absent, the row fills its width, as under a
   * card's progress bar, where it lines up with the bar's two ends.
   */
  size?: number;
  style?: CSSProperties;
}

/** A day this busy or busier is full lime; under it, fainter in proportion. */
const FULL_AT = 3;

const dayFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
/** "Tue 7 Oct" from a `YYYY-MM-DD` key: read at UTC midnight, so no zone can move it a day. */
const dayName = (key: string) => dayFormat.format(new Date(`${key}T00:00:00Z`)).replace(',', '');

export function PulseSquares({ days, label = 'Last 2 weeks', size, style }: PulseSquaresProps) {
  const [pointed, setPointed] = useState<number | null>(null);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const full = Math.max(FULL_AT, ...days.map((d) => d.count));
  const at = pointed === null ? null : days[pointed];

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)', ...style }}>
      <div
        aria-hidden="true"
        style={{
          display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-4)',
          font: 'var(--type-caption)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)',
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        <span>{at ? `${dayName(at.day)} · ${at.count} done` : label}</span>
        <span style={{ color: 'var(--fg-2)' }}>{total} done</span>
      </div>
      <div
        role="img"
        aria-label={`${total} task${total === 1 ? '' : 's'} done in the last ${days.length} days`}
        onPointerLeave={() => setPointed(null)}
        style={{ display: 'flex', gap: size ? 3 : 4 }}
      >
        {days.map((d, i) => (
          <span
            key={d.day}
            onPointerEnter={() => setPointed(i)}
            style={{
              ...(size ? { width: size, height: size, flex: '0 0 auto' } : { flex: '1 1 0', aspectRatio: '1', maxHeight: 20 }),
              borderRadius: size && size < 14 ? 3 : 4,
              ...(d.count > 0
                ? { backgroundColor: 'var(--job-lime)', opacity: 0.3 + (0.7 * d.count) / full }
                : { backgroundColor: 'oklch(1 0 0 / 0.07)', boxShadow: 'inset 0 1px 2px oklch(0 0 0 / 0.5)' }),
            }}
          />
        ))}
      </div>
    </div>
  );
}
