import { defineTool, optionalBoolean, requiredRecordArray, requiredStringArray, ToolArgError } from '../toolKit';
import type { JsonSchema, ToolArgs, ToolContext, ToolDef, ToolResult } from '../types';
import { resolveDateInput, toZonedDayString } from '../dates';
import { describeRecurrenceRule, formatRRule, parseRRule, resolveRule } from '../../recurrence';
import {
  ALERT_CHOICES, COUNTDOWN_STYLES, DEFAULT_EVENT_ALERTS, EVENT_COLOURS, EVENT_SHAPES, MAX_ALERTS, alertLabel, cleanAlerts,
  countdownReading, countdownText, describeWhen, eventMoment, isAllDay, isEventDate, passedEvents, upcomingEvents,
  type BaseEvent, type EventDraft, type EventWithMoment,
} from '../../events/events';
import { useEventStore } from '../../../store/useEventStore';
import { tasksLinkedTo } from '../../events/eventLinks';
import { addDays } from '../../dashboard/hours';
import { eventsOnDays, tasksDueOn } from '../../calendar/calendar';
import { ignoredWorkOf } from '../../ignoredWork';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';

/**
 * 29-2a — EVENTS AND THEIR COUNTDOWNS, FOR ATLAS.
 *
 * His rule (2026-10-14): Atlas can do everything he can. An event is made,
 * changed and deleted here through `useEventStore`'s own actions — the ones
 * the event sheet calls — so a tool cannot store what the sheet would not
 * (`cleanEventDraft` runs on every write). The store is the same one on both
 * hosts: `mcp/store.ts` reads and writes `users/{uid}/data/events` beside
 * `data/main` on the laptop, and in the page it is the live store.
 *
 * Every write captures the event first (`captureEvent`), so Revert on `/log`
 * puts it back whole, a deleted one included — events go to no Trash. So all
 * four are free, like `move_task`: nothing here is out of reach of Revert.
 *
 * Lists in, as every tool (`batch.ts`, rule 1). An all-day event is a bare
 * date; a time makes it timed — the shape of `start` is the whole of "all
 * day", here as in the sheet.
 *
 * 29-2c1: alerts are `alertMinutes`, minutes before, as a task's
 * `reminderMinutes` is — his eight choices only, and a new event starts with
 * a day before when none are sent, as one made in the sheet does. On an
 * all-day event they are whole days, ringing at `alertTime`.
 *
 * 29-2d1: tasks due before an event (`Task.eventId`, set by `create_task` /
 * `update_task`'s `eventId`) move with it when its date changes, and lose the
 * link when it is deleted — the event store does both. So a change here can
 * write tasks too, and every one is captured before the call, or Revert would
 * put the event back and leave its tasks where it had moved them.
 *
 * 29-2e1: `whats_on` reads a day or a run of days as the Calendar screen
 * draws them — events (every occurrence of a repeat) and the tasks due —
 * from the screen's own `lib/calendar/calendar.ts`, so the two agree. The set
 * of days is worked out here, never left to the model: gemma cannot pick
 * tasks by a time window on its own (29-1c2).
 */

const EVENT_CAP = 25;
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'] as const;
type Repeat = (typeof REPEATS)[number];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** What a date the model sent means for an event: a bare day stays all day. */
function readEventDate(raw: string, key: string, ctx: ToolContext): string {
  const input = raw.trim();
  const relative = { today: 0, tomorrow: 1 }[input.toLowerCase() as 'today' | 'tomorrow'];
  if (relative !== undefined) return toZonedDayString(new Date(ctx.now.getTime() + relative * 86_400_000), ctx.timezone);
  if (DAY.test(input)) {
    if (!isEventDate(input)) throw new ToolArgError(`"${key}" is "${raw}", which is not a real date.`);
    return input;
  }
  const resolved = resolveDateInput(input, ctx.now, ctx.timezone);
  if (!resolved.ok) throw new ToolArgError(`"${key}": ${resolved.error} A bare date makes it all day.`);
  return resolved.value;
}

const str = (item: Record<string, unknown>, key: string): string | undefined => {
  const value = item[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ToolArgError(`"${key}" must be a string.`);
  return value;
};

function oneOf<T extends string>(item: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined {
  const value = str(item, key);
  if (value === undefined || value === '') return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new ToolArgError(`"${key}" must be one of: ${allowed.join(', ')}.`);
  return value as T;
}

/**
 * The fields an entry names, as a patch. A field sent as `""` is cleared;
 * one left out is not touched (an update) or left empty (a new event).
 */
function readFields(item: Record<string, unknown>, ctx: ToolContext): Partial<EventDraft> {
  const patch: Partial<EventDraft> = {};
  const title = str(item, 'title');
  if (title !== undefined) patch.title = title;
  const start = str(item, 'start');
  if (start !== undefined && start.trim() !== '') patch.start = readEventDate(start, 'start', ctx);
  const end = str(item, 'end');
  if (end !== undefined) patch.end = end.trim() === '' ? undefined : readEventDate(end, 'end', ctx);

  const rule = str(item, 'repeatRule');
  const repeat = oneOf<Repeat>(item, 'repeat', REPEATS) ?? (rule ? 'custom' : undefined);
  if (repeat !== undefined) {
    patch.recurrence = repeat;
    patch.recurrenceRule = undefined;
    if (repeat === 'custom') {
      const parsed = parseRRule(rule);
      if (!parsed) throw new ToolArgError('"repeat": "custom" needs "repeatRule", an RRULE such as "FREQ=MONTHLY;BYDAY=-1FR".');
      patch.recurrenceRule = formatRRule(parsed);
    }
  }
  for (const key of ['location', 'notes'] as const) {
    const value = str(item, key);
    if (value !== undefined) patch[key] = value;
  }
  if ('colour' in item) patch.colour = oneOf(item, 'colour', EVENT_COLOURS);
  if ('countdown' in item) patch.countdown = oneOf(item, 'countdown', COUNTDOWN_STYLES);
  if ('shape' in item) patch.shape = oneOf(item, 'shape', EVENT_SHAPES);
  if ('alertMinutes' in item) {
    const raw = item.alertMinutes;
    if (!Array.isArray(raw) || raw.some((m) => !ALERT_CHOICES.includes(m as number))) {
      throw new ToolArgError(`"alertMinutes" must be a list of: ${ALERT_CHOICES.join(', ')} (minutes before). [] takes every alert off.`);
    }
    if (raw.length > MAX_ALERTS) throw new ToolArgError(`"alertMinutes": ${MAX_ALERTS} alerts at most.`);
    patch.alerts = raw as number[];
  }
  const alertTime = str(item, 'alertTime');
  if (alertTime !== undefined) {
    /* "08:00:00" read as "08:00": gemma sends seconds on times (29-2a). */
    const time = alertTime.trim().slice(0, 5);
    if (time !== '' && !CLOCK.test(time)) throw new ToolArgError('"alertTime" is a time of day, "HH:mm", e.g. "08:00".');
    patch.alertTime = time || undefined;
  }
  /* 29-2b: a picture is his to pick in the sheet; Atlas can only take one off. */
  if (item.removeCover === true) patch.imageUrl = undefined;
  else if (item.removeCover !== undefined && item.removeCover !== false) throw new ToolArgError('"removeCover" must be true or false.');
  return patch;
}

/** One event as the model reads it: ids in, everything said in words. */
function eventLine({ event, moment }: EventWithMoment, ctx: ToolContext): Record<string, unknown> {
  const rule = resolveRule(event);
  return {
    eventId: event.id,
    title: event.title,
    start: event.start,
    ...(event.end ? { end: event.end } : {}),
    allDay: isAllDay(event),
    when: describeWhen(moment, isAllDay(event), ctx.now, ctx.timezone),
    countdown: countdownText(countdownReading(moment, ctx.now, event.countdown, isAllDay(event), ctx.timezone)),
    state: moment.kind,
    ...(rule ? { repeats: describeRecurrenceRule(rule) } : {}),
    ...(event.location ? { location: event.location } : {}),
    ...(event.notes ? { notes: event.notes } : {}),
    ...(event.colour ? { colour: event.colour } : {}),
    ...(event.countdown ? { countsIn: event.countdown } : {}),
    ...(event.shape ? { shape: event.shape } : {}),
    ...(event.imageUrl ? { hasCover: true } : {}),
    alerts: cleanAlerts(event.alerts, isAllDay(event)).map((m) => alertLabel(m, isAllDay(event))),
    ...(isAllDay(event) && event.alerts?.length ? { alertTime: event.alertTime ?? '08:00' } : {}),
    ...dueBefore(event.id, ctx),
  };
}

/** 29-2d1: the tasks due before it, as rows Atlas can act on. Absent when none. */
function dueBefore(eventId: string, ctx: ToolContext): { tasksDueBefore?: Record<string, unknown>[] } {
  const linked = tasksLinkedTo(ctx.store.getState().backlogTasks, eventId);
  return linked.length === 0 ? {} : {
    tasksDueBefore: linked.map((t) => ({ taskId: t.id, title: t.title, ...(t.status === 'completed' ? { done: true } : {}) })),
  };
}

/** Everything a change to the event may write: its tasks, captured for Revert. */
function captureLinked(eventId: string, ctx: ToolContext): void {
  for (const task of tasksLinkedTo(ctx.store.getState().backlogTasks, eventId)) ctx.snapshots.captureTask(ctx.snapshotHandle, task.id);
}

const FIELD_SCHEMAS: Record<string, JsonSchema> = {
  start: {
    type: 'string',
    description: 'When it starts. "YYYY-MM-DD" for an all-day event (a birthday, a trip), "YYYY-MM-DDTHH:mm" for a time, or today / tomorrow.',
  },
  end: { type: 'string', description: 'When it ends, in the same form as start. Only if he said. "" clears it.' },
  repeat: { type: 'string', enum: [...REPEATS], description: 'How it repeats. A birthday is yearly. "none" stops a repeat.' },
  repeatRule: { type: 'string', description: 'Only for repeat "custom": an RRULE, e.g. "FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR" (the last Friday).' },
  location: { type: 'string', description: 'Where it is. "" clears it.' },
  notes: { type: 'string', description: 'Notes on it. "" clears them.' },
  colour: { type: 'string', enum: [...EVENT_COLOURS], description: 'Its colour, only if he asked for one.' },
  countdown: {
    type: 'string', enum: [...COUNTDOWN_STYLES],
    description: 'How its countdown counts: days-hours (the default), days, weeks or hours.',
  },
  shape: {
    type: 'string', enum: [...EVENT_SHAPES],
    description: 'The shape its countdown sits in on a Countdown widget drawn in the Shape style. circle is the default.',
  },
  alertMinutes: {
    type: 'array',
    items: { type: 'integer' },
    description:
      'When Google Calendar rings it, in minutes before, only these: 0 at the time, 10, 30, 60 an hour, 1440 a day, 2880 ' +
      'two days, 10080 a week, 40320 four weeks before. Up to 5. Left out of a new event, it rings a day before; [] takes ' +
      'every alert off. An all-day event takes whole days only (0 is on the day).',
  },
  alertTime: {
    type: 'string',
    description: 'All-day events only: the time of day its alerts ring, "HH:mm". 08:00 when left out.',
  },
};

export const listEvents: ToolDef = defineTool({
  name: 'list_events',
  mutates: false,
  description:
    'List his events — dates he counts down to (a trip, a birthday, a race; not tasks) — soonest first, each with how ' +
    'long is left and its eventId. includePassed adds the ones that have been (the archive).',
  parametersSchema: {
    type: 'object',
    properties: { includePassed: { type: 'boolean', description: 'Also list events that have passed.' } },
    required: [],
  },
  execute: async (args: ToolArgs, ctx): Promise<ToolResult> => {
    const events = useEventStore.getState().events;
    const coming = upcomingEvents(events, ctx.now, ctx.timezone).map((e) => eventLine(e, ctx));
    const passed = optionalBoolean(args, 'includePassed') ? passedEvents(events, ctx.now, ctx.timezone).map((e) => eventLine(e, ctx)) : [];
    const summary = coming.length === 0 && passed.length === 0
      ? 'He has no events.'
      : `${coming.length} coming${passed.length > 0 ? `, ${passed.length} passed` : ''}.`;
    return { ok: true, summary, data: { events: coming, ...(passed.length > 0 ? { passed } : {}) } };
  },
});

export const createEvent: ToolDef = defineTool({
  name: 'create_event',
  mutates: true,
  description:
    'Create events: dates to count down to on the Dashboard (a trip, a birthday, a race, a class) — not tasks. ' +
    'Takes a list; make everything he named in ONE call. Each needs a title and a start; send other fields only when ' +
    'he said them.',
  parametersSchema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        description: 'Every event to create.',
        items: {
          type: 'object',
          properties: { title: { type: 'string', description: 'What it is, as he would say it.' }, ...FIELD_SCHEMAS },
          required: ['title', 'start'],
        },
      },
    },
    required: ['events'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const wanted = requiredRecordArray(args, 'events', 'title', (item) => item, { max: EVENT_CAP, what: 'events' });
    const outcome = await runBatch(wanted.map((_, i) => String(i)), async (_, i) => {
      const item = wanted[i];
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      try {
        const fields = readFields(item, ctx);
        if (!('alerts' in fields)) fields.alerts = [...DEFAULT_EVENT_ALERTS];
        if (!fields.start) return { ok: false as const, title: title || undefined, reason: 'it has no start date — ask him when it is.' };
        /* Captured before it exists, so Revert takes it away again. */
        const id = crypto.randomUUID();
        ctx.snapshots.captureEvent(ctx.snapshotHandle, id);
        if (!useEventStore.getState().addEvent(fields, id)) return { ok: false as const, title: title || undefined, reason: 'it has no title.' };
        const event = useEventStore.getState().events.find((e) => e.id === id) as BaseEvent;
        const moment = eventMoment(event, ctx.now, ctx.timezone);
        return { ok: true as const, title: event.title, value: moment ? eventLine({ event, moment }, ctx) : { eventId: id } };
      } catch (err) {
        return { ok: false as const, title: title || undefined, reason: err instanceof Error ? err.message : String(err) };
      }
    });
    return batchResult(outcome, (done) => `Added ${titleList(done.map((d) => d.title))} to his events.`, {
      events: outcome.done.map((d) => d.value),
    });
  },
}, { entryList: 'events' });

export const updateEvent: ToolDef = defineTool({
  name: 'update_event',
  mutates: true,
  description:
    'Change events: rename, move the date, the repeat, the place, notes, colour, shape, its alerts or how the countdown counts, or ' +
    'take its cover picture off. Takes a list. Send only the fields that change; "" clears an optional one. eventId ' +
    'comes from list_events. Tasks due before it move with its date by themselves. To make a task due before an ' +
    'event, use create_task or update_task with its eventId.',
  parametersSchema: {
    type: 'object',
    properties: {
      events: {
        type: 'array',
        description: 'One entry per event to change.',
        items: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'Exact id from list_events.' },
            title: { type: 'string', description: 'A new name.' },
            ...FIELD_SCHEMAS,
            removeCover: {
              type: 'boolean',
              description: 'true takes its cover picture off. Atlas cannot add one: he picks a picture in the event sheet.',
            },
          },
          required: ['eventId'],
        },
      },
    },
    required: ['events'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const wanted = requiredRecordArray(args, 'events', 'eventId', (item) => item, { max: EVENT_CAP, what: 'events' });
    const ids = wanted.map((item) => (typeof item.eventId === 'string' ? item.eventId.trim() : ''));
    const outcome = await runBatch(ids, async (eventId, i) => {
      const current = useEventStore.getState().events.find((e) => e.id === eventId);
      if (!current) return { ok: false as const, reason: missingIdReason('event') };
      try {
        const patch = readFields(wanted[i], ctx);
        if (Object.keys(patch).length === 0) return { ok: false as const, title: current.title, reason: 'nothing to change was sent.' };
        ctx.snapshots.captureEvent(ctx.snapshotHandle, eventId);
        captureLinked(eventId, ctx);
        if (!useEventStore.getState().updateEvent(eventId, patch)) {
          return { ok: false as const, title: current.title, reason: 'that would leave it with no title or no start.' };
        }
        const event = useEventStore.getState().events.find((e) => e.id === eventId) as BaseEvent;
        const moment = eventMoment(event, ctx.now, ctx.timezone);
        return { ok: true as const, title: event.title, value: moment ? eventLine({ event, moment }, ctx) : { eventId } };
      } catch (err) {
        return { ok: false as const, title: current.title, reason: err instanceof Error ? err.message : String(err) };
      }
    });
    return batchResult(outcome, (done) => `Changed ${titleList(done.map((d) => d.title))}.`, {
      events: outcome.done.map((d) => d.value),
    });
  },
}, { entryList: 'events' });

export const deleteEvent: ToolDef = defineTool({
  name: 'delete_event',
  mutates: true,
  description:
    'Delete events (from list_events). Tasks due before one keep their date and are no longer tied to it. Revert on ' +
    'the log puts them back.',
  parametersSchema: {
    type: 'object',
    properties: { eventIds: { type: 'array', items: { type: 'string' }, description: 'Exact ids from list_events.' } },
    required: ['eventIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const ids = requiredStringArray(args, 'eventIds', { max: EVENT_CAP, what: 'events' });
    const outcome = await runBatch(ids, async (eventId) => {
      const current = useEventStore.getState().events.find((e) => e.id === eventId);
      if (!current) return { ok: false as const, reason: missingIdReason('event') };
      ctx.snapshots.captureEvent(ctx.snapshotHandle, eventId);
      captureLinked(eventId, ctx);
      useEventStore.getState().removeEvent(eventId);
      return { ok: true as const, title: current.title, value: { eventId } };
    });
    return batchResult(outcome, (done) => `Deleted ${titleList(done.map((d) => d.title))}.`);
  },
});

/** A month and a bit: past that the answer is too long to read and the question is a different one. */
const WHATS_ON_DAYS = 31;

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

export const whatsOn: ToolDef = defineTool({
  name: 'whats_on',
  mutates: false,
  description:
    'What is on his calendar, day by day, for one day or a run of days: his events with their times (every repeat of ' +
    'a weekly class or a birthday included) and the tasks due that day, with their times — what his Calendar screen ' +
    'shows. Use it for "what have I got on Thursday", "what does next week look like", "am I free on the 14th". ' +
    'Work he has ignored is left out. A day with nothing on says nothing: true.',
  parametersSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'The first day: "YYYY-MM-DD", or today / tomorrow.' },
      to: { type: 'string', description: `The last day, the same way. Leave it out for one day. At most ${WHATS_ON_DAYS} days after from. A week is Monday to Sunday.` },
    },
    required: ['from'],
  },
  execute: async (args: ToolArgs, ctx): Promise<ToolResult> => {
    const day = (key: string): string | undefined => {
      const raw = str(args, key);
      return raw === undefined || raw.trim() === '' ? undefined : readEventDate(raw, key, ctx).slice(0, 10);
    };
    const from = day('from');
    if (!from) throw new ToolArgError('"from" is the first day, "YYYY-MM-DD".');
    const to = day('to') ?? from;
    if (to < from) throw new ToolArgError(`"to" (${to}) is before "from" (${from}).`);
    const days: string[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (days.length === WHATS_ON_DAYS) throw new ToolArgError(`At most ${WHATS_ON_DAYS} days in one call: ask for ${from} to ${addDays(from, WHATS_ON_DAYS - 1)} first.`);
      days.push(d);
    }

    const state = ctx.store.getState();
    const ignored = ignoredWorkOf(state.backlogTasks, state.taskLists, state.projects).ids;
    const events = eventsOnDays(useEventStore.getState().events, days, ctx.timezone);
    const due = tasksDueOn(state.backlogTasks, days, ctx.timezone, ignored, ctx.now);

    let eventCount = 0;
    let taskCount = 0;
    const rows = days.map((d) => {
      const evs = events.filter((e) => e.day === d).map((e) => ({
        eventId: e.eventId,
        title: e.title,
        time: e.allDay ? 'all day' : `${hhmm(e.start)}–${e.end === 1440 ? '24:00' : hhmm(e.end)}`,
        ...(e.location ? { location: e.location } : {}),
      }));
      const tasks = due.filter((t) => t.day === d).map((t) => ({
        taskId: t.taskId,
        title: t.title,
        due: t.time,
        ...(t.done ? { done: true } : {}),
        ...(t.late ? { overdue: true } : {}),
      }));
      eventCount += evs.length;
      taskCount += tasks.length;
      if (evs.length === 0 && tasks.length === 0) return { day: d, weekday: weekdayOf(d), nothing: true };
      return { day: d, weekday: weekdayOf(d), ...(evs.length ? { events: evs } : {}), ...(tasks.length ? { tasksDue: tasks } : {}) };
    });

    const span = from === to ? weekdayOf(from) : `${weekdayOf(from)} to ${weekdayOf(to)}`;
    const summary = eventCount === 0 && taskCount === 0
      ? `Nothing on ${span}.`
      : `${span}: ${eventCount} event${eventCount === 1 ? '' : 's'} and ${taskCount} task${taskCount === 1 ? '' : 's'} due.`;
    return { ok: true, summary, data: { days: rows } };
  },
});

export const eventTools: ToolDef[] = [listEvents, whatsOn, createEvent, updateEvent, deleteEvent];
