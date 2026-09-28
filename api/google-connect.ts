/**
 * Session 2 — Google Calendar authorization-code exchange.
 *
 * This is the endpoint that makes "connect once, forever" real. The browser
 * sends the user to Google's consent screen (see
 * `src/lib/googleOAuthConnect.ts`), Google redirects back to `/oauth/callback`
 * with a one-time `code`, and this function trades that code for the pair that
 * matters:
 *
 *   - an **access token** (~1h) handed straight back to the browser, and
 *   - a **refresh token** that never leaves the server — written to
 *     `googleTokens/{uid}`, a top-level Firestore collection that
 *     `firestore.rules` denies to every client. Only the Admin SDK (which
 *     bypasses rules) can read it, and only in `api/refresh-token.ts`.
 *
 * Before this existed, `GOOGLE_REFRESH_TOKEN` was minted by hand in the OAuth
 * Playground and pasted into Vercel — one token, one Google account, and a
 * re-paste every time it was revoked. Now each Firebase user connects their own
 * Google account with one click, and `ALLOWED_UID` is gone because there is no
 * longer a shared owner credential for anyone else to borrow.
 *
 * NOTE (mandatory, outside the code): the OAuth consent screen must be
 * **published to production** in Google Cloud. While it is in Testing mode,
 * Google expires every refresh token after 7 days regardless of which flow
 * minted it, and the user is asked to reconnect weekly.
 *
 * Required Vercel env vars:
 *   GOOGLE_CLIENT_ID         — Web-application OAuth client id
 *   GOOGLE_CLIENT_SECRET     — its client secret
 *   FIREBASE_SERVICE_ACCOUNT — service-account JSON (string), for ID-token
 *                              verification and admin Firestore access
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

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

interface ConnectBody {
  code?: string;
  codeVerifier?: string;
  redirectUri?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // 1) Authenticate the caller with their Firebase ID token. The refresh token
  //    we are about to store belongs to *this* uid and nobody else's.
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

  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as ConnectBody;
  const { code, codeVerifier, redirectUri } = body;
  if (!code || !codeVerifier || !redirectUri) {
    return res.status(400).json({ error: 'missing_code' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'not_configured' });
  }

  // 2) Trade the one-time code for tokens. `code_verifier` is the PKCE half the
  //    browser kept to itself, so a code intercepted in the redirect is useless
  //    to anyone who didn't start the flow.
  let googleRes: Response;
  try {
    googleRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
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
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!googleRes.ok || !data.access_token) {
    return res.status(502).json({
      error: 'google_exchange_failed',
      detail: data.error_description || data.error || 'no access_token returned',
    });
  }

  // Google only returns a refresh token when the request asked for offline
  // access *and* forced the consent screen. The client always sends both, so
  // this should not happen — but if it does, connecting would appear to work
  // and then silently stop lasting, which is the exact bug this session exists
  // to kill. Fail loudly instead.
  if (!data.refresh_token) {
    return res.status(502).json({
      error: 'no_refresh_token',
      detail:
        'Google returned an access token but no refresh token. Remove this app at ' +
        'https://myaccount.google.com/permissions and connect again.',
    });
  }

  // 3) Park the refresh token where only the Admin SDK can reach it.
  try {
    await getFirestore(getAdminApp())
      .collection('googleTokens')
      .doc(uid)
      .set(
        {
          refreshToken: data.refresh_token,
          scope: data.scope ?? '',
          connectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (err) {
    return res.status(500).json({
      error: 'store_failed',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Never cache a secret at the edge/CDN.
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    access_token: data.access_token,
    expires_in: data.expires_in ?? 3300,
    scope: data.scope ?? '',
  });
}
