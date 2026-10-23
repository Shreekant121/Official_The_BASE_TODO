/**
 * The Dashboard's first five blocks (BIG-6, 29-1a) — every one of them drawn
 * from data the app already has. What each says is `lib/dashboard/blockData.ts`
 * (pure, tested); this file is only how it looks.
 *
 * A block is told the size it is drawn at (`w` × `h` cells) and lays itself
 * out for it: a 1×1 is a number and a line, and each size up earns a list.
 */
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { GelButton, Icon, type IconName, LitLine, NewBestBadge, PulseSquares, SoftButton, SoftIconButton, StatusPill, useMotion } from '../../ui';
import { useStore, taskEstimatedMinutes, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useUIStore } from '../../store/useUIStore';
import { useFocusRun } from '../../store/useFocusRun';
import { resolveUserTimeZone, parseStoredDate, toZonedDayString } from '../../lib/agent/dates';
import { useDashDayOr } from '../../store/useDashDay';
import { dayPhrase, dayWord } from '../../lib/dashboard/weekStrip';
import { planStartNow } from '../../lib/smartStart';
import { readDue } from '../../lib/dueDate';
import { warmthColour } from '../../lib/warmth';
import { bestWords } from '../../lib/stats';
import { useBests } from '../../lib/dashboard/todayHours';
import { setAside, startQueue } from '../task-fields/startNowMenu';
import {
  agoPhrase, busiestProject, finishedOn, formatMinutes, nextDeadline, overdueHeat, overdueTasks, passedOnToday, projectProgress,
  recommendTasks, tasksOnDay,
} from '../../lib/dashboard/blockData';
import type { DashboardBlock } from '../../lib/dashboard/layout';
import { eveningPatch, isEvening } from '../../lib/dashboard/timeline';
import { useCoverSrc } from '../../lib/covers/coverCache';
import { BigNumber, BlockIconButton, BlockStart, BlockTitle, HatchedBar, LimeTag, StepDots } from './parts';
import { useBlockLook, useBlockMood } from './blockContext';
import { cubic, usePlayOnChange } from './motionOnce';
import { dustAttr } from '../../lib/dust';
import { peekAttr } from '../../lib/peek';
import { dragRefusal, refusalWords } from '../../lib/calendar/snapDrag';
import { shownTimeline, useTimelineDrop } from '../../store/useTimelineDrop';
import { useEventStore } from '../../store/useEventStore';
import ProjectIcon from '../ProjectIcon';
import { buildProjectTree } from '../../lib/projectTree';
import { HEALTH_PILL, useProjectPulse } from '../project/useProjectPulse';

export interface BlockProps {
  block: DashboardBlock;
  /** Drawn size, in cells — already narrowed to the screen's columns. */
  w: number;
  h: number;
  onOpenTask: (task: Task) => void;
  onOpenOverdue: () => void;
  /** 29-1b's two sheets, opened by the page so they sit over everything. */
  onOpenSheet: (sheet: DashSheet) => void;
  /** Draws any block — how a Stack (29-1P13) draws its pages without importing the registry. */
  renderBlock: (block: DashboardBlock, w: number, h: number) => ReactNode;
}

export type DashSheet = 'hours' | 'log-time';

const EMPTY: ReadonlySet<string> = new Set();

function useTimeZone(): string {
  return useMemo(() => resolveUserTimeZone(), []);
}

/** "Due 18:00", "Due tomorrow 09:00", "Due Fri 12 Oct". */
function dueLabel(deadline: string | undefined, now: Date, timeZone: string): string | null {
  const at = parseStoredDate(deadline, timeZone);
  if (!at) return null;
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone });
  const time = at.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(at) === day(now)) return `Due ${time}`;
  if (day(at) === day(tomorrow)) return `Due tomorrow ${time}`;
  return `Due ${at.toLocaleDateString('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' })}`;
}

/** "18:00" — a row's time on a day the block is already named for. */
function clockOf(deadline: string | undefined, timeZone: string): string | null {
  const at = parseStoredDate(deadline, timeZone);
  return at ? at.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : null;
}

/** The One Thing hero's picture — a component so the pointer can resolve below the block's early returns. */
function HeroCover({ imageUrl }: { imageUrl: string }) {
  const src = useCoverSrc(imageUrl);
  return src ? (
    <img
      src={src}
      alt=""
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
    />
  ) : null;
}

function useProjectOf(): (task: Task) => { name: string; imageUrl?: string } | null {
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  return useMemo(() => {
    const listProject = new Map(lists.map((l) => [l.id, l.projectId]));
    const byId = new Map(projects.map((p) => [p.id, p]));
    return (task: Task) => {
      const id = task.listId ? listProject.get(task.listId) : undefined;
      const p = id ? byId.get(id) : undefined;
      return p ? { name: p.name, imageUrl: p.imageUrl } : null;
    };
  }, [lists, projects]);
}

const Muted = ({ children }: { children: ReactNode }) => (
  <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{children}</span>
);

// ─── Do this one thing ──────────────────────────────────────────────────────

export function OneThingBlock({ w, h, onOpenTask }: BlockProps) {
  const navigate = useNavigate();
  const backlog = useStore((s) => s.backlogTasks);
  const queue = useStore((s) => s.tasks);
  const scores = usePriorityScores();
  const notNow = useDashboardStore((s) => s.notNow);
  const passOn = useDashboardStore((s) => s.passOn);
  const setHandoff = useUIStore((s) => s.setPaletteHandoff);
  const runId = useFocusRun((s) => s.task?.id ?? null);
  const runTitle = useFocusRun((s) => s.task?.title ?? null);
  const projectOf = useProjectOf();
  const tz = useTimeZone();
  const now = new Date(scores.now);

  /* "Show them again" after passing on everything: this view only; the
     presses stay recorded for BIG-8. */
  const [showPassed, setShowPassed] = useState(false);
  const passed = useMemo(
    () => (showPassed ? EMPTY : passedOnToday(notNow, new Date(scores.now), tz)),
    [showPassed, notNow, scores.now, tz],
  );
  const recs = useMemo(
    () => recommendTasks(backlog, scores.scoreOf, scores.ignored.ids, passed, tz, 4),
    [backlog, scores, passed, tz],
  );
  const [head, ...next] = recs;
  const [confirm, setConfirm] = useState<{ label: string; hint: string } | null>(null);
  useBlockMood(head ? 'needs' : 'quiet');

  const askAtlas = () => {
    setHandoff({ kind: 'ask', text: 'Look at my board and tell me what to do today, and in what order.' });
    navigate('/chat');
  };

  if (!head) {
    return (
      <div style={{ display: 'grid', alignContent: 'center', justifyItems: 'start', gap: 'var(--sp-5)', height: '100%' }}>
        <BlockTitle icon="target">Do this one thing</BlockTitle>
        <span style={{ font: 'var(--weight-light) var(--text-2xl) / 1.15 var(--font-display)', color: 'var(--fg-1)' }}>
          {passed.size > 0 ? 'You passed on everything for today.' : 'Nothing is ready to start.'}
        </span>
        {/* 29-1P14c: his approved words, the key ones lit. */}
        <Muted>
          <LitLine
            text={passed.size > 0
              ? 'Everything you said **“not now”** to comes back **tomorrow**.'
              : 'Every open task is **waiting on something**, or there’s **nothing open**.'}
          />
        </Muted>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {passed.size > 0 && (
            <SoftButton onClick={() => setShowPassed(true)}>Show them again</SoftButton>
          )}
          <SoftButton className="ds-ask" icon={<Icon name="sparkles" size={15} />} onClick={askAtlas}>
            Ask Atlas about my day
          </SoftButton>
        </div>
      </div>
    );
  }

  const project = projectOf(head);
  const cover = head.imageUrl ?? project?.imageUrl;
  const start = () => {
    const plan = planStartNow(useStore.getState().backlogTasks, head.id);
    if (plan.kind === 'start') startQueue(plan.queue, navigate);
  };
  const pressStart = () => {
    const aside = setAside(head.id, runTitle, runId, queue);
    if (aside) setConfirm(aside);
    else start();
  };
  const facts = [
    project?.name,
    formatMinutes(taskEstimatedMinutes(head)),
    dueLabel(head.deadline, now, tz),
  ].filter(Boolean).join('  ·  ');
  const wideLayout = w >= 3 && next.length > 0;
  const titleSize = w >= 3 || h >= 3 ? 'var(--text-4xl)' : 'var(--text-3xl)';

  /* The whole hero opens the task for a finger or a mouse; the title is the
     button a keyboard reaches, so no button sits inside another. */
  const hero = (
    <div
      {...peekAttr(head.id)}
      onClick={() => onOpenTask(head)}
      style={{
        position: 'relative', overflow: 'hidden', flex: wideLayout ? '1 1 60%' : '1 1 auto', minHeight: 0,
        display: 'grid', alignContent: 'space-between', gap: 'var(--sp-5)',
        padding: 'var(--sp-7)', borderRadius: 'var(--r-lg)', cursor: 'pointer',
        backgroundColor: 'oklch(0.16 0.01 50)',
      }}
    >
      {cover ? (
        <>
          <HeroCover imageUrl={cover} />
          {/* Darkened under the words — his call: the cover, readable. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'linear-gradient(180deg, oklch(0.10 0.01 50 / 0.35) 0%, oklch(0.08 0.01 50 / 0.72) 55%, oklch(0.06 0.01 50 / 0.92) 100%)',
            }}
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              'radial-gradient(90% 70% at 85% 0%, oklch(0.70 0.19 45 / 0.28), transparent 65%), radial-gradient(70% 60% at 0% 100%, oklch(0.74 0.165 162 / 0.14), transparent 70%)',
          }}
        />
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <LimeTag>Do this one thing</LimeTag>
        <span style={{ flex: 1 }} />
        <BlockIconButton label="Ask Atlas about my day" icon="sparkles" size="md" className="ds-ask" onClick={askAtlas} />
      </div>
      <div style={{ position: 'relative', display: 'grid', gap: 'var(--sp-4)', minWidth: 0 }}>
        <button
          type="button"
          /* The hero's own peek: holding the title is holding the task. */
          {...peekAttr(head.id)}
          onClick={(e) => { e.stopPropagation(); onOpenTask(head); }}
          style={{
            border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', backgroundColor: 'transparent',
            font: `var(--weight-light) ${titleSize} / 1.02 var(--font-display)`, letterSpacing: '-0.035em',
            color: 'oklch(0.98 0.005 60)', textWrap: 'balance',
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {head.title}
        </button>
        {facts && <span style={{ font: 'var(--type-label)', color: 'oklch(0.85 0.01 60)' }}>{facts}</span>}
        {confirm ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-5)', borderRadius: 'var(--r-md)',
              backgroundColor: 'oklch(0.12 0.01 50 / 0.85)', boxShadow: 'var(--glass-rim-1)',
            }}
          >
            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{confirm.label}</span>
            <Muted>{confirm.hint}</Muted>
            <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', marginTop: 'var(--sp-2)' }}>
              <GelButton colour="orange" size="md" onClick={() => { setConfirm(null); start(); }}>Start</GelButton>
              <SoftButton onClick={() => setConfirm(null)}>Keep it</SoftButton>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap', marginTop: 'var(--sp-2)' }}>
            <BlockStart minutes={taskEstimatedMinutes(head)} onStart={pressStart} />
            <SoftButton onClick={(e) => { e.stopPropagation(); passOn(head.id); }}>
              Not now
            </SoftButton>
          </div>
        )}
      </div>
    </div>
  );

  /* One column wide, the hero needs two rows to itself: "Then" joins it at three.
     Stacked under the hero, it steps aside while "Replace today's queue?" is
     asking: the question is taller than the Start row, and its own Start was
     cut off below the hero's edge (found at 29-1P2). Beside the hero it stays. */
  const upNext = next.length > 0 && (wideLayout || h >= 3 || (w >= 2 && h >= 2)) && (wideLayout || !confirm) && (
    <div style={{ flex: wideLayout ? '1 1 40%' : '0 0 auto', minWidth: 0 }}>
      <ThenStack tasks={next} onOpenTask={onOpenTask} projectOf={projectOf} upward={!wideLayout} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: wideLayout ? 'row' : 'column', gap: 'var(--sp-5)', height: '100%', minHeight: 0 }}>
      {hero}
      {upNext}
    </div>
  );
}

/**
 * Idea 85, next tasks in a stack (29-1P13): what comes after the one thing,
 * as cards in Apple Wallet — the next on top, the one after peeking out
 * behind it. A tap fans them into a list; a card in the list opens its task;
 * "Stack" puts them back. The cards move on a transition, once per tap, and
 * sit still (rule 1); a transition, not a keyframe, so a kept screen shown
 * again does not replay it.
 *
 * Under the hero (`upward`) the list fans **up over it** rather than pushing
 * it: grown downward it squeezed the hero until its Start was cut off.
 */
const CARD_H = 52;
const CARD_GAP = 6;
const PEEK = 9;

export function ThenStack({ tasks, onOpenTask, projectOf, upward }: {
  tasks: Task[];
  onOpenTask: (task: Task) => void;
  projectOf: (task: Task) => { name: string } | null;
  upward: boolean;
}) {
  const [fanned, setFanned] = useState(false);
  const n = tasks.length;
  const stacked = CARD_H + (n - 1) * PEEK;
  const height = fanned ? n * CARD_H + (n - 1) * CARD_GAP : stacked;
  const grow = 'calc(var(--dur-sheet) * 2) var(--ease-springy)';

  return (
    <div
      style={{
        display: 'grid', alignContent: 'start', gap: 'var(--sp-3)', minWidth: 0,
        position: 'relative', zIndex: 1,
        marginTop: upward && fanned ? stacked - height : 0,
        transition: `margin-top ${grow}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 var(--sp-3)', minHeight: 22 }}>
        <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-3)', textTransform: 'var(--kicker-transform)' as never }}>
          Then
        </span>
        <span style={{ flex: 1 }} />
        {fanned && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFanned(false); }}
            style={{
              border: 0, padding: 0, cursor: 'pointer', backgroundColor: 'transparent',
              font: 'var(--type-caption)', color: 'var(--fg-3)',
            }}
          >
            Stack
          </button>
        )}
      </div>
      <div
        className="dash-then"
        style={{ position: 'relative', height, transition: `height ${grow}` }}
      >
        {tasks.map((t, i) => {
          const project = projectOf(t)?.name;
          /* Stacked, the later cards sit behind and peek out below, a little
             smaller and dimmer, as a wallet's do. */
          const y = fanned ? i * (CARD_H + CARD_GAP) : i * PEEK;
          const scale = fanned ? 1 : 1 - i * 0.06;
          const top = i === 0;
          return (
            <button
              key={t.id}
              {...dustAttr('task', t.id)}
              {...peekAttr(t.id)}
              type="button"
              className="dash-then-card"
              tabIndex={fanned || top ? 0 : -1}
              aria-hidden={!fanned && !top ? true : undefined}
              aria-label={!fanned && top ? `Then: ${t.title}${n > 1 ? `, and ${n - 1} more. Show them` : ''}` : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (fanned || n === 1) onOpenTask(t);
                else setFanned(true);
              }}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: CARD_H, zIndex: n - i,
                transform: `translateY(${y}px) scale(${scale})`,
                transformOrigin: '50% 100%',
                opacity: fanned ? 1 : 1 - i * 0.3,
                transitionDelay: `${i * 40}ms`,
              }}
            >
              <span style={{ font: '200 var(--text-2xl) / 1 var(--font-numeric)', color: 'var(--fg-3)', width: 22 }}>{i + 2}</span>
              <span style={{ display: 'grid', flex: 1, minWidth: 0, gap: 1 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-1)' }}>{t.title}</span>
                {project && (
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project}
                  </span>
                )}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{formatMinutes(taskEstimatedMinutes(t))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Today ──────────────────────────────────────────────────────────────────

/**
 * How many tasks he finished today, in gold, bumping as each one lands
 * (29-1P4b, idea 41 — the other half of the +1 that floats off every task's
 * tick). Any task, not only today's: the big number under it already says
 * how today's are going. Mounted at nought and hidden, so the first tick of
 * the day bumps it in rather than merely appearing.
 */
function FinishedTally({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(n);
  usePlayOnChange(ref, n, (el, first) => {
    const up = n > prev.current;
    prev.current = n;
    if (first || !up) return;
    el.animate(
      [{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    );
  });
  return (
    <span
      ref={ref}
      title={`${n} ${n === 1 ? 'task' : 'tasks'} finished today`}
      data-finished-today={n}
      style={{
        alignItems: 'center', gap: 4, display: n === 0 ? 'none' : 'inline-flex',
        font: 'var(--type-caption)', fontWeight: 'var(--weight-semi)',
        color: 'var(--job-gold)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Icon name="star" size={13} style={{ color: 'inherit' }} />
      {n} ticked
    </span>
  );
}

/**
 * Since 29-1c3 it shows the day picked on the week strip: that day's tasks,
 * named in its title ("Tomorrow", "Thu 23 Oct"). The moon and a new best are
 * today's alone — "this evening" is tonight, and a best is beaten today.
 *
 * Since 29-2e3c (idea 125), with a Timeline on the Dashboard, a row held
 * still lifts and is carried onto its hours: the quarter under it lights,
 * and let go it is due at that block's end (`TimelineBlock`'s drag, reached
 * through `useTimelineDrop`). With no Timeline a hold peeks, as before.
 */
export function TodayBlock({ h, w, onOpenTask }: BlockProps) {
  const backlog = useStore((s) => s.backlogTasks);
  const scores = usePriorityScores();
  const tz = useTimeZone();
  const now = new Date(scores.now);
  const today = toZonedDayString(now, tz);
  const day = useDashDayOr(today);
  const isToday = day === today;
  const { done, open } = useMemo(
    () => tasksOnDay(backlog, day, tz, scores.ignored.ids),
    [backlog, day, tz, scores.ignored.ids],
  );
  const total = done.length + open.length;
  const ticked = useMemo(() => finishedOn(backlog, day, tz), [backlog, day, tz]);
  /* 29-1P14a, idea 108: more tasks done today than on any day before. */
  const doneBest = useBests().done;
  const beat = isToday && doneBest.isNew ? bestWords(doneBest, (sec) => formatMinutes(sec / 60)).beat : null;
  const rows = h >= 2 ? open.slice(0, h === 2 ? 3 : 7) : [];
  /* A new best keeps it lit: grey would hide the reward (as Hours does). */
  useBlockMood(open.length > 0 ? 'needs' : beat ? 'neutral' : 'quiet');

  /* 29-2e3c: a row is carried onto the Timeline's hours, when there is one. */
  const toTimeline = useTimelineDrop((s) => s.targets.length > 0);
  const [tip, setTip] = useState<{ taskId: string; text: string } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 2200);
    return () => clearTimeout(t);
  }, [tip]);
  const holdRow = (e: ReactPointerEvent<HTMLElement>, task: Task) => {
    const target = shownTimeline(useTimelineDrop.getState().targets);
    if (!target) return;
    target.press(e, {
      taskId: task.id, day: null, start: 0, minutes: taskEstimatedMinutes(task), refusal: dragRefusal(task),
      onRefuse: (why) => {
        const event = useEventStore.getState().events.find((ev) => ev.id === task.eventId);
        setTip({ taskId: task.id, text: refusalWords(why, event?.title) });
      },
    });
  };
  /* The click a carry ends in is no tap on the row. */
  const isTap = () => useTimelineDrop.getState().targets.every((t) => t.isTap());

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-4)', height: '100%', minHeight: 0 }}>
      <BlockTitle
        icon="list-checks"
        trail={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <FinishedTally n={ticked} />
            {beat && <NewBestBadge beat={beat} />}
            {total > 0 && open.length === 0 && <LimeTag>All done</LimeTag>}
          </span>
        }
      >
        {dayWord(day, today)}
      </BlockTitle>
      {total === 0 ? (
        <div style={{ alignSelf: 'center', display: 'grid', gap: 'var(--sp-2)' }}>
          <BigNumber value="0" unit={`due ${dayPhrase(day, today)}`} size="md" tone="var(--fg-3)" />
          {/* 29-1P14c: idea 87's own sentence, his approved pick; another day's
              is idea 40's own, "A free day." (docs/design/words-and-empty-screens.md). */}
          <Muted>
            <LitLine
              text={isToday
                ? 'Nothing due today. **Pick one thing**, give it **an hour**, call it a **good day**.'
                : `Nothing due ${dayPhrase(day, today)}. **A free day.**`}
            />
          </Muted>
        </div>
      ) : (
        <div style={{ alignSelf: rows.length ? 'start' : 'center', display: 'grid', gap: 'var(--sp-4)', minHeight: 0 }}>
          <BigNumber value={done.length} unit={`of ${total} done`} size={w >= 2 ? 'lg' : 'md'} />
          {rows.length > 0 && (
            <div style={{ display: 'grid', gap: 2, minHeight: 0, overflow: 'hidden' }}>
              {rows.map((t, i) => (
                <Fragment key={t.id}>
                  {/* 29-1c2, idea 38: today splits into now and This evening, under rest's moon. */}
                  {isEvening(t.deadline) && !isEvening(rows[i - 1]?.deadline) && (
                    <span className="dash-evening">
                      <Icon name="moon" size={12} />
                      {isToday ? 'This evening' : 'Evening'}
                    </span>
                  )}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--sp-1)', minWidth: 0 }}>
                    <button
                      {...dustAttr('task', t.id)}
                      {...(toTimeline ? { 'data-drag-row': '' } : peekAttr(t.id))}
                      type="button"
                      className="dash-row"
                      style={{ flex: 1, minWidth: 0 }}
                      onPointerDown={toTimeline ? (e) => holdRow(e, t) : undefined}
                      onClick={() => isTap() && onOpenTask(t)}
                    >
                      <span className="dash-row-dot" style={{ width: 8, height: 8, borderRadius: '50%', boxShadow: 'var(--soft-pressed)', flex: '0 0 auto' }} />
                      <span className="dash-row-title" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span className="dash-row-time" style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                        {isToday ? dueLabel(t.deadline, now, tz)?.replace('Due ', '') : clockOf(t.deadline, tz)}
                      </span>
                    </button>
                    {isToday && <EveningToggle task={t} timeZone={tz} />}
                    {tip?.taskId === t.id && <span key={tip.text} className="cal-drag-tip dash-row-tip" role="status">{tip.text}</span>}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}
      {total > 0 && <HatchedBar fraction={done.length / total} />}
    </div>
  );
}

/**
 * Idea 38 (29-1c2): the moon that sends a task to this evening and back. Lit
 * indigo, pressed in, while it is there. Where it lands and what back
 * restores are `eveningPatch`'s (`lib/dashboard/timeline.ts`); it writes
 * through `updateBacklogTask`, so his undo has it and today's queue follows.
 */
function EveningToggle({ task, timeZone }: { task: Task; timeZone: string }) {
  const on = isEvening(task.deadline);
  return (
    <SoftIconButton
      label={on ? 'Back to the day' : 'Do it this evening'}
      size="sm"
      aria-pressed={on}
      style={on ? { color: 'var(--job-indigo)' } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().updateBacklogTask(task.id, eveningPatch(task, new Date(), timeZone));
      }}
    >
      <Icon name="moon" size={15} />
    </SoftIconButton>
  );
}

// ─── Next deadline ──────────────────────────────────────────────────────────

/** Whole minutes while it is more than an hour away; seconds only in the last hour. */
function useCountdownNow(target: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (target === null) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const left = target - t;
      if (left <= 0) return;
      /* A second at a time only in the last hour; otherwise on the next minute. */
      const wait = left <= 3_600_000 ? 1000 - (t % 1000) : 60_000 - (t % 60_000);
      timer = setTimeout(tick, wait);
    };
    tick();
    return () => clearTimeout(timer);
  }, [target]);
  return now;
}

function countdownParts(ms: number): { value: string; unit: string } {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const hh = Math.floor((s % 86_400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (d > 0) return { value: `${d}d ${hh}h`, unit: 'left' };
  if (hh > 0) return { value: `${hh}h ${String(mm).padStart(2, '0')}m`, unit: 'left' };
  return { value: `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, unit: 'left' };
}

export function NextDeadlineBlock({ w, h, onOpenTask }: BlockProps) {
  const backlog = useStore((s) => s.backlogTasks);
  const scores = usePriorityScores();
  const tz = useTimeZone();
  const next = useMemo(
    () => nextDeadline(backlog, new Date(scores.now), tz, scores.ignored.ids),
    [backlog, scores, tz],
  );
  const now = useCountdownNow(next ? next.at.getTime() : null);
  useBlockMood(next ? 'needs' : 'quiet');

  if (!next) {
    return (
      <div style={{ display: 'grid', alignContent: 'space-between', height: '100%' }}>
        <BlockTitle icon="hourglass">Next deadline</BlockTitle>
        <Muted><LitLine text="**No deadlines ahead.** A quiet stretch." /></Muted>
      </div>
    );
  }
  const parts = countdownParts(next.at.getTime() - now);
  /* 29-1P7a (idea 66): the hourglass warms sky to coral as the deadline nears,
     coral on the day — unless he picked the block's look himself. */
  const warmth = readDue(next.task.deadline, new Date(now), tz)?.warmth ?? 0;
  return (
    <div
      {...peekAttr(next.task.id)}
      role="button"
      tabIndex={0}
      onClick={() => onOpenTask(next.task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenTask(next.task); }}
      style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%', cursor: 'pointer' }}
    >
      <GiantGlyph icon="hourglass" h={h} warmth={warmth} />
      {/* Positioned, like the two below, so they paint over the glyph. */}
      <div style={{ position: 'relative' }}><BlockTitle icon="hourglass">Next deadline</BlockTitle></div>
      <BigNumber value={parts.value} size={w >= 2 ? 'lg' : 'md'} style={{ position: 'relative' }} />
      {/* Stops short of the glyph: a title running over it was hard to read. */}
      <span
        style={{
          position: 'relative', font: 'var(--type-body)', color: 'var(--fg-2)', maxWidth: w >= 2 ? '72%' : '60%',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {next.task.title}
      </span>
    </div>
  );
}

/**
 * Idea 86: one huge icon cut off by the block's corner, in the block's colour
 * (sky for a deadline; whatever he tints the block), so the block reads from
 * across the room. Behind everything and never pressed; on a mouse it leans
 * in a little under the pointer (`dashboard.css`). Streak and energy take it
 * when those blocks exist (29-3, step 30).
 */
export function GiantGlyph({ icon, h, warmth }: {
  icon: IconName;
  h: number;
  /** 29-1P7a: a deadline's warmth, sky to coral — drawn only while the block
   *  wears its own glass and sky, so a colour he chose for it still wins. */
  warmth?: number;
}) {
  const { look, colour } = useBlockLook();
  const size = h >= 2 ? 270 : 190;
  const warm = warmth !== undefined && look === 'glass' && colour === 'sky';
  return (
    <span
      aria-hidden="true"
      className="dash-glyph"
      style={{
        color: look === 'full' ? 'var(--fg-1)' : warm ? warmthColour(warmth) : `var(--job-${colour})`,
        opacity: look === 'full' ? 0.22 : 0.8,
        lineHeight: 0,
      }}
    >
      <Icon name={icon} size={size} />
    </span>
  );
}

// ─── Overdue ────────────────────────────────────────────────────────────────

/**
 * OPT-12, his pick of four (2026-10-06): a Snapchat streak in reverse. The
 * block's giant glyph is a flame, and it is as big as the oldest task is
 * late — a spark when it has only just passed, a blaze at a week. It grows
 * once, to its size, on the first draw and again when that size changes; it
 * never flickers (Performance rule 1). With nothing late it says so, Gmail's
 * inbox zero, in done's lime — calm, but not greyed out (his second call).
 */
export function OverdueBlock({ h, w, onOpenOverdue, onOpenTask }: BlockProps) {
  const backlog = useStore((s) => s.backlogTasks);
  const scores = usePriorityScores();
  const tz = useTimeZone();
  const now = new Date(scores.now);
  const pile = useMemo(
    () => overdueTasks(backlog, new Date(scores.now), tz, scores.ignored.ids),
    [backlog, scores, tz],
  );
  const rows = pile.slice(0, h >= 3 ? 6 : h === 2 ? 3 : w >= 2 ? 1 : 0);
  useBlockMood(pile.length > 0 ? 'needs' : 'neutral');

  if (pile.length === 0) {
    return (
      <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-4)', height: '100%' }}>
        <BlockTitle icon="clock">Overdue</BlockTitle>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--weight-light) var(--text-2xl) / 1.1 var(--font-display)', color: 'var(--fg-1)' }}>
              All caught up
            </span>
            <Muted><LitLine text="**Nothing** is late." /></Muted>
          </div>
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 52, height: 52, flex: '0 0 auto', borderRadius: '50%',
              backgroundColor: 'oklch(0.86 0.17 128 / 0.16)', color: 'var(--job-lime)',
            }}
          >
            <Icon name="check" size={26} />
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onOpenOverdue}
      style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 'var(--sp-4)', height: '100%', minHeight: 0, cursor: 'pointer' }}
    >
      <OverdueFlame heat={overdueHeat(pile[0].at, now)} h={h} />
      {/* Positioned, like the two below, so they paint over the flame. */}
      <div style={{ position: 'relative' }}>
        <BlockTitle icon="clock" trail={<BlockIconButton label="See every overdue task" icon="arrow-up-right" onClick={onOpenOverdue} />}>
          Overdue
        </BlockTitle>
      </div>
      <BigNumber value={pile.length} unit="late" size={w >= 2 ? 'lg' : 'md'} style={{ position: 'relative' }} />
      {rows.length > 0 ? (
        /* Stops short of the flame, as Next deadline's title does. */
        <div
          style={{
            position: 'relative', display: 'grid', alignContent: 'start', gap: 2, minHeight: 0, overflow: 'hidden',
            maxWidth: w >= 2 ? '72%' : '64%',
          }}
        >
          {rows.map(({ task, at }) => (
            <button
              key={task.id}
              {...dustAttr('task', task.id)}
              {...peekAttr(task.id)}
              type="button"
              className="dash-row"
              onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--status-deadline)' }}>{agoPhrase(at, now)}</span>
            </button>
          ))}
        </div>
      ) : (
        <span style={{ position: 'relative', alignSelf: 'end' }}>
          <Muted>Oldest burning {agoPhrase(pile[0].at, now)}</Muted>
        </span>
      )}
    </div>
  );
}

/* The glyph's scale at no heat and at full: a spark still reads as a flame,
   and a blaze stops short of the ↗ in the block's corner (measured). */
const SPARK = 0.45;
const BLAZE = 0.8;

function OverdueFlame({ heat, h }: { heat: number; h: number }) {
  const m = useMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const size = SPARK + (BLAZE - SPARK) * heat;
  /* Played per quarter-day, not per render: the clock moves the size a
     hair every minute, which is drawn but not worth a grow. */
  const step = Math.round(heat * 28);
  const shown = useRef<number | null>(null);
  usePlayOnChange(ref, step, (el, first) => {
    el.animate([{ scale: String(first ? size * 0.3 : (shown.current ?? size)) }, { scale: String(size) }], {
      duration: m.dur.sheet * (first ? 3200 : 2200), easing: cubic(m.ease.springy), delay: first ? 260 : 0, fill: 'backwards',
    });
  });
  useEffect(() => { shown.current = size; });
  return (
    <span ref={ref} aria-hidden="true" className="dash-flame" style={{ scale: String(size) }}>
      <GiantGlyph icon="flame" h={h} />
    </span>
  );
}

// ─── Project progress ───────────────────────────────────────────────────────

export function ProjectProgressBlock({ block, w, h }: BlockProps) {
  const navigate = useNavigate();
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const metric = block.settings?.metric ?? 'tasks';
  const chosen = block.settings?.projectId;

  const progress = useMemo(() => {
    const project = (chosen && projects.find((p) => p.id === chosen)) || busiestProject(projects, lists, backlog);
    return project ? projectProgress(project, projects, lists, backlog, metric) : null;
  }, [chosen, projects, lists, backlog, metric]);
  /* 29-1P8b — the same pulse and word as the project's card on Home (his
     call: Home's cards and this block). The word replaces nothing here; it
     sits beside the title, and only while the card would say "In progress". */
  const tree = useMemo(() => buildProjectTree(projects), [projects]);
  const { days: pulse, health } = useProjectPulse(progress?.project.id ?? '', tree, lists, backlog);
  /* Finished, or no project at all: nothing left here (idea 145). */
  useBlockMood(!progress || (progress.total > 0 && progress.done >= progress.total) ? 'quiet' : 'neutral');

  if (!progress) {
    return (
      <div style={{ display: 'grid', alignContent: 'space-between', height: '100%' }}>
        <BlockTitle icon="folder">Project progress</BlockTitle>
        <Muted><LitLine text="No projects yet. Make one on **Home**." /></Muted>
      </div>
    );
  }
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const line =
    metric === 'hours'
      ? `${formatMinutes(progress.done)} of ${formatMinutes(progress.total)}`
      : metric === 'money'
        ? `₹${progress.done.toLocaleString('en-IN')} of ₹${progress.total.toLocaleString('en-IN')}`
        : `${progress.doneTasks} of ${progress.totalTasks} tasks`;
  const second = metric === 'tasks' && progress.totalMinutes > 0
    ? `${formatMinutes(progress.doneMinutes)} of ${formatMinutes(progress.totalMinutes)} estimated`
    : null;
  const dots = metric === 'tasks' && progress.totalTasks > 0 && progress.totalTasks <= 10 && w >= 2;
  const word = progress.doneTasks > 0 && progress.doneTasks < progress.totalTasks ? health : null;
  const pill = word && (
    <StatusPill status={HEALTH_PILL[word.state]} size="sm" title={word.why}>{word.word}</StatusPill>
  );
  const trail = chosen ? pill ?? undefined : (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>{pill}<LimeTag>Busiest</LimeTag></span>
  );
  /* Two cells wide: the squares sit at the right of the number's row, where
     there is room; one cell tall and wide has none, and the pill's
     tooltip carries the why. Taller, the why gets its own line. */
  const squares = w >= 2;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/project/${progress.project.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/project/${progress.project.id}`); }}
      style={{ display: 'grid', gridTemplateRows: 'auto 1fr auto', gap: 'var(--sp-4)', height: '100%', cursor: 'pointer' }}
    >
      <BlockTitle
        glyph={<ProjectIcon project={progress.project} size={30} />}
        trail={trail}
      >
        {progress.project.name}
      </BlockTitle>
      <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <BigNumber value={pct} unit="%" size={w >= 2 || h >= 2 ? 'lg' : 'md'} />
        <div style={{ display: 'grid', gap: 2, paddingBottom: 6 }}>
          <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>{line}</span>
          {second && <Muted>{second}</Muted>}
        </div>
        {squares && <PulseSquares days={pulse} size={12} style={{ marginLeft: 'auto', paddingBottom: 6 }} />}
      </div>
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {dots ? <StepDots done={progress.doneTasks} total={progress.totalTasks} /> : <HatchedBar fraction={pct / 100} />}
        {word && h >= 2 && <Muted>{word.why}</Muted>}
      </div>
    </div>
  );
}
