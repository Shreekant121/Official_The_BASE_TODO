/**
 * The four Sample blocks (29-1c4): what steps 29-2, 29-3 and 29-5 will put
 * on the Dashboard, shown now on pretend data. His call (2026-09-30): a block
 * from a later stage may appear early **only wearing a "Sample" tag, never
 * data that looks real** — so every one says Sample in its title, reads
 * nothing from the store, and names things nobody's account holds.
 *
 * Which four is his call of 2026-10-21: a countdown (29-2), a streak and
 * today's routine (29-3), Atlas's morning note (29-5). The countdown is the
 * real widget since 29-2a (`CountdownBlock.tsx`), so three are left. The bad-habit breaker
 * (29-4) has none: it is private, and Atlas never sees it.
 *
 * Each step that builds the real block replaces its sample here, keeping the
 * kind's place on every Dashboard that holds one. The charts are drawn as
 * BIG-6 wrote them — the streak's days as one row of dots, the routine in
 * time order — and are still: nothing here moves (Performance rule 1).
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../ui';
import type { BlockProps } from './blocks';
import { useBlockLook, useBlockMood } from './blockContext';
import { BigNumber, BlockTitle } from './parts';

/** The tag on every sample: quiet grey, so it never reads as one of the colour jobs. */
function SampleTag() {
  return (
    <span
      className="dash-sample-tag"
      style={{
        display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 var(--sp-3)',
        borderRadius: 'var(--r-2xs)', backgroundColor: 'oklch(1 0 0 / 0.08)',
        color: 'var(--fg-2)', font: 'var(--type-caption)', fontWeight: 'var(--weight-medium)', whiteSpace: 'nowrap',
      }}
    >
      Sample
    </span>
  );
}

/* No giant glyph (idea 86) behind a sample: it covered the tag, and the tag is the one thing a sample must show. */
function SampleFrame({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  useBlockMood('neutral');
  return (
    <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%' }}>
      <div>
        <BlockTitle icon={icon} trail={<SampleTag />}>{title}</BlockTitle>
      </div>
      {children}
    </div>
  );
}

const Line = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      font: 'var(--type-body)', color: 'var(--fg-2)',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

// ─── 29-3: a streak ─────────────────────────────────────────────────────────

/** The last 30 days, oldest first: two misses long ago, one rest day, then twelve in a row. */
const STREAK_DAYS: readonly ('done' | 'missed' | 'rest')[] = [
  'done', 'done', 'missed', 'done', 'done', 'done', 'done', 'done', 'done', 'done',
  'missed', 'done', 'done', 'done', 'done', 'done', 'done', 'rest', 'done', 'done',
  'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done',
];

export function SampleStreakBlock({ w, h }: BlockProps) {
  const { colour } = useBlockLook();
  const lit = `var(--job-${colour})`;
  return (
    <SampleFrame icon="flame" title="Streak">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <BigNumber value="12" unit="days in a row" size={h >= 2 ? 'lg' : 'md'} />
        {w >= 3 && <Line>Gym · best 21</Line>}
      </div>
      <div
        aria-label="The last 30 days"
        role="img"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(30, minmax(0, 1fr))', gap: 3 }}
      >
        {STREAK_DAYS.map((d, i) => (
          <span
            key={i}
            style={{
              aspectRatio: '1', borderRadius: '50%', maxWidth: 12,
              backgroundColor: d === 'done' ? lit : d === 'rest' ? 'var(--job-indigo)' : 'oklch(1 0 0 / 0.10)',
            }}
          />
        ))}
      </div>
    </SampleFrame>
  );
}

// ─── 29-3: today's routine ──────────────────────────────────────────────────

const ROUTINE: readonly { at: string; name: string; state: 'done' | 'missed' | 'next' }[] = [
  { at: '07:00', name: 'Water and stretch', state: 'done' },
  { at: '07:30', name: 'Vitamins', state: 'done' },
  { at: '08:00', name: 'Gym', state: 'done' },
  { at: '13:00', name: 'Walk after lunch', state: 'missed' },
  { at: '18:30', name: 'Read 20 pages', state: 'next' },
  { at: '22:00', name: 'Lights out', state: 'next' },
];

export function SampleRoutineBlock({ w, h }: BlockProps) {
  const rows = ROUTINE.slice(0, h >= 3 ? 6 : 4);
  return (
    <SampleFrame icon="repeat" title="Today's routine">
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <BigNumber value="3" unit="of 6 done" size="md" />
        <ul style={{ display: 'grid', gap: 'var(--sp-2)', listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map((r) => (
            <li key={r.at} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
              <Icon
                name={r.state === 'done' ? 'circle-check' : r.state === 'missed' ? 'x-circle' : 'circle'}
                size={16}
                style={{ flex: '0 0 auto', color: r.state === 'done' ? 'var(--job-lime)' : r.state === 'missed' ? 'var(--job-coral)' : 'var(--fg-3)' }}
              />
              {w >= 2 && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>{r.at}</span>}
              <span
                style={{
                  font: 'var(--type-body)', fontSize: 'var(--text-sm)', minWidth: 0,
                  color: r.state === 'next' ? 'var(--fg-1)' : 'var(--fg-3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {r.name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SampleFrame>
  );
}

// ─── 29-5: Atlas's morning note ─────────────────────────────────────────────

export function SampleMorningBlock({ w, h }: BlockProps) {
  return (
    <SampleFrame icon="sparkles" title="Morning note">
      <p
        style={{
          margin: 0, font: 'var(--type-body)', color: 'var(--fg-1)', textWrap: 'pretty',
          display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: h >= 2 ? 6 : w >= 3 ? 2 : 3, overflow: 'hidden',
        }}
      >
        Good morning. Three things today: the report before 5, the gym at 7, and the call you have put off twice.
        You have six hours; the report needs two of them.
      </p>
    </SampleFrame>
  );
}
