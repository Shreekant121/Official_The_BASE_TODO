import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarWrite, GoogleCalendarEvent } from './googleCalendar';

/**
 * 29-2c1: events in the reconcile pass, with Google and Firestore stood in
 * for — `notificationSync.ts` reaches `./firebase` otherwise. What is pinned
 * is what reaches Google: what is written, what is swept, and what is left
 * alone while the events document has not been read.
 */

const google = vi.hoisted(() => ({ events: [] as GoogleCalendarEvent[], writes: [] as CalendarWrite[] }));

vi.mock('./firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  getDocs: async () => ({ docs: [] }),
  deleteDoc: async () => {},
  writeBatch: () => ({ set: () => {}, delete: () => {}, commit: async () => {} }),
  serverTimestamp: () => 0,
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}));
vi.mock('./notifications', () => ({
  fetchNotificationSettings: async () => ({
    enabled: true, defaultDeadlineOffsetMinutes: 30,
    googleNotificationCalendarId: 'cal', googleNotificationCalendarName: 'BASE',
  }),
  updateNotificationSettings: async () => {},
  notificationDocRef: () => ({}),
  notificationsCollectionRef: () => ({}),
}));
vi.mock('./googleCalendar', () => ({
  getOrCreateNotificationCalendar: async () => ({ ok: true, data: { id: 'cal', summary: 'BASE' } }),
  listCalendarEvents: async () => ({ ok: true, data: google.events }),
  runCalendarWrites: async (_token: string, writes: CalendarWrite[]) => {
    google.writes.push(...writes);
    return writes.map((w) => ({ key: w.key, ok: true, status: 200 }));
  },
  deleteEvent: async () => ({ ok: true }),
}));

const { reconcileAllNotifications } = await import('./notificationSync');
const { markEventsRead, useEventStore } = await import('../store/useEventStore');
const { eventCalendarBody, eventCalendarId } = await import('./events/eventCalendar');

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const race = { id: 'race-1', title: 'Mumbai Marathon', start: '2026-11-12T06:00', alerts: [1440], createdAt: 0 };

beforeEach(() => {
  google.events = [];
  google.writes = [];
  useEventStore.setState({ events: [race] });
  markEventsRead('me');
});

const pass = () => reconcileAllNotifications('me', [], 'token');

describe('events on the BASE calendar', () => {
  it('a new event is inserted under its own id, with its alert', async () => {
    await pass();
    expect(google.writes).toHaveLength(1);
    const [write] = google.writes;
    expect(write).toMatchObject({ key: 'event:race-1', method: 'POST', path: '/calendars/cal/events' });
    expect(write.body).toMatchObject({
      id: eventCalendarId('race-1'), summary: 'Mumbai Marathon',
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }] },
    });
  });

  it('one Google already holds is not written again', async () => {
    const body = eventCalendarBody(race, { enabled: true }, TZ)!;
    google.events = [{ id: eventCalendarId('race-1'), status: 'confirmed', ...body } as GoogleCalendarEvent];
    await pass();
    expect(google.writes).toEqual([]);
  });

  it('a changed one is written whole, revived if it was deleted in Google', async () => {
    const body = eventCalendarBody(race, { enabled: true }, TZ)!;
    google.events = [{ id: eventCalendarId('race-1'), ...body, summary: 'Old name', status: 'cancelled' } as GoogleCalendarEvent];
    await pass();
    expect(google.writes).toHaveLength(1);
    expect(google.writes[0]).toMatchObject({ method: 'PUT', path: `/calendars/cal/events/${eventCalendarId('race-1')}` });
    expect(google.writes[0].body).toMatchObject({ summary: 'Mumbai Marathon', status: 'confirmed' });
    expect(google.writes[0].body).not.toHaveProperty('recurrence');
  });

  it('an event deleted in BASE is swept, never a task block, a reminder or a broken-out instance', async () => {
    useEventStore.setState({ events: [] });
    const gone = { summary: 'x', start: {}, end: {}, status: 'confirmed' };
    google.events = [
      { id: 'e1gone', ...gone },
      { id: 'e1master_20261112', recurringEventId: 'e1master', ...gone },
      { id: 'd4quickreminder', ...gone },
      { id: 'e1ghost', ...gone, status: 'cancelled' },
    ];
    await pass();
    expect(google.writes.map((w) => [w.method, w.path])).toEqual([['DELETE', '/calendars/cal/events/e1gone']]);
  });

  it('before the events document is read, events are neither written nor swept', async () => {
    markEventsRead(null);
    google.events = [{ id: 'e1other', summary: 'Made on the tablet', start: {}, end: {}, status: 'confirmed' }];
    await pass();
    expect(google.writes).toEqual([]);
  });
});
