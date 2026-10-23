/**
 * `/design`'s "Your month, wrapped" (29-1P14e1, e2): the Dashboard's two
 * cards and, on Play, the story in a small frame, on a pretend September and
 * a pretend year. Nothing here reads or writes his data. Still until Play, so
 * the page's photograph is.
 */
import { useState } from 'react';
import { WrapCard, WrapStoryFrame, type WrapStoryData } from './dashboard/MonthWrapped';
import { daysOfMonth, daysOfPeriod, monthName, monthOf, monthsOfYear, primeHours, type MonthWrap } from '../lib/monthWrapped';
import { formatMinutes } from '../lib/dashboard/blockData';
import type { FocusType } from '../lib/wrapFocusType';
import type { PushedTask } from '../lib/wrapPushed';

const H = 3600;

const PROJECTS = [
  { id: 'p1', name: 'Studio Launch', seconds: 18 * H },
  { id: 'p2', name: 'Mid-sem revision', seconds: 9 * H },
  { id: 'p3', name: 'Routine', seconds: 7 * H },
  { id: 'p4', name: 'Operations', seconds: 5 * H },
  { id: 'p5', name: 'Portfolio', seconds: 3 * H },
];
const HOURS = [0, 0, 0, 0, 0, 0, 0.3, 1, 2.6, 6, 6.8, 4.4, 2.4, 2, 3, 3.4, 2.6, 2, 1.2, 0.8, 1.4, 1.2, 0.6, 0].map((h) => h * H);
const TYPE: FocusType = {
  name: 'The Morning Sprinter', phase: 'morning', style: 'sprinter',
  facts: ['Starts around 9 am', 'Sittings of about 35 minutes', 'Tuesdays run longest'],
};
const PUSHED: PushedTask = { id: 't1', title: 'Call the CA', pushes: 9, done: true, seconds: 10 * 60 };

/** A made-up day's focus: steady weekdays, quieter weekends, the 15th the best. */
function pretendDay(day: string): number {
  const date = Number(day.slice(8, 10));
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const base = weekday === 0 || weekday === 6 ? 0.2 : weekday === 2 ? 1.6 : 1;
  const wobble = ((date * 37 + Number(day.slice(5, 7)) * 13) % 11) / 10;
  return date === 20 ? 0 : Math.round((base + wobble) * H);
}

function pretendMonth(): MonthWrap {
  const days = daysOfMonth('2026-09').map((day) => ({ day, seconds: day === '2026-09-15' ? 5 * H + 40 * 60 : pretendDay(day) }));
  const focused = days.reduce((a, d) => a + d.seconds, 0);
  const best = days.reduce((a, d) => (d.seconds > a.seconds ? d : a));
  return {
    period: '2026-09', kind: 'month', name: monthName('2026-09'), year: 2026, previousName: 'August',
    focused, previousFocused: focused - 6 * H, days, projects: PROJECTS,
    hours: HOURS, prime: primeHours(HOURS), best, done: 131, run: 12, months: [], type: TYPE, pushed: PUSHED,
  };
}

/** A made-up year: March the biggest, a quiet August. */
function pretendYear(): MonthWrap {
  const lean: Record<string, number> = { '2026-03': 1.5, '2026-08': 0.45, '2026-12': 0.7 };
  const days = daysOfPeriod('2026').map((day) => ({
    day, seconds: day === '2026-03-17' ? 7 * H + 5 * 60 : Math.round(pretendDay(day) * (lean[monthOf(day)] ?? 1)),
  }));
  const focused = days.reduce((a, d) => a + d.seconds, 0);
  const best = days.reduce((a, d) => (d.seconds > a.seconds ? d : a));
  const months = monthsOfYear('2026').map((month) => ({
    month, seconds: days.reduce((a, d) => a + (monthOf(d.day) === month ? d.seconds : 0), 0),
  }));
  return {
    period: '2026', kind: 'year', name: '2026', year: 2026, previousName: '2025',
    focused, previousFocused: Math.round(focused * 0.8), days, projects: PROJECTS.map((p) => ({ ...p, seconds: p.seconds * 11 })),
    hours: HOURS.map((h) => h * 11), prime: primeHours(HOURS), best, done: 1420, run: 34, months,
    type: { ...TYPE, name: 'The Morning Runner', style: 'runner', facts: ['Starts around 9 am', 'Sittings of about 55 minutes', 'Tuesdays run longest'] },
    pushed: { ...PUSHED, title: 'File the GST return', pushes: 23, seconds: 50 * 60 },
  };
}

const COLOURS = {
  p1: 'oklch(0.68 0.16 162)', p2: 'oklch(0.68 0.16 240)', p3: 'oklch(0.68 0.16 355)',
  p4: 'oklch(0.68 0.16 45)', p5: 'oklch(0.68 0.16 300)',
};
const MONTH: WrapStoryData = { wrap: pretendMonth(), colours: COLOURS };
const YEAR: WrapStoryData = { wrap: pretendYear(), colours: COLOURS };

const line = (wrap: MonthWrap) => `${formatMinutes(wrap.focused / 60)} focused · ${wrap.done.toLocaleString('en-IN')} tasks done`;

export function MonthWrappedSpecimen() {
  const [playing, setPlaying] = useState<WrapStoryData | null>(null);
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)', justifyItems: 'start' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-5)', width: '100%' }}>
        <WrapCard name="September" line={line(MONTH.wrap)} onPlay={() => setPlaying(MONTH)} />
        <WrapCard name="2026" kind="year" line={line(YEAR.wrap)} onPlay={() => setPlaying(YEAR)} />
      </div>
      {playing && (
        <WrapStoryFrame key={playing.wrap.period} data={playing} onClose={() => setPlaying(null)} style={{ width: 'min(100%, 320px)', aspectRatio: '9 / 16' }} />
      )}
    </div>
  );
}
