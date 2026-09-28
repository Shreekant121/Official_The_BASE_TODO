/**
 * Persistent Google connection — mints a fresh Calendar access token, no popup.
 *
 * Client-only Google auth cannot stay connected in privacy-hardened browsers
 * (Brave blocks the GIS silent iframe refresh), so a short-lived (~1h) Calendar
 * access token could only be renewed by re-showing a popup. This endpoint
 * removes that limitation: it holds the long-lived Google **refresh token**
 * server-side and exchanges it for a fresh access token on demand — no popup,
 * works in every browser, keeps notifications firing while the app is closed.
 *
 * **Per-user since Session 2.** The refresh token is read from
 * `googleTokens/{uid}` — a top-level Firestore collection that
 * `firestore.rules` denies to every client, reachable only by the Admin SDK
 * used here. Each Firebase user connects their own Google account through
 * `api/google-connect.ts`; nothing is shared between accounts, which is why
 * `ALLOWED_UID` is gone. A caller with no stored token gets `not_connected` and
 * the app sends them through the one-click connect flow.
 *
 * `GOOGLE_REFRESH_TOKEN` is deliberately **no longer read**. Keeping it as a
 * fallback was tempting — it would have carried the owner across the upgrade
 * without a click — but a shared token handed to whichever uid asks means any
 * other account on this Firebase project writes into the owner's calendar. The
 * upgrade costs one click on Connect Google instead; the env var can be deleted.
 *
 * Required Vercel env vars:
 *   GOOGLE_CLIENT_ID       — Web-application OAuth client id
 *   GOOGLE_CLIENT_SECRET   — its client secret
 *   FIREBASE_SERVICE_ACCOUNT — service-account JSON (string) for token
 *                              verification and admin Firestore access
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

let adminApp: App | null = null;

/**
 * BUILD-15 — where a dead grant is written so it can reach him.
 *
 * This endpoint is the first thing in the system to learn that Google has
 * ended the connection, and it usually learns it with no browser open: the
 * app was closed, the consent screen's 7-day Testing cap lapsed, or he revoked
 * it from his Google account. Until this item that knowledge went nowhere — it
 * was returned to whichever client happened to ask next, which is precisely
 * the client that is not running.
 *
 * So it is written to the account's own notification settings, which is the
 * one document both halves of the app can see: every client reads it (the
 * banner on next open) and `server/pushRun.ts` reads it on every knock (the
 * push to the tablet, within the minute). It cannot live beside the refresh
 * token on `googleTokens/{uid}`, which `firestore.rules` denies to every
 * browser on purpose.
 */
function notificationSettingsRef(uid: string) {
  return getFirestore(getAdminApp()).collection('users').doc(uid).collection('settings').doc('notifications');
}

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
  // Google's downloaded service-account JSON uses snake_case keys; `cert()`
  // accepts that shape at runtime even though its TS type only names the
  // camelCase `ServiceAccount` fields — hence the cast below.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // 1) Authenticate the caller with their Firebase ID token.
  const idToken = bearerToken(req);
  if (!idToken) {
    return res.status(401).json({ error: 'missing_id_token' });
  }

  let uid: string;
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    // Covers both a genuinely invalid/expired token and a misconfigured
    // FIREBASE_SERVICE_ACCOUNT (thrown from getAdminApp above).
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('FIREBASE_SERVICE_ACCOUNT')) {
      return res.status(500).json({ error: 'not_configured', detail: message });
    }
    return res.status(401).json({ error: 'invalid_id_token' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'not_configured' });
  }

  // 2) Fetch *this user's* refresh token. Server-only path: the client cannot
  //    read `googleTokens/{uid}` at all (see firestore.rules).
  const tokenDoc = getFirestore(getAdminApp()).collection('googleTokens').doc(uid);
  let refreshToken: string | undefined;
  let wasRevoked: boolean;
  try {
    const snap = await tokenDoc.get();
    refreshToken = snap.exists ? (snap.data()?.refreshToken as string | undefined) : undefined;
    // Whether this grant was already known to be dead. Read here so a healthy
    // refresh only writes the settings document when there is a flag to take
    // down — otherwise every hourly refresh would cost an extra write to say
    // nothing changed.
    wasRevoked = snap.exists ? Boolean(snap.data()?.revokedAt) : false;
  } catch (err) {
    return res.status(500).json({
      error: 'store_unavailable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (!refreshToken) {
    // Not an error condition: this user simply hasn't connected Google yet.
    // The app turns this into the "Connect Google" button, never a retry loop.
    return res.status(200).json({ error: 'not_connected' });
  }

  // 3) Exchange the long-lived refresh token for a fresh access token.
  let googleRes: Response;
  try {
    googleRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch (err) {
    return res.status(502).json({
      error: 'google_unreachable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const data = (await googleRes.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!googleRes.ok || !data.access_token) {
    // `invalid_grant` means the grant is gone for good — revoked in the Google
    // account, or expired because the consent screen is still in Testing mode
    // (7-day cap). Drop the dead token so the app stops retrying it and shows
    // "Connect Google" instead of failing forever against a corpse.
    if (data.error === 'invalid_grant') {
      await tokenDoc
        .set({ refreshToken: FieldValue.delete(), revokedAt: FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => {
          // Best-effort — the client is told to reconnect either way.
        });
      // BUILD-15 — and tell him, rather than only telling whoever asks next.
      // Raised only when it is not already up, so the once-per-breakage rule
      // `pushRun` enforces survives a caller that retries.
      if (!wasRevoked) {
        await notificationSettingsRef(uid)
          .set({ googleReconnectRequiredAt: Date.now() }, { merge: true })
          .catch(() => {
            // Best-effort: the response below still says reconnect, and the
            // reconcile pass raises the same flag the next time it runs.
          });
      }
      return res.status(200).json({
        error: 'reconnect_required',
        detail: data.error_description || 'Google revoked or expired this connection.',
      });
    }
    return res.status(502).json({
      error: 'google_refresh_failed',
      detail: data.error_description || data.error || 'no access_token returned',
    });
  }

  await tokenDoc
    .set(
      // A grant that refreshes is a grant that works, so a `revokedAt` left
      // over from a previous breakage comes down with it — as does the flag it
      // raised on the client, or he would be told to reconnect something he
      // already has.
      wasRevoked
        ? { lastRefreshAt: FieldValue.serverTimestamp(), revokedAt: FieldValue.delete() }
        : { lastRefreshAt: FieldValue.serverTimestamp() },
      { merge: true },
    )
    .catch(() => {
      // Purely informational bookkeeping — never fail the request over it.
    });
  if (wasRevoked) {
    await notificationSettingsRef(uid)
      .set({ googleReconnectRequiredAt: 0, googleReconnectPushedAt: 0 }, { merge: true })
      .catch(() => {});
  }

  // Never cache a secret at the edge/CDN.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3300,
  });
}
