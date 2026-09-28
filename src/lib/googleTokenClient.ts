/**
 * Google Identity Services (GIS) token client — the sole mechanism for
 * obtaining a Google Calendar OAuth access token. Login/identity uses
 * Firebase email/password auth (see AuthContext.tsx) and is completely
 * decoupled from this: Calendar access is a separate, optional "Connect
 * Google Calendar" step that never expires the user's actual login session.
 *
 * Two modes:
 * - Silent (`prompt: 'none'`) — used to restore a token on page reload/tab
 *   focus without ever showing any UI. Succeeds silently when the user has
 *   an active Google session and previously granted this app the requested
 *   scopes; fails silently otherwise (third-party-cookie blocking, consent
 *   never granted, etc.), in which case callers fall back to the
 *   interactive flow. Deliberately `'none'` rather than `''` — an empty
 *   string leaves GIS free to decide the prompt itself, which under
 *   third-party-cookie restrictions can still render a visible
 *   account-chooser/FedCM popup even when the caller only meant "check
 *   silently". `'none'` is GIS's explicit "never show UI, just fail if you
 *   would have needed to" contract, which is what a background refresh
 *   requires — this is the fix for the stray popup appearing on login/tab
 *   focus for anyone who'd ever connected Calendar.
 * - Interactive (`prompt: 'consent'`) — shows the Google popup so the user
 *   can pick an account and grant Calendar access explicitly, from the
 *   "Connect Google" button. Independent of whichever email/password
 *   account the user logged into BASE with.
 *
 * Every failure now returns a *structured reason* (see `CalendarTokenResult`)
 * and is recorded to the central diagnostics log — previously all of these
 * collapsed to a bare `null`, which is exactly why "notifications won't
 * connect" was impossible to pinpoint.
 */

import { logDiag } from './googleDiagnostics';

/**
 * Scopes the app asks Google for. Shared with the authorization-code redirect
 * flow (`googleOAuthConnect.ts`) so both paths request exactly the same grant —
 * if they drifted, reconnecting through one would quietly downgrade the other.
 */
export const CALENDAR_SCOPES =
  'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.app.created';

/** Machine-readable reason a token request failed. */
export type TokenErrorCode =
  | 'no_client_id'
  | 'gis_unavailable'
  | 'access_denied'
  | 'interaction_required'
  | 'consent_required'
  | 'admin_policy_enforced'
  | 'popup_closed'
  | 'popup_blocked'
  | 'timeout'
  /** No refresh token is stored for this user yet — send them through the
   *  one-click authorization-code connect (`googleOAuthConnect.ts`). */
  | 'connect_required'
  | 'unknown';

export type CalendarTokenResult =
  | { ok: true; token: string; expiresInSec: number }
  | { ok: false; code: TokenErrorCode; message: string; detail?: string };

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GisAccounts {
  oauth2: {
    initTokenClient: (config: {
      client_id: string;
      scope: string;
      callback: (response: GisTokenResponse) => void;
      error_callback?: (error: { type: string; message?: string }) => void;
    }) => GisTokenClient;
  };
}

declare global {
  interface Window {
    google?: { accounts: GisAccounts };
  }
}

function waitForGis(timeoutMs = 4000): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Google Identity Services script did not load in time'));
      }
    }, 100);
  });
}

/** Maps GIS's `response.error` (OAuth error codes) to our reason + friendly copy. */
function mapOAuthError(
  error: string | undefined,
  description: string | undefined,
  mode: 'silent' | 'interactive',
): { code: TokenErrorCode; message: string } {
  switch (error) {
    case 'access_denied':
      return { code: 'access_denied', message: 'Calendar access was denied for this Google account.' };
    case 'interaction_required':
    case 'login_required':
      return {
        code: 'interaction_required',
        message:
          mode === 'silent'
            ? 'Google could not refresh access silently and needs you to reconnect (interaction required).'
            : 'Google needs you to sign in / interact to grant Calendar access.',
      };
    case 'consent_required':
      return {
        code: 'consent_required',
        message: 'Google needs you to grant consent again — click Reconnect Google.',
      };
    case 'admin_policy_enforced':
      return {
        code: 'admin_policy_enforced',
        message:
          'A Google Workspace admin policy is blocking Calendar access for this account. Contact your admin or use a personal Google account.',
      };
    default:
      return {
        code: 'unknown',
        message: description || error || 'Google rejected the token request for an unknown reason.',
      };
  }
}

/** Maps GIS's `error_callback` `type` (popup-level failures) to our reason + copy. */
function mapPopupError(type: string, message?: string): { code: TokenErrorCode; message: string } {
  switch (type) {
    case 'popup_closed':
      return { code: 'popup_closed', message: 'The Google sign-in popup was closed before access was granted.' };
    case 'popup_failed_to_open':
      return {
        code: 'popup_blocked',
        message: 'The Google sign-in popup was blocked by the browser. Allow popups for this site and retry.',
      };
    default:
      return { code: 'unknown', message: message || `Google popup error: ${type}` };
  }
}

/**
 * Requests a Calendar access token via GIS. Resolves to a structured
 * `CalendarTokenResult` (never rejects) — `{ ok: true, token }` on success,
 * or `{ ok: false, code, message }` carrying the *real* reason (missing
 * client id, GIS blocked, denied consent, closed/blocked popup, timeout,
 * silent-refresh-needs-interaction, etc.). Every outcome is also written to
 * the diagnostics log.
 *
 * @param mode `'silent'` asks with `prompt: 'none'` — guaranteed no UI, safe
 * to call on every page load/tab focus; `'interactive'` shows the Google
 * account/consent popup — only call this from a real user click (the
 * explicit "Connect/Reconnect Google" button).
 * @param trigger optional short label (e.g. `'tab-focus'`, `'token-miss'`,
 * `'scheduled'`, `'user-click'`) recorded alongside every diagnostic entry so
 * the log makes clear what caused this particular attempt.
 */
export async function requestCalendarToken(
  clientId: string | undefined,
  mode: 'silent' | 'interactive',
  trigger?: string,
): Promise<CalendarTokenResult> {
  const phase = mode === 'silent' ? 'token-silent' : 'token-interactive';
  // Appended to every diagnostic entry so the log makes clear *what* kicked
  // off this attempt (a scheduled refresh, a tab-focus event, a token cache
  // miss, the user clicking Connect, …) — otherwise a burst of identical
  // "token-silent" lines gives no hint about their cause.
  const triggerNote = trigger ? ` [trigger: ${trigger}]` : '';
  const withTrigger = (detail?: string) =>
    detail ? `${detail}${triggerNote}` : triggerNote.trim() || undefined;

  if (!clientId) {
    const message =
      'No Google OAuth client ID is configured (VITE_GOOGLE_CLIENT_ID is missing). Calendar access cannot be requested.';
    logDiag({ level: 'error', phase, code: 'no_client_id', message, detail: withTrigger() });
    return { ok: false, code: 'no_client_id', message };
  }

  try {
    await waitForGis();
  } catch (err) {
    const message =
      'Google Identity Services failed to load — check your network connection or any ad/script blockers, then retry.';
    logDiag({
      level: 'error',
      phase,
      code: 'gis_unavailable',
      message,
      detail: withTrigger(err instanceof Error ? err.message : String(err)),
    });
    return { ok: false, code: 'gis_unavailable', message };
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: CalendarTokenResult) => {
      if (settled) return;
      settled = true;
      if (result.ok) {
        logDiag({
          level: 'info',
          phase,
          code: 'ok',
          message: `Google Calendar access token obtained${
            mode === 'interactive' ? ' via your Connect/Reconnect click' : ' silently in the background'
          } (expires in ~${Math.round(result.expiresInSec / 60)} min).`,
          detail: withTrigger(),
        });
      } else {
        // A closed/timed-out popup on the *silent* path is expected in
        // privacy-hardened browsers (Brave shields, blocked third-party
        // cookies) and does NOT by itself mean the user lost access — it just
        // means the background exchange couldn't complete without UI. Keep it
        // at 'warn' and say so, instead of an alarming 'error'.
        const benignSilent = mode === 'silent' && (result.code === 'popup_closed' || result.code === 'timeout');
        logDiag({
          level: benignSilent ? 'warn' : result.code === 'popup_closed' ? 'warn' : 'error',
          phase,
          code: result.code,
          message: benignSilent
            ? `${result.message} This is expected in privacy-hardened browsers; any existing connection is kept.`
            : result.message,
          detail: withTrigger(result.detail),
        });
      }
      resolve(result);
    };

    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: CALENDAR_SCOPES,
        callback: (response) => {
          if (response.access_token) {
            settle({ ok: true, token: response.access_token, expiresInSec: response.expires_in ?? 3300 });
          } else {
            const { code, message } = mapOAuthError(response.error, response.error_description, mode);
            settle({ ok: false, code, message, detail: response.error_description || response.error });
          }
        },
        error_callback: (error) => {
          const { code, message } = mapPopupError(error.type, error.message);
          settle({ ok: false, code, message, detail: `${error.type}${error.message ? `: ${error.message}` : ''}` });
        },
      });

      // Safety net in case neither callback fires (older browsers without
      // error_callback support silently swallowing a blocked prompt). The
      // interactive popup can legitimately stay open longer while the user
      // picks an account, so give it more breathing room than the silent path.
      setTimeout(
        () =>
          settle({
            ok: false,
            code: 'timeout',
            message:
              mode === 'silent'
                ? 'Silent Google token refresh timed out (no response). Google may require you to reconnect.'
                : 'Timed out waiting for Google to respond. Close any popup and try Reconnect Google again.',
          }),
        mode === 'interactive' ? 60000 : 4000,
      );

      client.requestAccessToken({ prompt: mode === 'interactive' ? 'consent' : 'none' });
    } catch (err) {
      settle({
        ok: false,
        code: 'unknown',
        message: 'An unexpected error occurred while requesting Google Calendar access.',
        detail: withTrigger(err instanceof Error ? err.message : String(err)),
      });
    }
  });
}
