/**
 * `/design`'s "Atlas at rest" (29-1P15b, ideas 83, 88, 94): Atlas's screen over
 * its horizon (press Listen and it brightens), an ask box that glows while you
 * type in it, and a reply with "Remembered" under it, which opens the note.
 * Since 29-1P15c (idea 74) also the Ask Atlas bar, growing into a panel and
 * shrinking back when the panel's ✕ is pressed.
 * Local state only — nothing here asks Atlas anything.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AskGlow, Card, Horizon, Icon, IconButton, Remembered, SoftButton } from '../ui';
import { AskAtlasBar } from '../ui/overlay/AskAtlasBar';
import { catalogLink } from '../lib/atlas/remembered';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

export function AtlasAtRestSpecimen() {
  const navigate = useNavigate();
  const [listening, setListening] = useState(false);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);

  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        {/* 83 — Atlas's screen over its horizon. */}
        <div
          style={{
            position: 'relative', zIndex: 0, overflow: 'hidden',
            display: 'grid', alignContent: 'start', gap: 'var(--sp-4)', minHeight: 200,
            padding: 'var(--sp-6)', borderRadius: 'var(--r-lg)',
            backgroundColor: 'oklch(0.115 0.004 260)',
          }}
        >
          <Horizon top="68%" lit={listening} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <span style={{ ...kicker, flex: 1 }}>Atlas</span>
            <SoftButton size="sm" className="ds-ask" icon={<Icon name={listening ? 'square' : 'mic'} size={14} />} onClick={() => setListening((on) => !on)}>
              {listening ? 'Stop' : 'Listen'}
            </SoftButton>
          </div>
          <p style={{ margin: 0, font: 'var(--type-display)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>
            {listening ? 'Listening…' : 'What should we get done today?'}
          </p>
        </div>

        {/* 88 — the ask box, glowing only while there is something typed in it. */}
        <AskGlow typed={draft.trim() !== ''} radius="var(--r-xl)">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Atlas anything"
            aria-label="Ask Atlas anything"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box', height: 52,
              padding: '0 var(--sp-6)', border: 0, outline: 'none',
              borderRadius: 'var(--r-xl)', backgroundImage: 'var(--glass-fill-2)',
              boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
              color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            }}
          />
        </AskGlow>

        {/* 94 — a reply in which Atlas saved a note. */}
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <p
            style={{
              justifySelf: 'end', margin: 0, maxWidth: '80%', padding: 'var(--sp-3) var(--sp-5)',
              borderRadius: 'var(--r-lg)', backgroundImage: 'var(--glass-fill-3)', boxShadow: 'var(--glass-rim-2)',
              font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
            }}
          >
            I go to the gym at 7 on weekdays.
          </p>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--fg-2)' }}>
            Got it. I’ll keep your mornings clear until 8.
          </p>
          <Remembered name="Gym" onOpen={() => navigate(catalogLink('preferences/gym.md'))} />
        </div>

        {/* 74 — the bar that opens into a panel. The panel here is a stand-in
            with the real one's mark, `data-ai-panel`, which is how the bar
            finds what it grows into. */}
        <div style={{ position: 'relative', height: 280, borderRadius: 'var(--r-lg)', backgroundColor: 'oklch(0.115 0.004 260)' }}>
          {asking && (
            <aside
              data-ai-panel="right"
              aria-label="Ask about this project"
              style={{
                position: 'absolute', inset: 'var(--sp-4)', display: 'grid', alignContent: 'start', gap: 'var(--sp-4)',
                padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-card-lg)',
                backgroundColor: 'oklch(0.145 0.004 260 / 0.82)', backgroundImage: 'var(--glass-fill-2)',
                boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                <span style={{ ...kicker, flex: 1 }}>Project · Shreekant Empire</span>
                <IconButton label="Dismiss panel" variant="ghost" onClick={() => setAsking(false)}>
                  <Icon name="x" size={17} />
                </IconButton>
              </div>
              <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
                Asks about this project, its lists and their tasks.
              </p>
            </aside>
          )}
          <AskAtlasBar
            open={asking}
            onOpen={() => setAsking(true)}
            label="Ask Atlas about this project"
            style={{ position: 'absolute', right: 'var(--sp-5)', bottom: 'var(--sp-5)', width: 260 }}
          />
        </div>
      </div>
    </Card>
  );
}
