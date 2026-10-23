/**
 * One event, new or saved (29-2a) — Google Calendar's detail menu, his call:
 * a title, all day or a time, a start and an end, a repeat, how its countdown
 * counts, a colour, a place and notes. Since 29-2b, a cover picture and a
 * shape, which the Countdown widget's Cover and Shape styles draw. Since
 * 29-2c1, alerts: his eight choices (`ALERT_CHOICES`), "a day before" on a new
 * event, and on an all-day event the time they ring (8am unless he sets one).
 * They ring both ways: Google Calendar on the BASE calendar, and since 29-2c2
 * a BASE push on the tablet (`lib/events/eventAlerts.ts`).
 *
 * Nothing is written until Save, so Close leaves a saved event as it was. The
 * repeat is the task sheet's own picker (`RecurrencePicker`), writing the same
 * two fields a task carries, and every save goes through `cleanEventDraft`.
 * Delete is a hold (`HoldToConfirm`): a deleted event goes to no Trash.
 *
 * Above the fields, the countdown it will show, live as the dates change —
 * so he sees "3 weeks 1 day" before he saves rather than after.
 *
 * 29-2d1: a saved event with tasks due before it lists them under When, so
 * moving the date says what moves with it. Linking is done from the task's
 * own sheet (Deadline → Due before an event); this list only reads.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Chip, COLOUR_JOB_INFO, HoldToConfirm, Icon, Input, SegmentedControl, Switch, Textarea, WhiteButton, type IconName,
} from '../../ui';
import CustomDropdown from '../CustomDropdown';
import type { TaskRecurrence } from '../../store/useStore';
import { useEventStore } from '../../store/useEventStore';
import { useStore } from '../../store/useStore';
import { tasksLinkedTo } from '../../lib/events/eventLinks';
import { DueDate } from '../task-fields/DueDate';
import { resolveUserTimeZone, toZonedDayString } from '../../lib/agent/dates';
import {
  ALERT_CHOICES, ALL_DAY_ALERT_CHOICES, COUNTDOWN_STYLES, COUNTDOWN_STYLE_LABELS, DEFAULT_ALERT_TIME, DEFAULT_EVENT_ALERTS,
  DEFAULT_EVENT_COLOUR, DEFAULT_EVENT_SHAPE, EVENT_COLOURS, EVENT_SHAPES, EVENT_SHAPE_LABELS, MAX_ALERTS, addDays,
  alertLabel, cleanAlerts, cleanEventDraft, countdownReading, countdownText, describeWhen, eventMoment,
  type CountdownStyle, type EventColour, type EventDraft, type EventShape,
} from '../../lib/events/events';
import RecurrencePicker from '../task-fields/RecurrencePicker';
import CoverImageField from '../task-fields/CoverImageField';
import { EventShapeBox } from '../dashboard/countdownFaces';
import { Sheet } from '../dashboard/dialogs';

interface Props {
  eventId?: string;
  /** A new event's start: Capture hands the title and the day it was dropped on. */
  draft?: Partial<EventDraft>;
  onClose: () => void;
}

/** The form's own shape: a day and a time apart, as the two inputs hold them. */
interface Form {
  title: string;
  allDay: boolean;
  startDay: string;
  startTime: string;
  endDay: string;
  endTime: string;
  recurrence: TaskRecurrence;
  recurrenceRule?: string;
  countdown: CountdownStyle;
  colour: EventColour;
  location: string;
  notes: string;
  /** A `cover:` pointer (or, signed out, the picture), `''` for none. */
  imageUrl: string;
  shape: EventShape;
  /** As picked, timed or not: switching All day back and forth keeps "10 min before". */
  alerts: number[];
  alertTime: string;
}

function formOf(draft: Partial<EventDraft>, today: string, isNew: boolean): Form {
  const start = draft.start ?? addDays(today, 1);
  const allDay = start.length === 10;
  const startDay = start.slice(0, 10);
  const startTime = allDay ? '09:00' : start.slice(11, 16);
  const end = draft.end;
  return {
    title: draft.title ?? '',
    allDay,
    startDay,
    startTime,
    endDay: end ? end.slice(0, 10) : startDay,
    endTime: end && end.length > 10 ? end.slice(11, 16) : plusHour(startTime),
    recurrence: draft.recurrence ?? 'none',
    recurrenceRule: draft.recurrenceRule,
    countdown: draft.countdown ?? 'days-hours',
    colour: draft.colour ?? DEFAULT_EVENT_COLOUR,
    location: draft.location ?? '',
    notes: draft.notes ?? '',
    imageUrl: draft.imageUrl ?? '',
    shape: draft.shape ?? DEFAULT_EVENT_SHAPE,
    alerts: [...(draft.alerts ?? (isNew ? DEFAULT_EVENT_ALERTS : []))],
    alertTime: draft.alertTime ?? DEFAULT_ALERT_TIME,
  };
}

/** "09:00" → "10:00"; 23:xx stays 23:59, so an end never wraps before its start. */
function plusHour(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The form back into a draft. An end that is not after the start is left out. */
function draftOf(form: Form): Partial<EventDraft> {
  const start = form.allDay ? form.startDay : `${form.startDay}T${form.startTime}`;
  const end = form.allDay ? form.endDay : `${form.endDay}T${form.endTime}`;
  return {
    title: form.title,
    start,
    end: end > start ? end : undefined,
    recurrence: form.recurrence,
    recurrenceRule: form.recurrenceRule,
    countdown: form.countdown,
    colour: form.colour,
    location: form.location,
    notes: form.notes,
    imageUrl: form.imageUrl || undefined,
    shape: form.shape,
    alerts: cleanAlerts(form.alerts, form.allDay),
    alertTime: form.alertTime,
  };
}

export default function EventSheet({ eventId, draft, onClose }: Props) {
  const saved = useEventStore((s) => (eventId ? s.events.find((e) => e.id === eventId) : undefined));
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const [form, setForm] = useState<Form>(() => formOf(saved ?? draft ?? {}, toZonedDayString(new Date(), tz), !saved));
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));

  /* A new event opens on its name. `autoFocus` alone loses it when the sheet
     was opened from Ctrl+K or Capture: the one closing hands the focus back
     to whatever it was opened from, a moment after this mounts. */
  useEffect(() => {
    if (saved) return undefined;
    const t = setTimeout(() => document.querySelector<HTMLInputElement>('[data-event-name]')?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [saved]);

  /* Moving the start carries the end with it, keeping its length, as Google does. */
  const setStartDay = (startDay: string) => {
    if (!startDay) return;
    const shift = Date.parse(`${startDay}T00:00Z`) - Date.parse(`${form.startDay}T00:00Z`);
    const endDay = new Date(Date.parse(`${form.endDay}T00:00Z`) + shift).toISOString().slice(0, 10);
    set({ startDay, endDay });
  };

  const clean = cleanEventDraft(draftOf(form));
  const now = new Date();
  const preview = clean ? eventMoment({ id: 'preview', createdAt: 0, ...clean }, now, tz) : null;

  const save = () => {
    if (!clean) return;
    const store = useEventStore.getState();
    if (saved) store.updateEvent(saved.id, { ...draftOf(form) });
    else store.addEvent(clean);
    onClose();
  };

  return (
    <Sheet
      label={saved ? `Edit ${saved.title}` : 'New event'}
      title={saved ? 'Event' : 'New event'}
      sub="A date to count down to: a trip, a birthday, a race."
      onClose={onClose}
      width={540}
    >
      <div className="ag-scroll ag-fade" style={{ display: 'grid', gap: 'var(--sp-7)', maxHeight: '62vh', overflowY: 'auto', overscrollBehavior: 'contain', margin: '0 calc(var(--sp-2) * -1)', padding: '0 var(--sp-2)' }}>
        <Input
          data-event-name
          autoFocus={!saved}
          size="lg"
          aria-label="Event name"
          placeholder="What is it?"
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) save(); }}
        />

        {preview && (
          <div data-event-preview style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', flexWrap: 'wrap', marginTop: 'calc(var(--sp-4) * -1)' }}>
            <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: `var(--job-${form.colour})` }}>
              {countdownText(countdownReading(preview, now, form.countdown, form.allDay, tz))}
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              {describeWhen(preview, form.allDay, now, tz)}
            </span>
          </div>
        )}

        <Field icon="calendar" label="When">
          <Switch checked={form.allDay} onChange={(allDay) => set({ allDay })} label="All day" />
          <Row label="Starts" timed={!form.allDay}>
            <Input type="date" aria-label="Start date" value={form.startDay} onChange={(e) => setStartDay(e.target.value)} />
            {!form.allDay && (
              <Input
                type="time"
                aria-label="Start time"
                value={form.startTime}
                onChange={(e) => e.target.value && set({ startTime: e.target.value, ...(form.endDay === form.startDay && e.target.value >= form.endTime ? { endTime: plusHour(e.target.value) } : {}) })}
              />
            )}
          </Row>
          <Row label="Ends" timed={!form.allDay}>
            <Input type="date" aria-label="End date" min={form.startDay} value={form.endDay} onChange={(e) => e.target.value && set({ endDay: e.target.value })} />
            {!form.allDay && (
              <Input type="time" aria-label="End time" value={form.endTime} onChange={(e) => e.target.value && set({ endTime: e.target.value })} />
            )}
          </Row>
        </Field>

        {saved && <DueBefore eventId={saved.id} allDay={form.allDay} />}

        <Field icon="bell" label="Alerts">
          <Alerts form={form} set={set} />
        </Field>

        <Field icon="repeat" label="Repeat">
          <RecurrencePicker
            value={form.recurrence}
            customRule={form.recurrenceRule}
            onChange={(recurrence, recurrenceRule) => set({ recurrence, recurrenceRule })}
          />
          {form.recurrence !== 'none' && (
            <span style={hint}>When it has been, it counts down to the next one.</span>
          )}
        </Field>

        <Field icon="hourglass" label="Count in">
          <SegmentedControl
            look="soft"
            size="sm"
            options={COUNTDOWN_STYLES.map((s) => ({ value: s, label: COUNTDOWN_STYLE_LABELS[s] }))}
            value={form.countdown}
            onChange={(v) => set({ countdown: v as CountdownStyle })}
          />
        </Field>

        <Field icon="palette" label="Colour">
          <div role="radiogroup" aria-label="Colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            {EVENT_COLOURS.map((c) => {
              const on = c === form.colour;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={COLOUR_JOB_INFO[c].name}
                  title={COLOUR_JOB_INFO[c].name}
                  onClick={() => set({ colour: c })}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer',
                    backgroundColor: `var(--job-${c})`,
                    boxShadow: on
                      ? '0 0 0 2px var(--void-1), 0 0 0 3.5px var(--fg-2)'
                      : '0 0 0 2px var(--void-1), 0 0 0 3.5px transparent',
                    transition: 'box-shadow var(--dur-fast) var(--ease-glass)',
                  }}
                />
              );
            })}
          </div>
        </Field>

        <Field icon="image" label="Cover">
          <CoverImageField value={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />
          <span style={hint}>The Countdown's Cover style shows it, with the days over it.</span>
        </Field>

        <Field icon="circle" label="Shape">
          <div role="radiogroup" aria-label="Shape" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
            {EVENT_SHAPES.map((s) => {
              const on = s === form.shape;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={EVENT_SHAPE_LABELS[s]}
                  title={EVENT_SHAPE_LABELS[s]}
                  onClick={() => set({ shape: s })}
                  style={{
                    display: 'grid', placeItems: 'center', width: 44, height: 44, border: 0, padding: 0, cursor: 'pointer',
                    borderRadius: 'var(--r-sm)', backgroundColor: 'transparent',
                    boxShadow: on ? 'inset 0 0 0 1.5px var(--fg-2)' : 'inset 0 0 0 1.5px transparent',
                    transition: 'box-shadow var(--dur-fast) var(--ease-glass)',
                  }}
                >
                  <EventShapeBox shape={s} colour={form.colour} size={30} style={{ opacity: on ? 1 : 0.55 }} />
                </button>
              );
            })}
          </div>
          <span style={hint}>The Countdown's Shape style holds the days in it.</span>
        </Field>

        <Field icon="map-pin" label="Place">
          <Input aria-label="Place" placeholder="Where it is" value={form.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>

        <Field icon="file-text" label="Notes">
          <Textarea aria-label="Notes" placeholder="Anything to remember" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        {saved && (
          <HoldToConfirm
            doneLabel="Deleted"
            onConfirm={() => { useEventStore.getState().removeEvent(saved.id); onClose(); }}
          >
            Hold to delete
          </HoldToConfirm>
        )}
        <span style={{ flex: 1 }} />
        <WhiteButton disabled={!clean} onClick={save} icon={<Icon name="check" size={17} />}>
          {saved ? 'Save' : 'Add event'}
        </WhiteButton>
      </div>
    </Sheet>
  );
}

const hint: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

/**
 * The alerts as chips, each with its ✕, and a menu of the choices left — the
 * whole days only on an all-day event, five at most (Google's limit). All
 * day, the time they ring sits under them.
 */
function Alerts({ form, set }: { form: Form; set: (patch: Partial<Form>) => void }) {
  const shown = cleanAlerts(form.alerts, form.allDay);
  const left = (form.allDay ? ALL_DAY_ALERT_CHOICES : ALERT_CHOICES).filter((m) => !shown.includes(m));
  const remove = (m: number) => set({ alerts: form.alerts.filter((a) => a !== m) });
  return (
    <>
      {shown.length > 0 && (
        <div data-event-alerts style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          {shown.map((m) => (
            <Chip key={m} icon="bell" style={{ paddingRight: 'var(--sp-2)' }}>
              {alertLabel(m, form.allDay)}
              <button
                type="button"
                aria-label={`Remove ${alertLabel(m, form.allDay).toLowerCase()}`}
                onClick={() => remove(m)}
                style={{ display: 'inline-grid', placeItems: 'center', verticalAlign: 'middle', width: 24, height: 24, marginLeft: 'var(--sp-2)', border: 0, padding: 0, borderRadius: '50%', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer' }}
              >
                <Icon name="x" size={13} />
              </button>
            </Chip>
          ))}
        </div>
      )}
      {shown.length < MAX_ALERTS && left.length > 0 && (
        <CustomDropdown<number>
          ariaLabel="Add an alert"
          placeholder={shown.length === 0 ? 'No alerts. Add one' : 'Add an alert'}
          value={-1}
          options={left.map((m) => ({ value: m, label: alertLabel(m, form.allDay) }))}
          onChange={(m) => set({ alerts: [...form.alerts, m] })}
        />
      )}
      {form.allDay && shown.length > 0 && (
        <Row label="Ring at" timed={false}>
          <Input type="time" aria-label="Alert time" value={form.alertTime} onChange={(e) => e.target.value && set({ alertTime: e.target.value })} />
        </Row>
      )}
      {shown.length > 0 && (
        <span style={hint}>
          {form.allDay && shown.includes(0)
            ? "BASE rings them on the tablet, and Google Calendar too. Google can't ring on the day itself: BASE's alert is the only one."
            : 'BASE rings them on the tablet, and Google Calendar on the BASE calendar.'}
        </span>
      )}
    </>
  );
}

/** The tasks due before this event (29-2d1), finished ones dimmed; nothing when there are none. */
function DueBefore({ eventId, allDay }: { eventId: string; allDay: boolean }) {
  const backlog = useStore((s) => s.backlogTasks);
  const linked = useMemo(() => tasksLinkedTo(backlog, eventId), [backlog, eventId]);
  if (linked.length === 0) return null;
  return (
    <Field icon="list-checks" label="Due before it">
      <div data-event-tasks style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {linked.map((t) => {
          const done = t.status === 'completed';
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
              <Icon name={done ? 'check' : 'circle'} size={14} style={{ flex: '0 0 auto', color: done ? 'var(--job-lime)' : 'var(--fg-4)' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', font: 'var(--type-body)', color: done ? 'var(--fg-4)' : 'var(--fg-2)' }}>
                {t.title}
              </span>
              {!done && <DueDate deadline={t.deadline} />}
            </div>
          );
        })}
      </div>
      <span style={hint}>
        {allDay ? 'Due at 6pm the day before' : 'Due when it starts'}, and they move with it. A task you finished keeps its date.
      </span>
    </Field>
  );
}

function Field({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-kicker)',
          letterSpacing: 'var(--tracking-kicker)', textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
          color: 'var(--fg-3)',
        }}
      >
        <Icon name={icon} size={14} />
        {label}
      </span>
      {children}
    </div>
  );
}

/* All day, the date takes the row: an empty time column squeezed it on a phone. */
function Row({ label, timed, children }: { label: string; timed: boolean; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: timed ? '56px minmax(0, 1fr) minmax(0, 0.7fr)' : '56px minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-3)' }}>
      <span style={{ font: 'var(--type-label)', color: 'var(--fg-3)' }}>{label}</span>
      {children}
    </div>
  );
}
