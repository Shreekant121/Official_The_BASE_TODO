/**
 * `/design`'s "Atlas at work" (29-1P15a, ideas 20, 47, 67): a pretend question
 * to Atlas. Press Ask: the card's edges light and travel, the working line
 * shimmers, then the answer arrives in one lump, as a cloud model sends it, and
 * is typed out a word at a time behind a violet caret while the light fades.
 * Local state only — nothing here asks Atlas anything.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, EdgeLight, Icon, SoftButton, useWordReveal } from '../ui';
import { WorkingPill } from './chat/WorkingPill';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

const ANSWER =
  'Start with the pitch deck. It is due Friday and you are sharpest before noon, so give it the first two hours and leave email for after lunch.';

type Phase = 'idle' | 'thinking' | 'writing' | 'done';

export function AtlasAtWorkSpecimen() {
  const [phase, setPhase] = useState<Phase>('idle');
  /* Each press is a new reply, so it is typed out again. */
  const [run, setRun] = useState(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ask = () => {
    timers.current.forEach(clearTimeout);
    setPhase('thinking');
    setRun((n) => n + 1);
    timers.current = [
      setTimeout(() => setPhase('writing'), 2200),
      setTimeout(() => setPhase('done'), 2600),
    ];
  };

  const working = phase === 'thinking' || phase === 'writing';

  return (
    <Card style={{ position: 'relative', maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: 'var(--sp-5)', minHeight: 150 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <span style={{ ...kicker, flex: 1 }}>What should I do first?</span>
          <SoftButton size="sm" className="ds-ask" icon={<Icon name="sparkles" size={14} />} onClick={ask} disabled={working}>
            Ask
          </SoftButton>
        </div>
        {phase === 'thinking' && <WorkingPill label="Reading your board" />}
        {(phase === 'writing' || phase === 'done') && <Reply key={run} live={phase === 'writing'} />}
        {phase === 'idle' && <span style={{ ...kicker, color: 'var(--fg-4)' }}>Press Ask.</span>}
      </div>
      <EdgeLight on={working} />
    </Card>
  );
}

function Reply({ live }: { live: boolean }) {
  const reveal = useWordReveal(ANSWER, live);
  return (
    <p style={{ margin: 0, maxWidth: '54ch', font: 'var(--type-body)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
      {reveal.shown}
      {(live || reveal.revealing) && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block', width: 2, height: '1em', marginLeft: 2,
            verticalAlign: 'text-bottom', background: 'var(--job-violet)',
          }}
        />
      )}
    </p>
  );
}
