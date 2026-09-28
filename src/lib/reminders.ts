/**
 * Quick standalone reminders — not tied to any task or focus period (e.g.
 * "remind me at 5pm about X"). Each one is mirrored to a single Google
 * Calendar event with a `minutes: 0` reminder override (fires exactly at
 * `remindAt`) on the dedicated "BASE" calendar (see
 * `lib/notificationSync.ts`).
 *
 * Self-contained lifecycle: creating, updating, or deleting a reminder here
 * handles its own Google Calendar event + local history row directly — the
 * global reconcile pass explicitly skips `'reminder'`-typed history docs so
 * it never fights with this module.
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import { upsertEventWithId, deleteEvent, type EventReminders } from './googleCalendar';
import { fetchNotificationSettings, notificationDocRef } from './notifications';
import { resolveNotificationCalendarId } from './notificationSync';
import { useUIStore } from '../store/useUIStore';
import { logDiag } from './googleDiagnostics';

export interface Reminder {
  id: string;
  title: string;
  notes?: string;
  /** ISO datetime string the reminder should fire at. */
  remindAt: string;
  googleEventId?: string;
  createdAt: number | null;
}

function remindersCollection(uid: string) {
  return collection(db, 'users', uid, 'reminders');
}

function sanitizeForEventId(id: string): string {
  return id.replace(/[^a-v0-9]/gi, '').toLowerCase();
}

/** Deterministic id for a quick reminder's Calendar event — never persisted, always re-derivable. */
function reminderEventId(reminderId: string): string {
  return `d4${sanitizeForEventId(reminderId)}`.slice(0, 500);
}

export function subscribeReminders(uid: string, cb: (reminders: Reminder[]) => void): Unsubscribe {
  const q = query(remindersCollection(uid), orderBy('remindAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          title: data.title as string,
          notes: data.notes as string | undefined,
          remindAt: data.remindAt as string,
          googleEventId: data.googleEventId as string | undefined,
          createdAt: (data.createdAt as Timestamp | undefined)?.toMillis() ?? null,
        };
      }),
    );
  });
}

/** Best-effort Calendar sync for a reminder — creates/updates the event + local history row. */
export async function syncReminderToGoogle(
  uid: string,
  reminder: Pick<Reminder, 'id' | 'title' | 'notes' | 'remindAt'>,
  token: string | null,
): Promise<void> {
  const remindAtMs = Date.parse(reminder.remindAt);
  if (Number.isNaN(remindAtMs)) return;

  const historyRef = notificationDocRef(uid, `${reminder.id}_reminder`);
  // `quiet` ⇒ Google is simply disconnected (no token / missing scope): stay
  // silent (no banner) and light only the Alerts nav dot, matching the
  // deadline pipeline. A single failed history row (deterministic doc id, so
  // it's updated in place, never duplicated) still records it on the
  // Notifications page. Loud (`quiet=false`) is reserved for a real Calendar
  // API write error that happened while we DO hold a working token.
  const writeFailed = async (reason: string, quiet: boolean) => {
    await setDoc(
      historyRef,
      {
        type: 'reminder',
        title: reminder.title,
        body: `${reminder.notes ? `${reminder.notes} — ` : ''}${reason}`,
        sourceId: reminder.id,
        sendAt: Timestamp.fromMillis(remindAtMs),
        status: 'failed',
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    if (quiet) {
      useUIStore.getState().setNotificationsNeedReconnect(true);
    } else {
      useUIStore.getState().setReminderSyncIssue(
        `Quick reminder “${reminder.title}” failed to sync — ${reason}`,
      );
    }
  };

  if (!token) {
    logDiag({
      level: 'warn',
      phase: 'reminder',
      code: 'no_token',
      message: `Quick reminder "${reminder.title}" can't sync — no active Google Calendar token.`,
    });
    await writeFailed('Google Calendar not connected', true);
    return;
  }

  const settings = await fetchNotificationSettings(uid);
  const calendar = await resolveNotificationCalendarId(uid, settings, token);
  if (!calendar.ok) {
    await writeFailed(calendar.message, true);
    return;
  }

  const eventId = reminderEventId(reminder.id);
  const reminders: EventReminders = { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] };
  const result = await upsertEventWithId(token, calendar.calendarId, eventId, {
    summary: reminder.title,
    description: reminder.notes,
    startISO: new Date(remindAtMs).toISOString(),
    endISO: new Date(remindAtMs + 60_000).toISOString(),
    reminders,
  });
  if (!result.ok) {
    logDiag({
      level: 'error',
      phase: 'reminder',
      code: 'event_write_failed',
      message: `Couldn't create the Google Calendar event for quick reminder "${reminder.title}".`,
      detail: result.message,
    });
    await writeFailed(`Calendar sync failed: ${result.message}`, false);
    return;
  }
  const event = result.data;

  const now = Date.now();
  await setDoc(
    historyRef,
    {
      type: 'reminder',
      title: reminder.title,
      body: reminder.notes ?? '',
      sourceId: reminder.id,
      sendAt: Timestamp.fromMillis(remindAtMs),
      status: remindAtMs > now ? 'scheduled' : 'passed',
      googleEventId: event.id,
      googleEventLink: event.htmlLink ?? null,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  // A working token just synced successfully — clear both the loud banner and
  // the quiet "needs reconnect" queue indicator.
  useUIStore.getState().setReminderSyncIssue(null);
  useUIStore.getState().setNotificationsNeedReconnect(false);
}

export async function createReminder(
  uid: string,
  input: { title: string; notes?: string; remindAt: string },
  token: string | null,
): Promise<void> {
  const id = crypto.randomUUID();
  await setDoc(doc(remindersCollection(uid), id), {
    title: input.title,
    notes: input.notes ?? '',
    remindAt: input.remindAt,
    createdAt: serverTimestamp(),
  });
  await syncReminderToGoogle(uid, { id, ...input }, token);
}

export async function updateReminder(
  uid: string,
  reminder: Reminder,
  updates: { title?: string; notes?: string; remindAt?: string },
  token: string | null,
): Promise<void> {
  await setDoc(doc(remindersCollection(uid), reminder.id), updates, { merge: true });
  await syncReminderToGoogle(uid, { ...reminder, ...updates }, token);
}

export async function deleteReminder(uid: string, reminder: Reminder, token: string | null): Promise<void> {
  await deleteDoc(doc(remindersCollection(uid), reminder.id));
  await deleteDoc(notificationDocRef(uid, `${reminder.id}_reminder`)).catch(() => {});
  if (!token) return;
  const settings = await fetchNotificationSettings(uid);
  if (settings.googleNotificationCalendarId) {
    await deleteEvent(token, reminderEventId(reminder.id), settings.googleNotificationCalendarId);
  }
}
