/**
 * Sends one test notification to every device this account has registered.
 * APP-3.
 *
 * WHAT THIS IS AND IS NOT
 * -----------------------
 * It is the proof that the pipe works: the VAPID keys have sat in `.env` since
 * Phase 5 with no service worker to deliver through, and `public/sw.js` is now
 * that worker. One notification, pressed for by hand from Settings, arriving on
 * a lock screen.
 *
 * It is **not** the reminder system. Nothing schedules, nothing reads a
 * deadline, nothing runs on a cron. Item 27 owns what a notification says, what
 * tapping it opens and what happens to one that was missed; that split was
 * Shreekant's call on 2026-09-11. A future endpoint that sends real reminders
 * belongs beside this one, not inside it — this file's whole value is that it
 * has exactly one behaviour and so a failure here is unambiguous.
 *
 * WHY `web-push` RATHER THAN HAND-ROLLED CRYPTO
 * ---------------------------------------------
 * A web push message is AES-128-GCM encrypted to a key the browser generated
 * (RFC 8291) and authorised by an ES256 JWT signed with the VAPID private key
 * (RFC 8292). All of that is in Node's `crypto`, and all of it is the kind of
 * code that is wrong in a way nothing reports: a botched content-encoding key
 * gives a 201 from the push service and silence at the other end. The library
 * is the standard one, pure JS with no native build step, and it is what item
 * 27 will build on.
 *
 * REQUIRED ENVIRONMENT — three variables, none of which were on Vercel before
 * this item:
 *   VITE_VAPID_PUBLIC_KEY  — the keypair's public half. `VITE_`-prefixed
 *                            because the browser needs it too (see
 *                            `src/lib/push.ts`); it is meant to be public.
 *   VAPID_PRIVATE_KEY      — server-only. Never give it a `VITE_` prefix: Vite
 *                            inlines every such variable into the bundle as
 *                            plain text, and anyone could then send push
 *                            notifications as BASE.
 *   VAPID_SUBJECT          — a `mailto:` the push service can reach if this
 *                            application misbehaves. Required by the spec.
 *
 * A missing one is reported by name. The alternative — the browser's own
 * `subscribe()` failure on a mismatched key — names neither the key nor the
 * problem, and that is a session lost to guessing.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

let adminApp: App | null = null;

/**
 * Lazily initialise a single Firebase Admin app from the service-account JSON
 * in `FIREBASE_SERVICE_ACCOUNT`. Reused across warm invocations.
 *
 * Deliberately duplicated in each `api/` function rather than shared: every
 * file here is bundled as its own independent Vercel serverless function, and
 * keeping them self-contained avoids depending on how the bundler resolves a
 * relative import between them.
 */
function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps();
  if (existing.length) {
    adminApp = existing[0];
    return adminApp;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  }
  const serviceAccount = JSON.parse(raw) as Record<string, string>;
  // Vercel env vars often store the JSON with literal "\n" sequences inside the
  // private key; normalise them back to real newlines so `cert()` accepts it.
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  adminApp = initializeApp({ credential: cert(serviceAccount as unknown as ServiceAccount) });
  return adminApp;
}

/** Extracts the bearer token from an `Authorization: Bearer <token>` header. */
function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

interface StoredSubscription {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const missing = [
    !publicKey && 'VITE_VAPID_PUBLIC_KEY',
    !privateKey && 'VAPID_PRIVATE_KEY',
    !subject && 'VAPID_SUBJECT',
  ].filter(Boolean);
  if (missing.length) {
    return res.status(500).json({
      error: 'not_configured',
      detail: `Missing on the server: ${missing.join(', ')}.`,
    });
  }

  // Authenticate the caller with their Firebase ID token. Same shape as every
  // other function here — nothing sends a notification on somebody's behalf
  // without proving it is them.
  const idToken = bearerToken(req);
  if (!idToken) {
    return res.status(401).json({ error: 'missing_id_token' });
  }

  let uid: string;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('FIREBASE_SERVICE_ACCOUNT')) {
      return res.status(500).json({ error: 'not_configured', detail: message });
    }
    return res.status(401).json({ error: 'invalid_id_token' });
  }

  webpush.setVapidDetails(subject as string, publicKey as string, privateKey as string);

  const collection = getFirestore(getAdminApp())
    .collection('users')
    .doc(uid)
    .collection('pushSubscriptions');

  let docs;
  try {
    docs = (await collection.get()).docs;
  } catch (err) {
    return res.status(500).json({
      error: 'store_unavailable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (docs.length === 0) {
    // Not an error: this account has simply never turned notifications on.
    return res.status(200).json({ sent: 0, gone: 0, error: 'no_subscriptions' });
  }

  const payload = JSON.stringify({
    title: 'BASE',
    body: 'Notifications are working. This is the test one.',
    tag: 'base-test',
    url: '/settings',
  });

  let sent = 0;
  let gone = 0;
  const failures: string[] = [];

  for (const snapshot of docs) {
    const stored = snapshot.data() as StoredSubscription;
    if (!stored.endpoint || !stored.keys?.p256dh || !stored.keys?.auth) {
      failures.push(`${snapshot.id}: incomplete record`);
      continue;
    }
    try {
      await webpush.sendNotification(
        { endpoint: stored.endpoint, keys: { p256dh: stored.keys.p256dh, auth: stored.keys.auth } },
        payload,
      );
      sent += 1;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      /*
       * 404 and 410 are the push service saying this endpoint is dead — the
       * browser dropped the subscription, or the app was uninstalled. Deleting
       * the row is the only way the list stays true; leaving it turns every
       * later send into a silent partial failure that looks like a bug in the
       * worker.
       */
      if (status === 404 || status === 410) {
        gone += 1;
        await snapshot.ref.delete().catch(() => undefined);
        continue;
      }
      failures.push(`${snapshot.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    sent,
    gone,
    ...(failures.length ? { failures } : {}),
  });
}
