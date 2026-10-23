/**
 * Moments on the Dashboard (29-1P14b, BIG-15): the night's recap (idea 19),
 * welcome back after days away (idea 110) and the greeting on a special day
 * (idea 109). What each says and when is `lib/dayMoments.ts` (pure, tested);
 * this file is how they look, in BASE's own system: indigo is night, gold is
 * reward, orange is go.
 *
 * Each card is drawn twice over: a plain one that takes its words as props
 * (`/design` shows those), and a hook that reads the store and the clock. The
 * Dashboard is a kept screen, so every arrival is a Web Animation that plays
 * once (`motionOnce.ts`), never a CSS keyframe, and nothing loops.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GelButton, Icon, NewBestBadge, PerfectDayStamp, SlideToStart, SoftButton, useMotion } from '../../ui';
import { useStore, taskEstimatedMinutes, type Task } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useFocusRun } from '../../store/useFocusRun';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useBests, useWorkDays } from '../../lib/dashboard/todayHours';
import { finishedToday, formatMinutes, recommendTasks } from '../../lib/dashboard/blockData';
import { bestWords, isPerfectDay, newBests, type Best } from '../../lib/stats';
import {
  AWAY_DAYS, RECAP_BAR_FROM, awayChanges, daysAway, focusSpans, hasDayToRecap, isRecapTime, lastActivityAt,
  recapHeadline, smallestStart, welcomeWords, type SpecialDay, type Span,
} from '../../lib/dayMoments';
import { workedJudgeOf } from '../../lib/workedTime';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { cameBackFrom, settleCameBack, subscribeCameBack } from '../../lib/lastHere';
import { cloudMainLoaded, subscribeCloudLoaded } from '../../lib/covers/useCoverSync';
import { startsBySlide } from '../../lib/focusCommitment';
import { planStartNow } from '../../lib/smartStart';
import { useOverlayDismiss } from '../../lib/useOverlayDismiss';
import { Z } from '../../lib/zLayers';
import { cue } from '../../lib/sound';
import { setAside, startQueue } from '../task-fields/startNowMenu';
import { cubic, usePlayOnChange } from './motionOnce';

const span = (seconds: number) => formatMinutes(seconds / 60);
const todayOnly = (today: string) => [today];

// ─── Your day, recapped (idea 19) ───────────────────────────────────────────

const RECAP_KEY = 'base.recapClosed';
const recapListeners = new Set<() => void>();

function readRecapClosed(): string | null {
  try {
    return localStorage.getItem(RECAP_KEY);
  } catch {
    return null;
  }
}

function closeRecap(day: string): void {
  try {
    localStorage.setItem(RECAP_KEY, day);
  } catch {
    /* Closed for this page load only. */
  }
  for (const fn of recapListeners) fn();
}

function subscribeRecap(fn: () => void): () => void {
  recapListeners.add(fn);
  return () => { recapListeners.delete(fn); };
}

export interface RecapData {
  /** "Wed 15 Oct". */
  dayLabel: string;
  headline: string;
  worked: number;
  available: number;
  done: number;
  /** Days in a row ending today. */
  run: number;
  spans: Span[];
  /** Minutes after midnight, now: the bar's right end. */
  nowMinute: number;
  bests: Best[];
  perfect: boolean;
}

/** The night card, from its words. `onClose` puts it away until tomorrow night. */
export function RecapCard({ data, onClose }: { data: RecapData; onClose?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const motion = useMotion();
  usePlayOnChange(ref, data.dayLabel, (el) => {
    el.animate(
      [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
      { duration: 600, easing: cubic(motion.ease.glide) },
    );
  });
  const end = Math.max(data.nowMinute, RECAP_BAR_FROM + 60);
  const at = (minute: number) => `${((Math.min(Math.max(minute, RECAP_BAR_FROM), end) - RECAP_BAR_FROM) / (end - RECAP_BAR_FROM)) * 100}%`;
  const ticks: Array<[string, number]> = [['6am', RECAP_BAR_FROM], ['noon', 12 * 60], ['6pm', 18 * 60]];
  const share = data.available > 0 ? Math.round((data.worked / data.available) * 100) : null;
  const night = 'oklch(0.80 0.06 280)';

  return (
    <section
      ref={ref}
      aria-label="Your day, recapped"
      data-moment="recap"
      style={{
        display: 'grid', gap: 'var(--sp-5)', maxWidth: 620, boxSizing: 'border-box',
        padding: 'var(--sp-7) var(--sp-8) var(--sp-6)', borderRadius: 'var(--r-lg)',
        backgroundColor: 'color-mix(in oklab, var(--job-indigo-deep) 62%, var(--void-1))',
        backgroundImage: 'radial-gradient(80% 70% at 100% 0%, color-mix(in oklab, var(--job-indigo) 22%, transparent), transparent 70%)',
        boxShadow: 'var(--glass-rim-1), 0 18px 40px -24px oklch(0 0 0 / 0.7)',
        color: 'oklch(0.97 0.01 280)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: night }}>
        <Icon name="moon" size={14} style={{ color: 'var(--job-indigo)' }} />
        <span style={{ fontWeight: 'var(--weight-medium)', letterSpacing: '0.04em' }}>Tonight</span>
        <span style={{ marginLeft: 'auto', color: 'oklch(0.72 0.04 280)' }}>{data.dayLabel}</span>
        {onClose && (
          <button
            type="button"
            aria-label="Close the recap until tomorrow night"
            title="Close until tomorrow night"
            onClick={onClose}
            className="ds-soft ds-soft--round ds-soft--sm"
            style={{ marginRight: 'calc(-1 * var(--sp-3))' }}
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <h2 style={{ font: 'var(--weight-light) var(--text-3xl) / 1.05 var(--font-display)', letterSpacing: '-0.035em', margin: 0 }}>
          {data.headline}
        </h2>
        {data.perfect && <PerfectDayStamp />}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-numeric)', fontWeight: 200, fontSize: 'var(--text-4xl)', lineHeight: 0.95, letterSpacing: '-0.045em', fontVariantNumeric: 'tabular-nums', color: data.bests.some((b) => b.kind === 'focus') ? 'var(--job-gold)' : undefined }}>
          {span(data.worked)}
        </span>
        <span style={{ font: 'var(--type-body)', color: night }}>focused</span>
      </div>

      {/* When he focused, 6am to now. A stretch is a still bar; nothing moves. */}
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <div style={{ position: 'relative', height: 8, borderRadius: 4, backgroundColor: 'oklch(1 0 0 / 0.07)', overflow: 'hidden' }}>
          {data.spans.map((s, i) => (
            <i
              key={i}
              style={{
                position: 'absolute', top: 0, bottom: 0, left: at(s.from),
                width: `max(3px, calc(${at(s.to)} - ${at(s.from)}))`, borderRadius: 4,
                backgroundColor: 'var(--job-indigo)',
              }}
            />
          ))}
        </div>
        <div style={{ position: 'relative', height: 14, font: 'var(--type-caption)', fontSize: 11, color: 'oklch(0.64 0.03 280)' }}>
          {ticks.filter(([, m]) => m < end - 60).map(([label, m]) => (
            <span key={label} style={{ position: 'absolute', left: at(m), transform: m === RECAP_BAR_FROM ? undefined : 'translateX(-50%)' }}>{label}</span>
          ))}
          <span style={{ position: 'absolute', right: 0 }}>now</span>
        </div>
      </div>

      {data.bests.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
          {data.bests.map((b) => {
            const words = bestWords(b, span);
            return (
              <span key={b.kind} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap', font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--job-gold-tag-fg)' }}>
                <NewBestBadge beat={words.beat} />
                {words.headline} · {words.beat}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '1px solid oklch(1 0 0 / 0.08)', paddingTop: 'var(--sp-4)' }}>
        <RecapStat value={String(data.done)} label={data.done === 1 ? 'task done' : 'tasks done'} gold={data.bests.some((b) => b.kind === 'done')} />
        <RecapStat value={share === null ? '–' : `${share}%`} label={share === null ? 'no hours set' : `of ${span(data.available)}`} gold={data.perfect} divided />
        <RecapStat value={String(data.run)} label={data.run === 1 ? 'day in a row' : 'days in a row'} gold={data.bests.some((b) => b.kind === 'run')} divided />
      </div>
    </section>
  );
}

function RecapStat({ value, label, gold, divided }: { value: string; label: string; gold?: boolean; divided?: boolean }) {
  return (
    <div style={{ display: 'grid', gap: 2, minWidth: 0, ...(divided ? { borderLeft: '1px solid oklch(1 0 0 / 0.08)', paddingLeft: 'var(--sp-4)' } : null) }}>
      <b style={{ fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: 'var(--text-2xl)', letterSpacing: '-0.02em', color: gold ? 'var(--job-gold)' : undefined }}>{value}</b>
      <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'oklch(0.70 0.03 280)' }}>{label}</span>
    </div>
  );
}

/**
 * The recap on the Dashboard: from 8pm (his call) until he closes it, and
 * only on a day that held something. Closed is remembered per day on this
 * device, so tomorrow night brings it back.
 */
export function DayRecap() {
  const { today, timeZone } = useWorkDays(todayOnly);
  const closed = useSyncExternalStore(subscribeRecap, readRecapClosed);
  /* `useWorkDays` re-renders on the minute, so 8pm arrives on its own. The
     counting below (bests walk his whole history) waits for it. */
  if (!isRecapTime(new Date(), timeZone) || closed === today) return null;
  return <TonightRecap />;
}

function TonightRecap() {
  const { today, timeZone, days: [day], available: [available] } = useWorkDays(todayOnly);
  const bests = useBests();
  const focusLog = useStore((s) => s.focusLog);
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const runTask = useFocusRun((s) => s.task);
  const segmentStartedAt = useFocusRun((s) => s.segmentStartedAt);
  /* `useWorkDays` re-renders on the minute; this reads that minute. */
  const nowMs = new Date().getTime();

  const data = useMemo<RecapData | null>(() => {
    const worked = day.timer + day.hand;
    const done = finishedToday(backlog, new Date(nowMs), timeZone);
    if (!hasDayToRecap(worked, done)) return null;
    const live = runTask && segmentStartedAt !== null
      ? { taskId: runTask.id, listId: runTask.listId, startedAt: segmentStartedAt, now: nowMs }
      : null;
    const spans = focusSpans(focusLog, today, timeZone, workedJudgeOf(backlog, lists, projects), live);
    const perfect = isPerfectDay(worked, available);
    const fresh = newBests(bests);
    const nowParts = new Date(nowMs).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).split(':').map(Number);
    return {
      dayLabel: new Date(nowMs).toLocaleDateString('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, ''),
      headline: recapHeadline({ worked, available, done, perfect, newBests: fresh.length }),
      worked, available, done, run: bests.run.today, spans,
      nowMinute: nowParts[0] * 60 + nowParts[1], bests: fresh, perfect,
    };
  }, [today, day, available, backlog, lists, projects, focusLog, timeZone, bests, runTask, segmentStartedAt, nowMs]);

  if (!data) return null;
  return (
    <div style={{ marginBottom: 'var(--sp-7)' }}>
      <RecapCard data={data} onClose={() => closeRecap(today)} />
    </div>
  );
}

// ─── Welcome back (idea 110) ────────────────────────────────────────────────

export interface WelcomeData {
  title: string;
  changed: string;
  /** The small task to start with, if there is one. */
  task: { title: string; minutes: number } | null;
}

/** The welcome's words and its two buttons, as drawn on the layer. */
export function WelcomeCard({ data, onStart, onClose }: { data: WelcomeData; onStart?: () => void; onClose?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const motion = useMotion();
  usePlayOnChange(ref, data.title, (el) => {
    [...el.children].forEach((child, i) => {
      child.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 500, delay: i * 420, easing: cubic(motion.ease.glide), fill: 'backwards' },
      );
    });
  });
  const small = data.task && data.task.minutes > 0 && data.task.minutes <= 15;
  const startLabel = data.task ? `Start with “${data.task.title}”` : '';
  return (
    <div ref={ref} data-moment="welcome" style={{ display: 'grid', gap: 'var(--sp-6)', maxWidth: 520 }}>
      <h2 style={{ font: 'var(--weight-light) var(--text-4xl) / 1.08 var(--font-display)', letterSpacing: '-0.04em', margin: 0, color: 'var(--fg-1)', textWrap: 'balance' }}>
        {data.title}
      </h2>
      <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', lineHeight: 1.5, color: 'var(--fg-2)', margin: 0, textWrap: 'pretty' }}>
        {data.changed}
      </p>
      {data.task && (
        <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-2)', margin: 0 }}>
          {small ? `Let's start small: one ${data.task.minutes}-minute task.` : `Let's start with one thing: “${data.task.title}”.`}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        {data.task && (startsBySlide(data.task.minutes) ? (
          <div style={{ flex: '1 1 260px', maxWidth: 360 }}>
            <SlideToStart onConfirm={() => onStart?.()}>Slide to start</SlideToStart>
          </div>
        ) : (
          <GelButton colour="orange" size="lg" onClick={() => { cue('start'); onStart?.(); }} style={{ maxWidth: '100%' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{startLabel}</span>
          </GelButton>
        ))}
        <SoftButton onClick={() => onClose?.()}>Go to my Dashboard</SoftButton>
      </div>
    </div>
  );
}

/** The layer the welcome sits on: the whole screen, before the Dashboard. */
export function WelcomeLayer({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome back"
      style={{
        position: 'fixed', inset: 0, zIndex: Z.panel, display: 'grid', alignContent: 'center',
        padding: 'var(--sp-9) var(--gutter-page-sm)', overflowY: 'auto',
        backgroundColor: 'var(--void-1)',
        backgroundImage: 'radial-gradient(70% 55% at 90% 0%, color-mix(in oklab, var(--job-orange) 14%, transparent), transparent 70%), radial-gradient(60% 50% at 0% 100%, color-mix(in oklab, var(--job-lime) 7%, transparent), transparent 70%)',
        ...style,
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, justifySelf: 'center' }}>{children}</div>
    </div>
  );
}

/**
 * The first open after three or more days away (his call), on this device
 * and in the data alike: it waits for the cloud's copy, so a day spent on the
 * other device is never "away". Shown once — closing it, or starting the task
 * it offers, puts it away until the next long absence.
 */
export function WelcomeBack() {
  const navigate = useNavigate();
  const from = useSyncExternalStore(subscribeCameBack, cameBackFrom);
  const loaded = useSyncExternalStore(subscribeCloudLoaded, cloudMainLoaded);
  const backlog = useStore((s) => s.backlogTasks);
  const focusLog = useStore((s) => s.focusLog);
  const queue = useStore((s) => s.tasks);
  const timeLog = useDashboardStore((s) => s.timeLog);
  const scores = usePriorityScores();
  const runId = useFocusRun((s) => s.task?.id ?? null);
  const runTitle = useFocusRun((s) => s.task?.title ?? null);
  const [confirm, setConfirm] = useState<{ label: string; hint: string } | null>(null);

  const plan = useMemo(() => {
    if (from === null || !loaded) return null;
    const now = new Date(scores.now);
    const timeZone = resolveUserTimeZone();
    const days = daysAway(from, lastActivityAt(backlog, focusLog, timeLog), now, timeZone);
    if (days === null || days < AWAY_DAYS) return { due: false as const };
    const ranked = recommendTasks(backlog, scores.scoreOf, scores.ignored.ids, new Set(), timeZone, 12);
    const task = smallestStart(ranked, taskEstimatedMinutes);
    const words = welcomeWords(days, awayChanges(backlog, from, now, timeZone));
    return { due: true as const, task, data: { ...words, task: task ? { title: task.title, minutes: taskEstimatedMinutes(task) } : null } };
    /* Judged once, on the data as it stood when the cloud arrived: the board
       changing under the open welcome must not rewrite it. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, loaded]);

  const close = useCallback(() => settleCameBack(), []);
  useOverlayDismiss(plan?.due === true, close);
  /* Not away long enough: measure afresh on the next return. */
  const notDue = plan !== null && !plan.due;
  useEffect(() => { if (notDue) settleCameBack(); }, [notDue]);

  if (!plan || !plan.due) return null;

  const start = (task: Task) => {
    const startPlan = planStartNow(useStore.getState().backlogTasks, task.id);
    settleCameBack();
    if (startPlan.kind === 'start') startQueue(startPlan.queue, navigate);
  };
  const pressStart = () => {
    if (!plan.task) return;
    const aside = setAside(plan.task.id, runTitle, runId, queue);
    if (aside) setConfirm(aside);
    else start(plan.task);
  };

  return (
    <WelcomeLayer>
      {confirm && plan.task ? (
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{confirm.label}</span>
          <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{confirm.hint}</span>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <GelButton colour="orange" size="md" onClick={() => start(plan.task!)}>Start</GelButton>
            <SoftButton onClick={() => setConfirm(null)}>Keep it</SoftButton>
          </div>
        </div>
      ) : (
        <WelcomeCard data={plan.data} onStart={pressStart} onClose={close} />
      )}
    </WelcomeLayer>
  );
}

// ─── Special days (idea 109) ────────────────────────────────────────────────

/** Each day's ground: dark, and a trace of its colour. */
const DAY_GROUND: Record<SpecialDay['kind'], string> = {
  birthday: 'color-mix(in oklab, var(--job-rose) 16%, var(--void-1))',
  diwali: 'color-mix(in oklab, var(--job-orange) 13%, var(--void-1))',
  'new-year': 'color-mix(in oklab, var(--job-indigo) 15%, var(--void-1))',
  base: 'color-mix(in oklab, var(--job-emerald) 14%, var(--void-1))',
};

function Balloon({ x, y, colour, s }: { x: number; y: number; colour: string; s: number }) {
  return (
    <svg style={{ position: 'absolute', right: `${x}%`, top: y }} width={34 * s} height={70 * s} viewBox="0 0 34 70" aria-hidden="true">
      <path d="M17 44 C16 52 19 58 16 69" fill="none" stroke="oklch(1 0 0 / .4)" strokeWidth="1" />
      <ellipse cx="17" cy="22" rx="15" ry="19" style={{ fill: colour }} />
      <ellipse cx="11" cy="14" rx="4" ry="6" fill="oklch(1 0 0 / .35)" />
      <path d="M14 41 L20 41 L17 45 Z" style={{ fill: colour }} />
    </svg>
  );
}

function Diya({ x, s }: { x: number; s: number }) {
  return (
    <svg style={{ position: 'absolute', right: `${x}%`, bottom: 12 }} width={46 * s} height={50 * s} viewBox="0 0 46 50" aria-hidden="true">
      <ellipse cx="23" cy="26" rx="10" ry="16" style={{ fill: 'color-mix(in oklab, var(--job-gold) 35%, transparent)' }} />
      <path d="M23 12 C28 22 28 28 23 32 C18 28 18 22 23 12 Z" style={{ fill: 'var(--job-gold)' }} />
      <path d="M4 34 H42 C40 44 32 48 23 48 C14 48 6 44 4 34 Z" style={{ fill: 'var(--job-orange)' }} />
      <path d="M4 34 H42" strokeWidth="2" style={{ stroke: 'var(--job-gold)' }} />
    </svg>
  );
}

function Sparkle({ x, y, colour }: { x: number; y: number; colour: string }) {
  return (
    <svg style={{ position: 'absolute', right: `${x}%`, top: y }} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 C12.7 8 16 11.3 22 12 C16 12.7 12.7 16 12 22 C11.3 16 8 12.7 2 12 C8 11.3 11.3 8 12 2 Z" style={{ fill: colour }} />
    </svg>
  );
}

/** The day's picture, at the right of the greeting. Pops in once, then sits still. */
export function SpecialDayArt({ special }: { special: SpecialDay }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayOnChange(ref, special.kind, (el) => {
    [...el.children].forEach((child, i) => {
      child.animate(
        [{ transform: 'translateY(16px) scale(.8)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 550, delay: i * 70, easing: 'cubic-bezier(.34,1.4,.64,1)', fill: 'backwards' },
      );
    });
  });
  let art: ReactNode;
  if (special.kind === 'birthday') {
    art = (
      <>
        <Balloon x={22} y={18} colour="var(--job-rose)" s={0.9} />
        <Balloon x={12} y={36} colour="var(--job-gold)" s={0.8} />
        <Balloon x={3} y={12} colour="var(--job-sky)" s={0.85} />
      </>
    );
  } else if (special.kind === 'diwali') {
    art = (
      <>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(60% 70% at 85% 100%, color-mix(in oklab, var(--job-orange) 32%, transparent), transparent)' }} />
        <Diya x={26} s={1} />
        <Diya x={14} s={0.8} />
        <Diya x={2} s={1} />
      </>
    );
  } else if (special.kind === 'new-year') {
    art = (
      <>
        <Sparkle x={26} y={20} colour="var(--job-gold)" />
        <Sparkle x={12} y={52} colour="var(--job-sky)" />
        <Sparkle x={4} y={16} colour="var(--job-rose)" />
        <Sparkle x={20} y={90} colour="var(--job-lime)" />
        <Sparkle x={6} y={100} colour="var(--job-violet)" />
      </>
    );
  } else {
    art = (
      <span style={{ position: 'absolute', right: 20, top: 8, font: '200 96px / 1 var(--font-numeric)', letterSpacing: '-0.05em', color: 'color-mix(in oklab, var(--job-emerald) 55%, transparent)' }}>
        {special.years}
      </span>
    );
  }
  return (
    <div ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {art}
    </div>
  );
}

/**
 * The greeting dressed for the day: a rounded panel in the day's colour with
 * its picture on the right, the day named small above the big line. The date
 * chip stays below it, as on any day.
 */
export function SpecialGreeting({ special, kicker, line, children }: { special: SpecialDay; kicker: string; line: string; children?: ReactNode }) {
  return (
    <div
      data-special-day={special.kind}
      style={{
        position: 'relative', overflow: 'hidden', display: 'grid', gap: 'var(--sp-3)', alignContent: 'end',
        minHeight: 150, boxSizing: 'border-box', padding: 'var(--sp-7) var(--sp-7) var(--sp-6)',
        borderRadius: 'var(--r-lg)', backgroundColor: DAY_GROUND[special.kind], boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <SpecialDayArt special={special} />
      <span style={{ position: 'relative', font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{kicker}</span>
      <h1
        style={{
          position: 'relative', maxWidth: '66%', margin: 0,
          font: 'var(--weight-light) var(--text-3xl) / 1.08 var(--font-display)', letterSpacing: '-0.035em', color: 'var(--fg-1)',
          textWrap: 'balance',
        }}
      >
        {line}
      </h1>
      {children && <div style={{ position: 'relative' }}>{children}</div>}
    </div>
  );
}

