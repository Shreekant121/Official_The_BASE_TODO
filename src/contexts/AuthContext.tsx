import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  updateProfile,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useSnapshotStore } from '../store/useSnapshotStore';
import { requestCalendarToken, type CalendarTokenResult } from '../lib/googleTokenClient';
import {
  isBackendCalendarConfigured,
  requestCalendarTokenViaBackend,
  resetBackendCalendarProbe,
} from '../lib/calendarBackend';
import {
  completeCalendarConnect,
  startCalendarConnect as redirectToGoogleConsent,
  type ConnectStartResult,
} from '../lib/googleOAuthConnect';
import { logDiag } from '../lib/googleDiagnostics';
import { devBypassUser } from '../lib/devAuth';
import { useAccountAccessSync } from '../lib/accountAccess';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * True once a Google Calendar access token has been cached for this
   * session. Each individual Google access token is short-lived (~1hr), but
   * it's kept alive automatically so this should stay `true` indefinitely:
   * - Preferred (E2): a secure `/api/refresh-token` backend holds a long-lived
   *   refresh token and mints fresh access tokens with no popup, in every
   *   browser — this is what makes the connection survive even Brave's block
   *   on GIS silent iframe refresh.
   * - Fallback (client-only): if the backend isn't deployed/configured, the
   *   token is proactively refreshed silently (no popup, `prompt:'none'`) via
   *   Google Identity Services for as long as the browser's Google
   *   session/consent stays valid.
   * Fully independent of the login session, which never expires at all.
   */
  hasCalendarAccess: boolean;
  /**
   * True if this Firebase account has ever clicked "Connect Google" on this
   * browser. Distinguishes "never connected" from "connected before but the
   * silent refresh can't get a token right now" on the Notifications page.
   */
  hasEverConnectedCalendar: boolean;
  /** Returns a valid Calendar access token, or null if the user needs to reconnect. Never prompts. */
  getCalendarAccessToken: () => string | null;
  /**
   * Prompts (re)authorization with the calendar scope if there's no
   * cached/valid token. Returns a structured result: `{ ok: true, token }`
   * on success, or `{ ok: false, code, message }` carrying the real reason
   * (denied consent, blocked popup, missing client id, etc.) so callers can
   * show a precise error instead of a generic "reconnect failed".
   */
  ensureCalendarAccess: () => Promise<CalendarTokenResult>;
  /**
   * Sends the browser to Google's consent screen to grant *offline* Calendar
   * access. This is the only path that produces a refresh token, and therefore
   * the only path that survives closing the browser — `ensureCalendarAccess`
   * returning `code: 'connect_required'` is the signal to call it. Resolves to
   * `{ started: true }` as the page navigates away.
   */
  startCalendarConnect: (returnTo?: string) => Promise<ConnectStartResult>;
  /**
   * Completes that flow on the `/oauth/callback` route: exchanges Google's
   * one-time code for tokens (server-side) and adopts the resulting access
   * token. Returns the page the user started from so the callback can send
   * them back where they were.
   */
  finishCalendarConnect: (
    params: URLSearchParams,
  ) => Promise<{ result: CalendarTokenResult; returnTo: string }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// In-memory only — an OAuth access token is a secret and must never be
// persisted to Firestore or localStorage.
let cachedCalendarToken: { token: string; expiresAt: number } | null = null;

// Keep this in sync with the buffer subtracted when caching a token's
// `expiresAt` below — it's both "how early we consider a token stale" and
// "how far in advance we proactively schedule the next silent refresh".
const REFRESH_MARGIN_SEC = 300;
const MIN_REFRESH_DELAY_MS = 30_000;
// Silent refreshes never show any UI, so retrying on failure (network blip,
// tab was asleep, transient Google hiccup) is invisible and safe — cap the
// backoff instead of giving up, so a permanently revoked/expired grant is
// the *only* thing that ends up requiring the user to click "Reconnect".
const MAX_REFRESH_BACKOFF_MS = 30 * 60_000;
// How many consecutive non-"needs-interaction" silent failures (e.g. repeated
// timeouts) to tolerate before treating the silent path as dead and tripping
// the circuit breaker. Low enough that a stuck browser stops re-popping the
// Google window almost immediately, high enough to ride out a single transient
// network/GIS blip without forcing a manual reconnect.
const MAX_SILENT_FAILURES = 2;
// After a user-driven interactive connect settles, background silent refreshes
// are suppressed for this long. Closing the Google consent popup fires a
// `focus`/`visibilitychange` on the main window, which would otherwise kick off
// a silent refresh that races the just-obtained token — its popup gets
// auto-closed and, before this guard existed, its failure handler wiped the
// good token, flipping the connection off ~1s after it turned on.
const INTERACTIVE_COOLDOWN_MS = 10_000;

// Explicitly pin auth persistence to `local` (IndexedDB, survives tab/browser
// restarts) so the login session never silently ends. This mirrors Firebase's
// own web default, but pinning it here makes the "never logs out until the
// user clicks Logout" behavior an explicit guarantee instead of an implicit
// default that could regress. Fire this once at module load, before any
// sign-in call, so it's guaranteed to apply.
const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {
  // Ignore — falls back to the SDK's own default persistence.
});

/**
 * Whether this specific Google account has ever been explicitly connected
 * for Calendar access on this browser, keyed per Firebase uid. Used to
 * decide whether it's safe to attempt a background/no-gesture token
 * refresh: Google's Identity Services library always shows *some* UI the
 * very first time a given browser/app/scope combo requests a token (see
 * `googleTokenClient.ts`), even with `prompt: ''`. Auto-firing that request
 * right after every email/password login — before the user ever opted into
 * Calendar — was surfacing an unsolicited "choose a Google account" popup
 * immediately post-login, which read as a broken/duplicate sign-in. Gating
 * on this flag means that popup can only ever appear as a direct result of
 * the user clicking "Connect Google Calendar" themselves.
 */
function calendarConnectedKey(uid: string) {
  return `mutineer_calendar_connected_${uid}`;
}
function hasEverConnectedCalendar(uid: string): boolean {
  try {
    return localStorage.getItem(calendarConnectedKey(uid)) === 'true';
  } catch {
    return false;
  }
}
function markCalendarConnected(uid: string) {
  try {
    localStorage.setItem(calendarConnectedKey(uid), 'true');
  } catch {
    // Best-effort only — worst case the silent-restore optimization is skipped.
  }
}

/**
 * Persisted, browser-wide note that this browser cannot complete a *silent*
 * (`prompt:'none'`) Google token exchange without flashing a popup — i.e. GIS
 * opens a real popup window that instantly closes (`popup_closed` /
 * `popup_blocked`) instead of resolving invisibly. This happens under
 * privacy-hardened setups (Brave shields, blocked third-party cookies). While
 * it holds, no background token request is auto-fired, because every one of
 * them would surface an unsolicited popup even though the user is already
 * connected.
 *
 * **It expires.** The old version of this flag was written as a permanent
 * `'true'` and cleared only by signing out, so two failures — a blocked popup,
 * or even a pair of transient timeouts — disabled background refresh on this
 * browser *forever*, which is precisely how a working connection ended up
 * needing a manual reconnect every session. It now stores the timestamp it was
 * set at and lapses after `SILENT_UNSUPPORTED_TTL_MS`, so a browser that has
 * since had its privacy settings relaxed (or that hit a one-off blip) re-tests
 * on its own. It is also cleared outright the moment the server successfully
 * mints a token, because a working server-side refresh makes the GIS silent
 * path irrelevant.
 */
const SILENT_UNSUPPORTED_KEY = 'mutineer_calendar_silent_unsupported';
const SILENT_UNSUPPORTED_TTL_MS = 24 * 60 * 60_000;
function isSilentRefreshUnsupported(): boolean {
  try {
    const raw = localStorage.getItem(SILENT_UNSUPPORTED_KEY);
    if (!raw) return false;
    const setAt = Number(raw);
    // A non-numeric value is the pre-Session-2 permanent `'true'`. Treat it as
    // lapsed and drop it — that flag is exactly the latch being retired here.
    if (!Number.isFinite(setAt) || Date.now() - setAt > SILENT_UNSUPPORTED_TTL_MS) {
      clearSilentRefreshUnsupported();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function markSilentRefreshUnsupported() {
  try {
    localStorage.setItem(SILENT_UNSUPPORTED_KEY, String(Date.now()));
  } catch {
    // Best-effort — worst case we attempt one more silent refresh next load.
  }
}
function clearSilentRefreshUnsupported() {
  try {
    localStorage.removeItem(SILENT_UNSUPPORTED_KEY);
  } catch {
    // Best-effort.
  }
}

/**
 * The screenshot harness's stand-in user, or `null` in every other situation
 * (see `lib/devAuth.ts`). Resolved once at module load — the harness writes the
 * key it looks for before any app module evaluates — so `import.meta.env.DEV`
 * folds to `false` in a production build and every branch below it is dropped.
 *
 * `userRef` is deliberately *not* seeded with this user: it exists purely to
 * drive Google Calendar token refreshes, and the bypass account has no Google
 * grant to refresh. Leaving it null keeps the whole GIS path dormant.
 */
const DEV_BYPASS_USER = import.meta.env.DEV ? devBypassUser() : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(DEV_BYPASS_USER);
  const [loading, setLoading] = useState(DEV_BYPASS_USER === null);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);
  const [hasEverConnectedCalendarFlag, setHasEverConnectedCalendarFlag] = useState(false);
  const userRef = useRef<User | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffMsRef = useRef(MIN_REFRESH_DELAY_MS);
  // Guards against overlapping silent refreshes. Many independent triggers
  // (auth-state change, tab focus + visibilitychange firing together, every
  // `getCalendarAccessToken()` miss from a sync/reconcile pass, the scheduled
  // timer) can all land within the same second; without this each one spins up
  // its own GIS token popup, and in browsers that block the silent
  // (no-gesture) exchange they each immediately fail with `popup_closed` —
  // producing the burst of `token-silent/popup_closed` warnings.
  const refreshInFlightRef = useRef(false);
  // Circuit breaker for the *silent* refresh path. Set true the moment a
  // silent (no-gesture) token request fails in a way that can only be fixed
  // by the user actively interacting — a closed/blocked Google popup, denied
  // or required consent/interaction, or an admin policy block. Once tripped,
  // EVERY background silent trigger (auth-state change, tab focus/visibility,
  // and every `getCalendarAccessToken()` miss from a sync/reconcile pass)
  // bails out immediately instead of re-firing GIS. Without this the popup
  // just re-opens and re-closes on an endless loop. It's only ever cleared by
  // a successful *interactive* "Connect/Reconnect Google" click, or by
  // signing out — i.e. only a real user action can re-enable silent refresh.
  const silentRefreshBlockedRef = useRef(false);
  // Counts consecutive *silent* failures whose error code isn't already a
  // definitive "needs interaction" one (e.g. `timeout`, transient network
  // hiccups). A silent (`prompt:'none'`) request that simply times out with no
  // callback means GIS couldn't complete the no-gesture exchange in this
  // browser either — functionally identical to a closed popup — so after a
  // small allowance for genuinely transient blips we trip the same circuit
  // breaker rather than rescheduling forever (which is what kept the popup
  // open/close loop alive). Reset to 0 on any success or interactive connect.
  const silentFailureCountRef = useRef(0);
  // Tracks the uid the calendar-refresh state currently belongs to, so a
  // re-fired `onAuthStateChanged` for the *same* already-signed-in user can't
  // silently reset the circuit breaker (and restart the loop). Only a genuine
  // account change (or first sign-in) clears it.
  const lastRefreshUidRef = useRef<string | null>(null);
  // True while an interactive (user-clicked) token request is open, and its
  // settle time, so silent refreshes can stand down during the request and for
  // a short cooldown afterwards — see `INTERACTIVE_COOLDOWN_MS`.
  const interactiveInFlightRef = useRef(false);
  const interactiveSettledAtRef = useRef(0);
  // Mirror of `hasCalendarAccess` so `setCalendarConnected` can detect genuine
  // transitions (and only log/set on change) without depending on render state.
  const connectedRef = useRef(false);
  // Broken via a ref (instead of calling the memoized callbacks directly) to
  // avoid a circular useCallback dependency between "refresh" and "schedule
  // the next refresh" — both need to call each other.
  const silentlyRefreshRef = useRef<(uid: string, trigger?: string) => void>(() => {});

  const clearScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleSilentRefresh = useCallback((uid: string, delayMs: number) => {
    clearScheduledRefresh();
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      silentlyRefreshRef.current(uid, 'scheduled-timer');
    }, Math.max(delayMs, MIN_REFRESH_DELAY_MS));
  }, [clearScheduledRefresh]);

  /**
   * Google Calendar access is entirely separate from the login session —
   * it's obtained straight from Google Identity Services using the app's
   * OAuth client id, never through Firebase Auth. Once a user has ever
   * connected Calendar, this keeps re-requesting a token silently (no popup,
   * `prompt: ''`) in the background — first right away (e.g. on page
   * load/reload) and then again proactively, right as each token is about
   * to go stale, for as long as the tab stays open and the browser's Google
   * session/consent remains valid. This is what makes "connect once, stay
   * connected" hold: without it the cached token would simply expire ~1hr
   * in (no backend to hold a refresh token — see the Free tier constraints
   * in the master plan) and every calendar/notification action would start
   * silently failing until the user clicked "Reconnect" again.
   */
  // Single choke point for flipping the Calendar-connected flag, so every
  // transition is logged with a human reason. Mirrors state into a ref and
  // only logs/sets on an actual change — this is what makes the diagnostics log
  // read like a story ("connected via your click" → "disconnected: token
  // wiped") instead of leaving you to infer state from raw token events.
  const setCalendarConnected = useCallback((connected: boolean, reason: string) => {
    if (connectedRef.current === connected) return;
    connectedRef.current = connected;
    logDiag({
      level: connected ? 'info' : 'warn',
      phase: 'connection',
      code: connected ? 'connected' : 'disconnected',
      message: connected
        ? `Google Calendar is now connected — ${reason}.`
        : `Google Calendar is now disconnected — ${reason}.`,
    });
    setHasCalendarAccess(connected);
  }, []);

  /**
   * Takes a token the *server* minted (either a refresh of the stored grant, or
   * the exchange that created it) and makes it this session's live connection.
   *
   * Everything it resets exists because the pre-Session-2 app could only get
   * tokens through the browser: the circuit breaker, the failure counter, and
   * the persisted "this browser can't refresh silently" flag were all guarding
   * against popups. A server-held refresh token makes all three moot — the
   * browser is no longer part of the refresh — so a server token clears the lot
   * rather than inheriting a latch set by some earlier popup failure.
   */
  const adoptServerToken = useCallback(
    (uid: string, token: string, expiresInSec: number, reason: string) => {
      silentRefreshBlockedRef.current = false;
      silentFailureCountRef.current = 0;
      lastRefreshUidRef.current = uid;
      backoffMsRef.current = MIN_REFRESH_DELAY_MS;
      clearSilentRefreshUnsupported();
      const expiresAt = Date.now() + (expiresInSec - REFRESH_MARGIN_SEC) * 1000;
      cachedCalendarToken = { token, expiresAt };
      setCalendarConnected(true, reason);
      markCalendarConnected(uid);
      setHasEverConnectedCalendarFlag(true);
      scheduleSilentRefresh(uid, expiresAt - Date.now());
    },
    [scheduleSilentRefresh, setCalendarConnected],
  );

  const silentlyRefreshCalendarToken = useCallback(async (uid: string, trigger = 'scheduled') => {
    // ── Prefer the server-held refresh token ──
    // A `/api/refresh-token` call never shows UI and works in every browser
    // (incl. Brave, which blocks the GIS silent iframe), so it runs BEFORE all
    // the GIS-specific popup/circuit-breaker guards below. It also restores the
    // connection on a browser that has never seen it — the grant lives on the
    // server, not here — which is what makes a second machine, or a cleared
    // profile, simply work. Skipped only while another refresh is in flight or
    // a user-driven interactive connect is still settling (so it can't race
    // that flow's token caching).
    if (
      isBackendCalendarConfigured() &&
      !refreshInFlightRef.current &&
      !interactiveInFlightRef.current &&
      Date.now() - interactiveSettledAtRef.current >= INTERACTIVE_COOLDOWN_MS
    ) {
      refreshInFlightRef.current = true;
      let backendResult: CalendarTokenResult | null;
      try {
        backendResult = await requestCalendarTokenViaBackend(trigger);
      } finally {
        refreshInFlightRef.current = false;
      }
      // Account signed out/switched mid-flight — don't resurrect a stale uid.
      if (userRef.current?.uid !== uid) return;
      if (backendResult?.ok) {
        // A server refresh IS a connection — `adoptServerToken` also remembers
        // it locally, so the Notifications page reads as connected and future
        // sessions keep refreshing without a click.
        adoptServerToken(
          uid,
          backendResult.token,
          backendResult.expiresInSec,
          'the secure server refreshed your Google access token',
        );
        return;
      }
      // The server is healthy but holds no grant for this user — never
      // connected, or Google revoked/expired the stored refresh token. Stop
      // here rather than falling through to GIS: the silent path has nothing to
      // refresh either, and firing it is how a background tick ends up flashing
      // a Google popup at someone who is simply not connected. The Notifications
      // page shows Connect/Reconnect, which starts the redirect flow.
      if (backendResult && !backendResult.ok && backendResult.code === 'connect_required') {
        clearScheduledRefresh();
        if (!cachedCalendarToken || cachedCalendarToken.expiresAt <= Date.now()) {
          cachedCalendarToken = null;
          setCalendarConnected(false, 'Google has no saved permission for this account — click Connect Google once');
        }
        return;
      }
      // Backend unavailable/not-configured (`null`) or a hard rejection — fall
      // through to the GIS silent path below as a backup.
    }

    // Never auto-request a Google token for an account that hasn't
    // explicitly connected Calendar before — see `hasEverConnectedCalendar`
    // doc comment for why this guard exists.
    if (!hasEverConnectedCalendar(uid)) return;
    // This browser has already shown it can't do a silent exchange without
    // flashing a popup — never auto-fire another background request, or the
    // user gets an unsolicited popup while already connected. Only an explicit
    // interactive "Connect/Reconnect" click may talk to Google from now on.
    if (isSilentRefreshUnsupported()) return;
    // The circuit breaker tripped on an earlier failure that needs a real user
    // click to resolve — do not re-fire the silent request (that's exactly the
    // popup open/close loop this guard exists to stop). Only an interactive
    // reconnect or a sign-out will clear it.
    if (silentRefreshBlockedRef.current) return;
    // Stand down while a user-driven interactive connect is open or just
    // finished — otherwise the focus event from the closing consent popup
    // races (and wipes) the token that connect is about to cache. See
    // `INTERACTIVE_COOLDOWN_MS`.
    if (
      interactiveInFlightRef.current ||
      Date.now() - interactiveSettledAtRef.current < INTERACTIVE_COOLDOWN_MS
    ) {
      return;
    }
    // Collapse the many near-simultaneous triggers into a single request — see
    // `refreshInFlightRef`. A concurrent caller simply no-ops; the in-flight
    // request will update the cache/schedule for everyone.
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    let result: CalendarTokenResult;
    try {
      result = await requestCalendarToken(clientId, 'silent', trigger);
    } finally {
      refreshInFlightRef.current = false;
    }
    // The account may have signed out (or switched) while this request was
    // in flight — don't resurrect a token/timer for a stale uid.
    if (userRef.current?.uid !== uid) return;

    if (result.ok) {
      silentFailureCountRef.current = 0;
      backoffMsRef.current = MIN_REFRESH_DELAY_MS;
      const expiresAt = Date.now() + (result.expiresInSec - REFRESH_MARGIN_SEC) * 1000;
      cachedCalendarToken = { token: result.token, expiresAt };
      setCalendarConnected(true, 'background token refresh succeeded');
      scheduleSilentRefresh(uid, expiresAt - Date.now());
      return;
    }

    const hasValidToken = !!cachedCalendarToken && cachedCalendarToken.expiresAt > Date.now();
    // A popup that opened and instantly closed (or was blocked) proves this
    // browser can't do an invisible silent exchange — persist that so we never
    // auto-fire a background request again (every one would flash a popup even
    // while connected). This is the definitive "stop popping up" signal.
    const isPopupFlash = result.code === 'popup_closed' || result.code === 'popup_blocked';
    // Failures that inherently require the user to act (re-consent, denied,
    // admin-blocked). Silent retries can't fix these either.
    const needsInteraction =
      result.code === 'access_denied' ||
      result.code === 'interaction_required' ||
      result.code === 'consent_required' ||
      result.code === 'admin_policy_enforced';

    if (isPopupFlash) {
      markSilentRefreshUnsupported();
      silentRefreshBlockedRef.current = true;
      clearScheduledRefresh();
      if (hasValidToken) {
        // Stay connected on the token we already hold — just stop trying to
        // refresh it in the background. No popup, no disconnect.
        logDiag({
          level: 'info',
          phase: 'connection',
          code: 'kept_alive',
          message:
            'A background refresh would have shown a Google popup, so automatic refresh is now off for this browser. Your existing connection is kept — you will only be asked to reconnect (with a popup) once the current access actually expires.',
          detail: `reason: ${result.code}; trigger: ${trigger}`,
        });
        return;
      }
      cachedCalendarToken = null;
      setCalendarConnected(false, 'your Google access expired and this browser blocks silent refresh — click "Reconnect Google" when you want to reconnect');
      logDiag({
        level: 'warn',
        phase: 'connection',
        code: 'auto_refresh_disabled',
        message:
          'Automatic background reconnection is now disabled for this browser because Google can only refresh access by showing a popup. No popup will appear again on its own — click "Connect / Reconnect Google" whenever you want to reconnect.',
        detail: `reason: ${result.code}; trigger: ${trigger}`,
      });
      return;
    }

    if (needsInteraction) {
      silentRefreshBlockedRef.current = true;
      clearScheduledRefresh();
      if (hasValidToken) {
        logDiag({
          level: 'info',
          phase: 'connection',
          code: 'kept_alive',
          message:
            'A background refresh needs you to re-authorize, but the existing Google Calendar token is still valid — staying connected for now.',
          detail: `reason: ${result.code}; trigger: ${trigger}`,
        });
        return;
      }
      cachedCalendarToken = null;
      setCalendarConnected(false, `Google needs you to reconnect (${result.code})`);
      logDiag({
        level: 'warn',
        phase: 'connection',
        code: 'auto_refresh_paused',
        message:
          'Automatic background reconnection is paused — Google needs you to re-authorize. Click "Connect / Reconnect Google" to restore it.',
        detail: `reason: ${result.code}; trigger: ${trigger}`,
      });
      return;
    }

    // Everything else (timeout, offline, GIS not loaded, a transient Google
    // hiccup) *might* be a genuinely temporary blip. If we still hold a valid
    // token, stay connected and quietly try again before it expires. Otherwise
    // retry with capped backoff — but only up to a small cap, because a silent
    // request that keeps timing out is really this browser being unable to do
    // the no-gesture exchange, which we then treat as unsupported (stop
    // popping up) rather than retrying forever.
    silentFailureCountRef.current += 1;
    const exhausted = silentFailureCountRef.current >= MAX_SILENT_FAILURES;

    if (hasValidToken) {
      logDiag({
        level: 'info',
        phase: 'connection',
        code: 'kept_alive',
        message:
          'A background token refresh failed, but the existing Google Calendar token is still valid — staying connected.',
        detail: `reason: ${result.code}; trigger: ${trigger}`,
      });
      if (exhausted) {
        // Deliberately NOT `markSilentRefreshUnsupported()`. These are the
        // *transient* codes (timeout, offline, GIS not loaded); persisting them
        // is what used to turn a network blip into a permanently manual
        // connection. Trip the in-memory breaker so this session stops
        // retrying, and let the next page load try once more.
        silentRefreshBlockedRef.current = true;
        clearScheduledRefresh();
        logDiag({
          level: 'warn',
          phase: 'connection',
          code: 'auto_refresh_paused',
          message: `Automatic background refresh is paused for now after ${MAX_SILENT_FAILURES} failed silent attempts — no popup will appear on its own. Your existing connection is kept, and refreshing the app will try again.`,
          detail: `trigger: ${trigger}`,
        });
        return;
      }
      scheduleSilentRefresh(uid, backoffMsRef.current);
      backoffMsRef.current = Math.min(backoffMsRef.current * 2, MAX_REFRESH_BACKOFF_MS);
      return;
    }

    cachedCalendarToken = null;
    setCalendarConnected(false, `background token refresh failed (${result.code})`);
    if (exhausted) {
      // Same reasoning as above: session-scoped only, never persisted.
      silentRefreshBlockedRef.current = true;
      clearScheduledRefresh();
      logDiag({
        level: 'warn',
        phase: 'connection',
        code: 'auto_refresh_paused',
        message: `Automatic background reconnection is paused after ${MAX_SILENT_FAILURES} failed silent attempts (last: ${result.code}) — no popup will appear on its own. Reload the app to retry, or click "Connect / Reconnect Google".`,
        detail: `trigger: ${trigger}`,
      });
      return;
    }
    scheduleSilentRefresh(uid, backoffMsRef.current);
    backoffMsRef.current = Math.min(backoffMsRef.current * 2, MAX_REFRESH_BACKOFF_MS);
  }, [scheduleSilentRefresh, clearScheduledRefresh, setCalendarConnected, adoptServerToken]);

  useEffect(() => {
    silentlyRefreshRef.current = (uid: string, trigger = 'scheduled') => {
      silentlyRefreshCalendarToken(uid, trigger);
    };
  }, [silentlyRefreshCalendarToken]);

  useEffect(() => {
    // Dev-only bypass: there is no Firebase session to observe, and letting
    // the listener run would immediately overwrite the stand-in user with the
    // `null` Firebase reports for a signed-out browser.
    if (DEV_BYPASS_USER) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      await persistenceReady;
      setUser(firebaseUser);
      userRef.current = firebaseUser;
      setLoading(false);

      if (firebaseUser) {
        setHasEverConnectedCalendarFlag(hasEverConnectedCalendar(firebaseUser.uid));

        // Upsert user profile; createdAt is only written on the very first sign-in
        const profileRef = doc(db, 'users', firebaseUser.uid, 'profile', 'info');
        const existing = await getDoc(profileRef).catch(() => null);
        await setDoc(
          profileRef,
          {
            uid: firebaseUser.uid,
            displayName: firebaseUser.displayName,
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            lastSeen: serverTimestamp(),
            ...(existing?.exists() ? {} : { createdAt: serverTimestamp() }),
          },
          { merge: true }
        ).catch(() => {
          // Silently ignore — Firestore rules may not be set up yet
        });

        // Only treat this as a "clean slate" (worth re-enabling silent refresh)
        // when it's genuinely a new/different account signing in. A re-fired
        // `onAuthStateChanged` for the same already-signed-in user must NOT
        // reset a tripped circuit breaker, or the popup loop restarts.
        const isNewAccount = lastRefreshUidRef.current !== firebaseUser.uid;
        if (isNewAccount) {
          lastRefreshUidRef.current = firebaseUser.uid;
          silentRefreshBlockedRef.current = false;
          silentFailureCountRef.current = 0;
          backoffMsRef.current = MIN_REFRESH_DELAY_MS;
        }

        if (!cachedCalendarToken && !silentRefreshBlockedRef.current) {
          silentlyRefreshCalendarToken(firebaseUser.uid, 'sign-in');
        }
      } else {
        clearScheduledRefresh();
        cachedCalendarToken = null;
        setCalendarConnected(false, 'signed out');
        // Agent undo history is per-account: reverting a turn captured under
        // one uid would write that user's task data into the next one's store.
        useSnapshotStore.getState().clearTurns();
        setHasEverConnectedCalendarFlag(false);
        silentRefreshBlockedRef.current = false;
        silentFailureCountRef.current = 0;
        lastRefreshUidRef.current = null;
        // A deliberate sign-out is the clean re-evaluation point: forget that
        // silent refresh was unsupported so a future session (or a browser the
        // user has since relaxed privacy settings on) can try again. Page
        // reloads deliberately do NOT clear it, so they never re-flash a popup.
        clearSilentRefreshUnsupported();
        // Re-probe the backend on next login (a different account/deploy may
        // have the refresh-token endpoint configured even if this one didn't).
        resetBackendCalendarProbe();
      }
    });

    return unsubscribe;
  }, [silentlyRefreshCalendarToken, clearScheduledRefresh, setCalendarConnected]);

  // Defends against the scheduled refresh timer getting throttled/paused
  // while the tab is hidden or the laptop is asleep (very common — a
  // background tab's `setTimeout` can be delayed well past its target, or a
  // sleeping machine simply doesn't run it at all). The moment the tab
  // becomes visible/focused again, immediately check if the cached token is
  // missing or past/near its safe expiry and, if so, silently refresh right
  // away instead of waiting for the (possibly already-missed) timer.
  useEffect(() => {
    const checkAndRefreshIfStale = () => {
      if (document.visibilityState === 'hidden') return;
      const uid = userRef.current?.uid;
      if (!uid) return;
      const stale = !cachedCalendarToken || cachedCalendarToken.expiresAt - Date.now() < MIN_REFRESH_DELAY_MS;
      if (stale) silentlyRefreshRef.current(uid, 'tab-focus');
    };
    document.addEventListener('visibilitychange', checkAndRefreshIfStale);
    window.addEventListener('focus', checkAndRefreshIfStale);
    return () => {
      document.removeEventListener('visibilitychange', checkAndRefreshIfStale);
      window.removeEventListener('focus', checkAndRefreshIfStale);
    };
  }, []);

  const signUpWithEmail = async (email: string, password: string, displayName?: string) => {
    await persistenceReady;
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName && displayName.trim()) {
      await updateProfile(result.user, { displayName: displayName.trim() });
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    await persistenceReady;
    await signInWithEmailAndPassword(auth, email, password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  };

  const logout = async () => {
    clearScheduledRefresh();
    backoffMsRef.current = MIN_REFRESH_DELAY_MS;
    silentRefreshBlockedRef.current = false;
    silentFailureCountRef.current = 0;
    lastRefreshUidRef.current = null;
    cachedCalendarToken = null;
    setCalendarConnected(false, 'you signed out');
    await signOut(auth);
  };

  const getCalendarAccessToken = useCallback((): string | null => {
    if (cachedCalendarToken && cachedCalendarToken.expiresAt > Date.now()) {
      return cachedCalendarToken.token;
    }
    if (cachedCalendarToken) {
      cachedCalendarToken = null;
      setCalendarConnected(false, 'the cached Google token expired');
    }
    // The proactive scheduled refresh (see `silentlyRefreshCalendarToken`)
    // should normally prevent this branch from ever being hit; if it is
    // (e.g. the machine was asleep straight through the scheduled time),
    // kick a background silent refresh now so the *next* call succeeds
    // without the user needing to click "Reconnect" at all.
    if (userRef.current) silentlyRefreshRef.current(userRef.current.uid, 'token-miss');
    return null;
  }, [setCalendarConnected]);

  const ensureCalendarAccess = useCallback(async (): Promise<CalendarTokenResult> => {
    const existing = getCalendarAccessToken();
    if (existing) return { ok: true, token: existing, expiresInSec: REFRESH_MARGIN_SEC };
    if (!userRef.current) {
      const message = 'You must be signed in before connecting Google Calendar.';
      logDiag({ level: 'error', phase: 'token-interactive', code: 'not_signed_in', message });
      return { ok: false, code: 'unknown', message };
    }
    // ── Try the secure backend first — connects with NO popup at all ──
    // If a refresh token is already on file for this user, this succeeds
    // immediately and there is nothing for the user to do.
    if (isBackendCalendarConfigured()) {
      const backendResult = await requestCalendarTokenViaBackend('user-click');
      if (backendResult?.ok && userRef.current) {
        adoptServerToken(
          userRef.current.uid,
          backendResult.token,
          backendResult.expiresInSec,
          'you connected — the secure server issued a Google token',
        );
        return { ok: true, token: backendResult.token, expiresInSec: backendResult.expiresInSec };
      }
      // The server is healthy but holds no grant for this user (never
      // connected, or Google revoked it). Hand that back rather than falling
      // through to the GIS popup: a popup would mint one hour of access and
      // leave the user disconnected again tomorrow, which is the whole problem
      // this session exists to end. The caller answers this by starting the
      // authorization-code flow — see `startCalendarConnect`.
      if (backendResult && !backendResult.ok && backendResult.code === 'connect_required') {
        return backendResult;
      }
    }
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
    // Mark the interactive flow as in-flight so the closing consent popup's
    // focus event can't kick off a racing silent refresh — see
    // `INTERACTIVE_COOLDOWN_MS`. The cooldown window starts the moment this
    // request settles (success or failure).
    interactiveInFlightRef.current = true;
    let result: CalendarTokenResult;
    try {
      result = await requestCalendarToken(clientId, 'interactive', 'user-click');
    } finally {
      interactiveInFlightRef.current = false;
      interactiveSettledAtRef.current = Date.now();
    }
    if (!result.ok) return result;
    const uid = userRef.current.uid;
    // A real user-driven connect succeeded — re-enable the background silent
    // refresh path that a prior failure may have latched off.
    silentRefreshBlockedRef.current = false;
    silentFailureCountRef.current = 0;
    lastRefreshUidRef.current = uid;
    backoffMsRef.current = MIN_REFRESH_DELAY_MS;
    const expiresAt = Date.now() + (result.expiresInSec - REFRESH_MARGIN_SEC) * 1000;
    cachedCalendarToken = { token: result.token, expiresAt };
    setCalendarConnected(true, 'you connected via the Connect/Reconnect button');
    // Remember that this account explicitly opted in, so future logins can
    // silently refresh the token in the background instead of requiring
    // another "Connect Google Calendar" click.
    markCalendarConnected(uid);
    setHasEverConnectedCalendarFlag(true);
    if (isSilentRefreshUnsupported()) {
      // This browser can only get a token by showing a popup, and the user has
      // said they only want that on an explicit click. So DON'T schedule a
      // background refresh — that would flash a popup on its own later. Use this
      // freshly-granted token until it expires, then surface the "reconnect" UI
      // (no popup) and wait for another explicit click.
      logDiag({
        level: 'info',
        phase: 'connection',
        code: 'manual_mode',
        message:
          'Connected. Automatic background refresh stays off for this browser (it can only refresh by showing a popup), so you will be asked to reconnect with a click once this access expires — no popup will appear on its own before then.',
      });
    } else {
      // Keep the token alive from here on — proactively refresh again right
      // as this one is about to go stale, indefinitely, so this popup never
      // needs to reappear for the rest of the session (or future sessions).
      scheduleSilentRefresh(uid, expiresAt - Date.now());
    }
    return { ok: true, token: result.token, expiresInSec: result.expiresInSec };
  }, [getCalendarAccessToken, scheduleSilentRefresh, setCalendarConnected, adoptServerToken]);

  const startCalendarConnect = useCallback(
    (returnTo?: string) => redirectToGoogleConsent(returnTo),
    [],
  );

  const finishCalendarConnect = useCallback(
    async (params: URLSearchParams): Promise<{ result: CalendarTokenResult; returnTo: string }> => {
      const currentUser = userRef.current;
      if (!currentUser) {
        const message = 'You must be signed in to finish connecting Google Calendar.';
        logDiag({ level: 'error', phase: 'token-interactive', code: 'not_signed_in', message });
        return { result: { ok: false, code: 'unknown', message }, returnTo: '/notifications' };
      }

      let idToken: string;
      try {
        idToken = await currentUser.getIdToken();
      } catch (err) {
        const message = 'Could not confirm your BASE sign-in with the server. Try connecting again.';
        logDiag({
          level: 'error',
          phase: 'token-interactive',
          code: 'id_token_failed',
          message,
          detail: err instanceof Error ? err.message : String(err),
        });
        return { result: { ok: false, code: 'unknown', message }, returnTo: '/notifications' };
      }

      const { result, returnTo } = await completeCalendarConnect(params, idToken);
      if (result.ok) {
        // A prior probe may have latched the backend "unavailable" for this
        // session; it demonstrably works now, so let the refresh path use it.
        resetBackendCalendarProbe();
        adoptServerToken(
          currentUser.uid,
          result.token,
          result.expiresInSec,
          'you authorized Google — the permission is now stored on the server and will outlive this browser session',
        );
      }
      return { result, returnTo };
    },
    [adoptServerToken],
  );

  // BUILD-6: is this the admin, and which way does the assistant go. Here
  // because this is the one place that knows who is signed in.
  useAccountAccessSync(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUpWithEmail,
        signInWithEmail,
        resetPassword,
        logout,
        hasCalendarAccess,
        hasEverConnectedCalendar: hasEverConnectedCalendarFlag,
        getCalendarAccessToken,
        ensureCalendarAccess,
        startCalendarConnect,
        finishCalendarConnect,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Co-located provider/hook pair is the standard pattern for a React Context
// module; splitting it into two files just for Fast Refresh isn't worth it.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
