/**
 * The archive of passed events (29-2a) — inside the Countdown widget, his
 * call: a one-off that has been, or a repeat that ran out, most recent first.
 *
 * Nothing is moved into it: passed is worked out from the dates
 * (`passedEvents`), so opening one and giving it a new date brings it back
 * to the widget, and deleting it is the event sheet's hold.
 */
import { useMemo } from 'react';
import { EmptyCalm, Icon } from '../../ui';
import { useEventStore } from '../../store/useEventStore';
import { useEventSheet } from '../../store/useEventSheet';
import { resolveUserTimeZone, toZonedDayString } from '../../lib/agent/dates';
import { DEFAULT_EVENT_COLOUR, daysBetween, describeWhen, isAllDay, passedEvents } from '../../lib/events/events';
import { Sheet } from '../dashboard/dialogs';

/** "Yesterday", "12 days ago", "A year ago". */
function agoWords(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} months ago`;
  const years = Math.round(days / 365);
  return years === 1 ? 'A year ago' : `${years} years ago`;
}

export default function EventArchiveSheet({ onClose }: { onClose: () => void }) {
  const events = useEventStore((s) => s.events);
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const now = new Date();
  const today = toZonedDayString(now, tz);
  const passed = passedEvents(events, now, tz);

  return (
    <Sheet
      label="Passed events"
      title="Passed"
      sub="Events that have been. Open one to give it a new date, or to delete it."
      onClose={onClose}
    >
      {passed.length === 0 ? (
        <EmptyCalm art="leaf" title="Nothing has passed yet." />
      ) : (
        <div className="ag-scroll ag-fade" style={{ display: 'grid', gap: 2, maxHeight: '56vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {passed.map(({ event, moment }) => (
            <button
              key={event.id}
              type="button"
              className="dash-row"
              data-event-row={event.id}
              onClick={() => useEventSheet.getState().openEvent(event.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}
            >
              <span
                aria-hidden="true"
                style={{ width: 10, height: 10, flex: '0 0 auto', borderRadius: '50%', backgroundColor: `var(--job-${event.colour ?? DEFAULT_EVENT_COLOUR})`, opacity: 0.6 }}
              />
              <span style={{ display: 'grid', flex: 1, minWidth: 0, textAlign: 'left' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-1)' }}>{event.title}</span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  {describeWhen(moment, isAllDay(event), now, tz)}{moment.ended ? ' · its repeats ended' : ''}
                </span>
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                {agoWords(daysBetween(toZonedDayString(new Date(moment.end.getTime() - 1), tz), today))}
              </span>
              <Icon name="chevron-right" size={15} style={{ color: 'var(--fg-4)' }} />
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}
