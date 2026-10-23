/**
 * The Dashboard's three new blocks (29-1P13): the Stack (idea 133), Waiting
 * on (137) and Deadlines on a runway (138). What each says is pure and tested
 * in `lib/dashboard/layout.ts` and `blockData.ts`; this file is how it looks.
 *
 * His calls, 2026-10-06: a Stack starts as the one thing, the hours and today;
 * a name typed on a task's Assignee puts it in Waiting on, beside workers who
 * claimed a task on an outsourcing link; the ✓ there marks the task done; and
 * **no Nudge** until Contacts (step 34) knows how to reach anybody.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, LitLine, SoftIconButton, useMotion } from '../../ui';
import { useStore, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useAuth } from '../../contexts/AuthContext';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import {
  BLOCK_SPECS, stackPageAt, stackPages,
  type DashboardBlock,
} from '../../lib/dashboard/layout';
import {
  daysWaiting, deadlineWarmth, outsourceShareIds, runwayDeadlines, waitingOn, warmthColour,
} from '../../lib/dashboard/blockData';
import { clearSubmission, subscribeSubmissions, type ShareSubmission } from '../../lib/shareSubmissions';
import type { BlockProps } from './blocks';
import { BlockContext, useBlockLook, useBlockMood } from './blockContext';
import { BigNumber, BlockTitle } from './parts';
import { cubic, usePlayOnChange } from './motionOnce';
import { dustAttr } from '../../lib/dust';
import { peekAttr } from '../../lib/peek';

const Muted = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty', ...style }}>
    {children}
  </span>
);


// ─── The Stack (idea 133) ───────────────────────────────────────────────────

/**
 * Several blocks in one spot, scrolled through inside it — iOS's Smart Stack.
 * On its own it turns to the page for the time of day, once when that page's
 * hour comes; a page he scrolled to stays until the next one's hour.
 *
 * A native scroller with snap points, so a finger gets the browser's own
 * momentum and, at either end, hands the swipe on to the page. Each page is
 * the real block, drawn at the stack's size; only the page in view reports
 * its mood to the frame, so the stack goes quiet when what it shows is done.
 */
export function StackBlock(props: BlockProps) {
  const { block, w, h, renderBlock } = props;
  const look = useBlockLook();
  const pages = useMemo(() => stackPages(block), [block]);
  const pagesKey = pages.map((p) => `${p.kind}@${p.from}`).join(',');
  const hour = useHourOfDay(pages.map((p) => p.from));
  const slot = stackPageAt(pages, hour);

  const scroller = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(slot);

  /* Turn to the time's page when it changes — never on the way back to the
     screen (a kept screen's effects re-run on every return, and the browser
     keeps the scroll), so the page it last turned for is remembered. Instant
     the first time, gliding after. A page is the scroller's height, and that
     comes from an observer, whose answer arrives after layout — so opening
     the Dashboard reads no layout to place the stack (rule 6). */
  const pageH = useRef(0);
  const turnedFor = useRef<string | null>(null);
  const key = `${slot}|${pagesKey}`;
  const want = useRef({ slot, key });
  const turnNow = useCallback(() => {
    const el = scroller.current;
    const { slot: to, key: k } = want.current;
    if (!el || pageH.current === 0 || turnedFor.current === k) return;
    const first = turnedFor.current === null;
    turnedFor.current = k;
    el.scrollTo({ top: to * pageH.current, behavior: first ? 'instant' : 'smooth' });
    setCurrent(to);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      /* Hidden with the screen, it measures nothing; keep the last height. */
      if (entry.contentRect.height === 0) return;
      pageH.current = entry.contentRect.height;
      turnNow();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [turnNow]);
  useEffect(() => {
    want.current = { slot, key };
    turnNow();
  }, [slot, key, turnNow]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || pageH.current === 0) return;
    const i = Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollTop / pageH.current)));
    if (i !== current) setCurrent(i);
  };
  const goTo = (i: number) => scroller.current?.scrollTo({ top: i * pageH.current, behavior: 'smooth' });

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <div
        ref={scroller}
        className="dash-stack ag-scroll"
        onScroll={onScroll}
        aria-roledescription="stack"
      >
        {pages.map((p, i) => {
          const page: DashboardBlock = { id: `${block.id}:${i}`, kind: p.kind, w, h };
          const active = i === current;
          return (
            <section
              key={`${p.kind}@${p.from}`}
              className="dash-stack-page"
              aria-label={`${BLOCK_SPECS[p.kind].title}, from ${String(p.from).padStart(2, '0')}:00`}
              inert={!active || undefined}
              style={{ padding: p.kind === 'one-thing' ? 'var(--sp-3) 30px var(--sp-3) var(--sp-3)' : 'var(--sp-7) 34px var(--sp-7) var(--sp-7)' }}
            >
              <BlockContext.Provider value={{ ...look, setMood: active ? look.setMood : null }}>
                {renderBlock(page, w, h)}
              </BlockContext.Provider>
            </section>
          );
        })}
      </div>
      {pages.length > 1 && (
        <div className="dash-stack-dots" role="tablist" aria-label="Pages">
          {pages.map((p, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={BLOCK_SPECS[p.kind].title}
              title={`${BLOCK_SPECS[p.kind].title} · from ${String(p.from).padStart(2, '0')}:00`}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
            >
              <i />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The hour of the day, re-read only when one of `marks` arrives — a timer set
 * for the next page's hour, never a tick (rule 1).
 */
function useHourOfDay(marks: number[]): number {
  const [hour, setHour] = useState(() => new Date().getHours());
  const key = marks.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = new Date();
      setHour(now.getHours());
      const hours = key ? key.split(',').map(Number) : [];
      /* The next mark today, or the first one tomorrow. */
      const next = hours.find((m) => m > now.getHours()) ?? (hours.length ? hours[0] + 24 : now.getHours() + 24);
      const at = new Date(now);
      at.setHours(next, 0, 0, 50);
      timer = setTimeout(arm, Math.max(1000, at.getTime() - now.getTime()));
    };
    arm();
    return () => clearTimeout(timer);
  }, [key]);
  return hour;
}

// ─── Waiting on people (idea 137) ───────────────────────────────────────────

interface WaitRow {
  key: string;
  task: Task;
  who: string;
  since: number | null;
  /** On an outsourcing link: the claim behind it, which the ✓ clears. */
  claim?: { shareId: string; state: ShareSubmission['state'] };
}

/** Every worker's claim on every outsourcing link he has out, live. */
function useOutsourcedClaims(): { shareId: string; sub: ShareSubmission }[] {
  const projects = useStore((s) => s.projects);
  const lists = useStore((s) => s.taskLists);
  const backlog = useStore((s) => s.backlogTasks);
  const idsKey = useMemo(() => outsourceShareIds(projects, lists, backlog).join(','), [projects, lists, backlog]);
  const [byShare, setByShare] = useState<Record<string, ShareSubmission[]>>({});
  useEffect(() => {
    if (!idsKey) return;
    const unsubs = idsKey.split(',').map((sid) =>
      subscribeSubmissions(sid, (subs) => setByShare((prev) => ({ ...prev, [sid]: subs }))),
    );
    return () => unsubs.forEach((u) => u());
  }, [idsKey]);
  return useMemo(() => {
    const out: { shareId: string; sub: ShareSubmission }[] = [];
    for (const sid of idsKey ? idsKey.split(',') : []) {
      for (const sub of byShare[sid] ?? []) {
        if (sub.state === 'in_progress' || sub.state === 'submitted') out.push({ shareId: sid, sub });
      }
    }
    return out;
  }, [byShare, idsKey]);
}

export function WaitingOnBlock({ h, onOpenTask }: BlockProps) {
  const { user } = useAuth();
  const backlog = useStore((s) => s.backlogTasks);
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const scores = usePriorityScores();
  const claims = useOutsourcedClaims();

  const rows = useMemo<WaitRow[]>(() => {
    const named = waitingOn(backlog, user?.uid ?? null, scores.ignored.ids)
      .map((r) => ({ key: r.task.id, task: r.task, who: r.who, since: r.since }));
    const seen = new Set(named.map((r) => r.task.id));
    const byId = new Map(backlog.map((t) => [t.id, t]));
    const claimed: WaitRow[] = [];
    for (const { shareId, sub } of claims) {
      const task = byId.get(sub.taskId);
      if (!task || task.status === 'completed' || seen.has(task.id) || scores.ignored.ids.has(task.id)) continue;
      seen.add(task.id);
      claimed.push({ key: `${shareId}:${task.id}`, task, who: sub.workerName || 'A worker', since: sub.updatedAt, claim: { shareId, state: sub.state } });
    }
    return [...named, ...claimed].sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity));
  }, [backlog, user?.uid, scores.ignored.ids, claims]);

  useBlockMood(rows.length === 0 ? 'quiet' : 'neutral');
  const people = new Set(rows.map((r) => r.who)).size;
  const shown = rows.slice(0, h >= 3 ? 6 : h === 2 ? 3 : 0);

  const arrived = (row: WaitRow) => {
    /* The one completion path, so a repeating task still repeats; it stamps
       `completedAt` itself. */
    updateBacklogTask(row.task.id, { status: 'completed' });
    if (row.claim) void clearSubmission(row.claim.shareId, row.task.id).catch(() => { /* the task is done; a stale claim only lingers on the link */ });
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 'var(--sp-4)', height: '100%', minHeight: 0 }}>
      <BlockTitle icon="users" trail={rows.length > 0 ? <Muted>{people === 1 ? '1 person' : `${people} people`}</Muted> : undefined}>
        Waiting on
      </BlockTitle>
      {rows.length === 0 ? (
        <>
          <BigNumber value="0" unit="waiting" size="md" tone="var(--fg-3)" />
          <Muted><LitLine text="**Nobody** is holding anything of yours. Put a name in a task’s **Assignee** and it shows here." /></Muted>
        </>
      ) : shown.length === 0 ? (
        <>
          <BigNumber value={rows.length} unit={rows.length === 1 ? 'task out' : 'tasks out'} size="md" />
          <Muted>
            Longest: {rows[0].who}
            {rows[0].since !== null && `, ${daysWaiting(rows[0].since, scores.now)}d`}
          </Muted>
        </>
      ) : (
        <>
          <span />
          <div style={{ display: 'grid', alignContent: 'start', gap: 2, minHeight: 0, overflow: 'hidden' }}>
            <AnimatePresence initial={false}>
              {shown.map((row) => (
                <WaitingRowView key={row.key} row={row} now={scores.now} onOpen={() => onOpenTask(row.task)} onArrived={() => arrived(row)} />
              ))}
            </AnimatePresence>
            {rows.length > shown.length && <Muted style={{ padding: '0 var(--sp-3)' }}>and {rows.length - shown.length} more</Muted>}
          </div>
        </>
      )}
    </div>
  );
}

function WaitingRowView({ row, now, onOpen, onArrived }: { row: WaitRow; now: number; onOpen: () => void; onArrived: () => void }) {
  const m = useMotion();
  const days = row.since !== null ? daysWaiting(row.since, now) : null;
  /* The count warms the longer it goes: grey under three days, coral by a week. */
  const warmth = days === null ? 0 : Math.max(0, Math.min(1, (days - 2) / 5));
  return (
    <motion.div
      {...dustAttr('task', row.task.id)}
      layout="position"
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: m.dur.sheet * 1.4, ease: m.ease.glide }}
      className="dash-wait"
    >
      <button type="button" className="dash-row" {...peekAttr(row.task.id)} onClick={(e) => { e.stopPropagation(); onOpen(); }} style={{ flex: 1, minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30, flex: '0 0 auto', borderRadius: '50%',
            backgroundImage: 'var(--soft-fill)', boxShadow: 'var(--soft-raised)',
            font: 'var(--type-label)', color: 'var(--fg-2)',
          }}
        >
          {row.who === 'Another account' ? <Icon name="user-circle" size={15} /> : row.who.charAt(0).toUpperCase()}
        </span>
        <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.who}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.task.title}
            {row.claim && (row.claim.state === 'submitted' ? ' · sent back for review' : ' · on your link')}
          </span>
        </span>
        {days !== null && (
          <span
            title={`Waiting ${days === 1 ? '1 day' : `${days} days`}`}
            style={{
              flex: '0 0 auto', padding: '2px var(--sp-3)', borderRadius: 'var(--r-2xs)',
              font: 'var(--type-caption)', fontWeight: 'var(--weight-medium)', fontVariantNumeric: 'tabular-nums',
              color: warmth > 0 ? `color-mix(in oklch, var(--job-coral) ${Math.round(warmth * 100)}%, var(--fg-3))` : 'var(--fg-3)',
              backgroundColor: warmth > 0
                ? `color-mix(in oklch, var(--job-coral) ${Math.round(6 + warmth * 16)}%, transparent)`
                : 'oklch(1 0 0 / 0.06)',
            }}
          >
            {days === 0 ? 'today' : `${days}d`}
          </span>
        )}
      </button>
      <SoftIconButton
        size="sm"
        label={`It arrived: mark “${row.task.title}” done`}
        title="It arrived: mark done"
        onClick={(e) => { e.stopPropagation(); onArrived(); }}
        style={{ flex: '0 0 auto', color: 'var(--job-lime)' }}
      >
        <Icon name="check" size={15} />
      </SoftIconButton>
    </motion.div>
  );
}

// ─── Deadlines on a runway (idea 138) ───────────────────────────────────────

const RANGE_DAYS = 14;
const BIN_W = 58;
const LANE_H = 24;
/** A pill's widest, which is how far apart two must be to share a lane. */
const PILL_MAX = 132;

export function RunwayBlock({ w, h, onOpenTask, onOpenOverdue }: BlockProps) {
  const backlog = useStore((s) => s.backlogTasks);
  const scores = usePriorityScores();
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const m = useMotion();

  /* The lane's width, from an observer (its answer arrives after layout, so
     the way in reads nothing — rule 6); until then a guess from the size. */
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneW, setLaneW] = useState(() => Math.max(160, w * 230 - BIN_W));
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setLaneW(entry.contentRect.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = h >= 3 ? 12 : h === 2 ? 8 : 3;
  const runway = useMemo(
    () => runwayDeadlines(backlog, new Date(scores.now), tz, scores.ignored.ids, {
      days: RANGE_DAYS, lanes, gapDays: (RANGE_DAYS * (PILL_MAX + 6)) / laneW,
    }),
    [backlog, scores, tz, lanes, laneW],
  );
  useBlockMood(runway.items.length === 0 && runway.overdue === 0 ? 'quiet' : 'neutral');

  /* The pills taxi in from the far end on the first open only (motionOnce). */
  usePlayOnChange(laneRef, 'arrived', (el) => {
    el.querySelectorAll<HTMLElement>('.dash-pill').forEach((pill, i) => {
      pill.animate([{ translate: '60px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }], {
        duration: m.dur.sheet * 2600, easing: cubic(m.ease.glide), delay: 120 + i * 50, fill: 'backwards',
      });
    });
  });

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 'var(--sp-4)', height: '100%', minHeight: 0 }}>
      <BlockTitle
        icon="flag-triangle-right"
        trail={runway.hidden > 0 ? <Muted>+{runway.hidden} more</Muted> : undefined}
      >
        Next two weeks
      </BlockTitle>
      <div style={{ display: 'flex', gap: 0, minHeight: 0 }}>
        {/* The overdue box: whatever has crossed the line. */}
        <button
          type="button"
          className="dash-soft"
          onClick={(e) => { e.stopPropagation(); onOpenOverdue(); }}
          aria-label={`${runway.overdue} overdue. See them`}
          style={{
            flex: `0 0 ${BIN_W - 10}px`, marginRight: 10, alignSelf: 'stretch', border: 0, cursor: 'pointer',
            display: 'grid', placeItems: 'center', alignContent: 'center', gap: 2, padding: 0,
            borderRadius: 'var(--r-sm)', backgroundImage: 'var(--soft-fill)',
            color: runway.overdue ? 'var(--job-coral)' : 'var(--fg-4)',
          }}
        >
          <span style={{ font: '200 var(--text-2xl) / 1 var(--font-numeric)' }}>{runway.overdue}</span>
          <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-2xs, 10px)', color: 'var(--fg-3)' }}>overdue</span>
        </button>

        <div ref={laneRef} className="dash-runway" style={{ ['--lanes' as string]: lanes }}>
          {/* Today's line, lime (today), and the week marks. */}
          <span className="dash-runway-now" aria-hidden="true" />
          {[7, 14].map((d) => (
            <span key={d} className="dash-runway-mark" aria-hidden="true" style={{ left: `${(d / RANGE_DAYS) * 100}%` }} />
          ))}
          {runway.items.length === 0 && (
            <Muted style={{ position: 'absolute', left: 14, top: 0 }}><LitLine text="Nothing is due in **the next two weeks**." /></Muted>
          )}
          {runway.items.map((item) => {
            const warmth = deadlineWarmth(item.days, RANGE_DAYS);
            const colour = warmthColour(warmth);
            return (
              <button
                key={item.task.id}
                {...dustAttr('task', item.task.id)}
                {...peekAttr(item.task.id)}
                type="button"
                className="dash-pill"
                onClick={(e) => { e.stopPropagation(); onOpenTask(item.task); }}
                title={`${item.task.title} · ${item.at.toLocaleString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`}
                style={{
                  top: item.lane * LANE_H,
                  /* Never past the far end: the last days' pills sit flush with it. */
                  left: `min(${((item.days / RANGE_DAYS) * 100).toFixed(3)}%, calc(100% - ${PILL_MAX}px))`,
                  ['--pill' as string]: colour,
                }}
              >
                <i aria-hidden="true" />
                <span>{item.task.title}</span>
              </button>
            );
          })}
          <span className="dash-runway-label" style={{ left: 0 }}>today</span>
          <span className="dash-runway-label" style={{ left: '50%' }}>1 week</span>
          <span className="dash-runway-label" style={{ right: 0 }}>2 weeks</span>
        </div>
      </div>
    </div>
  );
}
