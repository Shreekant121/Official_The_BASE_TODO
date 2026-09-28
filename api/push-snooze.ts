/**
 * The notification's "5 min" button — BUILD-5.
 *
 * Called by `public/sw.js` from the lock screen, where there is no page and so
 * no sign-in to send. What proves the caller instead is the token the alert
 * itself carried (`snoozeToken` in `server/pushRun.ts`): an HMAC over the
 * account and that one alert, which the push service delivered encrypted to
 * the device. It can snooze that alert, once, and nothing else. A forged or
 * replayed call gets a 403 or a no-op.
 *
 * The snooze is only *recorded* here. The next knock of `push-fire` five
 * minutes on sends the last call — so it is as punctual as the cron is.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { snoozePush } from './_lib/pushRun.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.FIREBASE_SERVICE_ACCOUNT) {
    return res.status(500).json({ error: 'not_configured' });
  }

  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as
    | { uid?: unknown; key?: unknown; token?: unknown }
    | undefined;
  const { uid, key, token } = body ?? {};
  if (typeof uid !== 'string' || typeof key !== 'string' || typeof token !== 'string' || !uid || !key || !token) {
    return res.status(400).json({ error: 'bad_request' });
  }

  try {
    const result = await snoozePush({ secret, uid, key, token });
    if (result === 'forbidden') return res.status(403).json({ error: 'forbidden' });
    return res.status(200).json({ result });
  } catch (err) {
    console.error('push-snooze failed', err);
    return res.status(500).json({ error: 'snooze_failed' });
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
