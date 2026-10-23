/**
 * `/design`'s 29-1P10a section: the breath, the line and its question, and the
 * minute ruler — the real pieces from `FocusStart.tsx` and `ui/forms`, on a
 * pretend task with local state only. Nothing here touches the focus run.
 */
import { useState } from 'react';
import { MinuteRuler, SoftButton } from '../ui';
import { formatClock } from '../lib/timeSpan';
import { SETTLE_MS } from '../lib/focusIntent';
import { DoneQuestion, FocusBreath, FocusIntent } from './FocusStart';

const box = {
  display: 'grid', justifyItems: 'center', alignContent: 'start', gap: 'var(--sp-5)',
  padding: 'var(--sp-6)', borderRadius: 'var(--r-md)',
  backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
} as const;

export function FocusStartSpecimen() {
  const [until, setUntil] = useState<number | null>(null);
  const [intent, setIntent] = useState('uploaded the signed forms');
  const [editing, setEditing] = useState(true);
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState('');
  const [minutes, setMinutes] = useState(25);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--sp-5)' }}>
      <div style={{ ...box, minHeight: 240 }}>
        {until !== null ? (
          <FocusBreath until={until} onSkip={() => setUntil(null)} />
        ) : (
          <SoftButton
            onClick={() => {
              const at = Date.now() + SETTLE_MS;
              setUntil(at);
              window.setTimeout(() => setUntil((u) => (u === at ? null : u)), SETTLE_MS);
            }}
          >
            Start a session
          </SoftButton>
        )}
      </div>

      <div style={box}>
        <FocusIntent
          intent={intent}
          asking={editing}
          onChange={setIntent}
          onEditing={setEditing}
          onEnter={() => setEditing(false)}
        />
        {asking && intent.trim() ? (
          <DoneQuestion
            intent={intent}
            onAnswer={(a) => {
              setAsking(false);
              setSaid(a === 'notYet' ? 'Still open — the clock carries on.' : `Done, kept as “${a === 'yes' ? 'Yes' : 'Partly'}”.`);
            }}
          />
        ) : (
          <SoftButton onClick={() => { setEditing(false); setSaid(''); setAsking(true); }}>Mark done</SoftButton>
        )}
        {said && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{said}</span>}
      </div>

      <div style={box}>
        <MinuteRuler
          label="Session length"
          value={minutes}
          min={5}
          max={120}
          hint={`ends at ${formatClock(10 * 60 + 15 + minutes)}`}
          onChange={setMinutes}
        />
      </div>
    </div>
  );
}
