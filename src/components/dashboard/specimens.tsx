/**
 * The Dashboard's pieces on `/design` (29-1P12), live and pressable, drawn
 * with the Dashboard's own components on made-up numbers. Nothing here reads
 * or writes his data.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { COLOUR_JOBS, COLOUR_JOB_INFO, Card, SegmentedControl, SoftButton, SoftToggle, type ColourJob } from '../../ui';
import type { BlockLook, BlockKind } from '../../lib/dashboard/layout';
import { BigNumber, BlockTitle } from './parts';
import { GlassFill, Swatch, WeekBars, type WeekBar } from './charts';
import { GiantGlyph, ThenStack } from './blocks';
import { deadlineWarmth, warmthColour } from '../../lib/dashboard/blockData';
import type { Task } from '../../store/useStore';
import { BlockContext, type BlockMood } from './blockContext';
import { paneStyle } from './paneStyle';
import './dashboard.css';

const GRID: CSSProperties = { display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' };
const HOUR = 3600;

const span = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
};

function Specimen({ name, use, children }: { name: string; use: string; children: ReactNode }) {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)', alignContent: 'start' }}>
        <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{name}</span>
        {children}
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{use}</span>
      </div>
    </Card>
  );
}

/** A made-up block, drawn in a look, as the grid draws one. */
function MiniBlock({ kind = 'next-deadline', look = 'glass', colour, mood, height = 150, children }: {
  kind?: BlockKind; look?: BlockLook; colour?: ColourJob; mood?: BlockMood; height?: number; children: ReactNode;
}) {
  const pane = paneStyle({ kind, settings: { look, colour } });
  return (
    <div
      className={pane.lamp ? 'dash-block dash-lamp' : 'dash-block'}
      data-mood={mood}
      style={{
        position: 'relative', overflow: 'hidden', height, ...pane.style, padding: 'var(--sp-5)',
        boxShadow: ['var(--glass-shadow-pane)', pane.edge].filter(Boolean).join(', '),
      }}
    >
      <div className="dash-block-body">
        <BlockContext.Provider value={{ setMood: null, look, colour: colour ?? 'sky' }}>{children}</BlockContext.Provider>
      </div>
    </div>
  );
}

function GlassSpecimen() {
  const [timer, setTimer] = useState(2 * HOUR);
  const [hand, setHand] = useState(false);
  const [running, setRunning] = useState(false);
  const slices = { timer, hand: hand ? 0.75 * HOUR : 0, notCounted: 0.5 * HOUR, available: 4 * HOUR };
  const worked = slices.timer + slices.hand;
  return (
    <Specimen
      name="A glass that fills"
      use="Hours today. Teal fills from the timer, hatched is time logged by hand, grey is time that doesn't count. Past your hours it is full and gold. The surface moves only while the timer runs."
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)', flexWrap: 'wrap' }}>
        <GlassFill
          slices={slices}
          height={200}
          running={running}
          render={(ink) => <BigNumber value={span(worked)} size="md" tone={ink} style={{ fontSize: 'var(--text-3xl)' }} />}
        />
        <div style={{ display: 'grid', gap: 'var(--sp-3)', justifyItems: 'start' }}>
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <SoftButton onClick={() => setTimer((t) => Math.max(0, t - 0.75 * HOUR))}>Less</SoftButton>
            <SoftButton onClick={() => setTimer((t) => Math.min(6 * HOUR, t + 0.75 * HOUR))}>More</SoftButton>
          </div>
          <SoftToggle pressed={hand} onPressedChange={setHand}>By hand</SoftToggle>
          <SoftToggle pressed={running} onPressedChange={setRunning}>Timer running</SoftToggle>
          <span style={{ font: 'var(--type-caption)', color: worked > slices.available ? 'var(--job-gold)' : 'var(--fg-3)' }}>
            of 4h · {worked > slices.available ? `${span(worked - slices.available)} over` : `${span(slices.available - worked)} left`}
          </span>
        </div>
      </div>
    </Specimen>
  );
}

function RollSpecimen() {
  const [n, setN] = useState(128);
  return (
    <Specimen name="Numbers that roll" use="Every big thin number on the Dashboard: when it changes, its digits roll to the new value instead of jumping.">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-5)' }}>
        <BigNumber value={n} unit="tasks" />
        <SoftButton onClick={() => setN((v) => (v + 37 + Math.floor(Math.random() * 400)) % 1000)}>Change</SoftButton>
      </div>
    </Specimen>
  );
}

const WEEK: WeekBar[] = [
  [5.5, 0, 0], [7, 1, 0.5], [3, 0, 0], [8.5, 0.5, 0], [4.2, 0, 1], [0, 0, 0], [0, 0, 0],
].map(([t, hd, g], i) => ({
  label: 'MTWTFSS'[i],
  timer: t * HOUR, hand: hd * HOUR, notCounted: g * HOUR,
  available: (i < 5 ? 8 : 4) * HOUR,
  today: i === 4, future: i > 4,
  title: `${'MTWTFSS'[i]}: ${span((t + hd) * HOUR)}`,
}));

function DotsSpecimen() {
  const [run, setRun] = useState(0);
  return (
    <Specimen name="Dot-matrix bars" use="Focus this week: a column of lit dots a day, today in teal. Hollow dots are time logged by hand. Point at a day to name it.">
      <WeekBars key={run} days={WEEK} height={120} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <Swatch kind="timer" dots>Timer</Swatch>
        <Swatch kind="hand" dots>By hand</Swatch>
        <Swatch kind="grey" dots>Not counted</Swatch>
        <span style={{ flex: 1 }} />
        <SoftButton onClick={() => setRun((r) => r + 1)}>Replay</SoftButton>
      </div>
    </Specimen>
  );
}

const DEADLINE = (
  <div style={{ display: 'grid', alignContent: 'space-between', height: '100%' }}>
    <div style={{ position: 'relative' }}><BlockTitle icon="hourglass">Next deadline</BlockTitle></div>
    <BigNumber value="1d 8h" size="md" style={{ position: 'relative', fontSize: 'var(--text-3xl)' }} />
    <span style={{ position: 'relative', font: 'var(--type-body)', color: 'var(--fg-2)', maxWidth: '60%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      File the paperwork
    </span>
  </div>
);

function LooksSpecimen() {
  const [colour, setColour] = useState<ColourJob>('sky');
  const looks: { look: BlockLook; name: string }[] = [
    { look: 'glass', name: 'Glass' }, { look: 'lamp', name: 'Lamp' }, { look: 'tint', name: 'Tinted' }, { look: 'full', name: 'Full colour' },
  ];
  return (
    <Specimen
      name="Block looks"
      use="In any block's ⚙ on the Dashboard: Lamp is lit from within (point at it and the light grows), Tinted is a wash of colour, Full colour is for the one block you want to shout. Each block starts in its own colour."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-4)' }}>
        {looks.map(({ look, name }) => (
          <div key={look} style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            <MiniBlock look={look} colour={colour} height={140}>{DEADLINE}</MiniBlock>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{name}</span>
          </div>
        ))}
      </div>
      <div role="radiogroup" aria-label="Colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        {COLOUR_JOBS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === colour}
            aria-label={COLOUR_JOB_INFO[c].name}
            title={COLOUR_JOB_INFO[c].name}
            onClick={() => setColour(c)}
            style={{
              width: 26, height: 26, borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer', backgroundColor: `var(--job-${c})`,
              boxShadow: c === colour ? '0 0 0 2px var(--void-1), 0 0 0 3.5px var(--fg-2)' : '0 0 0 2px var(--void-1)',
            }}
          />
        ))}
      </div>
    </Specimen>
  );
}

function GlyphSpecimen() {
  return (
    <Specimen name="A giant glyph in the corner" use="The deadline block (and later streak and energy) shows one huge icon cut off at the corner, in the block's colour. On a mouse it leans in when you point at it.">
      <MiniBlock colour="sky" height={176}>
        <GiantGlyph icon="hourglass" h={1} />
        {DEADLINE}
      </MiniBlock>
    </Specimen>
  );
}

function QuietSpecimen() {
  const [evening, setEvening] = useState('Morning');
  const pm = evening !== 'Morning';
  const mini = (title: string, value: string, mood: BlockMood, icon: 'list-checks' | 'clock' | 'hourglass' | 'activity') => (
    <MiniBlock mood={mood} height={104}>
      <div style={{ display: 'grid', alignContent: 'space-between', height: '100%' }}>
        <BlockTitle icon={icon}>{title}</BlockTitle>
        <BigNumber value={value} size="md" style={{ fontSize: 'var(--text-2xl)' }} />
      </div>
    </MiniBlock>
  );
  return (
    <Specimen
      name="Quiet when it's done"
      use="A block with nothing left for you goes grey and a little smaller. Once one has, the blocks that still need you get a soft lime edge, so your eye goes straight there. Nothing moves on the grid."
    >
      <SegmentedControl look="soft" options={['Morning', 'Evening, all done']} value={evening} onChange={setEvening} />
      <div className="dash-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-4)' }}>
        {mini('Today', pm ? 'Done' : '5 left', pm ? 'quiet' : 'needs', 'list-checks')}
        {mini('Overdue', pm ? '0' : '2', pm ? 'quiet' : 'needs', 'clock')}
        {mini('Next deadline', '1d 8h', 'needs', 'hourglass')}
        {mini('Hours', '7h 40m', 'neutral', 'activity')}
      </div>
    </Specimen>
  );
}

// ─── 29-1P13 ────────────────────────────────────────────────────────────────

const SAMPLE_NEXT: Task[] = [
  { id: 'spec-1', title: 'Call the CA', status: 'needsAction', estimatedTime: 10 },
  { id: 'spec-2', title: 'Book the venue', status: 'needsAction', estimatedTime: 20 },
];

function ThenSpecimen() {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <Specimen
      name="Next tasks in a stack"
      use="Under the one thing, what comes after it sits in a stack like cards in a wallet. Tap to fan them out; tap one to open it; Stack puts them back."
    >
      <div style={{ paddingTop: 70 }}>
        <ThenStack tasks={SAMPLE_NEXT} upward onOpenTask={(t) => setOpened(t.title)} projectOf={() => ({ name: 'Studio Launch' })} />
      </div>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{opened ? `Would open “${opened}”` : ' '}</span>
    </Specimen>
  );
}

function WarmthSpecimen() {
  const days = [13, 9, 6, 3, 1, 0.2];
  return (
    <Specimen
      name="Deadlines warm up"
      use="On the runway a deadline's colour goes from sky (a date) to coral (urgent) as it gets close, so you see how near it is before you read where it is. Waiting on warms its day count the same way."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        {days.map((d) => (
          <span
            key={d}
            className="dash-pill"
            style={{ position: 'static', ['--pill' as string]: warmthColour(deadlineWarmth(d)) }}
          >
            <i aria-hidden="true" />
            <span>{d < 1 ? 'Today' : `${d} days`}</span>
          </span>
        ))}
      </div>
    </Specimen>
  );
}

/** Everything 29-1P12 and 29-1P13 added, for `/design`'s Dashboard section. */
export function DashboardSpecimens() {
  return (
    <div style={GRID}>
      <GlassSpecimen />
      <DotsSpecimen />
      <RollSpecimen />
      <LooksSpecimen />
      <GlyphSpecimen />
      <QuietSpecimen />
      <ThenSpecimen />
      <WarmthSpecimen />
    </div>
  );
}
