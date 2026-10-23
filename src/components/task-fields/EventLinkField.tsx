/**
 * "Due before an event" (29-2d1), inside the task sheet's Deadline field.
 *
 * Unlinked, it is a quiet line under the date — "Due before an event…" — that
 * opens the events still to come. Picking one sets the deadline to the
 * event's (`linkedDeadline`: at its start, or 6pm the day before an all-day
 * one, his call) and the link, both in the draft, so nothing is written until
 * Save like every other field here. Linked, the date box gives way to the
 * event: its dot, its name, the date the task is due, and an ✕ that lifts the
 * link and keeps the date. While linked the date moves only with the event;
 * the Fixed switch is hidden, because a linked date is fixed already.
 *
 * The date shown is the task's own, never the event re-read: a task linked to
 * a birthday that went by stays on that birthday, overdue (his call). An event
 * that has been deleted shows as unlinked.
 */
import { useMemo } from 'react';
import { Icon, IconButton, MorphMenu, SoftButton, type MorphMenuItem } from '../../ui';
import { useEventStore } from '../../store/useEventStore';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { DEFAULT_EVENT_COLOUR, describeWhen, isAllDay, upcomingEvents, type BaseEvent } from '../../lib/events/events';
import { linkedDeadline } from '../../lib/events/eventLinks';
import { fullDueDate, readDue } from '../../lib/dueDate';
import { Z } from '../../lib/zLayers';

export interface EventLinkFieldProps {
  eventId: string;
  /** The task's deadline, which a linked task holds as its event's. */
  deadline: string;
  /** Picked: the event and the deadline it gives. `null` lifts the link. */
  onChange: (link: { eventId: string; deadline: string } | null) => void;
}

const Dot = ({ event }: { event: BaseEvent }) => (
  <span
    aria-hidden="true"
    style={{
      width: 10, height: 10, flex: '0 0 auto', borderRadius: '50%',
      backgroundColor: `var(--job-${event.colour ?? DEFAULT_EVENT_COLOUR})`,
    }}
  />
);

export function EventLinkField({ eventId, deadline, onChange }: EventLinkFieldProps) {
  const events = useEventStore((s) => s.events);
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const now = new Date();
  const linked = eventId ? events.find((e) => e.id === eventId) : undefined;

  if (linked) {
    const due = readDue(deadline, now, tz);
    return (
      <div
        data-event-link={linked.id}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0,
          padding: 'var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-5)', borderRadius: 'var(--r-md)',
          background: 'var(--glass-fill-1)', boxShadow: 'inset 0 0 0 1px var(--glass-rim-1)',
        }}
      >
        <Dot event={linked} />
        <span style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Due before {linked.title}
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            {due ? fullDueDate(due.at, tz) : 'Its date cannot be read'}
            {isAllDay(linked) ? ', the evening before' : ', when it starts'}
          </span>
        </span>
        <IconButton size="sm" variant="ghost" label={`Not due before ${linked.title}`} onClick={() => onChange(null)}>
          <Icon name="x" size={16} />
        </IconButton>
      </div>
    );
  }

  const coming = upcomingEvents(events, now, tz);
  if (coming.length === 0) return null;
  const items: MorphMenuItem[] = coming.map(({ event, moment }) => ({
    value: event.id,
    label: event.title,
    icon: <Dot event={event} />,
    /* Its first day only, "Thu 12 Nov": a span's two days crowded the name out. */
    meta: describeWhen(moment, isAllDay(event), now, tz).split(/,| – /)[0],
    onSelect: () => {
      const deadline = linkedDeadline(event, now, tz);
      if (deadline) onChange({ eventId: event.id, deadline });
    },
  }));

  return (
    <MorphMenu
      portal
      zIndex={Z.dropdown}
      width={280}
      items={items}
      trigger={(
        <SoftButton size="sm" icon={<Icon name="calendar-clock" size={16} />} style={{ justifySelf: 'start' }}>
          Due before an event…
        </SoftButton>
      )}
    />
  );
}
