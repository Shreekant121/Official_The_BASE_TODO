/**
 * `/design`'s 29-1P9c section: a pretend task's story, every kind of moment in
 * its colour, and its steps as the white "40%". Local state only — nothing
 * here reads or writes his tasks. It uses the real pieces (`StoryTimeline`,
 * `StepPercent`, `lib/taskStory.ts`'s words), fed pretend moments dated back
 * from now.
 */
import { useMemo, useState } from 'react';
import { resolveUserTimeZone, toTaskDateString } from '../../lib/agent/dates';
import { storyLine, type StoryItem } from '../../lib/taskStory';
import { TickBox } from '../../ui';
import { CollapsibleSection } from './CollapsibleSection';
import { StepPercent } from './StepPercent';
import { StoryTimeline } from './StorySection';

const DAY = 86_400_000;
const HOUR = 3_600_000;

function pretendStory(now: number, zone: string): StoryItem[] {
  const ago = (days: number, hours = 0) => now - days * DAY - hours * HOUR;
  const date = (days: number) => toTaskDateString(new Date(now + days * DAY), zone);
  const items: StoryItem[] = [
    { at: ago(41), k: 'made', list: 'Build' },
    { at: ago(41, -1), k: 'edit', f: ['estimate'], by: 'atlas' },
    { at: ago(39), k: 'start', to: date(-38).slice(0, 10) },
    { at: ago(38), k: 'avoided', n: 2 },
    { at: ago(36), k: 'deadline', to: date(5), because: 'Pick the domain' },
    { at: ago(35), k: 'moved', to: 'Doing' },
    { at: ago(34), k: 'focus', sec: 3300, n: 1 },
    { at: ago(34, -2), k: 'step', t: 'Hero section' },
    { at: ago(30), k: 'title', from: 'Landing page' },
    { at: ago(20), k: 'assigned', to: 'Priya' },
    { at: ago(12), k: 'emergency', n: 3 },
    { at: ago(3), k: 'red', score: 21.3 },
    { at: ago(1), k: 'milestone', on: true },
    { at: ago(0, 1), k: 'focus', sec: 5700, n: 2 },
  ];
  return items.reverse();
}

const STEPS = ['Hero section', 'Pricing table', 'FAQ', 'Footer links', 'Proof-read'];

export function TaskStorySpecimen() {
  const [now] = useState(() => Date.now());
  const zone = useMemo(() => resolveUserTimeZone(), []);
  const lines = useMemo(() => pretendStory(now, zone).map((item) => storyLine(item, now, zone)), [now, zone]);
  const [open, setOpen] = useState(false);
  const [built, setBuilt] = useState(false);
  const [done, setDone] = useState<boolean[]>([true, true, false, false, false]);
  const count = done.filter(Boolean).length;

  return (
    <div style={{ display: 'grid', gap: 'var(--gap-card)', maxWidth: 640 }}>
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 }}>
          <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-3)', textTransform: 'var(--kicker-transform)' as never }}>Subtasks</span>
          <StepPercent done={count} total={STEPS.length} />
        </div>
        {STEPS.map((step, i) => (
          <button
            key={step}
            type="button"
            aria-pressed={done[i]}
            onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 0, border: 0, background: 'transparent',
              cursor: 'pointer', textAlign: 'left', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
              color: done[i] ? 'var(--fg-3)' : 'var(--fg-1)',
            }}
          >
            <TickBox done={done[i]} size={20} />
            {step}
          </button>
        ))}
      </div>
      <CollapsibleSection
        icon="clock"
        title="Story"
        hint={`${lines.length} moments · last: ${lines[0].text} today`}
        open={open}
        onToggle={() => { setBuilt(true); setOpen((o) => !o); }}
        blur={false}
      >
        {built && <StoryTimeline open={open} lines={lines} />}
      </CollapsibleSection>
    </div>
  );
}
