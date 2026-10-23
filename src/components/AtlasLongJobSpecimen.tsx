/**
 * `/design`'s "Long jobs and the mic" (29-1P15d, ideas 77 and 78): Atlas's
 * working pill on a long job (press Run a long job; the light comes up at five
 * seconds), and the microphone that becomes a timer (press it to pretend to
 * talk, press again to finish), with dock mode's larger face beside it.
 * Local state only — nothing here opens the microphone or asks Atlas anything.
 */
import { useState, type CSSProperties } from 'react';
import { Card, SoftButton, Icon } from '../ui';
import { WorkingPill } from './chat/WorkingPill';
import { MicButton } from './chat/MicButton';
import { MicTimerFace } from './chat/MicTimer';
import { useSecondsSince } from './chat/micClock';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

export function AtlasLongJobSpecimen() {
  const [jobSince, setJobSince] = useState<number | null>(null);
  const [micSince, setMicSince] = useState<number | null>(null);
  const [landedAt, setLandedAt] = useState<number | null>(null);
  const listening = micSince !== null;
  const seconds = useSecondsSince(micSince, listening);

  return (
    <Card style={{ maxWidth: 560 }}>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        {/* 77 — the working pill on a long job. Started four seconds back, so
            the light comes up a second after pressing. */}
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <span style={{ ...kicker, flex: 1 }}>Atlas working</span>
            <SoftButton
              size="sm"
              className="ds-ask"
              icon={<Icon name={jobSince === null ? 'play' : 'square'} size={14} />}
              onClick={() => setJobSince((on) => (on === null ? Date.now() - 4000 : null))}
            >
              {jobSince === null ? 'Run a long job' : 'Stop'}
            </SoftButton>
          </div>
          <div style={{ minHeight: 38, display: 'grid' }}>
            {jobSince !== null && <WorkingPill label="Thinking on the laptop" since={jobSince} />}
          </div>
        </div>

        {/* 78 — the mic beside Send, and dock mode's face. */}
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Tap the mic, talk, tap again</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)', flexWrap: 'wrap' }}>
            <MicButton
              listening={listening}
              heard=""
              error={null}
              startedAt={micSince}
              landedAt={landedAt}
              onToggle={() => {
                if (listening) {
                  setMicSince(null);
                  setLandedAt(Date.now());
                } else {
                  setMicSince(Date.now());
                }
              }}
            />
            <MicTimerFace face={listening ? 'listening' : 'idle'} seconds={seconds} scale={1.6} />
          </div>
        </div>
      </div>
    </Card>
  );
}
