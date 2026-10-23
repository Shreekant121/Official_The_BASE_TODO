/**
 * `/design`'s 29-1P10c section: the StandBy clock by day and by night, the
 * real `StandByFace` in two tablet-shaped boxes, on a pretend task. Nothing
 * here touches the focus run.
 */
import { useState } from 'react';
import { SoftButton } from '../ui';
import { StandByFace } from './FocusStandBy';

function Tablet({ label, night, seconds }: { label: string; night: boolean; seconds: number }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <span className="ag-kicker">{label}</span>
      <div
        style={{
          aspectRatio: '16 / 10', borderRadius: 'var(--r-md)', overflow: 'hidden',
          boxShadow: 'var(--glass-rim-1)',
        }}
      >
        <StandByFace seconds={seconds} title="Pitch deck" running night={night} />
      </div>
    </div>
  );
}

export function FocusStandBySpecimen() {
  const [flow, setFlow] = useState(false);
  const seconds = flow ? -192 : 1112;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'center' }}>
      <div className="grid" style={{ width: '100%', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-5)' }}>
        <Tablet label="Day" night={false} seconds={seconds} />
        <Tablet label="Night, 9pm to 5am" night seconds={seconds} />
      </div>
      <SoftButton size="sm" onClick={() => setFlow(!flow)}>{flow ? 'Before zero' : 'Past zero'}</SoftButton>
    </div>
  );
}
