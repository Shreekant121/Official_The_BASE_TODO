/**
 * The Dashboard's time blocks (BIG-6, 29-1b): hours today, focus this week,
 * and the running focus timer. What they count is `lib/dashboard/hours.ts`
 * (pure, tested) through `lib/dashboard/todayHours.ts`; this file is only how
 * it looks. His calls are at the top of `charts.tsx` and `hours.ts`.
 *
 * Since 29-1c3 Hours and Focus this week show the day picked on the week
 * strip (and its week); the running timer is about right now and does not.
 * A new best, the glass's live fill and "Today only" stay today's.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LitLine, NewBestBadge, PerfectDayStamp, SoftButton } from '../../ui';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useDashDay } from '../../store/useDashDay';
import { dayPhrase, weekPhrase } from '../../lib/dashboard/weekStrip';
import { taskSecondsLeft, sessionSecondsLeft, useFocusRun } from '../../store/useFocusRun';
import { formatMinutes } from '../../lib/dashboard/blockData';
import { WEEKDAY_NAMES, weekOf, weekdayOfDay } from '../../lib/dashboard/hours';
import { useBests, useWorkDays } from '../../lib/dashboard/todayHours';
import { bestWords, isPerfectDay } from '../../lib/stats';
import { BigNumber, BlockIconButton, BlockTitle, LimeTag } from './parts';
import { GlassFill, Swatch, WeekBars, type WeekBar } from './charts';
import { useBlockMood } from './blockContext';
import type { BlockProps } from './blocks';

const span = (seconds: number) => formatMinutes(seconds / 60);
const oneDay = (day: string) => [day];

const Caption = ({ children, tone = 'var(--fg-3)' }: { children: ReactNode; tone?: string }) => (
  <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: tone }}>{children}</span>
);

// ─── Hours today ────────────────────────────────────────────────────────────

export function HoursTodayBlock({ w, h, onOpenSheet }: BlockProps) {
  const picked = useDashDay((s) => s.picked);
  const { today, day: shown, days: [day], available: [available] } = useWorkDays(oneDay, picked);
  const isToday = shown === today;
  const overridden = useDashboardStore((s) => s.hours.overrides[today] !== undefined) && isToday;
  const running = useFocusRun((s) => s.running) && isToday;
  const worked = day.timer + day.hand;
  const left = available - worked;
  const weekday = WEEKDAY_NAMES[weekdayOfDay(shown)];
  const title = isToday ? 'Hours' : `Hours ${dayPhrase(shown, today)}`;
  /* 29-1P14a: the hours met is a perfect day (idea 111, his call: the hours
     alone until 29-3's habits), and a day focused longer than any before is a
     new best (idea 108). Both are gold, as past the hours already was. */
  const perfect = isPerfectDay(worked, available);
  const focusBest = useBests().focus;
  const beat = isToday && focusBest.isNew ? bestWords(focusBest, span).beat : null;
  const overTone = left < 0 || perfect ? 'var(--job-gold)' : undefined;
  /* The figure itself is gold on a new best too; the lines under it only past the hours. */
  const numberTone = overTone ?? (beat ? 'var(--job-gold)' : undefined);
  /* Quiet (idea 145) only on a day with no hours: a day he has worked out is
     a full glass, and past it a gold one — grey would hide the reward. A
     perfect day's mood is its gold edge (`dashboard.css`). */
  useBlockMood(available === 0 ? 'quiet' : perfect ? 'perfect' : 'neutral');

  const tools = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
      {beat && <NewBestBadge beat={beat} />}
      <BlockIconButton label="Log time by hand" icon="plus" onClick={() => onOpenSheet('log-time')} />
      <BlockIconButton label="Hours you have" icon="sliders" onClick={() => onOpenSheet('hours')} />
    </span>
  );
  const slices = { ...day, available };
  /* The figure inside the glass, in the ink the glass hands it: dark where
     the liquid is, light above it. */
  const inGlass = (size: string) => (ink: string) => (
    <BigNumber value={span(worked)} size="md" tone={ink} style={{ fontSize: size }} />
  );
  const leftLine = available === 0
    ? `No hours set for ${weekday}`
    : shown > today ? 'Not yet'
      : left > 0 ? `${span(left)} left` : left === 0 ? 'Hours met' : `${span(-left)} over`;
  const stamp = perfect ? <PerfectDayStamp /> : null;
  const beatLine = beat ? <Caption tone="var(--job-gold)">{beat}</Caption> : null;
  const key = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2) var(--sp-4)' }}>
      <Swatch kind="timer">Timer {span(day.timer)}</Swatch>
      {day.hand > 0 && <Swatch kind="hand">By hand {span(day.hand)}</Swatch>}
      {day.notCounted > 0 && <Swatch kind="grey">Not counted {span(day.notCounted)}</Swatch>}
    </div>
  );

  /* One cell, one row: too small for a figure inside a glass, so the figure
     stands beside it. */
  if (w === 1 && h === 1) {
    return (
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 'var(--sp-3)', height: '100%', minHeight: 0 }}>
        <BlockTitle icon="activity" trail={tools}>{title}</BlockTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 0 }}>
          <GlassFill slices={slices} height={84} running={running} />
          <div style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0 }}>
            <BigNumber value={span(worked)} size="md" tone={numberTone} style={{ fontSize: 'var(--text-2xl)' }} />
            <Caption tone={overTone}>of {span(available)}</Caption>
            {stamp && <span style={{ justifySelf: 'start', marginTop: 'var(--sp-1)' }}>{stamp}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (w === 1) {
    return (
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-3)', height: '100%', minHeight: 0 }}>
        <BlockTitle icon="activity" trail={tools}>{title}</BlockTitle>
        <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
          <GlassFill slices={slices} height={220} running={running} render={inGlass('var(--text-3xl)')} />
        </div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)' }}>
          <Caption tone={overTone}>of {span(available)} · {leftLine}</Caption>
          {beatLine}
          {stamp}
          {key}
        </div>
      </div>
    );
  }

  /* Two wide: the glass takes the block's whole height, and the title moves
     beside it. One row tall, the glass is too narrow for a figure that
     crosses its surface to read, so the figure stands beside it there. */
  const tall = h >= 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)', height: '100%', minHeight: 0 }}>
      <GlassFill slices={slices} height={tall ? 280 : 128} running={running} render={tall ? inGlass('var(--text-3xl)') : undefined} />
      <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', flex: 1, minWidth: 0, height: '100%' }}>
        <BlockTitle icon="activity" trail={tools}>{`Hours ${dayPhrase(shown, today)}`}</BlockTitle>
        <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {!tall && <BigNumber value={span(worked)} size="md" tone={numberTone} style={{ fontSize: 'var(--text-2xl)' }} />}
            <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-2)' }}>
              of {span(available)}
            </span>
            {overridden && <LimeTag>Today only</LimeTag>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <Caption tone={overTone}>{leftLine}</Caption>
            {stamp}
          </span>
          {beatLine}
        </div>
        {key}
      </div>
    </div>
  );
}

// ─── Focus this week ────────────────────────────────────────────────────────

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function FocusWeekBlock({ h }: BlockProps) {
  const picked = useDashDay((s) => s.picked);
  const { today, day: shown, days, available } = useWorkDays(weekOf, picked);
  const bars: WeekBar[] = days.map((d, i) => {
    const title = new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-GB', {
      timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short',
    });
    return {
      label: LETTERS[i],
      timer: d.timer,
      hand: d.hand,
      notCounted: d.notCounted,
      available: available[i],
      today: d.day === today,
      future: d.day > today,
      title: `${title}: ${span(d.timer + d.hand)} of ${span(available[i])}`,
    };
  });
  const total = days.reduce((sum, d) => sum + d.timer + d.hand, 0);
  const soFar = days.reduce((sum, d, i) => sum + (d.day <= today ? available[i] : 0), 0);
  const handAny = days.some((d) => d.hand > 0);
  const greyAny = days.some((d) => d.notCounted > 0);

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-3)', height: '100%', minHeight: 0 }}>
      <BlockTitle
        icon="bar-chart-3"
        trail={h === 1 ? <Caption>{span(total)} of {span(soFar)}</Caption> : undefined}
      >
        {`Focus ${weekPhrase(shown, today)}`}
      </BlockTitle>
      {h >= 2 ? (
        <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-5)', minHeight: 0 }}>
          <BigNumber value={span(total)} unit={`of ${span(soFar)} so far`} size="md" />
          <WeekBars days={bars} height={h >= 3 ? 260 : 120} />
        </div>
      ) : (
        <div style={{ alignSelf: 'end' }}>
          <WeekBars days={bars} height={64} />
        </div>
      )}
      {h >= 2 && (handAny || greyAny) ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2) var(--sp-4)' }}>
          <Swatch kind="timer" dots>Timer</Swatch>
          {handAny && <Swatch kind="hand" dots>By hand</Swatch>}
          {greyAny && <Swatch kind="grey" dots>Not counted</Swatch>}
        </div>
      ) : <span />}
    </div>
  );
}

// ─── The running focus timer ────────────────────────────────────────────────

/** Repaints once a second while the clock runs — it is working right now (rule 1). */
function useSecond(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

function clock(seconds: number): string {
  const s = Math.abs(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const body = hh > 0
    ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return seconds < 0 ? `+${body}` : body;
}

export function FocusTimerBlock({ w, h }: BlockProps) {
  const navigate = useNavigate();
  const run = useFocusRun();
  const queued = useStore((s) => s.tasks.length);
  const now = useSecond(run.running);
  /* Nothing running and nothing queued: nothing here for him (idea 145). */
  useBlockMood(!run.task && queued === 0 ? 'quiet' : 'neutral');

  if (!run.task) {
    return (
      <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%' }}>
        <BlockTitle icon="timer">Focus timer</BlockTitle>
        <Caption><LitLine text="No focus session is **running**." /></Caption>
        {queued > 0 ? (
          <SoftButton style={{ justifySelf: 'start' }} onClick={(e) => { e.stopPropagation(); navigate('/focus'); }}>
            Open today’s queue
          </SoftButton>
        ) : <span />}
      </div>
    );
  }

  const left = taskSecondsLeft(run, now);
  const session = sessionSecondsLeft(run, now);
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-3)', height: '100%', minHeight: 0 }}>
      <BlockTitle
        icon="timer"
        trail={run.running ? <LimeTag>Running</LimeTag> : <Caption>Paused</Caption>}
      >
        Focus
      </BlockTitle>
      <div style={{ alignSelf: 'center', display: 'grid', gap: 'var(--sp-2)', minWidth: 0 }}>
        <BigNumber
          value={clock(left)}
          size={w >= 2 || h >= 2 ? 'lg' : 'md'}
          /* In flow past zero, gold, as on Focus and the pill (29-1P10b). */
          tone={left < 0 ? 'var(--job-gold)' : 'var(--fg-1)'}
        />
        <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {run.task.title}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <BlockIconButton label={run.running ? 'Pause' : 'Resume'} icon={run.running ? 'pause' : 'play'} size="md" onClick={run.toggle} />
        <BlockIconButton label="Open Focus" icon="arrow-up-right" size="md" onClick={() => navigate('/focus')} />
        {w >= 2 && (
          <span style={{ marginLeft: 'auto' }}>
            <Caption tone={session < 0 ? 'var(--job-gold)' : undefined}>
              {session < 0 ? `Session: ${span(-session)} in flow` : `Session: ${span(session)} left`}
            </Caption>
          </span>
        )}
      </div>
    </div>
  );
}
