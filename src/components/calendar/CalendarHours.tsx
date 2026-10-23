/**
 * The calendar's Day and Week (29-2e1): the hours, with his tasks and his
 * events on them. It is the Dashboard's timeline (29-1c2) made a screen —
 * the same blocks, the same orange now line and indigo evening — plus events:
 *
 * - **A task** is the block BASE writes into his Google Calendar, ending at
 *   its deadline (`timelineItems`), in the date's sky; coral once late, struck
 *   through and grey once done.
 * - **An event** is a block in its own colour, timed ones on the hours and
 *   all-day ones in a strip over them (`eventsOnDays`). Tasks and events share
 *   the lanes, so nothing is drawn over anything else.
 *
 * A tap opens the task's sheet or the event's; in the week a tap on a day's
 * name opens that day. A sideways swipe turns the day or the week (idea 128,
 * `useSwipePages`); the hours scroll up and down in one scroller shared by
 * the three pages, so a swipe lands on the same hours it left.
 *
 * A held task moves (29-2e3a, idea 125, `useBlockDrag`): its quarter lights
 * and pulls it in, and let go it is due at its new end. A finished block stays
 * (it peeks instead), and one due before an event shakes and says it moves
 * with the event.
 *
 * The tray of undated tasks (29-2e3b, `CalendarTray`) sits beside the hours
 * when the header's "No date" opens it: a row held there lands on them the
 * same way, and a block held from here and let go on the tray (or, shut, on
 * its button) is undated again; a repeating one keeps its date.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Icon } from '../../ui';
import { useSwipePages } from '../../ui/core/useSwipePages';
import { useStore, taskEstimatedMinutes, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useEventStore } from '../../store/useEventStore';
import { EVENING_FROM_MIN, columnLabel, hourLabel, nowMinutes, placeLanes, timelineItems, type Placed } from '../../lib/dashboard/timeline';
import { clockWords, eventsOnDays, pageDays, stepDay, type CalendarEventItem } from '../../lib/calendar/calendar';
import { eventColours } from './eventColours';
import { dustAttr } from '../../lib/dust';
import { peekAttr } from '../../lib/peek';
import { dragRefusal, droppedDeadline, refusalWords } from '../../lib/calendar/snapDrag';
import { undateRefusal } from '../../lib/calendar/tray';
import { useBlockDrag, type Landing } from './useBlockDrag';
import CalendarTray from './CalendarTray';

/** One hour's height: roomier than the Dashboard block's 40, this is a whole screen. */
const HOUR_PX = 48;
const DAY_PX = HOUR_PX * 24;
const GUTTER = 52;
/** The shortest a block is drawn, so a ten-minute task still has a name. */
const MIN_PX = 20;

const px = (min: number) => (min / 60) * HOUR_PX;

type Block =
  | ({ kind: 'task'; taskId: string; done: boolean; late: boolean; title: string } & { day: string; start: number; end: number })
  | ({ kind: 'event' } & CalendarEventItem);

export default function CalendarHours({ view, day, today, now, timeZone, wide, onPick, onOpenDay, onOpenTask, onOpenEvent, tray, trayOpen, trayButton }: {
  view: 'day' | 'week';
  day: string;
  today: string;
  now: Date;
  timeZone: string;
  wide: boolean;
  onPick: (day: string) => void;
  onOpenDay: (day: string) => void;
  onOpenTask: (task: Task) => void;
  onOpenEvent: (eventId: string) => void;
  /** The undated tasks, best first (`trayTasks`), and whether their tray is open. */
  tray: readonly Task[];
  trayOpen: boolean;
  /** The header's "No date": where a block is let go to lose its date while the tray is shut. */
  trayButton: RefObject<HTMLElement | null>;
}) {
  const backlog = useStore((s) => s.backlogTasks);
  const events = useEventStore((s) => s.events);
  const scores = usePriorityScores();
  const [peek, setPeek] = useState(false);

  const pages = useMemo(() => (peek ? [-1, 0, 1] : [0]).map((p) => pageDays(view, day, p)), [peek, view, day]);
  const { timed, allDay } = useMemo(() => {
    const all = pages.flat();
    const tasks: Block[] = timelineItems(backlog, all, timeZone, scores.ignored.ids, now, taskEstimatedMinutes)
      .map((i) => ({ kind: 'task', ...i }));
    const evs = eventsOnDays(events, all, timeZone);
    const blocks: Block[] = [...tasks, ...evs.filter((e) => !e.allDay).map((e): Block => ({ kind: 'event', ...e }))];
    const byDay = new Map<string, Placed<Block>[]>();
    for (const p of placeLanes(blocks, (MIN_PX / HOUR_PX) * 60)) {
      const list = byDay.get(p.day);
      if (list) list.push(p);
      else byDay.set(p.day, [p]);
    }
    const strip = new Map<string, CalendarEventItem[]>();
    for (const e of evs) {
      if (!e.allDay) continue;
      const list = strip.get(e.day);
      if (list) list.push(e);
      else strip.set(e.day, [e]);
    }
    return { timed: byDay, allDay: strip };
  }, [pages, backlog, events, timeZone, scores.ignored.ids, now]);
  const byId = useMemo(() => new Map(backlog.map((t) => [t.id, t])), [backlog]);

  const days = pageDays(view, day, 0);
  const multi = days.length > 1;
  /* The strip of all-day events, only as tall as the fullest day needs. */
  const stripRows = Math.max(0, ...pages.flat().map((d) => allDay.get(d)?.length ?? 0));
  /* A week below the laptop's width has narrow columns: names only, smaller, no times. */
  const narrow = multi && !wide;

  // ─── Where the hours open ─────────────────────────────────────────────────
  /* On arrival and on a new view: an hour and a bit above now when today is
     on the page, else just above its first block, else 8am. A write only —
     it reads no layout (rule 6). */
  const scroller = useRef<HTMLDivElement>(null);
  const firstStart = Math.min(...days.flatMap((d) => (timed.get(d) ?? []).map((i) => i.start)), 8 * 60 + 30);
  const nowMin = days.includes(today) ? nowMinutes(today, now, timeZone) : null;
  const openAt = nowMin !== null ? nowMin - 75 : firstStart - 30;
  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, px(openAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ─── Turning the page ─────────────────────────────────────────────────────
  const bodyTrack = useRef<HTMLDivElement>(null);
  const headTrack = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const swipe = useSwipePages({
    tracks: () => [bodyTrack.current, headTrack.current].filter((el): el is HTMLDivElement => !!el),
    viewport,
    peeking: peek,
    onFirstTouch: () => setPeek(true),
    onTurn: (dir) => onPick(stepDay(view, day, dir)),
  });

  // ─── Moving a task (29-2e3a) ──────────────────────────────────────────────
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const [tip, setTip] = useState<{ taskId: string; text: string } | null>(null);
  useEffect(() => {
    if (!tip) return;
    const t = window.setTimeout(() => setTip(null), 2200);
    return () => clearTimeout(t);
  }, [tip]);
  const trayBox = useRef<HTMLElement>(null);
  const drag = useBlockDrag({
    hourPx: HOUR_PX,
    scroller,
    columns: () => [...(bodyTrack.current?.querySelectorAll<HTMLElement>(':scope > :not([inert]) > .tl-day') ?? [])],
    days,
    onDrop: (to) => updateBacklogTask(to.taskId, { deadline: droppedDeadline(to.day, to.start, to.minutes) }),
    onRefuse: (taskId, why) => {
      const task = byId.get(taskId);
      const event = why === 'event' ? events.find((e) => e.id === task?.eventId) : undefined;
      setTip({ taskId, text: refusalWords(why, event?.title) });
    },
    out: () => (trayOpen ? trayBox.current : trayButton.current),
    onUndate: (taskId) => updateBacklogTask(taskId, { deadline: undefined }),
    onKeep: (taskId) => setTip({ taskId, text: 'Repeats, so it keeps its date' }),
  });

  const slots = peek ? [-1, 0, 1] : [0];
  const pageOf = (slot: number) => pages[peek ? slot + 1 : 0];
  const slotStyle: CSSProperties = { flex: '0 0 100%', minWidth: 0, display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` };
  const trackStyle: CSSProperties = { display: 'flex', translate: peek ? '-100% 0' : undefined };
  const showHead = multi || stripRows > 0;

  return (
    <div className="cal-hours-wrap" data-wide={wide || undefined}>
      <div className="cal-hours" onClickCapture={swipe.onClickCapture}>
        {showHead && (
          <div style={{ display: 'flex', minWidth: 0 }}>
            <span className="cal-allday-label" style={{ flex: `0 0 ${GUTTER}px` }}>{stripRows > 0 ? 'All day' : ''}</span>
            <div style={{ flex: 1, minWidth: 0, overflow: 'clip' }}>
              <div ref={headTrack} style={trackStyle}>
                {slots.map((slot) => (
                  <div key={slot} style={slotStyle} aria-hidden={slot !== 0 || undefined} inert={slot !== 0 || undefined}>
                    {pageOf(slot).map((d) => (
                      <div key={d} className="cal-head" data-zoom-day={d}>
                        {multi && (() => {
                          const label = columnLabel(d);
                          return (
                            <button type="button" className="tl-colhead cal-colhead" data-today={d === today || undefined} onClick={() => onOpenDay(d)} aria-label={`Open ${label.weekday} ${label.date}`}>
                              {!narrow && <span>{label.weekday}</span>}
                              <b>{narrow ? `${label.weekday.slice(0, 1)} ${label.date}` : label.date}</b>
                            </button>
                          );
                        })()}
                        {stripRows > 0 && (
                          <div className="cal-strip" style={{ minHeight: stripRows * 24 }}>
                            {(allDay.get(d) ?? []).map((e) => (
                              <button
                                key={`${e.eventId}-${e.at}`}
                                type="button"
                                className="cal-chip"
                                style={eventColours(e.colour)}
                                title={e.title}
                                onClick={() => onOpenEvent(e.eventId)}
                              >
                                {e.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={scroller} className="tl-scroll ag-scroll ag-fade cal-scroll" style={{ '--tl-hour': `${HOUR_PX}px` } as CSSProperties}>
          <div style={{ display: 'flex', height: DAY_PX, position: 'relative' }}>
            <div className="tl-gutter" style={{ flex: `0 0 ${GUTTER}px` }} aria-hidden="true">
              {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
                <span key={hour} style={{ top: hour * HOUR_PX }}>{hourLabel(hour)}</span>
              ))}
              <Icon name="moon" size={12} className="tl-moon" style={{ top: px(EVENING_FROM_MIN) + 10 }} />
            </div>
            <div ref={viewport} className="tl-viewport" {...swipe.handlers}>
              <div ref={bodyTrack} style={{ ...trackStyle, height: '100%' }}>
                {slots.map((slot) => (
                  <div key={slot} style={{ ...slotStyle, height: '100%' }} aria-hidden={slot !== 0 || undefined} inert={slot !== 0 || undefined}>
                    {pageOf(slot).map((d, i) => (
                      <HoursColumn
                        key={d}
                        day={d}
                        blocks={timed.get(d) ?? []}
                        first={i === 0}
                        nowAt={d === today ? nowMinutes(d, now, timeZone) : null}
                        eveningLabel={!multi}
                        narrow={narrow}
                        byId={byId}
                        onOpenTask={onOpenTask}
                        onOpenEvent={onOpenEvent}
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
      {trayOpen && <CalendarTray ref={trayBox} tasks={tray} wide={wide} drag={drag} onOpenTask={onOpenTask} />}
    </div>
  );
}

function HoursColumn({ day, blocks, first, nowAt, eveningLabel, narrow, byId, onOpenTask, onOpenEvent, landing, tip, drag }: {
  /** Which day it is, for a pinch to ask what was under the fingers (29-2e2). */
  day: string;
  blocks: Placed<Block>[];
  first: boolean;
  nowAt: number | null;
  eveningLabel: boolean;
  narrow: boolean;
  byId: ReadonlyMap<string, Task>;
  onOpenTask: (task: Task) => void;
  onOpenEvent: (eventId: string) => void;
  /** The quarter a held block will land on, when it is in this column. */
  landing: Landing | null;
  tip: { taskId: string; text: string } | null;
  drag: ReturnType<typeof useBlockDrag>;
}) {
  return (
    <div className="tl-day" data-zoom-day={day} data-first={first || undefined}>
      <div className="tl-evening" style={{ top: px(EVENING_FROM_MIN) }}>
        {eveningLabel && <span>This evening</span>}
      </div>
      {landing && (
        <div
          className="cal-slot"
          aria-hidden="true"
          style={{ top: px(landing.start) + 1, height: Math.max(MIN_PX, Math.min(DAY_PX - px(landing.start), px(landing.minutes)) - 2) }}
        >
          {!narrow && <span>{clockWords(landing.start)}–{clockWords(landing.start + Math.round(landing.minutes))}</span>}
        </div>
      )}
      {blocks.map((b) => {
        const height = Math.max(MIN_PX, px(b.end - b.start) - 2);
        const span = `${clockWords(b.start)}–${clockWords(b.end)}`;
        const place: CSSProperties = {
          top: px(b.start) + 1,
          height,
          left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`,
          width: `calc(${100 / b.lanes}% - 4px)`,
        };
        const time = !narrow && height >= 40;
        if (b.kind === 'event') {
          return (
            <button
              key={`e-${b.eventId}-${b.at}`}
              type="button"
              className="tl-item cal-event"
              data-narrow={narrow || undefined}
              title={`${b.title} · ${span}${b.location ? ` · ${b.location}` : ''}`}
              onClick={() => onOpenEvent(b.eventId)}
              style={{ ...place, ...eventColours(b.colour) }}
            >
              <span className="tl-item-title">{b.title}</span>
              {time && <span className="tl-item-time">{span}{b.location ? ` · ${b.location}` : ''}</span>}
            </button>
          );
        }
        const task = byId.get(b.taskId);
        const refusal = task ? dragRefusal(task) : 'done';
        /* A finished block is a record, and peeks on a hold; any other hold is the drag's. */
        const holds = refusal !== 'done';
        return (
          <button
            key={`t-${b.taskId}`}
            type="button"
            {...dustAttr('task', b.taskId)}
            {...(holds ? { 'data-drag-row': '' } : peekAttr(b.taskId))}
            className="tl-item"
            data-done={b.done || undefined}
            data-late={b.late || undefined}
            data-narrow={narrow || undefined}
            title={`${b.title} · ${span}`}
            onPointerDown={holds && task ? (e) => drag.press(e, { taskId: b.taskId, day, start: b.start, minutes: taskEstimatedMinutes(task), refusal, undate: undateRefusal(task) }) : undefined}
            onClick={() => task && drag.isTap() && onOpenTask(task)}
            style={place}
          >
            <span className="tl-item-title">
              {b.done && <Icon name="check" size={11} style={{ color: 'var(--job-lime)' }} />}
              {b.title}
            </span>
            {time && <span className="tl-item-time">{span}</span>}
          </button>
        );
      })}
      {(() => {
        const at = tip && blocks.find((b) => b.kind === 'task' && b.taskId === tip.taskId);
        return at ? <span key={tip.taskId} className="cal-drag-tip" role="status" style={{ top: Math.max(0, px(at.start) - 26) }}>{tip.text}</span> : null;
      })()}
      {nowAt !== null && <span className="tl-now" style={{ top: px(nowAt) }} aria-label="Now" />}
    </div>
  );
}
