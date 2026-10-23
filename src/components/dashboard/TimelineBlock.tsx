/**
 * The timeline block (29-1c2, ideas 29, 38, 128). What is on it, where it
 * sits and what "this evening" means are pure and tested in
 * `lib/dashboard/timeline.ts`; this file is how it looks and how it moves.
 *
 * - **Idea 29, the "now" line**: an orange line with a dot across today's
 *   column, moved by the score's minute clock — never a loop (rule 1).
 * - **Idea 38, This evening**: from 6pm the columns wear rest's indigo, under
 *   a small moon. Sending a task there is the Today block's moon button.
 * - **Idea 128, swipe to the next range**: the page under the finger moves
 *   with it and the next (or the last) peeks in beside it; a quarter of the
 *   width or a quick flick turns the page, anything less springs back. The
 *   arrows in the corner do the same for a mouse.
 * - **Since 29-1c3 the week strip's day drives it**: page 0 holds the picked
 *   day, and a turn moves the picked day by a whole range (1, 3 or 7 days),
 *   so the strip and every other day block follow the timeline's swipe.
 *
 * ONE SCROLLER, TWO TRACKS
 * ------------------------
 * The hours scroll up and down in one scroller, shared by every page, so a
 * swipe lands on the same hours it left. Inside it a track of three pages
 * (last, this, next) slides sideways by `translate`; the day labels above sit
 * in a second track moved by the same numbers. The neighbours are built on
 * the first touch, not at load (rule 2). The scroller says `pan-y`, so the
 * browser keeps the vertical scroll and hands the sideways drag to the page.
 *
 * SNAP INTO PLACE (29-2e3c, idea 125)
 * -----------------------------------
 * The Calendar's drag on the Dashboard (`useBlockDrag`, `lib/calendar/snapDrag.ts`):
 * a held block moves, its quarter lights lime and pulls it in, and let go it
 * is due at its new end. A row of the Today block lands here the same way:
 * the block hands its press to `useTimelineDrop`, and Today's rows press into
 * it, as the Calendar's tray does. A finished block peeks instead, and one due
 * before an event shakes and says it moves with the event.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon, SoftButton } from '../../ui';
import { useSwipePages } from '../../ui/core/useSwipePages';
import { useStore, taskEstimatedMinutes, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useEventStore } from '../../store/useEventStore';
import { useTimelineDrop, type TimelineTarget } from '../../store/useTimelineDrop';
import { dragRefusal, droppedDeadline, refusalWords } from '../../lib/calendar/snapDrag';
import { useBlockDrag, type Landing } from '../calendar/useBlockDrag';
import { resolveUserTimeZone, toZonedDayString } from '../../lib/agent/dates';
import {
  EVENING_FROM_MIN, RANGE_STEP, columnLabel, hourLabel, nowMinutes, placeLanes, rangeDays, rangeTitle, timelineItems,
  timelineRange, type PlacedItem,
} from '../../lib/dashboard/timeline';
import { addDays } from '../../lib/dashboard/hours';
import { pickDashDay, useDashDay, useDashDayOr } from '../../store/useDashDay';
import { dustAttr } from '../../lib/dust';
import { peekAttr } from '../../lib/peek';
import type { BlockProps } from './blocks';
import { useBlockMood } from './blockContext';
import { BlockIconButton, BlockTitle } from './parts';

/** One hour's height. Two rows of the grid show about six of them. */
const HOUR_PX = 40;
const DAY_PX = HOUR_PX * 24;
/** The hour marks' column. */
const GUTTER = 44;
/** The shortest a block is drawn, so a ten-minute task still has a name. */
const MIN_PX = 18;

const px = (min: number) => (min / 60) * HOUR_PX;

export function TimelineBlock({ block, w, onOpenTask }: BlockProps) {
  const range = timelineRange(block.settings?.range);
  const timeZone = useMemo(() => resolveUserTimeZone(), []);
  const scores = usePriorityScores();
  const now = useMemo(() => new Date(scores.now), [scores.now]);
  const today = toZonedDayString(now, timeZone);
  const backlog = useStore((s) => s.backlogTasks);

  /* The week strip's day (29-1c3): page 0 holds it. */
  const day = useDashDayOr(today);
  /* The neighbours, built on the first touch or arrow press (rule 2). */
  const [peek, setPeek] = useState(false);

  const pages = useMemo(
    () => (peek ? [-1, 0, 1] : [0]).map((p) => rangeDays(range, day, p)),
    [peek, range, day],
  );
  const placed = useMemo(() => {
    const all = pages.flat();
    const items = timelineItems(backlog, all, timeZone, scores.ignored.ids, now, taskEstimatedMinutes);
    const byDay = new Map<string, PlacedItem[]>();
    for (const p of placeLanes(items, (MIN_PX / HOUR_PX) * 60)) {
      const list = byDay.get(p.day);
      if (list) list.push(p);
      else byDay.set(p.day, [p]);
    }
    return byDay;
  }, [pages, backlog, timeZone, scores.ignored.ids, now]);
  const byId = useMemo(() => new Map(backlog.map((t) => [t.id, t])), [backlog]);

  const days = rangeDays(range, day, 0);
  const openHere = days.some((d) => (placed.get(d) ?? []).some((i) => !i.done));
  useBlockMood(openHere ? 'needs' : 'neutral');

  // ─── Where the hours open ─────────────────────────────────────────────────
  /* On arrival and on a new range: an hour and a bit above now when today is
     on the page, else just above its first task, else 8am. A write only — it
     reads no layout (rule 6). */
  const scroller = useRef<HTMLDivElement>(null);
  const firstStart = Math.min(...days.flatMap((d) => (placed.get(d) ?? []).map((i) => i.start)), 8 * 60 + 30);
  const nowMin = days.includes(today) ? nowMinutes(today, now, timeZone) : null;
  const openAt = nowMin !== null ? nowMin - 75 : firstStart - 30;
  /* Only on a new range: the minute moving `openAt` must not pull the hours
     back from wherever he has scrolled them. */
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, px(openAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // ─── Turning the page ─────────────────────────────────────────────────────
  const bodyTrack = useRef<HTMLDivElement>(null);
  const headTrack = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  /* A turn moves the picked day by a whole range, so the strip follows. */
  const swipe = useSwipePages({
    tracks: () => [bodyTrack.current, headTrack.current].filter((el): el is HTMLDivElement => !!el),
    viewport,
    peeking: peek,
    onFirstTouch: () => setPeek(true),
    onTurn: (dir) => pickDashDay(addDays(day, dir * RANGE_STEP[range]), today),
  });

  // ─── Moving a task (29-2e3c) ──────────────────────────────────────────────
  const [tip, setTip] = useState<{ taskId: string; text: string } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 2200);
    return () => clearTimeout(t);
  }, [tip]);
  const drag = useBlockDrag({
    hourPx: HOUR_PX,
    minPx: MIN_PX,
    scroller,
    columns: () => [...(bodyTrack.current?.querySelectorAll<HTMLElement>(':scope > :not([inert]) > .tl-day') ?? [])],
    days,
    onDrop: (to) => useStore.getState().updateBacklogTask(to.taskId, { deadline: droppedDeadline(to.day, to.start, to.minutes) }),
    onRefuse: (taskId, why) => {
      const eventId = byId.get(taskId)?.eventId;
      setTip({ taskId, text: refusalWords(why, useEventStore.getState().events.find((e) => e.id === eventId)?.title) });
    },
  });
  /* Today's rows press into this drag (`useTimelineDrop`): one entry for the
     block's life, reading the latest drag through a ref. */
  const latest = useRef(drag);
  useEffect(() => { latest.current = drag; });
  useEffect(() => {
    const target: TimelineTarget = {
      hours: () => scroller.current,
      press: (e, held) => latest.current.press(e, held),
      isTap: () => latest.current.isTap(),
    };
    const { add, remove } = useTimelineDrop.getState();
    add(target);
    return () => remove(target);
  }, []);

  // ─── Drawing ──────────────────────────────────────────────────────────────
  const multi = days.length > 1;
  const slots = peek ? [-1, 0, 1] : [0];
  const pageOf = (slot: number) => pages[peek ? slot + 1 : 0];
  const slotStyle: CSSProperties = { flex: '0 0 100%', minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  /* The track's resting place: the middle slot when there are three. */
  const trackStyle: CSSProperties = { display: 'flex', translate: peek ? '-100% 0' : undefined };
  /* A week's columns are narrow below the full width, and three days' in a
     block two cells wide: names only, smaller, no times. Judged from the
     block's size, never measured (rule 6). */
  const narrow = (days.length === 7 && w < 4) || (days.length === 3 && w <= 2);

  const title = rangeTitle(range, days, today);
  const trail = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
      {!days.includes(today) && (
        <SoftButton size="sm" onClick={(e) => { e.stopPropagation(); useDashDay.getState().pick(null); }}>Today</SoftButton>
      )}
      <BlockIconButton label="Earlier" icon="chevron-left" onClick={() => swipe.turn(-1)} />
      <BlockIconButton label="Later" icon="chevron-right" onClick={() => swipe.turn(1)} />
    </span>
  );

  return (
    <div style={{ display: 'grid', gridTemplateRows: multi ? 'auto auto 1fr' : 'auto 1fr', gap: 'var(--sp-3)', height: '100%', minHeight: 0 }}>
      <BlockTitle icon="calendar-clock" trail={trail}>{title}</BlockTitle>

      {multi && (
        <div style={{ display: 'flex', minWidth: 0 }}>
          <span style={{ flex: `0 0 ${GUTTER}px` }} />
          <div style={{ flex: 1, minWidth: 0, overflow: 'clip' }}>
            <div ref={headTrack} style={trackStyle}>
              {slots.map((slot) => (
                <div key={slot} style={slotStyle} aria-hidden={slot !== 0 || undefined}>
                  {pageOf(slot).map((day) => {
                    const label = columnLabel(day);
                    const isToday = day === today;
                    return (
                      <span key={day} className="tl-colhead" data-today={isToday || undefined}>
                        {!narrow && <span>{label.weekday}</span>}
                        <b>{narrow ? `${label.weekday.slice(0, 1)} ${label.date}` : label.date}</b>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        ref={scroller}
        className="tl-scroll ag-scroll ag-fade"
        style={{ '--tl-hour': `${HOUR_PX}px` } as CSSProperties}
        onClickCapture={swipe.onClickCapture}
      >
        <div style={{ display: 'flex', height: DAY_PX, position: 'relative' }}>
          <div className="tl-gutter" style={{ flex: `0 0 ${GUTTER}px` }} aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span key={hour} style={{ top: hour * HOUR_PX }}>{hourLabel(hour)}</span>
            ))}
            <Icon name="moon" size={12} className="tl-moon" style={{ top: px(EVENING_FROM_MIN) + 10 }} />
          </div>
          <div
            ref={viewport}
            className="tl-viewport"
            {...swipe.handlers}
          >
            <div ref={bodyTrack} style={{ ...trackStyle, height: '100%' }}>
              {slots.map((slot) => (
                <div key={slot} style={{ ...slotStyle, height: '100%' }} aria-hidden={slot !== 0 || undefined} inert={slot !== 0 || undefined}>
                  {pageOf(slot).map((d, i) => (
                    <DayColumn
                      key={d}
                      day={d}
                      items={placed.get(d) ?? []}
                      first={i === 0}
                      nowAt={d === today ? nowMinutes(d, now, timeZone) : null}
                      eveningLabel={!multi}
                      narrow={narrow}
                      byId={byId}
                      onOpenTask={onOpenTask}
                      landing={slot === 0 && drag.landing?.day === d ? drag.landing : null}
                      tip={slot === 0 ? tip : null}
                      drag={drag}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const clock = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const mm = min % 60;
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};

function DayColumn({ day, items, first, nowAt, eveningLabel, narrow, byId, onOpenTask, landing, tip, drag }: {
  day: string;
  items: PlacedItem[];
  first: boolean;
  nowAt: number | null;
  eveningLabel: boolean;
  narrow: boolean;
  byId: ReadonlyMap<string, Task>;
  onOpenTask: (task: Task) => void;
  /** The quarter a held block will land on, when it is in this column. */
  landing: Landing | null;
  tip: { taskId: string; text: string } | null;
  drag: ReturnType<typeof useBlockDrag>;
}) {
  return (
    <div className="tl-day" data-first={first || undefined}>
      <div className="tl-evening" style={{ top: px(EVENING_FROM_MIN) }}>
        {eveningLabel && <span>This evening</span>}
      </div>
      {landing && (
        <div
          className="cal-slot"
          aria-hidden="true"
          style={{ top: px(landing.start) + 1, height: Math.max(MIN_PX, Math.min(DAY_PX - px(landing.start), px(landing.minutes)) - 2) }}
        >
          {!narrow && <span>{clock(landing.start)}–{clock(landing.start + Math.round(landing.minutes))}</span>}
        </div>
      )}
      {items.map((item) => {
        const task = byId.get(item.taskId);
        const height = Math.max(MIN_PX, px(item.end - item.start) - 2);
        const span = `${clock(item.start)}–${clock(item.end)}`;
        const refusal = task ? dragRefusal(task) : 'done';
        /* A finished block is a record, and peeks on a hold; any other hold is the drag's. */
        const holds = refusal !== 'done';
        return (
          <button
            key={`${item.taskId}-${item.day}`}
            type="button"
            {...dustAttr('task', item.taskId)}
            {...(holds ? { 'data-drag-row': '' } : peekAttr(item.taskId))}
            className="tl-item"
            data-done={item.done || undefined}
            data-late={item.late || undefined}
            data-narrow={narrow || undefined}
            title={`${item.title} · ${span}`}
            onPointerDown={holds && task ? (e) => drag.press(e, { taskId: item.taskId, day, start: item.start, minutes: taskEstimatedMinutes(task), refusal }) : undefined}
            onClick={() => task && drag.isTap() && onOpenTask(task)}
            style={{
              top: px(item.start) + 1,
              height,
              left: `calc(${(item.lane / item.lanes) * 100}% + 2px)`,
              width: `calc(${100 / item.lanes}% - 4px)`,
            }}
          >
            <span className="tl-item-title">
              {item.done && <Icon name="check" size={11} style={{ color: 'var(--job-lime)' }} />}
              {item.title}
            </span>
            {!narrow && height >= 38 && <span className="tl-item-time">{span}</span>}
          </button>
        );
      })}
      {(() => {
        const at = tip && items.find((i) => i.taskId === tip.taskId);
        return at ? <span key={tip.taskId} className="cal-drag-tip" role="status" style={{ top: Math.max(0, px(at.start) - 26) }}>{tip.text}</span> : null;
      })()}
      {nowAt !== null && <span className="tl-now" style={{ top: px(nowAt) }} aria-label="Now" />}
    </div>
  );
}
