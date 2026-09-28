/**
 * Session 2 — the one-click "connect Google Calendar once, forever" flow.
 *
 * This is the *authorization-code* flow, and it is deliberately a full-page
 * redirect rather than a popup. The popup path (`googleTokenClient.ts`) can
 * only ever hand back a ~1h access token, and privacy-hardened browsers block
 * the silent iframe that would renew it — which is the entire reason the
 * connection kept dying. A redirect asks Google for `access_type=offline`, so
 * the code that comes back can be traded for a **refresh token**, and a refresh
 * token is what survives closing the browser.
 *
 * The refresh token never touches this file. The browser only ever holds the
 * one-time `code`; `api/google-connect.ts` does the exchange server-side and
 * keeps the refresh token in Firestore where no client can read it.
 *
 * PKCE (RFC 7636) rides along: a random `code_verifier` stays in this tab's
 * `sessionStorage` and only its SHA-256 hash goes to Google, so a `code`
 * captured out of the redirect URL is worthless to whoever captured it.
 *
 * Google Cloud Console must list `<origin>/oauth/callback` under **Authorized
 * redirect URIs** for every origin the app runs on (localhost dev, the Vercel
 * domain). Google matches it character for character.
 */

import { CALENDAR_SCOPES, type CalendarTokenResult, type TokenErrorCode } from './googleTokenClient';
import { logDiag } from './googleDiagnostics';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Path the Google consent screen redirects back to. Registered with Google. */
export const OAUTH_CALLBACK_PATH = '/oauth/callback';

// Session-scoped so a second tab can't consume the first tab's flow, and so
// nothing survives the browser being closed mid-consent.
const VERIFIER_KEY = 'mutineer_google_pkce_verifier';
const STATE_KEY = 'mutineer_google_oauth_state';
const RETURN_TO_KEY = 'mutineer_google_oauth_return_to';

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength = 48): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** The exact `redirect_uri` this origin uses — must match Google's registration. */
export function calendarRedirectUri(): string {
  return `${window.location.origin}${OAUTH_CALLBACK_PATH}`;
}

/**
 * Outcome of *starting* the flow — deliberately not a `CalendarTokenResult`,
 * because no token exists yet at this point and a success here means "the
 * browser is on its way to Google", not "connected". `window.location.assign`
 * doesn't stop the current call stack, so the caller does observe this value
 * even on the success path; it must be able to tell "leaving now" apart from
 * "couldn't leave" without inspecting an error code.
 */
export type ConnectStartResult = { started: true } | { started: false; message: string };

/**
 * Sends the browser to Google's consent screen.
 *
 * @param returnTo where to land the user after the callback completes; defaults
 * to wherever they clicked from.
 */
export async function startCalendarConnect(returnTo?: string): Promise<ConnectStartResult> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (!clientId) {
    const message =
      'No Google OAuth client ID is configured (VITE_GOOGLE_CLIENT_ID is missing). Calendar access cannot be requested.';
    logDiag({ level: 'error', phase: 'token-interactive', code: 'no_client_id', message });
    return { started: false, message };
  }

  const verifier = randomToken();
  const state = randomToken(16);
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_TO_KEY, returnTo ?? window.location.pathname + window.location.search);
  } catch (err) {
    // Without the verifier the exchange cannot be completed, so fail here
    // rather than stranding the user on Google's consent screen.
    const message =
      'This browser is blocking session storage, so the Google connection cannot be started. Allow site data and try again.';
    logDiag({
      level: 'error',
      phase: 'token-interactive',
      code: 'storage_blocked',
      message,
      detail: err instanceof Error ? err.message : String(err),
    });
    return { started: false, message };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: calendarRedirectUri(),
    response_type: 'code',
    scope: CALENDAR_SCOPES,
    // The two that buy a refresh token. `prompt=consent` looks redundant on a
    // first connect, but Google withholds the refresh token on every *repeat*
    // authorization unless consent is re-shown — without it, reconnecting
    // after a revoke silently produces an access-token-only grant.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  });

  logDiag({
    level: 'info',
    phase: 'token-interactive',
    code: 'redirect_start',
    message: 'Sending you to Google to authorize Calendar access. You will come straight back.',
  });
  window.location.assign(`${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`);
  return { started: true };
}

export interface ConnectCallbackResult {
  result: CalendarTokenResult;
  /** Where the user was when they started, so the callback page can go back. */
  returnTo: string;
}

interface ConnectResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  detail?: string;
}

/**
 * Completes the flow on `/oauth/callback`: validates Google's `state` against
 * the one this tab stored, then posts the code to `api/google-connect.ts` for
 * the server-side exchange.
 *
 * Consumes the stored verifier/state on every path — a one-time code really is
 * one-time, so a retry has to start the whole flow again rather than replay it.
 */
export async function completeCalendarConnect(
  params: URLSearchParams,
  idToken: string,
): Promise<ConnectCallbackResult> {
  let verifier: string | null = null;
  let expectedState: string | null = null;
  let returnTo = '/notifications';
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY);
    expectedState = sessionStorage.getItem(STATE_KEY);
    returnTo = sessionStorage.getItem(RETURN_TO_KEY) || returnTo;
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // Handled by the null checks below.
  }

  const fail = (code: TokenErrorCode, message: string, detail?: string): ConnectCallbackResult => {
    logDiag({ level: 'error', phase: 'token-interactive', code, message, detail });
    return { result: { ok: false, code, message, detail }, returnTo };
  };

  // Google reports a refused consent screen in the query string, not as an HTTP
  // error — so this is the "user clicked Cancel" path.
  const googleError = params.get('error');
  if (googleError) {
    return fail(
      googleError === 'access_denied' ? 'access_denied' : 'unknown',
      googleError === 'access_denied'
        ? 'You cancelled the Google authorization, so Calendar is still not connected.'
        : `Google refused the authorization (${googleError}).`,
      params.get('error_description') ?? undefined,
    );
  }

  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) {
    return fail('unknown', 'Google did not send an authorization code back. Start the connection again.');
  }
  if (!verifier || !expectedState) {
    return fail(
      'unknown',
      'This browser tab did not start the Google connection (or its session data was cleared). Click Connect Google again in this tab.',
    );
  }
  if (state !== expectedState) {
    // Mismatched state is the CSRF signal — never exchange the code.
    return fail('unknown', 'The Google response did not match the request this tab started. Nothing was connected; please try again.');
  }

  let res: Response;
  try {
    res = await fetch('/api/google-connect', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: calendarRedirectUri() }),
    });
  } catch (err) {
    return fail(
      'unknown',
      'Could not reach the server to finish connecting Google. Check your connection and try again.',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Plain `vite` dev has no serverless runtime, so /api/* falls through to the
  // SPA's index.html. Say so plainly instead of failing on a JSON parse.
  const contentType = res.headers.get('content-type') ?? '';
  if (res.status === 404 || !contentType.includes('application/json')) {
    return fail(
      'unknown',
      'The server endpoint that finishes the Google connection is not running here. Start the app with `npm run dev:full` (or use the deployed site).',
    );
  }

  const data = (await res.json().catch(() => ({}))) as ConnectResponse;
  if (!res.ok || !data.access_token) {
    return fail(
      'unknown',
      data.error === 'not_configured'
        ? 'The server is missing its Google credentials, so the connection could not be completed.'
        : `The server could not complete the Google connection (${data.error ?? res.status}).`,
      data.detail,
    );
  }

  logDiag({
    level: 'info',
    phase: 'token-interactive',
    code: 'ok',
    message:
      'Google Calendar connected. The long-lived permission is now stored on the server, so this will survive closing the browser.',
  });
  return {
    result: { ok: true, token: data.access_token, expiresInSec: data.expires_in ?? 3300 },
    returnTo,
  };
}
