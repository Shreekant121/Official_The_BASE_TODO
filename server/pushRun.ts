/**
 * The sender — BUILD-5. What `api/push-fire.ts` and `api/push-snooze.ts` run.
 *
 * WHY THIS IS NOT IN `api/`, AND WHY IT IS BUNDLED
 * ------------------------------------------------
 * It has to ask the app's own rule — `firingToday`, which takes its time from
 * `deadlineBlockFor`, which takes its duration from `taskEstimatedMinutes` in
 * `store/useStore.ts` — or the push and the calendar block could disagree,
 * which is the one failure this item exists to prevent. Everything under
 * `src/` is written with extensionless imports, and Vercel compiles each file
 * of a function **on its own** and runs the result as plain Node ESM, which
 * refuses an extensionless specifier at load time. `vite build` would stay
 * green and every knock would 500.
 *
 * So `scripts/build-push.mjs` bundles this file and the part of `src/` it
 * reaches into **one** file, `api/_lib/pushRun.js` (an `_` folder is never a
 * function of its own), with every npm package left as a normal import for
 * Vercel to trace. `npm run build` fails when that file is stale. Edit this
 * file or anything it imports, then run `npm run build:push`.
 *
 * It is type-checked with `mcp/` (`tsconfig.mcp.json`) for the same reason
 * that project exists: it runs on Node, imports the app's store, and must
 * fail the build if a browser-only module ever enters its graph.
 *
 * WHAT A KNOCK DOES
 * -----------------
 * For every account with at least one registered device: read the account's
 * notification switch, its document and its push log; ask `planPushes`; write
 * the log **in the same transaction that read it**, so two overlapping knocks
 * cannot both send an alert; then send. Nothing about a user's data ever goes
 * into the response — it is read by a third-party cron service's log.
 */
// Before anything pulls a store in. See `mcp/storageStub.ts`.
import { silenceStorageWarnings } from '../mcp/storageStub.ts';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { hydrateFromPayload, type SyncPayload } from '../src/lib/syncPayload';
import { firingToday, type FiringRow } from '../src/lib/firingToday';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from '../src/lib/notificationSettings';
import { isValidTimeZone } from '../src/lib/agent/dates';
import {
  EMPTY_LOG,
  LATE_LIMIT_MS,
  applySnooze,
  planPushes,
  reconnectMessage,
  type PushLog,
  type PushMessage,
} from '../src/lib/pushPlan';
import type * as Declared from '../api/_lib/pushRun';

silenceStorageWarnings();

const APP_NAME = 'base-push';

function adminApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const account = JSON.parse(raw) as Record<string, string>;
  // Vercel stores the key with literal "\n" sequences; `cert()` needs newlines.
  if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
  return initializeApp({ credential: cert(account as unknown as ServiceAccount) }, APP_NAME);
}

function db(): Firestore {
  return getFirestore(adminApp());
}

function logRef(store: Firestore, uid: string): DocumentReference {
  return store.collection('users').doc(uid).collection('push').doc('log');
}

function settingsRef(store: Firestore, uid: string): DocumentReference {
  return store.collection('users').doc(uid).collection('settings').doc('notifications');
}

function readLog(data: unknown): PushLog {
  const entries = (data as { entries?: PushLog['entries'] } | undefined)?.entries;
  return entries && typeof entries === 'object' ? { entries } : EMPTY_LOG;
}

/**
 * The token a notification carries so its "5 min" button can prove, without
 * a sign-in, which alert it is snoozing. It unlocks exactly that: one snooze
 * on one alert, once. The payload it rides in is encrypted to the device.
 */
export function snoozeToken(secret: string, uid: string, key: string): string {
  return createHmac('sha256', secret).update(`snooze|${uid}|${key}`).digest('base64url');
}

function tokenMatches(secret: string, uid: string, key: string, token: string): boolean {
  const expected = Buffer.from(snoozeToken(secret, uid, key));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

interface StoredSubscription {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  timeZone?: string;
  updatedAt?: string;
}

export interface RunOptions {
  /** Signs each alert's snooze token. The same secret the cron sends. */
  secret: string;
  vapid: { subject: string; publicKey: string; privateKey: string };
  now?: number;
  /** Plan and report, but write nothing and send nothing. */
  dryRun?: boolean;
}

export interface RunReport {
  accounts: number;
  sent: number;
  gone: number;
  failed: number;
  /** Why an account was passed over, counted — never which account. */
  skipped: Record<string, number>;
  /** Dry runs only: what would have gone out, as kinds. */
  planned?: string[];
}

/** Tasks that fire today — and, just after midnight, yesterday's last few minutes. */
function rowsFor(payload: SyncPayload, settings: NotificationSettings, timeZone: string, now: number): FiringRow[] {
  const state = hydrateFromPayload(payload);
  const ask = (at: number) =>
    firingToday({
      tasks: state.backlogTasks,
      taskLists: state.taskLists,
      projects: state.projects,
      settings,
      timeZone,
      now: at,
    });
  return [...ask(now - LATE_LIMIT_MS), ...ask(now)];
}

/** The newest device that reported a zone. Every device of one account gets the same alerts. */
function zoneOf(subs: StoredSubscription[]): string | null {
  const zoned = subs
    .filter((s) => typeof s.timeZone === 'string' && isValidTimeZone(s.timeZone))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return zoned[0]?.timeZone ?? null;
}

/** The knock. */
export async function runPushes(opts: RunOptions): Promise<RunReport> {
  const now = opts.now ?? Date.now();
  const store = db();
  const report: RunReport = { accounts: 0, sent: 0, gone: 0, failed: 0, skipped: {} };
  if (opts.dryRun) report.planned = [];
  const skip = (reason: string) => {
    report.skipped[reason] = (report.skipped[reason] ?? 0) + 1;
  };

  webpush.setVapidDetails(opts.vapid.subject, opts.vapid.publicKey, opts.vapid.privateKey);

  const subscriptions = await store.collectionGroup('pushSubscriptions').get();
  const byUid = new Map<string, typeof subscriptions.docs>();
  for (const doc of subscriptions.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (!uid) continue;
    byUid.set(uid, [...(byUid.get(uid) ?? []), doc]);
  }

  for (const [uid, docs] of byUid) {
    report.accounts += 1;
    const subs = docs.map((d) => d.data() as StoredSubscription);

    const settingsSnap = await store.collection('users').doc(uid).collection('settings').doc('notifications').get();
    const settings: NotificationSettings = {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...((settingsSnap.data() as Partial<NotificationSettings> | undefined) ?? {}),
    };
    if (!settings.enabled) {
      skip('paused');
      continue;
    }

    /* BUILD-15 — "BASE lost Google Calendar, tap to reconnect".
       Sent before anything else this account might be owed, and before the
       time-zone check, because it needs no zone and because it is the reason
       none of the rest is syncing. `api/refresh-token.ts` raises the flag from
       the server when Google ends the grant; the reconcile pass raises it from
       the browser when the calendar scope goes. Once per breakage: the flag's
       own timestamp is banked in `googleReconnectPushedAt`, so this knock and
       the fourteen hundred after it today say it once between them. */
    const reconnectAt = settings.googleReconnectRequiredAt ?? 0;
    if (reconnectAt > (settings.googleReconnectPushedAt ?? 0)) {
      if (opts.dryRun) {
        report.planned!.push('reconnect');
      } else {
        await sendToDevices(docs, reconnectMessage(now), uid, opts.secret, report);
        await settingsRef(store, uid)
          .set({ googleReconnectPushedAt: reconnectAt }, { merge: true })
          .catch(() => undefined);
      }
    }

    /* The document stores wall-clock times with no zone; the device says
       which zone they mean. A device registered before BUILD-5 has none until
       the app is next opened on it. */
    const timeZone = zoneOf(subs);
    if (!timeZone) {
      skip('no_time_zone');
      continue;
    }

    const mainSnap = await store.collection('users').doc(uid).collection('data').doc('main').get();
    const payload = mainSnap.data() as SyncPayload | undefined;
    if (!payload || !Array.isArray(payload.backlogTasks)) {
      skip('no_data');
      continue;
    }

    const rows = rowsFor(payload, settings, timeZone, now);
    const backlog = hydrateFromPayload(payload).backlogTasks;

    const ref = logRef(store, uid);
    const plan = await store.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const next = planPushes({ rows, backlog, log: readLog(snap.data()), now, timeZone });
      if (next.changed && !opts.dryRun) tx.set(ref, { entries: next.log.entries, updatedAt: now });
      return next;
    });

    if (opts.dryRun) {
      report.planned!.push(...plan.messages.map((m) => m.kind));
      continue;
    }

    for (const message of plan.messages) {
      await sendToDevices(docs, message, uid, opts.secret, report);
    }
  }

  return report;
}

/** One message to every device on one account. */
async function sendToDevices(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  message: PushMessage,
  uid: string,
  secret: string,
  report: RunReport,
): Promise<void> {
  const body = JSON.stringify(payloadFor(message, uid, secret));
  for (const doc of docs) {
    const sub = doc.data() as StoredSubscription;
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
      report.failed += 1;
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        body,
        deliveryOptions(message),
      );
      report.sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      /* The push service saying this device is gone — see `push-test.ts`. */
      if (status === 404 || status === 410) {
        report.gone += 1;
        await doc.ref.delete().catch(() => undefined);
        continue;
      }
      report.failed += 1;
      console.error('push send failed', status ?? '', err instanceof Error ? err.message : String(err));
    }
  }
}

/** What `public/sw.js` reads. */
function payloadFor(message: PushMessage, uid: string, secret: string) {
  return {
    title: message.title,
    body: message.body,
    tag: message.tag,
    url: message.url,
    actions: message.actions,
    timestamp: message.timestamp,
    renotify: true,
    ...(message.snoozeKey
      ? { snooze: { uid, key: message.snoozeKey, token: snoozeToken(secret, uid, message.snoozeKey) } }
      : {}),
  };
}

/**
 * How the push service should treat it. `high` urgency is what lets a fire
 * through Android's Doze promptly; the summary is a report and can wait.
 *
 * TTL: an alarm that could not be delivered within half an hour is noise by
 * the time it lands, so the push service drops it. The summary keeps for half
 * a day and carries a topic, so an undelivered one is replaced rather than
 * queued behind the next.
 */
function deliveryOptions(message: PushMessage): webpush.RequestOptions {
  if (message.kind === 'summary') return { TTL: 12 * 60 * 60, urgency: 'normal', topic: 'base-missed' };
  /* A broken connection is still broken tomorrow morning, so this one keeps
     for a day rather than being dropped for arriving late — the opposite of
     an alarm. Its topic replaces an undelivered one instead of stacking. */
  if (message.kind === 'reconnect') {
    return { TTL: 24 * 60 * 60, urgency: 'normal', topic: 'base-reconnect' };
  }
  return { TTL: 30 * 60, urgency: 'high' };
}

export type SnoozeResult = 'snoozed' | 'already' | 'forbidden';

/** The "5 min" button. */
export async function snoozePush(opts: {
  secret: string;
  uid: string;
  key: string;
  token: string;
  now?: number;
}): Promise<SnoozeResult> {
  if (!tokenMatches(opts.secret, opts.uid, opts.key, opts.token)) return 'forbidden';
  const now = opts.now ?? Date.now();
  const store = db();
  const ref = logRef(store, opts.uid);
  return store.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = applySnooze(readLog(snap.data()), opts.key, now);
    if (!next) return 'already' as const;
    tx.set(ref, { entries: next.entries, updatedAt: now });
    return 'snoozed' as const;
  });
}

/*
 * The functions compile against a hand-written declaration of this file
 * (`api/_lib/pushRun.d.ts`). This line is what stops the two drifting: if
 * either signature changes without the other, `npm run typecheck` fails here.
 */
[runPushes, snoozePush] satisfies [typeof Declared.runPushes, typeof Declared.snoozePush];
