import { describe, expect, it } from 'vitest';
import { cleanAlerts, cleanEventDraft, alertLabel, googleReminderMinutes, type BaseEvent } from './events';
import { eventCalendarBody, eventCalendarId, eventCalendarMatches, eventWriteBody, EVENT_NOTE } from './eventCalendar';
import type { GoogleCalendarEvent } from '../googleCalendar';

const TZ = 'Asia/Kolkata';
const ON = { enabled: true };
const event = (over: Partial<BaseEvent>): BaseEvent => ({ id: 'ab-12', title: 'Mumbai Marathon', start: '2026-11-12', createdAt: 0, ...over });

describe('alerts on an event', () => {
  it('keeps only the menu, once each, furthest first, five at most', () => {
    expect(cleanAlerts([30, 1440, 30, 7, 'x', 40320], false)).toEqual([40320, 1440, 30]);
    expect(cleanAlerts([0, 10, 30, 60, 1440, 2880, 10080], false)).toEqual([10080, 2880, 1440, 60, 30]);
    expect(cleanAlerts(undefined, false)).toEqual([]);
  });

  it('keeps whole days on an all-day event', () => {
    expect(cleanAlerts([10, 60, 1440, 0], true)).toEqual([1440, 0]);
    expect(cleanEventDraft({ title: 'Birthday', start: '2026-11-12', alerts: [30, 2880] })?.alerts).toEqual([2880]);
  });

  it('stores no empty list, and the ring time only on an all-day event with alerts', () => {
    const none = cleanEventDraft({ title: 'A', start: '2026-11-12', alerts: [], alertTime: '07:00' });
    expect(none).not.toHaveProperty('alerts');
    expect(none).not.toHaveProperty('alertTime');
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', alerts: [1440], alertTime: '08:00' })).not.toHaveProperty('alertTime');
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', alerts: [1440], alertTime: '07:30' })?.alertTime).toBe('07:30');
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12', alerts: [1440], alertTime: '25:00' })).not.toHaveProperty('alertTime');
    expect(cleanEventDraft({ title: 'A', start: '2026-11-12T06:00', alerts: [60], alertTime: '07:30' })).not.toHaveProperty('alertTime');
  });

  it('says each choice in words', () => {
    expect([0, 10, 30, 60, 1440, 2880, 10080, 40320].map((m) => alertLabel(m, false))).toEqual([
      'At the time', '10 min before', '30 min before', '1 hour before', '1 day before', '2 days before', '1 week before', '4 weeks before',
    ]);
    expect(alertLabel(0, true)).toBe('On the day');
  });

  it('turns into Google reminders: a timed event counts from its start', () => {
    expect(googleReminderMinutes({ start: '2026-11-12T06:00', alerts: [1440, 0] })).toEqual([1440, 0]);
  });

  it('an all-day event rings at 8am, or its own time, before the midnight Google counts from', () => {
    /* A day before at 8am is 16 hours before the day's midnight. */
    expect(googleReminderMinutes({ start: '2026-11-12', alerts: [1440] })).toEqual([960]);
    expect(googleReminderMinutes({ start: '2026-11-12', alerts: [40320, 1440], alertTime: '19:00' })).toEqual([39180, 300]);
    /* On the day at 8am is after that midnight: Google cannot take it (the push will). */
    expect(googleReminderMinutes({ start: '2026-11-12', alerts: [0, 1440] })).toEqual([960]);
  });
});

describe('the event on Google', () => {
  it('takes an id Google accepts, under its own prefix', () => {
    expect(eventCalendarId('3f2a-ZZ_9')).toBe('e13f2a9');
    expect(eventCalendarId('ab-12')).toMatch(/^e1[a-v0-9]+$/);
  });

  it('is nothing while notifications are off', () => {
    expect(eventCalendarBody(event({}), { enabled: false }, TZ)).toBeNull();
  });

  it('draws all day as dates, ending the day after the last', () => {
    const body = eventCalendarBody(event({ end: '2026-11-14' }), ON, TZ)!;
    expect(body.start).toEqual({ date: '2026-11-12' });
    expect(body.end).toEqual({ date: '2026-11-15' });
    expect(eventCalendarBody(event({}), ON, TZ)!.end).toEqual({ date: '2026-11-13' });
  });

  it('draws a timed event as instants, an hour long with no end', () => {
    const body = eventCalendarBody(event({ start: '2026-11-12T06:00' }), ON, TZ)!;
    expect(body.start).toEqual({ dateTime: '2026-11-12T00:30:00.000Z' });
    expect(body.end).toEqual({ dateTime: '2026-11-12T01:30:00.000Z' });
  });

  it('carries the place, the notes, the colour and the alerts', () => {
    const body = eventCalendarBody(event({ start: '2026-11-12T06:00', location: 'Marine Drive', notes: 'Bib 4412', colour: 'coral', alerts: [1440, 60] }), ON, TZ)!;
    expect(body.location).toBe('Marine Drive');
    expect(body.description).toBe(`Bib 4412\n\n${EVENT_NOTE}`);
    expect(body.colorId).toBe('11');
    expect(body.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] });
    /* No alerts rings nothing, never Google's default. */
    expect(eventCalendarBody(event({}), ON, TZ)!.reminders).toEqual({ useDefault: false, overrides: [] });
    expect(eventCalendarBody(event({}), ON, TZ)!.colorId).toBe('7');
  });

  it('repeats from the event itself, with the zone it expands in', () => {
    const body = eventCalendarBody(event({ recurrence: 'yearly' }), ON, TZ)!;
    expect(body.recurrence).toEqual(['RRULE:FREQ=YEARLY;INTERVAL=1']);
    /* A date repeats on its date: no zone, which Google might not echo back. */
    expect(body.start).toEqual({ date: '2026-11-12' });
    const weekly = eventCalendarBody(event({ start: '2026-11-10T19:00', recurrence: 'weekly' }), ON, TZ)!;
    expect(weekly.recurrence[0]).toMatch(/^RRULE:FREQ=WEEKLY;.*WKST=SU$/);
    expect(weekly.start).toEqual({ dateTime: '2026-11-10T13:30:00.000Z', timeZone: TZ });
  });

  it('ends an all-day series on a date, as RFC 5545 asks beside a date', () => {
    const body = eventCalendarBody(event({ recurrence: 'custom', recurrenceRule: 'FREQ=YEARLY;INTERVAL=1;UNTIL=20300101' }), ON, TZ)!;
    expect(body.recurrence[0]).toContain('UNTIL=20300101');
    expect(body.recurrence[0]).not.toContain('UNTIL=20300101T');
  });

  it('leaves the repeat out of a one-off write, which a whole write reads as none', () => {
    const body = eventCalendarBody(event({}), ON, TZ)!;
    expect(eventWriteBody(body)).not.toHaveProperty('recurrence');
    expect(eventWriteBody(eventCalendarBody(event({ recurrence: 'yearly' }), ON, TZ)!)).toHaveProperty('recurrence');
  });
});

describe('whether Google already holds it', () => {
  const desired = eventCalendarBody(event({ start: '2026-11-12T06:00', location: 'Marine Drive', alerts: [1440], recurrence: 'weekly' }), ON, TZ)!;
  const asGoogle = (over: Partial<GoogleCalendarEvent> = {}): GoogleCalendarEvent => ({
    id: 'e1ab12',
    summary: desired.summary,
    description: desired.description,
    location: 'Marine Drive',
    colorId: desired.colorId,
    /* Google's own spelling of the same instant and rule. */
    start: { dateTime: '2026-11-12T06:00:00+05:30', timeZone: TZ },
    end: { dateTime: '2026-11-12T07:00:00+05:30', timeZone: TZ },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
    recurrence: [desired.recurrence[0].replace(';INTERVAL=1', ''), 'EXDATE;TZID=Asia/Kolkata:20261117T190000'],
    status: 'confirmed',
    ...over,
  });

  it('matches its own answer however Google spells it', () => {
    expect(eventCalendarMatches(asGoogle(), desired)).toBe(true);
  });

  it('reads several alerts in any order', () => {
    const two = eventCalendarBody(event({ start: '2026-11-12T06:00', alerts: [1440, 60] }), ON, TZ)!;
    const back = { ...two, id: 'e1ab12', status: 'confirmed', reminders: { useDefault: false, overrides: [...two.reminders.overrides].reverse() } };
    expect(eventCalendarMatches(back as GoogleCalendarEvent, two)).toBe(true);
  });

  it('sees every change he can make', () => {
    expect(eventCalendarMatches(asGoogle({ summary: 'Run' }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ location: undefined }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ colorId: '11' }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ reminders: { useDefault: true } }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ recurrence: [] }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ status: 'cancelled' }), desired)).toBe(false);
    expect(eventCalendarMatches(asGoogle({ start: { dateTime: '2026-11-12T07:00:00+05:30', timeZone: TZ } }), desired)).toBe(false);
  });

  it('tells a date from a time', () => {
    const allDay = eventCalendarBody(event({}), ON, TZ)!;
    const asDate = asGoogle({ start: { date: '2026-11-12' }, end: { date: '2026-11-13' }, location: undefined, recurrence: undefined, reminders: { useDefault: false, overrides: [] }, description: allDay.description, colorId: allDay.colorId });
    expect(eventCalendarMatches(asDate, allDay)).toBe(true);
    expect(eventCalendarMatches({ ...asDate, start: { date: '2026-11-12', dateTime: '2026-11-12T00:00:00Z' } }, allDay)).toBe(false);
  });
});
