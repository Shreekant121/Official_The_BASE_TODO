/**
 * `/design`'s "Wins" (29-1P14a): a new best, a perfect day and the confetti,
 * on pretend numbers with local state only. Nothing here reads or writes his
 * data; the confetti is the real burst, from the button pressed.
 */
import { useState, type CSSProperties } from 'react';
import { Card, NewBestBadge, PerfectDayStamp, SoftButton } from '../ui';
import { formatMinutes } from '../lib/dashboard/blockData';
import { bestWords, type Best } from '../lib/stats';
import { burstConfetti } from '../lib/confetti';

const RECORD = 255 * 60;
const START = 245 * 60;
const HOURS = 6 * 3600;
const span = (seconds: number) => formatMinutes(seconds / 60);

const box: CSSProperties = {
  position: 'relative', display: 'grid', gap: 'var(--sp-3)', alignContent: 'start',
  padding: 'var(--sp-6)', borderRadius: 'var(--r-md)',
  backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
};

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

export function WinsSpecimen() {
  const [focused, setFocused] = useState(START);
  const [worked, setWorked] = useState(HOURS - 20 * 60);

  const best: Best = { kind: 'focus', today: focused, record: RECORD, recordDay: '2026-09-16', isNew: focused > RECORD };
  const words = bestWords(best, span);
  const perfect = worked >= HOURS;

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        <div style={box} data-wins-best="">
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)', minHeight: 22 }}>
            <span style={kicker}>Focused today</span>
            {best.isNew && <NewBestBadge beat={words.beat} />}
          </span>
          <span
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-3xl)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              color: best.isNew ? 'var(--job-gold)' : 'var(--fg-1)', transition: 'color 500ms var(--ease-glass)',
            }}
          >
            {span(focused)}
          </span>
          <span style={{ ...kicker, color: best.isNew ? 'var(--job-gold)' : 'var(--fg-3)' }}>
            {best.isNew ? words.beat : `Best: ${span(RECORD)} on 16 Sep`}
          </span>
          <span style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <SoftButton onClick={() => setFocused((s) => s + 10 * 60)}>+10 min</SoftButton>
            <SoftButton onClick={() => setFocused(START)}>Reset</SoftButton>
          </span>
        </div>

        <div
          style={{
            ...box,
            boxShadow: perfect
              ? 'var(--glass-rim-1), inset 0 0 0 1.5px var(--job-gold), inset 0 0 34px -10px oklch(0.8 0.16 82 / 0.55)'
              : 'var(--glass-rim-1)',
          }}
          data-wins-perfect={perfect || undefined}
        >
          <span style={kicker}>Hours today</span>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <span
              style={{
                font: 'var(--type-numeric)', fontSize: 'var(--text-3xl)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                color: perfect ? 'var(--job-gold)' : 'var(--fg-1)',
              }}
            >
              {span(worked)}
            </span>
            <span style={kicker}>of {span(HOURS)}</span>
          </span>
          <span style={{ minHeight: 28, display: 'flex', alignItems: 'center' }}>
            {perfect ? <PerfectDayStamp /> : <span style={kicker}>{span(HOURS - worked)} left</span>}
          </span>
          <span style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <SoftButton
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                if (!perfect && worked + 10 * 60 >= HOURS) burstConfetti({ x: r.left + r.width / 2, y: r.top });
                setWorked((s) => s + 10 * 60);
              }}
            >
              +10 min
            </SoftButton>
            <SoftButton onClick={() => setWorked(HOURS - 20 * 60)}>Reset</SoftButton>
          </span>
        </div>

        <div style={{ ...box, alignContent: 'center', justifyItems: 'center', textAlign: 'center' }}>
          <span style={kicker}>A finished project, a finished milestone, a perfect day</span>
          <SoftButton
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              burstConfetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            Confetti
          </SoftButton>
        </div>
      </div>
    </Card>
  );
}
