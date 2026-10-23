/**
 * `/design`'s "Moments" (29-1P14b): the night's recap, welcome back and the
 * greeting on a special day, on pretend words with local state only. Nothing
 * here reads or writes his data.
 */
import { useState, type CSSProperties } from 'react';
import { Card, SoftButton, SoftToggle } from '../ui';
import { RecapCard, SpecialGreeting, WelcomeCard, type RecapData, type WelcomeData } from './dashboard/moments';
import { specialWords, welcomeWords, type SpecialDay } from '../lib/dayMoments';

const DAY = 3600;

const RECAP: RecapData = {
  dayLabel: 'Wed 15 Oct',
  headline: 'A good day.',
  worked: 4 * DAY + 20 * 60,
  available: 6 * DAY,
  done: 7,
  run: 12,
  spans: [{ from: 9 * 60 + 10, to: 10 * 60 + 40 }, { from: 11 * 60, to: 12 * 60 + 20 }, { from: 15 * 60, to: 15 * 60 + 45 }, { from: 17 * 60 + 30, to: 18 * 60 + 15 }],
  nowMinute: 21 * 60 + 5,
  bests: [],
  perfect: false,
};

const RECORD_DAY: RecapData = {
  ...RECAP,
  headline: 'A perfect day.',
  worked: 6 * DAY + 10 * 60,
  perfect: true,
  bests: [{ kind: 'focus', today: 6 * DAY + 10 * 60, record: 5 * DAY + 40 * 60, recordDay: '2026-09-16', isNew: true }],
};

const WELCOME: WelcomeData = {
  ...welcomeWords(4, { passed: 2, dueToday: 0, dueTomorrow: 1 }),
  task: { title: 'Call the CA', minutes: 10 },
};

const DAYS: Array<[string, SpecialDay]> = [
  ['Birthday', { kind: 'birthday' }],
  ['Diwali', { kind: 'diwali' }],
  ['New Year', { kind: 'new-year', year: 2027 }],
  ['BASE turns one', { kind: 'base', years: 1 }],
];

const frame: CSSProperties = {
  padding: 'var(--sp-8)', borderRadius: 'var(--r-lg)', backgroundColor: 'var(--void-1)',
  backgroundImage: 'radial-gradient(70% 55% at 90% 0%, color-mix(in oklab, var(--job-orange) 14%, transparent), transparent 70%)',
  boxShadow: 'var(--glass-rim-1)',
};

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

export function MomentsSpecimen() {
  const [record, setRecord] = useState(false);
  const [day, setDay] = useState(0);
  const [welcomeKey, setWelcomeKey] = useState(0);
  const special = DAYS[day][1];
  const words = specialWords(special, 'Shreekant', 2140);

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Your day, recapped: on the Dashboard from 8pm</span>
          <RecapCard data={record ? RECORD_DAY : RECAP} />
          <span><SoftButton onClick={() => setRecord((r) => !r)}>{record ? 'An ordinary good day' : 'A perfect, record day'}</SoftButton></span>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Welcome back: the first open after three or more days away</span>
          <div style={frame}>
            <WelcomeCard key={welcomeKey} data={WELCOME} />
          </div>
          <span><SoftButton onClick={() => setWelcomeKey((k) => k + 1)}>Replay</SoftButton></span>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Special days: the greeting dresses up</span>
          <SpecialGreeting key={day} special={special} kicker={words.kicker} line={words.line} />
          <span style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {DAYS.map(([label], i) => (
              <SoftToggle key={label} pressed={i === day} onPressedChange={() => setDay(i)}>
                {label}
              </SoftToggle>
            ))}
          </span>
        </div>
      </div>
    </Card>
  );
}
