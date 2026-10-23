/**
 * `/design`'s "Words and empty screens" (29-1P14c): a few of his approved lit
 * sentences, and the four calm empties, on pretend words with local state
 * only. Nothing here reads or writes his data. The full list is
 * `docs/design/words-and-empty-screens.md`.
 */
import { useState, type CSSProperties } from 'react';
import { Card, EmptyCalm, GelButton, Icon, Lit, LitLine, SoftButton, SoftToggle, type EmptyArt } from '../ui';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };
const box: CSSProperties = {
  padding: 'var(--sp-6) var(--sp-7)', borderRadius: 'var(--r-lg)', backgroundColor: 'var(--void-1)',
  boxShadow: 'var(--glass-rim-1)', display: 'grid', gap: 'var(--sp-2)',
};
const line: CSSProperties = { font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-3)' };

const EMPTIES: Array<{ label: string; art: EmptyArt; title: string; text: string; action: string }> = [
  { label: 'A board', art: 'plane', title: 'A clean board.', text: '**Add the first task**, or make **a list** to sort tasks into sections.', action: 'Add first task' },
  { label: 'Set Deadlines', art: 'leaf', title: 'Nothing to time yet.', text: '**Pick today’s tasks** first, then give each one **its time** here.', action: 'Back to New Session' },
  { label: 'All caught up', art: 'sea', title: 'All caught up', text: 'Every task has **a score**, **a deadline**, **an estimate** and **a description**. Ready to **focus**.', action: 'Start focusing' },
  { label: 'No results', art: 'search', title: '', text: 'Nothing matches **“invoice”**. Try **another word**, or clear the filter.', action: 'Clear filter' },
];

export function WordsSpecimen() {
  const [replay, setReplay] = useState(0);
  const [empty, setEmpty] = useState(0);
  const shown = EMPTIES[empty];

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Sentences that light their key words</span>
          <div key={replay} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <div style={box}>
              <span style={kicker}>The Dashboard’s Today, nothing due</span>
              <LitLine always style={line}>
                Nothing due today. <Lit>Pick one thing</Lit>, give it <Lit>an hour</Lit>, call it a <Lit>good day</Lit>.
              </LitLine>
            </div>
            <div style={box}>
              <span style={kicker}>New Session’s title line</span>
              <LitLine always style={line} text="You have **5 hours** and **3 tasks** that fit. Start with **the pitch deck**." />
            </div>
          </div>
          <span><SoftButton onClick={() => setReplay((n) => n + 1)}>Replay</SoftButton></span>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Empty, but calm: a whole screen with nothing on it</span>
          <div style={{ ...box, display: 'block', padding: 0 }}>
            <EmptyCalm
              key={`${empty}-${replay}`}
              art={shown.art}
              title={shown.title === '' ? undefined : shown.title}
              actions={shown.art === 'search'
                ? <SoftButton size="sm" icon={<Icon name="x" size={14} />}>{shown.action}</SoftButton>
                : <GelButton colour="emerald" tile={false} size="md">{shown.action}</GelButton>}
            >
              <LitLine always text={shown.text} />
            </EmptyCalm>
          </div>
          <span style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {EMPTIES.map((one, i) => (
              <SoftToggle key={one.label} pressed={i === empty} onPressedChange={() => setEmpty(i)}>
                {one.label}
              </SoftToggle>
            ))}
          </span>
        </div>
      </div>
    </Card>
  );
}
