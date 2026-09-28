/**
 * The knock — BUILD-5. A free external cron service calls this once a minute.
 *
 * WHY AN OUTSIDE CRON
 * -------------------
 * Settled 2026-09-15: BASE is on Vercel Hobby, whose own cron runs once a day,
 * and Firebase's scheduled functions need a card on file. A free service
 * (cron-job.org) calling this route is the third way to the same place, and
 * all three end here — moving to Vercel Pro or Blaze later changes who
 * knocks, not what answers. **Every minute** was his call on 2026-09-16: a
 * 15-minute knock would land an alert up to 15 minutes late and make the
 * 5-minute snooze meaningless.
 *
 * THE LOCK
 * --------
 * `Authorization: Bearer <CRON_SECRET>`. That is also exactly what Vercel's
 * own cron sends, so the move later needs no change here. Without the secret
 * this route does nothing and says nothing about anyone. The response is
 * counts only — the cron service keeps a log of it.
 *
 * What a knock does is in `server/pushRun.ts`, bundled into
 * `_lib/pushRun.js`; why it is bundled is at the top of that file.
 *
 * `?dry=1` plans without writing or sending, for checking a live account
 * from a terminal without firing anything at the tablet.
 *
 * REQUIRED ENVIRONMENT: `CRON_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, and the
 * three VAPID variables `api/push-test.ts` describes.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { runPushes } from './_lib/pushRun.js';

function secretMatches(header: string | undefined, secret: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match) return false;
  const given = Buffer.from(match[1].trim());
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'not_configured', detail: 'Missing on the server: CRON_SECRET.' });
  }
  if (!secretMatches(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  const missing = [
    !publicKey && 'VITE_VAPID_PUBLIC_KEY',
    !privateKey && 'VAPID_PRIVATE_KEY',
    !subject && 'VAPID_SUBJECT',
    !process.env.FIREBASE_SERVICE_ACCOUNT && 'FIREBASE_SERVICE_ACCOUNT',
  ].filter(Boolean);
  if (missing.length) {
    return res.status(500).json({ error: 'not_configured', detail: `Missing on the server: ${missing.join(', ')}.` });
  }

  try {
    const report = await runPushes({
      secret,
      vapid: { subject: subject as string, publicKey: publicKey as string, privateKey: privateKey as string },
      dryRun: req.query.dry === '1',
    });
    return res.status(200).json(report);
  } catch (err) {
    console.error('push-fire failed', err);
    return res.status(500).json({ error: 'run_failed', detail: err instanceof Error ? err.message : String(err) });
  }
}
