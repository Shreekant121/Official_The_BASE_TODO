/**
 * The calendar's month (29-2e1, idea 53): six weeks, Monday first, each day
 * with dots in the colours of what is on it, today in an orange ring and the
 * day the calendar is on in lime (chosen). A tap on a day opens its day view.
 * What the dots are is `lib/calendar/calendar.ts` (pure, tested).
 *
 * A sideways swipe turns the month (idea 128, `useSwipePages`); the months
 * either side are built on the first touch, never at load (rule 2).
 */
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useEventStore } from '../../store/useEventStore';
import { useSwipePages } from '../../ui/core/useSwipePages';
import { dayDots, dayLabel, eventsOnDays, pageDays, stepDay, tasksDueOn, type DayDots, type DotTone } from '../../lib/calendar/calendar';
import { cue } from '../../lib/sound';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarMonth({ day, today, now, timeZone, onPick, onOpenDay }: {
  day: string;
  today: string;
  now: Date;
  timeZone: string;
  /** Move the calendar to another day (a turn of the month). */
  onPick: (day: string) => void;
  /** A tap on a day: its day view. */
  onOpenDay: (day: string) => void;
}) {
  const backlog = useStore((s) => s.backlogTasks);
  const events = useEventStore((s) => s.events);
  const scores = usePriorityScores();
  const [peek, setPeek] = useState(false);

  const pages = useMemo(() => (peek ? [-1, 0, 1] : [0]).map((p) => pageDays('month', day, p)), [peek, day]);
  const dots = useMemo(() => {
    /* The pages share their edge weeks: ask once for the days they cover. */
    const all = [...new Set(pages.flat())].sort();
    return dayDots(eventsOnDays(events, all, timeZone), tasksDueOn(backlog, all, timeZone, scores.ignored.ids, now));
  }, [pages, events, backlog, timeZone, scores.ignored.ids, now]);

  const track = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const swipe = useSwipePages({
    tracks: () => (track.current ? [track.current] : []),
    viewport,
    peeking: peek,
    onFirstTouch: () => setPeek(true),
    onTurn: (dir) => onPick(stepDay('month', day, dir)),
  });

  const slots = peek ? [-1, 0, 1] : [0];
  const trackStyle: CSSProperties = { display: 'flex', height: '100%', translate: peek ? '-100% 0' : undefined };

  return (
    <div className="cal-month">
      <div className="cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>
      <div ref={viewport} className="cal-month-viewport" {...swipe.handlers} onClickCapture={swipe.onClickCapture}>
        <div ref={track} style={trackStyle}>
          {slots.map((slot) => {
            const days = pages[peek ? slot + 1 : 0];
            /* Which month this page is: the one its middle falls in. */
            const month = days[15].slice(0, 7);
            return (
              <div key={slot} className="cal-month-grid" aria-hidden={slot !== 0 || undefined} inert={slot !== 0 || undefined}>
                {days.map((d) => (
                  <MonthDay
                    key={d}
                    day={d}
                    dots={dots.get(d)}
                    today={d === today}
                    picked={d === day}
                    out={d.slice(0, 7) !== month}
                    past={d < today}
                    onOpen={() => { cue('detent'); onOpenDay(d); }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** A dot's colour: an event's own job colour, or a task's (sky due, coral late, lime done). */
function toneColour(tone: DotTone): string {
  if (tone === 'due') return 'var(--job-sky)';
  if (tone === 'late') return 'var(--job-coral)';
  if (tone === 'done') return 'var(--job-lime)';
  return `var(--job-${tone})`;
}

function MonthDay({ day, dots, today, picked, out, past, onOpen }: {
  day: string;
  dots: DayDots | undefined;
  today: boolean;
  picked: boolean;
  out: boolean;
  past: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="cal-day"
      data-zoom-day={day}
      data-today={today || undefined}
      data-out={out || undefined}
      data-past={past || undefined}
      aria-current={picked ? 'date' : undefined}
      aria-label={dayLabel(day, dots)}
      onClick={onOpen}
    >
      <b className="cal-day-num">{Number(day.slice(8))}</b>
      {dots && (
        <span className="cal-dots" aria-hidden="true">
          {dots.tones.map((tone, i) => <i key={i} style={{ backgroundColor: toneColour(tone) }} />)}
          {dots.more > 0 && <span className="cal-more">+{dots.more}</span>}
        </span>
      )}
    </button>
  );
}
