/**
 * `/design`'s 29-1P10b section: a clock in flow with Wrap up, the halfway
 * note and the away card — the real pieces from `FocusMoments.tsx` and
 * `Countdown`, on a pretend task with local state only. Nothing here touches
 * the focus run.
 */
import { useState } from 'react';
import { Countdown, SoftButton } from '../ui';
import { AwayCard, HalfwayNote, WrapUp } from './FocusMoments';

const box = {
  display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 'var(--sp-5)',
  padding: 'var(--sp-6)', borderRadius: 'var(--r-md)',
  backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
} as const;

export function FocusMomentsSpecimen() {
  const [said, setSaid] = useState('');
  const [flow, setFlow] = useState(true);
  const [halfway, setHalfway] = useState(true);
  const [away, setAway] = useState(true);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-5)' }}>
        <div style={box}>
          <Countdown
            seconds={flow ? -192 : 192}
            format="clock"
            size="lg"
            running
            over="flow"
            note={flow ? <WrapUp onClick={() => setSaid('Wrap up opens Mark done.')} /> : undefined}
          />
          <SoftButton size="sm" onClick={() => setFlow(!flow)}>{flow ? 'Before zero' : 'Past zero'}</SoftButton>
        </div>

        <div style={{ ...box, alignContent: 'center' }}>
          {halfway ? (
            <HalfwayNote
              title="Pitch deck"
              drain={0.6}
              onYes={() => { setHalfway(false); setSaid('Yes: the note goes, the clock carries on.'); }}
              onSwitch={() => { setHalfway(false); setSaid('Switch pauses the clock and opens today’s queue.'); }}
            />
          ) : (
            <SoftButton size="sm" onClick={() => setHalfway(true)}>Pass halfway again</SoftButton>
          )}
        </div>

        <div style={{ ...box, alignContent: 'center' }}>
          {away ? (
            <AwayCard
              awayMs={4 * 60_000}
              onAnswer={(count) => {
                setAway(false);
                setSaid(count ? 'Counted: the 4 minutes stay in your hours.' : 'Not counted: off your hours, and back on the clock.');
              }}
            />
          ) : (
            <SoftButton size="sm" onClick={() => setAway(true)}>Come back again</SoftButton>
          )}
        </div>
      </div>
      {said && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textAlign: 'center' }}>{said}</span>}
    </div>
  );
}
