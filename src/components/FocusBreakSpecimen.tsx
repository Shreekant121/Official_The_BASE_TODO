/**
 * `/design`'s 29-1P11a section: the break offer, the break itself and
 * "Session done" — the real pieces from `FocusBreak.tsx` and
 * `FocusSessionDone.tsx`, on pretend numbers with local state only. Nothing
 * here touches the focus run or starts a break.
 */
import { useState } from 'react';
import { SoftButton } from '../ui';
import { BreakCard, BreakOffer } from './FocusBreak';
import { FocusSessionDone } from './FocusSessionDone';
import { pickIdea } from '../lib/breaks';
import type { Best } from '../lib/stats';
import { useBreakIdeas } from '../lib/breakIdeaStore';

const box = {
  display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 'var(--sp-5)',
  padding: 'var(--sp-6)', borderRadius: 'var(--r-md)',
  backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
} as const;

/** A pretend new best for the card (29-1P14a). */
const BESTS: Best[] = [{ kind: 'focus', today: 4 * 3600 + 25 * 60, record: 4 * 3600 + 15 * 60, recordDay: '2026-09-16', isNew: true }];

const LOG = [
  { id: 'a', title: 'Pitch deck: the money slide', used: 1500 },
  { id: 'b', title: 'Reply to the studio', used: 420 },
];

export function FocusBreakSpecimen() {
  const ideas = useBreakIdeas();
  const [said, setSaid] = useState('');
  const [offered, setOffered] = useState(true);
  const [over, setOver] = useState(false);
  const [seconds, setSeconds] = useState(300);
  const [turn, setTurn] = useState(0);
  const [ideaId, setIdeaId] = useState<string | null>(ideas[0]?.id ?? null);
  const idea = ideas.find((i) => i.id === ideaId) ?? ideas[0] ?? null;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--sp-5)' }}>
        <div style={box}>
          {offered ? (
            <BreakOffer
              focusMinutes={25}
              minutes={5}
              long={false}
              onKeepGoing={() => { setOffered(false); setSaid('Keep going: a fresh 25 minutes from now.'); }}
              onTake={() => { setOffered(false); setSaid('Take a break: the clock and the sound pause.'); }}
            />
          ) : (
            <SoftButton size="sm" onClick={() => setOffered(true)}>End the block again</SoftButton>
          )}
        </div>

        <div style={box}>
          <BreakCard
            long={false}
            secondsLeft={seconds}
            over={over}
            idea={idea}
            ideaTurn={turn}
            backLabel="Back to work"
            onAnotherIdea={() => { setTurn((t) => t + 1); setIdeaId(pickIdea(ideas, Math.random(), idea?.id)?.id ?? null); }}
            onAddTime={() => { setOver(false); setSeconds((s) => (over ? 120 : s + 120)); }}
            onBack={() => {
              if (over) { setOver(false); setSeconds(300); setSaid('Back to work presses play: a fresh block.'); } else setOver(true);
            }}
          />
        </div>
      </div>

      <div style={{ ...box, justifyItems: 'stretch' }}>
        <div style={{ display: 'grid', justifyItems: 'center' }}>
          <FocusSessionDone
            log={LOG}
            stats={{ subtasks: 2, ideas: 1, pauses: 0 }}
            bests={BESTS}
            canAnother
            breakMinutes={5}
            onAnother={() => setSaid('Another 25: your next best task, 25 minutes on it.')}
            onBreak={() => setSaid('Break: in pomodoro mode only.')}
            onDone={() => setSaid('Done: to the Dashboard.')}
          />
        </div>
      </div>

      <p style={{ minHeight: '1.5em', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{said}</p>
    </div>
  );
}
