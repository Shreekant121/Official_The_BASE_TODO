/**
 * Web push — the browser's half. APP-3.
 *
 * The service worker in `public/sw.js` is what a notification is delivered to;
 * this is what tells the push service that this device wants them, and where to
 * put the address it gets back.
 *
 * SCOPE, AND WHY IT IS THIS SMALL
 * -------------------------------
 * APP-3 proved **one** test notification with this file. The real reminders
 * are BUILD-5's (it was item 27), and they live elsewhere: what fires and what
 * it says in `pushPlan.ts`, the sender in `server/pushRun.ts`, the buttons in
 * `public/sw.js`. This file still only registers a device. The one thing
 * BUILD-5 added here is the device's **time zone**: the cloud document stores
 * wall-clock times with no zone, the sender runs in UTC, and the device is the
 * only thing that knows what "18:00" means.
 *
 * WHERE THE SUBSCRIPTION LIVES, AND WHY NOT IN THE STORE
 * ------------------------------------------------------
 * `users/{uid}/pushSubscriptions/{id}` — a Firestore subcollection, **not**
 * `users/{uid}/data/main`. That document is rewritten whole on every task edit
 * under a 1 MB cap (CLAUDE.md), and a push subscription is neither small talk
 * nor per-account: it is per *device*, it is a few hundred bytes of opaque
 * endpoint and keys, and one account has as many as it has devices. A
 * subcollection is the shape that already fits. `firestore.rules` grants the
 * signed-in owner everything under `users/{uid}`, so nothing there needed
 * changing; `api/push-test.ts` reads it with the Admin SDK.
 *
 * The endpoint is the identity of a subscription, so the document id is a hash
 * of it rather than a random id — see `pushEncoding.ts`, which holds that and
 * the VAPID key decoder, and `pushEncoding.test.ts`, which pins both.
 */
import { doc, deleteDoc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { db } from './firebase';
import { subscriptionDocId, urlBase64ToUint8Array } from './pushEncoding';
import { resolveUserTimeZone } from './agent/dates';
import { EMPTY_LOG, type PushLog } from './pushPlan';

/*
 * The two pure halves live in `pushEncoding.ts` and are re-exported here, so a
 * caller still reads `from './push'`. They moved for the reason
 * `publicShareSnapshot.ts` moved out of `publicShare.ts`: this file reaches
 * `./firebase`, which cannot load in Node, and both of them fail silently when
 * they are wrong — which is exactly what a test is for.
 */
export { subscriptionDocId, urlBase64ToUint8Array };

/**
 * The VAPID public key, from `VITE_VAPID_PUBLIC_KEY`. It identifies this
 * application to the push service and is meant to be public — it ships in the
 * bundle by design, which is what the `VITE_` prefix means. Its private half
 * is server-only and lives in Vercel's environment; the two are a keypair and
 * a mismatched pair fails at `subscribe()` with a flatly unhelpful error, so
 * `api/push-test.ts` reports which of the three variables is missing rather
 * than letting the browser guess.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Whether this browser can do push at all. False on anything pre-2017. */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Whether the keys were built into this bundle. */
export function pushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY);
}

/** Why enabling notifications did not work, in words Shreekant can act on. */
export type PushFailure =
  | 'unsupported'
  | 'not_configured'
  | 'no_service_worker'
  | 'permission_denied'
  | 'subscribe_failed';

export interface PushResult {
  ok: boolean;
  failure?: PushFailure;
  detail?: string;
}

/**
 * Asks for permission, subscribes this device, and records the address.
 *
 * Safe to call again: `pushManager.subscribe` returns the existing
 * subscription when one is already in place with the same key, and the
 * Firestore write is keyed on the endpoint, so a second run refreshes
 * `lastSeenAt` and changes nothing else.
 */
export async function enablePush(uid: string): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, failure: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { ok: false, failure: 'not_configured' };

  /*
   * `ready` rather than `getRegistration`: it waits for a worker that is
   * *active*, and subscribing against one still installing throws. In practice
   * this resolves immediately — `main.tsx` registers before any screen exists —
   * but on a very first load the two can genuinely race.
   */
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.ready;
  } catch {
    return { ok: false, failure: 'no_service_worker' };
  }

  /*
   * Asked here rather than on load, and never behind a prompt of our own. The
   * browser's dialog is the one that matters and it is spent once: a denial is
   * remembered for the origin and cannot be re-asked from code, which is why
   * this is behind a button somebody pressed on purpose.
   */
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, failure: 'permission_denied' };
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      // Non-negotiable, and not a formality: Chrome refuses a silent
      // subscription outright, and every push through it must show a
      // notification — which is what `sw.js`'s `push` handler guarantees.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (err) {
    return {
      ok: false,
      failure: 'subscribe_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  await recordSubscription(uid, subscription);
  return { ok: true };
}

async function recordSubscription(uid: string, subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await setDoc(
    doc(db, 'users', uid, 'pushSubscriptions', subscriptionDocId(subscription.endpoint)),
    {
      endpoint: subscription.endpoint,
      keys: json.keys ?? {},
      // So a stale row is recognisable as "the tablet" rather than as a hash.
      userAgent: navigator.userAgent,
      // What the stored wall-clock deadlines mean. The sender reads it.
      timeZone: resolveUserTimeZone(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
}

/**
 * Re-records this device's subscription, if it has one, each time the app
 * opens. Two reasons, both BUILD-5's: a device registered before the time
 * zone was recorded gets one without being asked to switch anything on
 * again, and a tablet that has moved zone says so. Quiet by design — it never
 * asks for permission and never subscribes a device that has not opted in.
 */
export async function refreshPushSubscription(uid: string): Promise<void> {
  if (!pushSupported() || !VAPID_PUBLIC_KEY) return;
  if (Notification.permission !== 'granted') return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await recordSubscription(uid, subscription);
  } catch {
    /* Offline, or the worker is not there in dev: the next open tries again. */
  }
}

/**
 * Turns this device off again: drops the subscription at the push service and
 * removes the row. Leaving the row behind would have `api/push-test.ts` send to
 * an endpoint the browser has abandoned — which does not fail loudly, it just
 * quietly delivers nothing.
 */
export async function disablePush(uid: string): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const id = subscriptionDocId(subscription.endpoint);
  await subscription.unsubscribe().catch(() => undefined);
  await deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', id)).catch(() => undefined);
}

/** Whether this device currently holds a subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/**
 * Asks the server to send one notification to every device this account has
 * registered. The endpoint is deliberately a *test* endpoint and says so — see
 * `api/push-test.ts`.
 */
export async function sendTestNotification(idToken: string): Promise<PushResult> {
  let response: Response;
  try {
    response = await fetch('/api/push-test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }

  const data = (await response.json().catch(() => ({}))) as {
    sent?: number;
    error?: string;
    detail?: string;
  };

  if (!response.ok) {
    return { ok: false, detail: data.detail || data.error || `HTTP ${response.status}` };
  }
  if (!data.sent) {
    return { ok: false, detail: 'No device is registered for notifications yet.' };
  }
  return { ok: true, detail: data.sent === 1 ? 'Sent to this device.' : `Sent to ${data.sent} devices.` };
}

/**
 * What the sender has done today — `users/{uid}/push/log`, written only by
 * `server/pushRun.ts`. The Notifications screen reads it to tell a row that
 * was sent from one that was missed. `null` while it cannot be read, which the
 * screen treats as "no log": DESIGN-2's drawing, where everything past is
 * missed.
 */
export function subscribePushLog(uid: string, cb: (log: PushLog | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid, 'push', 'log'),
    (snap) => {
      const entries = snap.exists() ? (snap.data() as Partial<PushLog>).entries : undefined;
      cb(entries && typeof entries === 'object' ? { entries } : EMPTY_LOG);
    },
    () => cb(null),
  );
}
