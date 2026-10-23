/**
 * The week strip (29-1c3, ideas 40 and 128): seven days at the top of the
 * Dashboard, under the greeting, in place of the date chip (his call,
 * 2026-10-21). What the dots count and the words are `lib/dashboard/weekStrip.ts`
 * (pure, tested); the picked day is `store/useDashDay.ts`, in memory.
 *
 * - **Idea 40, load dots**: under each day, up to four sky dots for how much
 *   of its hours the work due that day fills; coral past them. Sky because a
 *   date is sky's job; the design card's orange is go's.
 * - **Tapping a day moves the blocks that have one** — Today, the timeline,
 *   Hours and Focus this week (his pick). The picked day is a lime gel, what
 *   is chosen; today, when not picked, keeps lime numbers.
 * - **Idea 128, swipe**: a sideways drag moves the week with the finger, the
 *   next (or the last) peeking in beside it; a quarter of the width or a flick
 *   turns it, a week at a time, keeping the weekday. The arrows do the same
 *   for a mouse, and "Today" comes back once away. The timeline's own swipe
 *   moves the picked day too, so the strip follows it.
 * - **The floating + drops onto a day** (idea 37's second half): each day says
 *   `data-plus-day`, and `QuickCaptureFab` opens Capture with that day set.
 * - **The month's name opens the Calendar** (29-2e1, his call), on its month
 *   and the picked day.
 *
 * The neighbouring weeks are built on the first touch or arrow, not at load
 * (rule 2), and nothing moves at rest (rule 1).
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, SoftButton } from '../../ui';
import { useSwipePages } from '../../ui/core/useSwipePages';
import { useStore, taskEstimatedMinutes } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useDashboardStore } from '../../store/useDashboardStore';
import { pickDashDay, useDashDay, useDashDayOr } from '../../store/useDashDay';
import { usePlusDrop } from '../../store/usePlusDrop';
import { useCalendarView } from '../../store/useCalendarView';
import { resolveUserTimeZone, toZonedDayString } from '../../lib/agent/dates';
import { addDays, weekOf } from '../../lib/dashboard/hours';
import { formatMinutes } from '../../lib/dashboard/blockData';
import { MAX_DOTS, dayLoads, weekMonths, type DayLoad } from '../../lib/dashboard/weekStrip';
import { cue } from '../../lib/sound';
import { BlockIconButton } from './parts';

const dayName = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

export default function WeekStrip() {
  const timeZone = useMemo(() => resolveUserTimeZone(), []);
  const scores = usePriorityScores();
  const today = toZonedDayString(new Date(scores.now), timeZone);
  const day = useDashDayOr(today);
  const backlog = useStore((s) => s.backlogTasks);
  const hours = useDashboardStore((s) => s.hours);
  const aimed = usePlusDrop((s) => s.dayAim);
  const navigate = useNavigate();

  /* The neighbours, built on the first touch or arrow press (rule 2). */
  const [peek, setPeek] = useState(false);
  const weeks = useMemo(
    () => (peek ? [-7, 0, 7] : [0]).map((n) => weekOf(addDays(day, n))),
    [peek, day],
  );
  const loads = useMemo(() => {
    const all = dayLoads(backlog, weeks.flat(), timeZone, scores.ignored.ids, hours, taskEstimatedMinutes);
    return new Map(all.map((l) => [l.day, l]));
  }, [backlog, weeks, timeZone, scores.ignored.ids, hours]);

  // ─── Turning the week ─────────────────────────────────────────────────────
  const track = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  /* A turn keeps the weekday. */
  const swipe = useSwipePages({
    tracks: () => (track.current ? [track.current] : []),
    viewport,
    peeking: peek,
    onFirstTouch: () => setPeek(true),
    onTurn: (dir) => pickDashDay(addDays(day, dir * 7), today),
  });

  // ─── Drawing ──────────────────────────────────────────────────────────────
  const week = weekOf(day);
  const slots = peek ? [-1, 0, 1] : [0];
  const trackStyle: CSSProperties = { display: 'flex', translate: peek ? '-100% 0' : undefined };

  return (
    <section className="ws" aria-label="Week">
      <div className="ws-head">
        {/* 29-2e1: the month's name opens the Calendar's month, on the picked day. */}
        <button
          type="button"
          className="ws-month"
          aria-label={`${weekMonths(week, today)} — open the calendar`}
          onClick={() => {
            useCalendarView.getState().open('month', day, today);
            navigate('/calendar');
          }}
        >
          {weekMonths(week, today)}
          <Icon name="chevron-right" size={13} />
        </button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', marginLeft: 'auto' }}>
          {day !== today && (
            <SoftButton size="sm" onClick={() => useDashDay.getState().pick(null)}>Today</SoftButton>
          )}
          <BlockIconButton label="Last week" icon="chevron-left" onClick={() => swipe.turn(-1)} />
          <BlockIconButton label="Next week" icon="chevron-right" onClick={() => swipe.turn(1)} />
        </span>
      </div>
      <div
        ref={viewport}
        className="ws-viewport"
        {...swipe.handlers}
        onClickCapture={swipe.onClickCapture}
      >
        <div ref={track} style={trackStyle}>
          {slots.map((slot) => (
            <div key={slot} className="ws-week" aria-hidden={slot !== 0 || undefined} inert={slot !== 0 || undefined}>
              {weeks[peek ? slot + 1 : 0].map((d) => (
                <StripDay
                  key={d}
                  load={loads.get(d)}
                  day={d}
                  today={today}
                  picked={d === day}
                  aimed={d === aimed}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StripDay({ day, load, today, picked, aimed }: {
  day: string;
  load: DayLoad | undefined;
  today: string;
  picked: boolean;
  aimed: boolean;
}) {
  const dots = load?.dots ?? 0;
  const due = load && load.dueMinutes > 0
    ? `, ${formatMinutes(load.dueMinutes)} due of ${formatMinutes(load.availableMinutes)}`
    : ', nothing due';
  return (
    <button
      type="button"
      className="ws-day"
      data-plus-day={day}
      data-today={day === today || undefined}
      data-past={day < today || undefined}
      data-aimed={aimed || undefined}
      aria-pressed={picked}
      aria-label={`${dayName(day, { weekday: 'long', day: 'numeric', month: 'long' })}${due}`}
      onClick={() => {
        if (!picked) cue('detent');
        pickDashDay(day, today);
      }}
    >
      <span className="ws-weekday">{dayName(day, { weekday: 'short' })}</span>
      <b className="ws-date">{dayName(day, { day: 'numeric' })}</b>
      <span className="ws-dots" data-over={load?.over || undefined} aria-hidden="true">
        {Array.from({ length: Math.min(dots, MAX_DOTS) }, (_, i) => <i key={i} />)}
      </span>
    </button>
  );
}
