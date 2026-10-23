/**
 * Your month, wrapped (29-1P14e1, BIG-15, idea 107, after Spotify Wrapped):
 * last month as a story that moves on by itself. What it counts is
 * `lib/monthWrapped.ts` (pure, tested); this file is how it looks, in BASE's
 * own system: each page takes the colour of what it is about (teal is focus,
 * sky is dates, gold the best of it, lime done, a project its cover's colour)
 * and the cover and summary are the celebration's mix, like the special days.
 *
 * His calls (2026-10-20): a card on the Dashboard with Play, **from the 1st to
 * the 7th, until watched** — watched means the summary was reached, or the
 * card's ✕ put it away. Remembered on this device, like the night's recap.
 * 29-1P14e2 added the task pushed most (sky, it is about dates), the focus
 * type (the colour of its hour, as the Dashboard's sky paints it), Share on
 * the summary (`lib/wrapShareImage.ts`) and **the year**: in January, last
 * year is a second card of its own beside December's (his call), the same
 * story with its months in place of a month's calendar.
 *
 * How it moves: the bar along the top of the page in view is a Web Animation
 * as long as the page, and its end is what turns the page — so holding pauses
 * the very thing that is the clock, and nothing else keeps time. Tap the left
 * third to go back, anywhere else to go on; hold to pause; arrows and Space
 * on a keyboard. Each page's arrival is `el.animate` from a layout effect, as
 * everywhere on the Dashboard (a kept screen); nothing loops, and the summary
 * waits, still, for Done.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { GelButton, Icon, SoftButton, SoftIconButton, WhiteButton, useMotion } from '../../ui';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useWorkDays } from '../../lib/dashboard/todayHours';
import { formatMinutes } from '../../lib/dashboard/blockData';
import { weekdayOfDay } from '../../lib/dashboard/hours';
import {
  bestDayInYear, bestDayWords, bestMonth, buildMonthWrap, clockHour, coverWords, daysOfMonth, focusFigure, hasMonthToWrap,
  hoursCompareWords, hoursWords, kindOf, monthName, primeShare, summaryStats, wrapMonthAt, wrapPages, wrapYearAt,
  type MonthWrap, type WrapKind, type WrapPage,
} from '../../lib/monthWrapped';
import { pushedWords } from '../../lib/wrapPushed';
import { PHASE_COLOUR } from '../../lib/wrapFocusType';
import { useAllStories } from '../../lib/taskStorySync';
import { ignoredWorkOf } from '../../lib/ignoredWork';
import { workedJudgeOf } from '../../lib/workedTime';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { coverGlow, coverInks, resolveCover } from '../../lib/projectCover';
import { useOverlayDismiss } from '../../lib/useOverlayDismiss';
import { Z } from '../../lib/zLayers';
import { cubic, usePlayOnChange } from './motionOnce';

const span = (seconds: number) => formatMinutes(seconds / 60);
const todayOnly = (today: string) => [today];

/** How long a page stays before the story moves on. */
const PAGE_MS = 5200;
/** A press longer than this is a hold, not a tap. */
const HOLD_MS = 260;

// ─── Watched, on this device ────────────────────────────────────────────────

/** The last month watched, and the last year: one key each, so December and the year are put away apart. */
const WATCHED_KEY: Record<WrapKind, string> = { month: 'base.wrapWatched', year: 'base.wrapWatchedYear' };
const watchedListeners = new Set<() => void>();

function readWatched(kind: WrapKind): string | null {
  try {
    return localStorage.getItem(WATCHED_KEY[kind]);
  } catch {
    return null;
  }
}

function markWatched(period: string): void {
  try {
    localStorage.setItem(WATCHED_KEY[kindOf(period)], period);
  } catch {
    /* Watched for this page load only. */
  }
  for (const fn of watchedListeners) fn();
}

function subscribeWatched(fn: () => void): () => void {
  watchedListeners.add(fn);
  return () => { watchedListeners.delete(fn); };
}

// ─── The data ───────────────────────────────────────────────────────────────

export interface WrapStoryData {
  wrap: MonthWrap;
  /** Each ranked project's colour: its cover's main ink. */
  colours: Record<string, string>;
}

/**
 * What is offered now and not yet watched: last month from the 1st to the
 * 7th, and in January last year too, each on its own card (his call).
 */
function useOfferedPeriods(): string[] {
  /* `useWorkDays` re-renders on the minute, so the 1st arrives on its own. */
  const { timeZone } = useWorkDays(todayOnly);
  const watchedMonth = useSyncExternalStore(subscribeWatched, () => readWatched('month'));
  const watchedYear = useSyncExternalStore(subscribeWatched, () => readWatched('year'));
  const now = new Date();
  const month = wrapMonthAt(now, timeZone);
  const year = wrapYearAt(now, timeZone);
  return [month && month !== watchedMonth ? month : null, year && year !== watchedYear ? year : null]
    .filter((p): p is string => p !== null);
}

function useWrapData(period: string): WrapStoryData {
  const focusLog = useStore((s) => s.focusLog);
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const timeLog = useDashboardStore((s) => s.timeLog);
  /* Read once a card is up, so the pushed page is there by the time Play is pressed. */
  const stories = useAllStories(true);
  return useMemo(() => {
    const timeZone = resolveUserTimeZone();
    const wrap = buildMonthWrap({
      period, focusLog, handLog: timeLog, backlog, lists, projects, judge: workedJudgeOf(backlog, lists, projects), timeZone,
      stories, ignored: ignoredWorkOf(backlog, lists, projects).ids,
    });
    const colours: Record<string, string> = {};
    for (const p of wrap.projects) {
      const cover = resolveCover(p.id, projects.find((x) => x.id === p.id)?.cover);
      colours[p.id] = coverGlow(coverInks(cover.seed, cover.colours));
    }
    return { wrap, colours };
  }, [period, focusLog, timeLog, backlog, lists, projects, stories]);
}

// ─── The look ───────────────────────────────────────────────────────────────

/** The cover's and the summary's ground: the celebration's colours on the dark. */
const PARTY_GROUND = [
  'radial-gradient(90% 60% at 90% 0%, color-mix(in oklab, var(--job-rose) 42%, transparent), transparent 70%)',
  'radial-gradient(80% 60% at 0% 100%, color-mix(in oklab, var(--job-orange) 38%, transparent), transparent 70%)',
].join(', ');

function groundOf(page: WrapPage, data: WrapStoryData): CSSProperties {
  switch (page) {
    case 'hours':
      return { backgroundImage: 'linear-gradient(165deg, color-mix(in oklab, var(--job-teal) 58%, var(--void-1)), var(--job-teal-deep))' };
    case 'projects': {
      const top = data.wrap.projects[0];
      const colour = top ? data.colours[top.id] : 'var(--job-teal)';
      return { backgroundImage: `radial-gradient(100% 60% at 100% 0%, color-mix(in oklab, ${colour} 40%, transparent), transparent 72%)` };
    }
    case 'when':
      return { backgroundImage: 'linear-gradient(175deg, var(--job-teal-deep), var(--void-1) 80%)' };
    case 'best':
    case 'months':
      return { backgroundImage: 'linear-gradient(165deg, color-mix(in oklab, var(--job-sky) 55%, var(--void-1)), var(--job-sky-deep))' };
    case 'pushed':
      return { backgroundImage: 'radial-gradient(80% 50% at 50% 38%, color-mix(in oklab, var(--job-sky) 34%, transparent), transparent 70%)' };
    case 'type': {
      const phase = data.wrap.type?.phase ?? 'morning';
      const colour = PHASE_COLOUR[phase];
      const deep = colour.replace(')', '-deep)');
      return { backgroundImage: `linear-gradient(170deg, color-mix(in oklab, ${colour} 72%, var(--void-1)), ${deep})` };
    }
    default:
      return { backgroundImage: PARTY_GROUND };
  }
}

const ink = 'oklch(0.98 0.01 260)';
const kickerStyle: CSSProperties = {
  position: 'relative', font: 'var(--type-caption)', fontSize: 'clamp(11px, 3.4cqw, 14px)', fontWeight: 'var(--weight-medium)',
  letterSpacing: '0.04em', opacity: 0.82,
};
const headlineStyle: CSSProperties = {
  position: 'relative', margin: 0, font: 'var(--weight-light) 10.5cqw / 1.04 var(--font-display)', letterSpacing: '-0.04em',
  textWrap: 'balance',
};
const bodyStyle: CSSProperties = {
  position: 'relative', margin: 0, fontSize: 'clamp(13px, 4.2cqw, 17px)', lineHeight: 1.4, opacity: 0.88, textWrap: 'pretty',
};

function Kicker({ children }: { children: ReactNode }) {
  return <span data-in="0" style={kickerStyle}>{children}</span>;
}

/** A ranked row: a label and its value, and a bar that grows to its share. */
function Rank({ n, label, value, share, colour, strong, delay }: {
  n?: number; label: string; value: string; share: number; colour: string; strong?: boolean; delay: number;
}) {
  return (
    <div data-in={delay} style={{ display: 'grid', gridTemplateColumns: n ? '6cqw minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', alignItems: 'baseline', gap: '1.4cqw 2.4cqw', fontSize: strong ? 'clamp(14px, 4.6cqw, 18px)' : 'clamp(13px, 4.2cqw, 16px)', fontWeight: strong ? 'var(--weight-medium)' : undefined }}>
      {n && <b style={{ fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: '5.4cqw' }}>{n}</b>}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <i
        data-grow="x"
        data-d={delay + 200}
        style={{
          gridColumn: n ? '2 / -1' : '1 / -1', height: '1.8cqw', minHeight: 5, borderRadius: 99, backgroundColor: colour,
          transformOrigin: 'left', transform: `scaleX(${Math.max(0.02, Math.min(1, share))})`,
        }}
      />
    </div>
  );
}

function CoverPage({ wrap }: { wrap: MonthWrap }) {
  const shape: CSSProperties = { position: 'absolute', display: 'block' };
  return (
    <>
      <i data-pop="100" style={{ ...shape, right: '-12%', top: '13%', width: '50%', aspectRatio: '1', borderRadius: '50%', backgroundColor: 'var(--job-gold)' }} />
      <i data-pop="250" style={{ ...shape, left: '-9%', top: '37%', width: '41%', aspectRatio: '1', borderRadius: '26%', backgroundColor: 'var(--job-lime)', rotate: '18deg' }} />
      <i data-pop="400" style={{ ...shape, right: '8%', top: '56%', width: '55%', height: '9.6%', borderRadius: 999, backgroundColor: 'var(--job-rose)' }} />
      <Kicker>BASE · {wrap.kind === 'year' ? wrap.name : `${wrap.name} ${wrap.year}`}</Kicker>
      <div style={{ marginTop: 'auto', position: 'relative', display: 'grid', gap: '3cqw' }}>
        <h2 data-in="600" style={{ ...headlineStyle, fontSize: '15cqw', lineHeight: 0.98 }}>Your<br />{wrap.name}.</h2>
        <p data-in="900" style={bodyStyle}>{coverWords(wrap.period)}</p>
      </div>
    </>
  );
}

function HoursPage({ wrap }: { wrap: MonthWrap }) {
  const figure = focusFigure(wrap.focused);
  const compare = hoursCompareWords(wrap, span);
  const most = Math.max(wrap.focused, wrap.previousFocused);
  return (
    <>
      <Kicker>You focused for</Kicker>
      <div data-in="150" style={{ display: 'flex', alignItems: 'flex-end', gap: '2.4cqw', marginTop: '3cqw', flexWrap: 'wrap' }}>
        <span data-count={figure.value} style={{ fontFamily: 'var(--font-numeric)', fontWeight: 200, fontSize: '36cqw', lineHeight: 0.84, letterSpacing: '-0.06em', fontVariantNumeric: 'tabular-nums' }}>
          {figure.value}
        </span>
        <span style={{ ...headlineStyle, marginBottom: '1.6cqw' }}>{figure.unit}</span>
      </div>
      {compare && <p data-in="500" style={{ ...bodyStyle, marginTop: '2cqw' }}>{compare}</p>}
      {wrap.previousFocused > 0 && (
        <div style={{ marginTop: 'auto', display: 'grid', gap: '4cqw' }}>
          <Rank label={wrap.previousName} value={span(wrap.previousFocused)} share={wrap.previousFocused / most} colour="oklch(1 0 0 / 0.42)" delay={900} />
          <Rank label={wrap.name} value={span(wrap.focused)} share={wrap.focused / most} colour={ink} strong delay={1100} />
        </div>
      )}
    </>
  );
}

function ProjectsPage({ wrap, colours }: WrapStoryData) {
  const [top] = wrap.projects;
  return (
    <>
      <Kicker>Your top projects</Kicker>
      <h2 data-in="150" style={{ ...headlineStyle, marginTop: '2cqw' }}>
        <span style={{ color: colours[top.id] }}>{top.name}</span><br />ran the month.
      </h2>
      <div style={{ marginTop: 'auto', display: 'grid', gap: '4cqw' }}>
        {wrap.projects.map((p, i) => (
          <Rank key={p.id} n={i + 1} label={p.name} value={span(p.seconds)} share={p.seconds / top.seconds} colour={colours[p.id]} strong={i === 0} delay={400 + i * 150} />
        ))}
      </div>
    </>
  );
}

function WhenPage({ wrap }: { wrap: MonthWrap }) {
  const prime = wrap.prime!;
  const used = wrap.hours.map((s, h) => (s > 0 ? h : -1)).filter((h) => h >= 0);
  const from = Math.min(6, used[0] ?? 6);
  const to = Math.max(23, (used.at(-1) ?? 22) + 1);
  const range = Array.from({ length: to - from }, (_, i) => from + i);
  const peak = Math.max(...range.map((h) => wrap.hours[h]), 1);
  const at = (h: number) => `${((h - from) / (to - from)) * 100}%`;
  const ticks = [12, 18].filter((h) => h > from + 2 && h < to - 2);
  return (
    <>
      <Kicker>When you focus</Kicker>
      <h2 data-in="150" style={{ ...headlineStyle, marginTop: '2cqw' }}>
        You're sharpest from <span style={{ color: 'var(--job-gold)' }}>{hoursWords(prime)}.</span>
      </h2>
      <div data-in="300" style={{ marginTop: 'auto', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.8cqw', height: '44cqw' }}>
          {range.map((h, i) => {
            const lit = h >= prime.from && h < prime.to;
            return (
              <i
                key={h}
                data-grow="y"
                data-d={500 + i * 40}
                style={{
                  flex: 1, height: `${Math.max(2, (wrap.hours[h] / peak) * 100)}%`, borderRadius: '1cqw 1cqw 0.3cqw 0.3cqw',
                  backgroundColor: lit ? 'var(--job-gold)' : 'oklch(1 0 0 / 0.32)',
                  boxShadow: lit ? '0 0 4cqw -0.5cqw color-mix(in oklab, var(--job-gold) 70%, transparent)' : undefined,
                  transformOrigin: 'bottom', transform: 'none',
                }}
              />
            );
          })}
        </div>
        <div style={{ position: 'relative', height: 16, marginTop: '1.6cqw', fontSize: 'clamp(10px, 3cqw, 12px)', opacity: 0.7, whiteSpace: 'nowrap' }}>
          <span style={{ position: 'absolute', left: 0 }}>{clockHour(from)}</span>
          {ticks.map((h) => <span key={h} style={{ position: 'absolute', left: at(h), translate: '-50% 0' }}>{clockHour(h)}</span>)}
          <span style={{ position: 'absolute', right: 0 }}>{clockHour(to)}</span>
        </div>
      </div>
      <p data-in="1400" style={{ ...bodyStyle, marginTop: '3cqw' }}>
        {primeShare(wrap.hours, prime)}% of your timed focus fell in those two hours.
      </p>
    </>
  );
}

function BestPage({ wrap }: { wrap: MonthWrap }) {
  const best = wrap.best!;
  const days = daysOfMonth(wrap.period);
  /* Monday first. */
  const lead = (weekdayOfDay(days[0]) + 6) % 7;
  const seconds = new Map(wrap.days.map((d) => [d.day, d.seconds]));
  return (
    <>
      <Kicker>Your best day</Kicker>
      <h2 data-in="150" style={{ ...headlineStyle, marginTop: '2cqw' }}>
        {bestDayWords(best.day)}<br />{span(best.seconds)} focused.
      </h2>
      <div data-in="300" style={{ marginTop: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1.4cqw', fontSize: 'clamp(9px, 3cqw, 12px)', opacity: 0.7, textAlign: 'center', marginBottom: '1.6cqw' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1.4cqw' }}>
          {Array.from({ length: lead }, (_, i) => <i key={`lead${i}`} />)}
          {days.map((day, i) => {
            const isBest = day === best.day;
            const s = seconds.get(day) ?? 0;
            return (
              <i
                key={day}
                data-in={400 + i * 25}
                style={{
                  aspectRatio: '1', borderRadius: '2cqw', display: 'grid', placeItems: 'center',
                  fontStyle: 'normal', fontSize: 'clamp(10px, 3.2cqw, 13px)', fontWeight: 600,
                  backgroundColor: isBest ? 'var(--job-gold)' : `oklch(1 0 0 / ${s > 0 ? (0.12 + 0.5 * (s / best.seconds)).toFixed(2) : '0.06'})`,
                  color: isBest ? 'var(--job-gold-ink)' : undefined,
                  boxShadow: isBest ? '0 0 0 0.8cqw color-mix(in oklab, var(--job-gold) 35%, transparent), 0 0 6cqw color-mix(in oklab, var(--job-gold) 60%, transparent)' : undefined,
                }}
              >
                {isBest ? Number(day.slice(8)) : ''}
              </i>
            );
          })}
        </div>
      </div>
      <p data-in="1500" style={{ ...bodyStyle, marginTop: '3cqw' }}>Brighter squares, more focus.</p>
    </>
  );
}

/** A year's best day is its months: twelve bars, the best one gold, the best day said under them. */
function MonthsPage({ wrap }: { wrap: MonthWrap }) {
  const top = bestMonth(wrap)!;
  const best = wrap.best!;
  return (
    <>
      <Kicker>Month by month</Kicker>
      <h2 data-in="150" style={{ ...headlineStyle, marginTop: '2cqw' }}>
        <span style={{ color: 'var(--job-gold)' }}>{monthName(top.month)}</span><br />was your biggest.
      </h2>
      <div data-in="300" style={{ marginTop: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.4cqw', height: '48cqw' }}>
          {wrap.months.map((m, i) => {
            const lit = m.month === top.month;
            return (
              <i
                key={m.month}
                data-grow="y"
                data-d={500 + i * 60}
                style={{
                  flex: 1, height: `${Math.max(2, (m.seconds / top.seconds) * 100)}%`, borderRadius: '1.2cqw 1.2cqw 0.3cqw 0.3cqw',
                  backgroundColor: lit ? 'var(--job-gold)' : 'oklch(1 0 0 / 0.32)',
                  boxShadow: lit ? '0 0 4cqw -0.5cqw color-mix(in oklab, var(--job-gold) 70%, transparent)' : undefined,
                  transformOrigin: 'bottom', transform: 'none',
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: '1.4cqw', marginTop: '1.6cqw', fontSize: 'clamp(9px, 3cqw, 12px)', opacity: 0.7, textAlign: 'center' }}>
          {wrap.months.map((m) => <span key={m.month} style={{ flex: 1 }}>{monthName(m.month)[0]}</span>)}
        </div>
      </div>
      <p data-in="1500" style={{ ...bodyStyle, marginTop: '3cqw' }}>
        Your best day: {bestDayInYear(best.day)}, {span(best.seconds)} focused.
      </p>
    </>
  );
}

/** The task pushed most, stamped with how many times. */
function PushedPage({ wrap }: { wrap: MonthWrap }) {
  const pushed = wrap.pushed!;
  return (
    <>
      <Kicker>The task you pushed most</Kicker>
      <h2
        data-in="300"
        style={{
          ...headlineStyle, fontSize: pushed.title.length > 40 ? '9.5cqw' : '12.5cqw', marginTop: '9cqw',
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        “{pushed.title}”
      </h2>
      <span
        data-stamp="1000"
        style={{
          position: 'relative', alignSelf: 'flex-start', marginTop: '6cqw', padding: '1.6cqw 3.6cqw', rotate: '-8deg',
          border: '0.9cqw solid var(--job-sky)', borderRadius: 'var(--r-sm)', color: 'var(--job-sky)',
          font: 'var(--weight-semi) clamp(15px, 6cqw, 26px) / 1 var(--font-display)', letterSpacing: '0.02em',
          boxShadow: '0 0 5cqw -1cqw color-mix(in oklab, var(--job-sky) 60%, transparent)',
        }}
      >
        Pushed {pushed.pushes}×
      </span>
      <p data-in="1900" style={{ ...bodyStyle, marginTop: 'auto' }}>{pushedWords(pushed, span)}</p>
    </>
  );
}

/** The sun or moon over the focus type, by the hour it lives in. */
function TypeSky({ phase }: { phase: NonNullable<MonthWrap['type']>['phase'] }) {
  const light = 'oklch(0.97 0.05 90)';
  const glow = `0 0 16cqw color-mix(in oklab, ${light} 55%, transparent)`;
  const base: CSSProperties = { position: 'absolute', display: 'block', backgroundColor: light, boxShadow: glow };
  if (phase === 'night') {
    /* A crescent: a ring of light cast by a circle with no fill. */
    return <i data-pop="200" style={{ position: 'absolute', display: 'block', right: '16%', top: '14%', width: '34%', aspectRatio: '1', borderRadius: '50%', boxShadow: `-6cqw 4cqw 0 0 ${light}, ${glow}` }} />;
  }
  if (phase === 'afternoon') return <i data-pop="200" style={{ ...base, right: '12%', top: '13%', width: '40%', aspectRatio: '1', borderRadius: '50%' }} />;
  /* Morning rises, evening sets: a half disc on the line, higher in the morning. */
  return (
    <i
      data-pop="200"
      style={{ ...base, left: '50%', translate: '-50% 0', top: phase === 'morning' ? '22%' : '30%', width: '72%', aspectRatio: '2', borderRadius: '999px 999px 0 0' }}
    />
  );
}

function TypePage({ wrap }: { wrap: MonthWrap }) {
  const type = wrap.type!;
  const [first, ...rest] = type.name.split(' ');
  return (
    <>
      <TypeSky phase={type.phase} />
      <Kicker>Your focus type</Kicker>
      <div style={{ marginTop: 'auto', position: 'relative', display: 'grid', gap: '4cqw' }}>
        <h2 data-in="600" style={{ ...headlineStyle, fontSize: '13cqw' }}>
          {first} {rest.slice(0, -1).join(' ')}<br />{rest.at(-1)}.
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2cqw' }}>
          {type.facts.map((fact, i) => (
            <span
              key={fact}
              data-in={1000 + i * 200}
              style={{ padding: '1.4cqw 3cqw', borderRadius: 999, backgroundColor: 'oklch(1 0 0 / 0.2)', fontSize: 'clamp(12px, 3.8cqw, 15px)', fontWeight: 'var(--weight-medium)' }}
            >
              {fact}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, colour, big, wide }: { label: string; value: string; colour?: string; big?: boolean; wide?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: '0.8cqw', minWidth: 0, gridColumn: wide ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 'clamp(11px, 3.6cqw, 14px)', opacity: 0.75 }}>{label}</span>
      <b
        style={{
          color: colour, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          ...(big
            ? { fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: '9.5cqw', lineHeight: 1, letterSpacing: '-0.03em' }
            : { fontWeight: 'var(--weight-medium)', fontSize: 'clamp(14px, 5cqw, 20px)', lineHeight: 1.15 }),
        }}
      >
        {value}
      </b>
    </div>
  );
}

type ShareState = 'idle' | 'making' | 'saved' | 'shared';
const SHARE_WORDS: Record<ShareState, string> = { idle: 'Share', making: 'Making…', saved: 'Saved', shared: 'Shared' };

/**
 * Share (his call): a picture of this page, story-sized, to the share sheet
 * on the tablet and saved on the laptop. The drawing is fetched on the press.
 */
function useShareWrap(data: WrapStoryData) {
  const [state, setState] = useState<ShareState>('idle');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const share = async (from: Element) => {
    if (state === 'making') return;
    setState('making');
    const { wrap } = data;
    try {
      const { drawWrapPicture, shareOrSave } = await import('../../lib/wrapShareImage');
      const blob = await drawWrapPicture({ name: wrap.name, kicker: `${wrap.name} in BASE`, stats: summaryStats(wrap, data.colours, span) }, from);
      const fileName = `base-${wrap.kind === 'year' ? wrap.name : `${wrap.name.toLowerCase()}-${wrap.year}`}.jpg`;
      const outcome = await shareOrSave(blob, fileName, `My ${wrap.name} in BASE`);
      setState(outcome === 'cancelled' ? 'idle' : outcome);
    } catch {
      setState('idle');
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2600);
  };
  return { state, share };
}

function SummaryPage({ wrap, colours, onReplay, onDone }: WrapStoryData & { onReplay: () => void; onDone?: () => void }) {
  const { state, share } = useShareWrap({ wrap, colours });
  return (
    <>
      <Kicker>{wrap.name} in BASE</Kicker>
      <div data-in="200" style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '6cqw 4cqw', marginTop: '7cqw' }}>
        {summaryStats(wrap, colours, span).map((s) => <Stat key={s.label} {...s} />)}
      </div>
      <div data-in="600" style={{ position: 'relative', marginTop: 'auto', display: 'flex', gap: '2.4cqw' }}>
        <SoftIconButton label="Replay" onClick={onReplay}><Icon name="rotate-ccw" size={15} /></SoftIconButton>
        <SoftButton icon={<Icon name={state === 'saved' || state === 'shared' ? 'check' : 'share-2'} size={15} />} onClick={(e) => void share(e.currentTarget)} aria-busy={state === 'making'}>
          {SHARE_WORDS[state]}
        </SoftButton>
        {onDone && <WhiteButton onClick={onDone} style={{ flex: 1 }}>Done</WhiteButton>}
      </div>
    </>
  );
}

// ─── The story ──────────────────────────────────────────────────────────────

/**
 * The story in a frame its caller sizes (9:16 on the Dashboard's layer, a
 * small one on `/design`). `onWatched` is told once the summary is reached;
 * `keys` lets the arrows and Space drive it.
 */
export function WrapStoryFrame({ data, onClose, onWatched, keys = false, style }: {
  data: WrapStoryData;
  onClose?: () => void;
  onWatched?: () => void;
  keys?: boolean;
  style?: CSSProperties;
}) {
  const { wrap } = data;
  const pages = useMemo(() => wrapPages(wrap), [wrap]);
  const last = pages.length - 1;
  /* `n` counts every turn, so going back to the page in view (or Replay) plays it again. */
  const [view, setView] = useState({ at: 0, n: 0 });
  const at = Math.min(view.at, last);
  const page = pages[at];
  const [held, setHeld] = useState(false);
  const heldRef = useRef(false);
  const bars = useRef<(HTMLElement | null)[]>([]);
  const clock = useRef<Animation | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: number } | null>(null);
  const reduced = useReducedMotion();
  const motion = useMotion();

  /* Back from the first page plays it again; on from the last does nothing. */
  const go = (to: number) => {
    if (to > last) return;
    setView((v) => ({ at: Math.max(0, to), n: v.n + 1 }));
  };

  /* The page's bar is the clock: when it fills, the story moves on. */
  useLayoutEffect(() => {
    const bar = bars.current[at];
    if (!bar) return;
    const run = bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: PAGE_MS, easing: 'linear', fill: 'forwards' });
    if (heldRef.current) run.pause();
    run.onfinish = () => {
      if (at < last) setView((v) => ({ at: v.at + 1, n: v.n + 1 }));
    };
    clock.current = run;
    return () => {
      run.onfinish = null;
      run.cancel();
    };
  }, [at, last, view.n]);

  /* The page arrives: its pieces rise in one after another, bars grow, the big number counts up. */
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el || reduced) return;
    const ease = cubic(motion.ease.glide);
    const played: Animation[] = [el.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'none' }], { duration: 480, easing: ease })];
    el.querySelectorAll<HTMLElement>('[data-in]').forEach((n) => {
      played.push(n.animate([{ opacity: 0, transform: 'translateY(4cqw)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: Number(n.dataset.in), easing: ease, fill: 'backwards' }));
    });
    el.querySelectorAll<HTMLElement>('[data-stamp]').forEach((n) => {
      played.push(n.animate([{ opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: Number(n.dataset.stamp), easing: cubic(motion.ease.springy), fill: 'backwards' }));
    });
    el.querySelectorAll<HTMLElement>('[data-pop]').forEach((n) => {
      played.push(n.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: Number(n.dataset.pop), easing: cubic(motion.ease.springy), fill: 'backwards' }));
    });
    el.querySelectorAll<HTMLElement>('[data-grow]').forEach((n) => {
      const from = n.dataset.grow === 'y' ? 'scaleY(0)' : 'scaleX(0)';
      played.push(n.animate([{ transform: from }, { transform: n.style.transform || 'none' }], { duration: 800, delay: Number(n.dataset.d), easing: ease, fill: 'backwards' }));
    });
    let frame = 0;
    const counters = [...el.querySelectorAll<HTMLElement>('[data-count]')];
    if (counters.length > 0) {
      const start = performance.now() + 150;
      const tick = (now: number) => {
        const t = Math.min(1, Math.max(0, (now - start) / 1400));
        for (const c of counters) c.textContent = String(Math.round(Number(c.dataset.count) * (1 - (1 - t) ** 3)));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      for (const c of counters) c.textContent = '0';
      frame = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(frame);
      for (const c of counters) c.textContent = c.dataset.count ?? '';
      for (const a of played) a.cancel();
    };
  }, [view.n, reduced, motion]);

  const watchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (page === 'summary' && watchedFor.current !== wrap.period) {
      watchedFor.current = wrap.period;
      onWatched?.();
    }
  }, [page, wrap.period, onWatched]);

  const pause = () => {
    heldRef.current = true;
    setHeld(true);
    if (clock.current?.playState === 'running') clock.current.pause();
  };
  const resume = () => {
    heldRef.current = false;
    setHeld(false);
    if (clock.current?.playState === 'paused') clock.current.play();
  };

  useEffect(() => {
    if (!keys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') go(at + 1);
      else if (e.key === 'ArrowLeft') go(at - 1);
      else if (e.key === ' ' && !(e.target as Element | null)?.closest?.('button')) {
        e.preventDefault();
        if (heldRef.current) resume();
        else pause();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const release = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
    if (heldRef.current) resume();
  };

  let body: ReactNode;
  switch (page) {
    case 'cover': body = <CoverPage wrap={wrap} />; break;
    case 'hours': body = <HoursPage wrap={wrap} />; break;
    case 'projects': body = <ProjectsPage {...data} />; break;
    case 'when': body = <WhenPage wrap={wrap} />; break;
    case 'best': body = <BestPage wrap={wrap} />; break;
    case 'months': body = <MonthsPage wrap={wrap} />; break;
    case 'pushed': body = <PushedPage wrap={wrap} />; break;
    case 'type': body = <TypePage wrap={wrap} />; break;
    default: body = <SummaryPage {...data} onReplay={() => go(0)} onDone={onClose} />;
  }

  return (
    <div
      data-wrap-story={page}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as Element).closest('button')) return;
        press.current = { timer: window.setTimeout(pause, HOLD_MS) };
      }}
      onPointerUp={(e) => {
        if (!press.current) return;
        window.clearTimeout(press.current.timer);
        press.current = null;
        if (heldRef.current) { resume(); return; }
        const box = e.currentTarget.getBoundingClientRect();
        go(e.clientX - box.left < box.width / 3 ? at - 1 : at + 1);
      }}
      onPointerLeave={release}
      onPointerCancel={release}
      style={{
        position: 'relative', overflow: 'hidden', containerType: 'inline-size', boxSizing: 'border-box',
        borderRadius: 'var(--r-lg)', backgroundColor: 'var(--void-1)', color: ink, cursor: 'pointer',
        userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation',
        boxShadow: 'var(--glass-rim-1), 0 30px 60px -24px oklch(0 0 0 / 0.8)',
        ...style,
      }}
    >
      <div
        key={view.n}
        ref={pageRef}
        style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: '2.4cqw',
          padding: '15cqw 7cqw 7cqw', overflow: 'hidden', ...groundOf(page, data),
        }}
      >
        {body}
      </div>

      {/* The bars: one per page, the one in view filling as it plays. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '4cqw', right: '4cqw', top: '4cqw', display: 'flex', gap: '1.2cqw' }}>
        {pages.map((p, j) => (
          <i key={p} style={{ position: 'relative', flex: 1, height: 3, borderRadius: 2, overflow: 'hidden', backgroundColor: 'oklch(1 0 0 / 0.28)' }}>
            <b
              ref={(el) => { bars.current[j] = el; }}
              style={{ position: 'absolute', inset: 0, backgroundColor: ink, transformOrigin: 'left', transform: `scaleX(${j < at ? 1 : 0})` }}
            />
          </i>
        ))}
      </div>

      <div style={{ position: 'absolute', right: '2.5cqw', top: '7cqw', display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
        <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: '0.08em', opacity: held ? 0.85 : 0, transition: 'opacity .2s' }}>Paused</span>
        {onClose && (
          <button
            type="button"
            aria-label={`Close your ${wrap.name}`}
            onClick={onClose}
            className="ds-soft ds-soft--round ds-soft--sm"
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/** The layer the story plays on: the whole screen, the story in a 9:16 frame. */
function WrapLayer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  useOverlayDismiss(true, onClose);
  const ref = useRef<HTMLDivElement>(null);
  const motion = useMotion();
  usePlayOnChange(ref, label, (el) => {
    el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: cubic(motion.ease.glide) });
  });
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: Z.panel, display: 'grid', placeItems: 'center', backgroundColor: 'var(--void-0)' }}
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

// ─── The Dashboard's card ───────────────────────────────────────────────────

/** The small cover beside the card's words: the story's three shapes. The year's is a size up. */
function MiniCover({ big = false }: { big?: boolean }) {
  const shape: CSSProperties = { position: 'absolute', display: 'block' };
  const k = big ? 1.35 : 1;
  return (
    <div aria-hidden="true" style={{ position: 'relative', flex: '0 0 auto', width: 56 * k, height: 72 * k, borderRadius: 'var(--r-sm)', overflow: 'hidden', backgroundColor: 'var(--void-1)', backgroundImage: PARTY_GROUND, boxShadow: 'var(--glass-rim-1)' }}>
      <i style={{ ...shape, right: -6 * k, top: 8 * k, width: 28 * k, height: 28 * k, borderRadius: '50%', backgroundColor: 'var(--job-gold)' }} />
      <i style={{ ...shape, left: -5 * k, top: 28 * k, width: 23 * k, height: 23 * k, borderRadius: 6 * k, backgroundColor: 'var(--job-lime)', rotate: '18deg' }} />
      <i style={{ ...shape, right: 5 * k, top: 46 * k, width: 30 * k, height: 7 * k, borderRadius: 99, backgroundColor: 'var(--job-rose)' }} />
    </div>
  );
}

/**
 * The card, from its words. `onClose` puts it away until the next one. A
 * year's card is the same card a size up (his call: its own card, beside
 * December's).
 */
export function WrapCard({ name, line, kind = 'month', onPlay, onClose }: {
  name: string; line: string; kind?: WrapKind; onPlay?: () => void; onClose?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const motion = useMotion();
  const year = kind === 'year';
  usePlayOnChange(ref, name, (el) => {
    el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: cubic(motion.ease.glide) });
  });
  return (
    <section
      ref={ref}
      aria-label={`Your ${name}, wrapped`}
      data-moment="wrapped"
      data-wrap-kind={kind}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap', flex: '1 1 340px', maxWidth: 620, boxSizing: 'border-box',
        padding: year ? 'var(--sp-6) var(--sp-7)' : 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)', backgroundColor: 'var(--void-1)',
        backgroundImage: year
          ? 'radial-gradient(70% 120% at 100% 0%, color-mix(in oklab, var(--job-gold) 20%, transparent), transparent 70%), radial-gradient(60% 120% at 0% 100%, color-mix(in oklab, var(--job-rose) 18%, transparent), transparent 70%)'
          : 'radial-gradient(70% 120% at 100% 0%, color-mix(in oklab, var(--job-rose) 18%, transparent), transparent 70%), radial-gradient(60% 120% at 0% 100%, color-mix(in oklab, var(--job-orange) 14%, transparent), transparent 70%)',
        boxShadow: 'var(--glass-rim-1), 0 18px 40px -24px oklch(0 0 0 / 0.7)',
      }}
    >
      <MiniCover big={year} />
      <div style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0, flex: '1 1 200px' }}>
        <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', letterSpacing: '0.04em', color: 'var(--fg-3)' }}>
          {year ? 'Your year, wrapped' : 'Your month, wrapped'}
        </span>
        <h2 style={{ font: `var(--weight-light) var(${year ? '--text-3xl' : '--text-2xl'}) / 1.1 var(--font-display)`, letterSpacing: '-0.03em', margin: 0, color: 'var(--fg-1)' }}>
          {name}, in one story.
        </h2>
        <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>{line}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <GelButton colour="orange" size="md" tile={false} icon={<Icon name="play" size={16} />} onClick={onPlay} aria-label={`Play your ${name}`}>Play</GelButton>
        {onClose && (
          <button
            type="button"
            aria-label={year ? 'Put it away until next year' : 'Put it away until next month'}
            title={year ? 'Put away until next year' : 'Put away until next month'}
            onClick={onClose}
            className="ds-soft ds-soft--round ds-soft--sm"
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>
    </section>
  );
}

/** The card's one line: what the month held. */
function cardLine(wrap: MonthWrap): string {
  const done = `${wrap.done.toLocaleString('en-IN')} ${wrap.done === 1 ? 'task' : 'tasks'} done`;
  return wrap.focused > 0 ? `${span(wrap.focused)} focused · ${done}` : done;
}

/**
 * The cards on the Dashboard, from the 1st to the 7th until watched, and only
 * for a period that held something: last month, and in January last year
 * beside it. `onPlay` hands the period to the page, which plays it on its own
 * layer (the column it sits in moves under a pull).
 */
export function MonthWrappedCard({ onPlay }: { onPlay: (period: string) => void }) {
  const periods = useOfferedPeriods();
  if (periods.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-5)', alignItems: 'stretch' }}>
      {periods.map((p) => <OfferedCard key={p} period={p} onPlay={onPlay} />)}
    </div>
  );
}

function OfferedCard({ period, onPlay }: { period: string; onPlay: (period: string) => void }) {
  const { wrap } = useWrapData(period);
  if (!hasMonthToWrap(wrap)) return null;
  return (
    <div style={{ display: 'flex', flex: '1 1 340px', maxWidth: 620, marginBottom: 'var(--sp-7)' }}>
      <WrapCard name={wrap.name} kind={wrap.kind} line={cardLine(wrap)} onPlay={() => onPlay(period)} onClose={() => markWatched(period)} />
    </div>
  );
}

/** The story on its layer, over the Dashboard. Inside the page, not a portal, so the kept screen hides it. */
export function MonthWrappedStory({ period, onClose }: { period: string; onClose: () => void }) {
  const data = useWrapData(period);
  return (
    <WrapLayer label={`Your ${data.wrap.name}, wrapped`} onClose={onClose}>
      <WrapStoryFrame
        data={data}
        keys
        onClose={onClose}
        onWatched={() => markWatched(period)}
        style={{
          height: 'min(calc(100dvh - 32px), 860px)', aspectRatio: '9 / 16',
          maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc((100vw - 32px) * 16 / 9)',
        }}
      />
    </WrapLayer>
  );
}
