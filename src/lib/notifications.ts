import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  limit,
  serverTimestamp,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * Notification System client helpers. Settings/history are deliberately kept
 * separate from `firestoreSync.ts`'s monolithic `users/{uid}/data/main`
 * document — they change independently of task edits and are read directly
 * (not mirrored into the Zustand store).
 *
 * Delivery itself is handled by Google Calendar (see `lib/notificationSync.ts`):
 * this file only stores our own settings + a local mirror of what's been
 * scheduled, so `NotificationsPage` has something fast to read without
 * round-tripping to the Calendar API on every render.
 */

import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from './notificationSettings';

/*
 * The settings shape and its default live in `notificationSettings.ts`, which
 * the push sender can load on Node; re-exported so callers are unchanged.
 */
export { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings };

export type NotificationType = 'deadline' | 'reminder';
/**
 * Mostly informational — Google doesn't report delivery receipts back to
 * us, so `scheduled`/`passed` are inferred from `sendAt` vs. now. `failed`
 * is the one status we set ourselves, when the upstream Calendar API write
 * itself didn't go through (see `lib/notificationSync.ts`) — without it, a
 * silently-dropped sync was indistinguishable from "nothing due yet."
 */
export type NotificationStatus = 'scheduled' | 'passed' | 'cancelled' | 'failed';

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  sourceId: string;
  sendAt: number;
  status: NotificationStatus;
  /** The Google Calendar event id carrying this reminder, if any. */
  googleEventId?: string;
  /** Deep link to the event in Google Calendar's own UI, for "Open in Google Calendar". */
  googleEventLink?: string;
  createdAt: number | null;
}

// ── Settings ─────────────────────────────────────────────────────────────

function settingsRef(uid: string) {
  return doc(db, 'users', uid, 'settings', 'notifications');
}

export async function fetchNotificationSettings(uid: string): Promise<NotificationSettings> {
  const snap = await getDoc(settingsRef(uid));
  if (!snap.exists()) return DEFAULT_NOTIFICATION_SETTINGS;
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...(snap.data() as Partial<NotificationSettings>) };
}

export function subscribeNotificationSettings(
  uid: string,
  cb: (settings: NotificationSettings) => void,
): Unsubscribe {
  return onSnapshot(settingsRef(uid), (snap) => {
    cb(
      snap.exists()
        ? { ...DEFAULT_NOTIFICATION_SETTINGS, ...(snap.data() as Partial<NotificationSettings>) }
        : DEFAULT_NOTIFICATION_SETTINGS,
    );
  });
}

export async function updateNotificationSettings(
  uid: string,
  updates: Partial<NotificationSettings>,
): Promise<void> {
  await setDoc(settingsRef(uid), { ...updates, updatedAt: serverTimestamp() }, { merge: true });
}

// ── Notification history (local mirror of what's scheduled in Google Calendar) ──

function notificationsCollection(uid: string) {
  return collection(db, 'users', uid, 'notifications');
}

/** Exposed for `lib/notificationSync.ts`'s orphan-cleanup/pruning pass. */
export function notificationsCollectionRef(uid: string) {
  return notificationsCollection(uid);
}

export function notificationDocRef(uid: string, id: string) {
  return doc(notificationsCollection(uid), id);
}

export function subscribeNotificationHistory(
  uid: string,
  cb: (records: NotificationRecord[]) => void,
  max = 50,
): Unsubscribe {
  const q = query(notificationsCollection(uid), orderBy('sendAt', 'desc'), limit(max));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          type: data.type as NotificationType,
          title: data.title as string,
          body: data.body as string,
          sourceId: data.sourceId as string,
          sendAt: (data.sendAt as Timestamp | undefined)?.toMillis() ?? 0,
          status: data.status as NotificationStatus,
          googleEventId: data.googleEventId as string | undefined,
          googleEventLink: data.googleEventLink as string | undefined,
          createdAt: (data.createdAt as Timestamp | undefined)?.toMillis() ?? null,
        };
      }),
    );
  });
}

/** Low-level: deletes only the local history row. Callers that want to also
 * cancel the real Google Calendar reminder should use `cancelNotification`
 * from `lib/notificationSync.ts` instead. */
export async function dismissNotification(uid: string, id: string): Promise<void> {
  await deleteDoc(notificationDocRef(uid, id));
}
