/**
 * The Countdown widget (29-2a, the Dashboard kind `countdown`) — the real one,
 * in the place `sample-countdown` held (`RENAMED_KINDS`).
 *
 * It counts to the event picked in its ⚙, or to the soonest coming one when
 * none is (`settings.eventId` absent), the way the event says to count — days
 * and hours by default (`countdownReading`). A picked one-off that has been
 * reads "Passed" and waits in the archive, which opens from the widget's own
 * corner: his call, "the archive of passed events is inside the countdown
 * block". Two tall, it lists the next few after it.
 *
 * A tap opens the event; the + makes a new one. Both go through
 * `useEventSheet`, the one sheet Capture and Ctrl+K open too.
 *
 * 29-2b: the ⚙'s Style draws it one of five ways (`settings.face`): Minimal,
 * below, or Cover, Shape, Journey and Split-flap from `countdownFaces.tsx`.
 *
 * 29-2d2: it can count to a task (its deadline) or a date he names instead,
 * and its ⚙ switch lists what is due before it in place of the next events —
 * which, and in what order, is `lib/dashboard/countdownTarget.ts`. A tap on a
 * task's countdown, or a row, opens the task; a date's opens nothing.
 *
 * It re-reads on the minute, by one timer to the next minute, and only while
 * there is something to count to — nothing on screen loops (Performance
 * rule 1), and the smallest unit it shows is a minute.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { LitLine, SoftButton, Icon } from '../../ui';
import { useStore, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useEventStore } from '../../store/useEventStore';
import { useEventSheet } from '../../store/useEventSheet';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { readDue } from '../../lib/dueDate';
import {
  DEFAULT_EVENT_COLOUR, countdownFace, countdownReading, countdownText, describeWhen, isAllDay, passedEvents,
  upcomingEvents, type BaseEvent,
} from '../../lib/events/events';
import { dueBefore, resolveCountdownTarget, targetReading, type DueBeforeRow } from '../../lib/dashboard/countdownTarget';
import type { BlockProps } from './blocks';
import { useBlockMood } from './blockContext';
import { BigNumber, BlockIconButton, BlockTitle } from './parts';
import { CoverFace, FlapFace, JourneyFace, ShapeFace, type FaceProps } from './countdownFaces';

/** Now, moved on at each minute while `live`. */
function useMinuteNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      timer = setTimeout(tick, 60_000 - (t % 60_000) + 50);
    };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, [live]);
  return now;
}

const Dot = ({ event, dim }: { event: BaseEvent; dim?: boolean }) => (
  <span
    aria-hidden="true"
    style={{
      width: 10, height: 10, flex: '0 0 auto', borderRadius: '50%',
      backgroundColor: `var(--job-${event.colour ?? DEFAULT_EVENT_COLOUR})`, opacity: dim ? 0.5 : 1,
    }}
  />
);

const ROW_TEXT = { flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const ROW_TRAIL = { font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } as const;

export function CountdownBlock({ block, w, h, onOpenTask }: BlockProps) {
  const events = useEventStore((s) => s.events);
  const backlog = useStore((s) => s.backlogTasks);
  const ignored = usePriorityScores().ignored.ids;
  const settings = block.settings;
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const now = useMinuteNow(events.length > 0 || !!settings?.taskId || !!settings?.date);
  const at = new Date(now);
  const { openEvent, openArchive } = useEventSheet.getState();

  const upcoming = useMemo(() => upcomingEvents(events, new Date(now), tz), [events, now, tz]);
  const passedCount = useMemo(() => passedEvents(events, new Date(now), tz).length, [events, now, tz]);

  /* The picked task, date or event wherever it stands; gone (deleted) is the soonest again. */
  const target = useMemo(() => resolveCountdownTarget(settings, events, backlog, new Date(now), tz), [settings, events, backlog, now, tz]);
  const reading = target ? targetReading(target, at, tz) : null;
  const listsDue = !!settings?.dueBefore && !!target;
  const due = useMemo(
    () => (listsDue && target ? dueBefore(backlog, target, new Date(now), tz, ignored) : []),
    [listsDue, target, backlog, now, tz, ignored],
  );
  const overdueCount = due.filter((r) => r.overdue).length;
  /* Grey (quiet) only with nothing to count to, or one that has been (or is
     done); on its day, overdue, or with overdue work before it, it needs him;
     counting, it is plain. */
  const over = !reading || (reading.kind === 'word' && (reading.word === 'Passed' || reading.word === 'Done'));
  useBlockMood(over && overdueCount === 0 ? 'quiet' : reading?.kind === 'word' || overdueCount > 0 ? 'needs' : 'neutral');

  const corner = (
    <span style={{ display: 'inline-flex', gap: 'var(--sp-2)' }}>
      {passedCount > 0 && (
        <BlockIconButton label={`Passed events (${passedCount})`} icon="archive" onClick={openArchive} />
      )}
      <BlockIconButton label="New event" icon="plus" onClick={() => openEvent()} />
    </span>
  );

  if (!target || !reading) {
    return (
      <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%' }}>
        <BlockTitle icon="hourglass" trail={corner}>Countdown</BlockTitle>
        <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
          <LitLine text="**Nothing to count down to.** Add a trip, a birthday, a race." />
        </span>
        {w >= 2 && (
          <div>
            <SoftButton icon={<Icon name="plus" size={15} />} onClick={() => openEvent()}>New event</SoftButton>
          </div>
        )}
      </div>
    );
  }

  const { event, moment, kind, task } = target;
  const passed = moment.kind === 'passed' || (reading.kind === 'word' && reading.word === 'Done');
  const max = h >= 3 ? 5 : 2;
  const others = listsDue ? [] : upcoming.filter((u) => u.event.id !== event.id).slice(0, max);
  const face = countdownFace(settings?.face);
  const title = (trail: ReactNode) => (
    <BlockTitle glyph={<Dot event={event} dim={passed} />} trail={trail}>{event.title}</BlockTitle>
  );
  const props: FaceProps = { event, moment, reading, at, tz, w, h, corner, title, shapeable: kind === 'event' };
  /* The Cover face fills the block with its picture: no list under it. */
  const listed = h >= 2 && face !== 'cover' && (listsDue || others.length > 0);
  const open = kind === 'event' ? () => openEvent(event.id) : kind === 'task' && task ? () => onOpenTask(task) : undefined;
  /* One tall, the due list has no room: Minimal's line says how many instead. */
  const dueWord = listsDue && !listed ? ` · ${due.length} due before it` : '';

  return (
    <div
      role={open ? 'button' : undefined}
      tabIndex={open ? 0 : undefined}
      data-countdown-event={event.id}
      data-countdown-target={kind}
      data-countdown-face={face}
      onClick={open}
      onKeyDown={open ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) open(); } : undefined}
      /* Minimal's parts are the grid's own rows, spread as 29-2a drew them; a
         new face is one row that fills the block, the list under it. */
      style={face === 'minimal'
        ? { display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%', cursor: open ? 'pointer' : undefined, minWidth: 0 }
        : {
          display: 'grid', gridTemplateRows: listed ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)', gap: 'var(--sp-3)',
          height: '100%', cursor: open ? 'pointer' : undefined, minWidth: 0,
        }}
    >
      {face === 'cover' ? <CoverFace {...props} />
        : face === 'shape' ? <ShapeFace {...props} />
          : face === 'journey' ? <JourneyFace {...props} />
            : face === 'flap' ? <FlapFace {...props} />
              : (
                <>
                  {title(corner)}
                  <BigNumber
                    value={reading.kind === 'word' ? reading.word : reading.value}
                    unit={reading.kind === 'count' ? reading.unit : undefined}
                    size={w >= 2 ? 'lg' : 'md'}
                    tone={passed ? 'var(--fg-3)' : reading.kind === 'word' && reading.word === 'Overdue' ? 'var(--status-overrun)' : undefined}
                  />
                  {/* `minHeight`: a box that clips is a grid item that may shrink to
                      nothing, and one row tall this line did. */}
                  <span
                    style={{
                      font: 'var(--type-body)', color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      minHeight: 'min-content',
                    }}
                  >
                    {describeWhen(moment, isAllDay(event), at, tz)}
                    {event.location && w >= 2 ? ` · ${event.location}` : ''}
                    {kind === 'event' && passed ? ' · in the archive' : ''}
                    {dueWord}
                  </span>
                </>
              )}
      {listed && (
        <div style={{ display: 'grid', gap: 2, borderTop: '1px solid var(--line-faint)', paddingTop: 'var(--sp-3)', minWidth: 0 }}>
          {listsDue
            ? <DueList rows={due} max={max} at={at} tz={tz} colour={event.colour ?? DEFAULT_EVENT_COLOUR} onOpenTask={onOpenTask} />
            : others.map((o) => (
              <button
                key={o.event.id}
                type="button"
                className="dash-row"
                onClick={(e) => { e.stopPropagation(); openEvent(o.event.id); }}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}
              >
                <Dot event={o.event} />
                <span style={ROW_TEXT}>{o.event.title}</span>
                <span style={ROW_TRAIL}>
                  {countdownText(countdownReading(o.moment, at, o.event.countdown, isAllDay(o.event), tz))}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * 29-2d2: what is due before it — the tied ones first (a dot in the countdown's colour), each
 * with how far off it is, coral once overdue, and "+3 more" past the room.
 */
function DueList({ rows, max, at, tz, colour, onOpenTask }: {
  rows: DueBeforeRow<Task>[]; max: number; at: Date; tz: string; colour: string; onOpenTask: (task: Task) => void;
}) {
  if (rows.length === 0) {
    return (
      <span data-countdown-due="0" style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', padding: 'var(--sp-1) var(--sp-3)' }}>
        <LitLine text="**Nothing due before it.**" />
      </span>
    );
  }
  /* "+1 more" would take the row it stands for: show that row instead. */
  const shown = rows.length > max ? rows.slice(0, max - 1) : rows;
  return (
    <>
      {shown.map(({ task, tied, overdue }) => (
        <button
          key={task.id}
          type="button"
          className="dash-row"
          data-countdown-due-row={task.id}
          onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}
        >
          <span
            aria-hidden="true"
            data-countdown-tied={tied || undefined}
            style={{
              width: 8, height: 8, borderRadius: '50%', flex: '0 0 auto',
              ...(tied ? { backgroundColor: `var(--job-${colour})` } : { boxShadow: 'var(--soft-pressed)' }),
            }}
          />
          <span style={ROW_TEXT}>{task.title}</span>
          <span style={{ ...ROW_TRAIL, color: overdue ? 'var(--status-overrun)' : ROW_TRAIL.color }}>
            {readDue(task.deadline, at, tz)?.words ?? 'No date'}
          </span>
        </button>
      ))}
      {shown.length < rows.length && (
        <span style={{ ...ROW_TRAIL, padding: '0 var(--sp-3)' }}>+{rows.length - shown.length} more</span>
      )}
    </>
  );
}
