/**
 * Client half of the persistent Google connection.
 *
 * Calls the `/api/refresh-token` serverless endpoint (see
 * `liquid-glass/api/refresh-token.ts`) to obtain a fresh Google Calendar access
 * token WITHOUT any popup. The endpoint holds the long-lived refresh token
 * server-side — since Session 2, one per Firebase user at a Firestore path no
 * client can read — so this works in privacy-hardened browsers (Brave) where
 * the client-only GIS silent refresh cannot. That's what makes "connect once,
 * stay connected" actually hold.
 *
 * The caller is authenticated by forwarding the signed-in user's Firebase ID
 * token as a bearer token; the endpoint verifies it before minting anything.
 *
 * This is the PREFERRED token source. `AuthContext` tries it first and falls
 * back to Google Identity Services (`googleTokenClient.ts`) only when this
 * returns `null` — i.e. the backend isn't deployed/configured (e.g. plain
 * `vite` dev with no serverless runtime, or a deployment where the env vars
 * were never set). A `connect_required` result is a different thing entirely:
 * the backend is healthy and simply has no refresh token for this user yet, and
 * the answer to that is the one-click flow in `googleOAuthConnect.ts`, not a
 * popup that would only mint another hour of access.
 */

import { auth } from './firebase';
import { logDiag } from './googleDiagnostics';
import type { CalendarTokenResult } from './googleTokenClient';

// Once we learn the endpoint isn't usable in this environment (404 in local
// `vite` dev, SPA-fallback HTML, or a 500 "not_configured"), stop hitting it
// on every refresh and let the GIS fallback take over for the session.
let backendUnavailable = false;

/**
 * Whether it's still worth attempting a backend refresh. Returns false once a
 * prior attempt proved the endpoint isn't deployed/configured here, so the
 * caller can skip straight to the GIS fallback.
 */
export function isBackendCalendarConfigured(): boolean {
  return !backendUnavailable;
}

/** Force a re-probe of the backend (e.g. after sign-in on a fresh session). */
export function resetBackendCalendarProbe(): void {
  backendUnavailable = false;
}

interface RefreshTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  detail?: string;
}

/**
 * Attempts to fetch a Calendar access token from the secure backend.
 *
 * @returns
 *  - `{ ok: true, token, expiresInSec }` on success;
 *  - `{ ok: false, ... }` when the backend is reachable but Google/auth
 *     genuinely rejected the request (caller may still try GIS as a backup);
 *  - `null` when the backend simply isn't available/configured in this
 *     environment — the signal to fall back to GIS silently, with no error.
 */
export async function requestCalendarTokenViaBackend(
  trigger?: string,
): Promise<CalendarTokenResult | null> {
  if (backendUnavailable) return null;

  const user = auth.currentUser;
  if (!user) return null;

  const triggerNote = trigger ? ` [trigger: ${trigger}]` : '';

  let idToken: string;
  try {
    idToken = await user.getIdToken();
  } catch {
    // Can't prove the user's identity to the backend — let GIS handle it.
    return null;
  }

  let res: Response;
  try {
    res = await fetch('/api/refresh-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    });
  } catch (err) {
    // Network error / offline. Don't latch `backendUnavailable` for this — it
    // may just be a transient blip — but do fall back to GIS for now.
    logDiag({
      level: 'warn',
      phase: 'token-silent',
      code: 'unknown',
      message: 'Could not reach the token-refresh server; will try Google directly.',
      detail: (err instanceof Error ? err.message : String(err)) + triggerNote,
    });
    return null;
  }

  // In plain `vite` dev (no serverless runtime) or a misrouted deploy the
  // request resolves to the SPA's index.html, not JSON. Treat anything that
  // isn't a JSON API response as "backend not available here".
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 404 || !contentType.includes('application/json')) {
    backendUnavailable = true;
    return null;
  }

  const data = (await res.json().catch(() => ({}))) as RefreshTokenResponse;

  if (res.ok && data.access_token) {
    logDiag({
      level: 'info',
      phase: 'connection',
      code: 'ok',
      message: `Google Calendar access token obtained from the secure server (no popup; expires in ~${Math.round(
        (data.expires_in ?? 3300) / 60,
      )} min).`,
      detail: triggerNote.trim() || undefined,
    });
    return { ok: true, token: data.access_token, expiresInSec: data.expires_in ?? 3300 };
  }

  // The endpoint is alive and configured, but this user has no refresh token
  // on file — either they have never connected, or Google revoked the grant
  // and `api/refresh-token.ts` dropped the dead token. Neither is an error to
  // retry: the fix is one click through the authorization-code flow, so say so
  // in a way the caller can act on and DON'T latch `backendUnavailable` (the
  // backend is fine; it just has nothing to refresh yet).
  if (data.error === 'not_connected' || data.error === 'reconnect_required') {
    const revoked = data.error === 'reconnect_required';
    logDiag({
      level: 'info',
      phase: 'connection',
      code: data.error,
      message: revoked
        ? 'Google ended the saved Calendar permission (revoked, or the consent screen is still in Testing mode). One click on Connect Google restores it.'
        : 'No saved Google Calendar permission for this account yet — click Connect Google once and it will persist from then on.',
      detail: (data.detail ?? '') + triggerNote,
    });
    return {
      ok: false,
      code: 'connect_required',
      message: revoked
        ? 'Google ended the saved Calendar permission. Click Connect Google to restore it.'
        : 'Google Calendar has not been connected for this account yet.',
      detail: data.detail,
    };
  }

  // The endpoint exists but says it isn't set up (missing Google creds /
  // service account). No point retrying every cycle — fall back to GIS.
  if (data.error === 'not_configured') {
    backendUnavailable = true;
    logDiag({
      level: 'warn',
      phase: 'connection',
      code: 'unknown',
      message:
        'The token-refresh server is deployed but not fully configured (missing Google or Firebase Admin credentials); falling back to Google popup refresh.',
      detail: (data.detail ?? '') + triggerNote,
    });
    return null;
  }

  // Reachable + configured, but the request was rejected (bad/expired ID
  // token, forbidden uid, or a revoked refresh token). Surface it so the
  // caller can decide; callers currently fall back to GIS as a backup.
  logDiag({
    level: 'warn',
    phase: 'connection',
    code: 'unknown',
    message: `The token-refresh server rejected the request (${data.error ?? res.status}).`,
    detail: (data.detail ?? '') + triggerNote,
  });
  return {
    ok: false,
    code: 'unknown',
    message: `Backend token refresh failed: ${data.error ?? res.status}`,
    detail: data.detail,
  };
}
