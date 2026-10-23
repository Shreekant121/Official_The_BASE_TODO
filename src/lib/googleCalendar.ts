/**
 * Thin fetch-based wrapper around the Google Calendar REST v3 API — no
 * extra SDK, mirrors just what BASE needs to run the dedicated
 * "BASE" calendar (see `lib/notificationSync.ts`).
 * Every call is best-effort: on any failure it resolves to `null`/`false`
 * rather than throwing, since calendar sync is always a secondary, "nice
 * to have" side-effect of local task actions (see AuthContext's
 * client-only token limitation).
 *
 * One failure is not final, though. Being told to slow down is answered with
 * exponential backoff rather than reported as a broken calendar — see the rate
 * limit section below for which refusals qualify and, more importantly, which
 * look identical and must never be retried.
 */

const BASE_URL = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  colorId?: string;
  /** An event's place (29-2c1); task blocks have none. */
  location?: string;
  /**
   * The event's own `RRULE:` line(s), and any `EXDATE`/`RDATE` Google added
   * when somebody edited a single instance in its UI. Present only on the
   * master event of a series — which, with `singleEvents: false` below, is the
   * only form a series comes back in.
   */
  recurrence?: string[];
  /**
   * Set on an *instance* Google broke out of a series (one the user dragged or
   * deleted in Google Calendar), pointing at the master it came from. Its id is
   * `{masterId}_{originalStart}`, so it carries the master's prefix without
   * being the master — which is why the orphan sweep in `notificationSync.ts`
   * has to skip these rather than mistake them for events no task claims.
   */
  recurringEventId?: string;
  /**
   * `confirmed` | `tentative` | `cancelled`. A deleted event is not gone — it
   * lingers as `cancelled`, still holding its id, and inserting a new event at
   * that id is a 409. Reviving it with a PATCH is the documented way back, so
   * the reconcile diff has to be able to see the difference.
   */
  status?: string;
  /** Deep link to this event in Google Calendar's own web UI. */
  htmlLink?: string;
  /**
   * As Google *returns* it — looser than the `EventReminders` we write, since
   * an event we never set reminders on comes back as `{ useDefault: true }`
   * with no `overrides` at all. Read by the reconcile diff in
   * `notificationSync.ts` to decide whether an event already says what it
   * should.
   */
  reminders?: { useDefault?: boolean; overrides?: ReminderOverride[] };
}

/** One entry from the user's Google CalendarList — a calendar they own or are subscribed to (work, exams, birthdays, holidays, etc.). */
export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  /** Whether the calendar is checked "on" in the user's Google Calendar UI. Hidden calendars are skipped when fetching events, matching what the user actually sees in Google Calendar. */
  selected?: boolean;
}

/** Discriminated result carrying the *actual* failure reason (Google's own
 *  error message — "Calendar API has not been used in project ... or it is
 *  disabled", "Request had insufficient authentication scopes", etc.) —
 *  returned directly from the call that failed rather than via shared
 *  module state, so concurrent calls can never clobber each other's error
 *  message. */
export type GcalResult<T> =
  | { ok: true; data: T }
  /**
   * `status` is the HTTP status the refusal arrived with, `0` when the request
   * never reached Google at all, and absent when the failure was raised above
   * the network (no event in a 200, say). BUILD-15 added it: the reconcile
   * pass now has to tell a refusal that waiting fixes — a 5xx, a dead
   * connection — from one that never will, and Google's own error *text* is
   * not a sound way to ask. See `calendarRetry.ts`, which is the only reader.
   */
  | { ok: false; message: string; status?: number };

// ── Rate limits ────────────────────────────────────────────────────────────

/**
 * Google refuses a request for being too frequent in two different shapes,
 * and only one of them is a 429 (FIX-8).
 *
 * A **429** is unambiguous. A **403** is not: the same status carries
 * `rateLimitExceeded`/`userRateLimitExceeded` — wait and it will work — and
 * `insufficientPermissions`, which is a missing OAuth scope and will *never*
 * work no matter how patiently it is asked. Re-sending that one turns an
 * instant, legible failure into a slow one, and the reconcile pass runs two
 * seconds after every store write, so it would be a slow failure on repeat.
 * That is the whole reason this classifier exists rather than a bare
 * `status >= 429` check.
 *
 * Nothing else is retried here. A 5xx already has its own answer one level
 * up — a batch endpoint that will not respond falls back to sending the
 * writes one at a time — and a network throw is not something a backoff
 * fixes. This is deliberately only about being told to slow down.
 */

/** Extra sends a rate-limited request gets before its failure is reported. */
const RATE_LIMIT_RETRIES = 4;

/** First backoff step. Doubles per attempt: ~0.5s, 1s, 2s, 4s — under 8s in total. */
const RATE_LIMIT_BASE_MS = 500;

/** Ceiling on our own computed backoff, so a long chunk cannot stall a pass for minutes. */
const RATE_LIMIT_MAX_MS = 16_000;

/**
 * Ceiling on a `Retry-After` Google sends us. Its own number is honoured over
 * ours — it knows when the quota window turns over and we are guessing — but
 * not without a limit, or one unlucky header could park a background pass for
 * an hour.
 */
const RETRY_AFTER_MAX_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `Retry-After` in ms — seconds or an HTTP-date, both of which Google sends. `0` when absent or unreadable. */
function retryAfterMs(headers: Headers | null | undefined): number {
  const raw = headers?.get('retry-after');
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000, RETRY_AFTER_MAX_MS);
  }
  const at = Date.parse(raw);
  if (!Number.isNaN(at)) return Math.min(Math.max(at - Date.now(), 0), RETRY_AFTER_MAX_MS);
  return 0;
}

/**
 * Whether a 403's body is the *rate limit* 403 rather than the *scope* one.
 *
 * A text match rather than a parse, on purpose: the reason arrives as
 * `error.errors[].reason` from the events endpoints and as `error.status` from
 * others, and a batch sub-response hands this function a body that was already
 * re-serialised once. Text survives all three. A body that says neither is
 * treated as the scope case and is not retried, which is the safe direction to
 * be wrong in.
 */
function isRateLimitBody(body: string): boolean {
  const lowered = body.toLowerCase();
  return (
    lowered.includes('ratelimitexceeded') ||
    lowered.includes('userratelimitexceeded') ||
    lowered.includes('rate limit exceeded')
  );
}

/**
 * `null` when this answer is not Google asking us to slow down — which is
 * every answer except a 429 and a rate-limited 403. Otherwise the wait it
 * asked for in ms, or `0` when it named none and the backoff below should
 * pick one.
 */
function rateLimitWait(status: number, body: string, headers?: Headers | null): number | null {
  if (status !== 429 && status !== 403) return null;
  if (status === 403 && !isRateLimitBody(body)) return null;
  return retryAfterMs(headers);
}

/** Exponential with jitter. Half the step is fixed so a retry always waits; half is random so two devices do not march in step. */
function backoffDelay(attempt: number, asked: number): number {
  if (asked > 0) return asked;
  const step = Math.min(RATE_LIMIT_BASE_MS * 2 ** attempt, RATE_LIMIT_MAX_MS);
  return step / 2 + Math.random() * (step / 2);
}

/**
 * Sends, and re-sends while the answer is a rate limit.
 *
 * `wait` reads one attempt's outcome and returns `null` for anything that is
 * not a rate limit, which is what keeps this from becoming a general-purpose
 * retry: the final attempt's outcome is returned as-is, so a caller that never
 * sees a rate limit behaves exactly as it did before this existed.
 */
async function sendWithBackoff<T>(
  send: () => Promise<T>,
  wait: (outcome: T) => number | null,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const outcome = await send();
    const asked = wait(outcome);
    if (asked === null || attempt >= RATE_LIMIT_RETRIES) return outcome;
    await sleep(backoffDelay(attempt, asked));
  }
}

/** One attempt, kept as data so the backoff loop can read the answer before the caller does. */
interface FetchAttempt<T> {
  result: GcalResult<T | null>;
  /** See `rateLimitWait` — `null` means "this is the caller's answer, do not send again". */
  wait: number | null;
}

async function gcalFetchOnce<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<FetchAttempt<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      // Best-effort everywhere else, but a console warning here is the only
      // way to ever diagnose a silent failure (expired token, Calendar API
      // not enabled on the Google Cloud project, insufficient scope, etc.) —
      // without this every failure looked identical to "no events today".
      const body = await res.text().catch(() => '');
      let message = `${res.status} ${res.statusText}`;
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        // body wasn't JSON — fall back to the plain status text above
      }
      console.warn(`[googleCalendar] ${path} → ${res.status} ${res.statusText}`, body);
      return {
        result: { ok: false, message, status: res.status },
        wait: rateLimitWait(res.status, body, res.headers),
      };
    }
    if (res.status === 204) return { result: { ok: true, data: null }, wait: null };
    return { result: { ok: true, data: (await res.json()) as T }, wait: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    console.warn(`[googleCalendar] ${path} threw`, err);
    // `0` is the shape `CalendarWriteResult` already uses for "never reached
    // Google", and it is what makes an offline laptop retryable rather than
    // indistinguishable from a refusal.
    return { result: { ok: false, message, status: 0 }, wait: null };
  }
}

async function gcalFetch<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<GcalResult<T | null>> {
  const attempt = await sendWithBackoff(
    () => gcalFetchOnce<T>(token, path, init),
    (outcome) => outcome.wait,
  );
  return attempt.result;
}

/**
 * Lists every calendar in the user's account — their primary calendar plus
 * any secondary/subscribed calendars. Requires the `calendar.readonly`
 * scope (or broader) — a token that only has `calendar.events` will get a
 * 403 here even though event reads/writes still work fine. Used to find
 * (or confirm the id of) the dedicated "BASE" calendar
 * — see `getOrCreateNotificationCalendar`.
 */
export async function listCalendars(token: string): Promise<GcalResult<GoogleCalendarListEntry[]>> {
  const result = await gcalFetch<{ items: GoogleCalendarListEntry[] }>(
    token,
    `/users/me/calendarList?maxResults=250`,
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data?.items ?? [] };
}

/** Shared tokeninfo lookup — returns the space-delimited scope string, or null on failure. */
async function fetchTokenScopes(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { scope?: string };
    return data.scope ?? '';
  } catch {
    return null;
  }
}

/**
 * Verifies the token carries any general Calendar scope (`calendar.events`,
 * `calendar.readonly`, or the full `calendar` scope). Distinct from
 * `tokenHasNotificationScope` — a token can pass this check yet still lack
 * `calendar.app.created`, which is the exact "Needs reconnect" case the
 * Notifications page surfaces.
 */
export async function tokenHasCalendarScope(token: string): Promise<boolean | null> {
  const scope = await fetchTokenScopes(token);
  if (scope === null) return null;
  return (
    scope.includes('https://www.googleapis.com/auth/calendar.events') ||
    scope.includes('https://www.googleapis.com/auth/calendar.readonly') ||
    /(^|\s)https:\/\/www\.googleapis\.com\/auth\/calendar(\s|$)/.test(scope)
  );
}

/**
 * Verifies the token carries the `calendar.app.created` scope specifically —
 * required to create/manage the dedicated "BASE"
 * calendar (see `lib/notificationSync.ts`). A token can carry other
 * Calendar scopes (`calendar.events`/`calendar.readonly`) yet still lack
 * this narrower one if it predates the Notification System, which
 * otherwise looks identical to "notifications are just broken."
 */
export async function tokenHasNotificationScope(token: string): Promise<boolean | null> {
  const scope = await fetchTokenScopes(token);
  if (scope === null) return null;
  return scope.includes('calendar.app.created');
}

/** A single Calendar API reminder override — see `reminders.overrides` on the Events resource. */
export interface ReminderOverride {
  method: 'popup' | 'email';
  /** Minutes before the event's start time to fire. `0` fires exactly at the start time. */
  minutes: number;
}

export interface EventReminders {
  useDefault: false;
  overrides: ReminderOverride[];
}

export async function updateEvent(
  token: string,
  eventId: string,
  event: {
    summary?: string;
    description?: string;
    startISO?: string;
    endISO?: string;
    reminders?: EventReminders;
    calendarId?: string;
  },
): Promise<GoogleCalendarEvent | null> {
  const result = await gcalFetch<GoogleCalendarEvent>(
    token,
    `/calendars/${encodeURIComponent(event.calendarId ?? 'primary')}/events/${eventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        ...(event.summary !== undefined ? { summary: event.summary } : {}),
        ...(event.description !== undefined ? { description: event.description } : {}),
        ...(event.startISO ? { start: { dateTime: event.startISO } } : {}),
        ...(event.endISO ? { end: { dateTime: event.endISO } } : {}),
        ...(event.reminders ? { reminders: event.reminders } : {}),
      }),
    },
  );
  return result.ok ? result.data : null;
}

export async function deleteEvent(
  token: string,
  eventId: string,
  calendarId: string = 'primary',
): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok || res.status === 404 || res.status === 410;
  } catch {
    return false;
  }
}

/**
 * Upserts an event at a *caller-chosen, deterministic* id (Google allows a
 * client-specified `id` on insert — see `lib/notificationSync.ts`, which
 * derives these from a task/reminder's own id so it never has to write a
 * Google-generated id back into Firestore). Tries PATCH first (the common
 * case once the event exists); falls back to POST with the explicit `id`
 * when it doesn't exist yet (or was previously deleted).
 */
export async function upsertEventWithId(
  token: string,
  calendarId: string,
  eventId: string,
  event: { summary: string; description?: string; startISO: string; endISO: string; reminders?: EventReminders },
): Promise<GcalResult<GoogleCalendarEvent>> {
  const body = {
    summary: event.summary,
    description: event.description,
    start: { dateTime: event.startISO },
    end: { dateTime: event.endISO },
    ...(event.reminders ? { reminders: event.reminders } : {}),
  };

  // PATCH first (common case once the event exists). A 404/410 here is
  // *expected* the first time — it just means we fall through to POST — so a
  // failed PATCH is never reported as the error; only a failed POST is.
  const patchResult = await gcalFetch<GoogleCalendarEvent>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
  if (patchResult.ok && patchResult.data) return { ok: true, data: patchResult.data };

  const insertResult = await gcalFetch<GoogleCalendarEvent>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: 'POST', body: JSON.stringify({ id: eventId, ...body }) },
  );
  if (insertResult.ok && insertResult.data) return { ok: true, data: insertResult.data };
  // Surface the POST failure reason — this is the meaningful one. If POST
  // somehow succeeded with no body, fall back to the PATCH message.
  if (!insertResult.ok) return insertResult;
  return { ok: false, message: 'Google Calendar returned no event data.' };
}

/**
 * Every event on a calendar, paged through to the end.
 *
 * This is what lets the reconcile pass in `notificationSync.ts` write only
 * what actually differs instead of re-pushing every task on every store
 * write: one read, then a diff. `singleEvents: false` keeps a recurring event
 * as the one event it is rather than expanding it into its occurrences —
 * load-bearing since item 4, because the app writes one master event per
 * repeating task and the diff has to see the `recurrence` it holds. Expanded,
 * a task repeating for years would come back as thousands of instances, none
 * of them the thing the app actually wrote.
 *
 * `showDeleted: true` is deliberate. An event deleted from Google is not
 * gone — it lingers as `cancelled`, still holding its id, and a fresh insert
 * at a held id comes back 409. Seeing the cancelled ones is what lets the
 * caller revive one with a PATCH instead of colliding with a ghost.
 *
 * `maxPages` is a seatbelt, not a limit anyone should reach: at 2500 events a
 * page it stops at 50,000 rather than looping forever on a malformed
 * `nextPageToken`.
 */
export async function listCalendarEvents(
  token: string,
  calendarId: string,
  maxPages = 20,
): Promise<GcalResult<GoogleCalendarEvent[]>> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({
      maxResults: '2500',
      showDeleted: 'true',
      singleEvents: 'false',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const result = await gcalFetch<{ items?: GoogleCalendarEvent[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );
    if (!result.ok) return result;
    events.push(...(result.data?.items ?? []));
    pageToken = result.data?.nextPageToken;
    if (!pageToken) break;
  }
  return { ok: true, data: events };
}

// ── Batched writes ─────────────────────────────────────────────────────────

/**
 * One event write, described rather than performed, so a caller can hand over
 * a whole pass's worth at once. `key` is the caller's own handle — a task id,
 * usually — echoed back on the result, because a batch response does not
 * arrive in the order it was sent.
 */
export interface CalendarWrite {
  key: string;
  /** `PUT` is a whole event, which is how BASE's events are written (`lib/events/eventCalendar.ts`). */
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path under `/calendar/v3` — e.g. `/calendars/{id}/events/{eventId}`. */
  path: string;
  body?: unknown;
}

export interface CalendarWriteResult {
  key: string;
  ok: boolean;
  /** HTTP status, or `0` when the request never reached Google at all. */
  status: number;
  message?: string;
  /** The event Google returned, on a write that produced one. */
  event?: GoogleCalendarEvent;
}

/** Google's own per-API batch endpoint. The old global `/batch` was retired in 2019; this one is current. */
const BATCH_URL = 'https://www.googleapis.com/batch/calendar/v3';

/** Google's documented ceiling for a Calendar batch is 50 sub-requests. */
const BATCH_CHUNK = 50;

const BATCH_ITEM_PREFIX = 'item-';

/**
 * Reads one sub-response the same way whether it arrived alone or inside a
 * batch, so the two paths cannot drift.
 *
 * A `DELETE` answered 404/410 is reported as success on purpose: the event is
 * gone, which is the state the caller asked for. Anything else non-2xx keeps
 * Google's own error text, which is the only thing that ever makes one of
 * these diagnosable.
 */
function interpretWrite(write: CalendarWrite, status: number, body: string): CalendarWriteResult {
  if (write.method === 'DELETE' && (status === 404 || status === 410)) {
    return { key: write.key, ok: true, status };
  }
  if (status >= 200 && status < 300) {
    let event: GoogleCalendarEvent | undefined;
    try {
      const trimmed = body.trim();
      if (trimmed) event = JSON.parse(trimmed) as GoogleCalendarEvent;
    } catch {
      // A 204 (DELETE) has no body, and that is not a failure.
    }
    return { key: write.key, ok: true, status, event };
  }
  let message = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
  } catch {
    // body wasn't JSON — the status line is all we have
  }
  return { key: write.key, ok: false, status, message };
}

/**
 * A write result that is a rate limit rather than a real failure.
 *
 * Reads `message` where a raw body would normally be read: a batch
 * sub-response has already been through `interpretWrite`, and Google's own
 * "Rate Limit Exceeded" is what survives that. See `isRateLimitBody`.
 */
function writeWasRateLimited(result: CalendarWriteResult): boolean {
  return !result.ok && rateLimitWait(result.status, result.message ?? '') !== null;
}

async function sendOneWrite(
  token: string,
  write: CalendarWrite,
): Promise<{ result: CalendarWriteResult; wait: number | null }> {
  try {
    const res = await fetch(`${BASE_URL}${write.path}`, {
      method: write.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(write.body !== undefined ? { body: JSON.stringify(write.body) } : {}),
    });
    const text = await res.text().catch(() => '');
    return {
      result: interpretWrite(write, res.status, text),
      wait: rateLimitWait(res.status, text, res.headers),
    };
  } catch (err) {
    return {
      result: {
        key: write.key,
        ok: false,
        status: 0,
        message: err instanceof Error ? err.message : 'Network error',
      },
      wait: null,
    };
  }
}

/**
 * The un-batched path: one request, used for a lone write and as the batch's
 * fallback. Backs off and re-sends on a rate limit (FIX-8) — which is also
 * what protects the fallback itself, since the writes arriving here are
 * exactly the ones a struggling batch endpoint just handed back.
 */
async function runOneWrite(token: string, write: CalendarWrite): Promise<CalendarWriteResult> {
  const attempt = await sendWithBackoff(
    () => sendOneWrite(token, write),
    (outcome) => outcome.wait,
  );
  return attempt.result;
}

function buildBatchBody(boundary: string, writes: CalendarWrite[]): string {
  const parts = writes.map((write, index) => {
    const head =
      `--${boundary}\r\n` +
      'Content-Type: application/http\r\n' +
      `Content-ID: <${BATCH_ITEM_PREFIX}${index}>\r\n\r\n` +
      `${write.method} /calendar/v3${write.path} HTTP/1.1\r\n`;
    if (write.body === undefined) return `${head}\r\n`;
    return `${head}Content-Type: application/json\r\n\r\n${JSON.stringify(write.body)}\r\n`;
  });
  return `${parts.join('')}--${boundary}--\r\n`;
}

/**
 * Splits a `multipart/mixed` batch response back into one result per write.
 *
 * Parts are matched by the `Content-ID` Google echoes (`<response-item-3>`
 * for the request that went out as `<item-3>`) rather than by position — the
 * spec is explicit that the order is not guaranteed. Position is only the
 * fallback for a part whose id is unreadable.
 */
function parseBatchResponse(
  contentType: string,
  body: string,
  writes: CalendarWrite[],
): Map<string, CalendarWriteResult> {
  const results = new Map<string, CalendarWriteResult>();
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (!boundaryMatch) return results;
  const marker = `--${boundaryMatch[1] ?? boundaryMatch[2]}`;

  let position = 0;
  for (const rawChunk of body.split(marker).slice(1)) {
    const chunk = rawChunk.replace(/\r\n/g, '\n');
    if (chunk.trim() === '' || chunk.trim() === '--') continue;
    const index = position;
    position += 1;

    const headerEnd = chunk.indexOf('\n\n');
    if (headerEnd === -1) continue;
    const partHeaders = chunk.slice(0, headerEnd);
    const response = chunk.slice(headerEnd + 2);

    const statusMatch = /^HTTP\/[\d.]+\s+(\d{3})/m.exec(response);
    if (!statusMatch) continue;
    const responseBodyStart = response.indexOf('\n\n');
    const responseBody = responseBodyStart === -1 ? '' : response.slice(responseBodyStart + 2);

    const idMatch = new RegExp(`content-id:\\s*<response-${BATCH_ITEM_PREFIX}(\\d+)>`, 'i').exec(partHeaders);
    const write = writes[idMatch ? Number(idMatch[1]) : index];
    if (!write) continue;
    results.set(write.key, interpretWrite(write, Number(statusMatch[1]), responseBody));
  }
  return results;
}

async function sendBatch(
  token: string,
  writes: CalendarWrite[],
): Promise<{ results: Map<string, CalendarWriteResult> | null; wait: number | null }> {
  const boundary = `mutineer_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
  try {
    const res = await fetch(BATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/mixed; boundary=${boundary}`,
      },
      body: buildBatchBody(boundary, writes),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[googleCalendar] batch → ${res.status} ${res.statusText}`);
      return { results: null, wait: rateLimitWait(res.status, body, res.headers) };
    }
    const results = parseBatchResponse(
      res.headers.get('content-type') ?? '',
      await res.text(),
      writes,
    );
    return { results, wait: null };
  } catch (err) {
    console.warn('[googleCalendar] batch threw', err);
    return { results: null, wait: null };
  }
}

/**
 * One HTTP request carrying up to `BATCH_CHUNK` writes. `null` means the batch
 * transport itself failed.
 *
 * A rate-limited *transport* is backed off here rather than reported (FIX-8),
 * and that ordering is the point: falling straight through to the fallback
 * would answer "you are sending too much" by sending fifty separate requests.
 * Only once the backoff is spent does this return `null` and let the caller
 * degrade as it always has.
 */
async function runBatch(token: string, writes: CalendarWrite[]): Promise<Map<string, CalendarWriteResult> | null> {
  const attempt = await sendWithBackoff(
    () => sendBatch(token, writes),
    (outcome) => outcome.wait,
  );
  return attempt.results;
}

/**
 * Performs a whole reconcile's worth of event writes.
 *
 * **This is the reason a reconcile is not one API call per task.** Item 3 put
 * every dated task on the calendar, which turned a per-task request into a
 * per-task request times the whole backlog; the writes now travel 50 to a
 * request through Google's Calendar batch endpoint. The caller's own diff is
 * the other half — most passes have nothing to send at all.
 *
 * Degrades rather than fails: a batch endpoint that will not answer (or a
 * response that cannot be parsed) falls back to sending that chunk one
 * request at a time, and any single write the batch simply did not answer for
 * is retried on its own. Sync being slow is recoverable; sync silently
 * dropping a write is not.
 */
export async function runCalendarWrites(
  token: string,
  writes: CalendarWrite[],
): Promise<CalendarWriteResult[]> {
  const results: CalendarWriteResult[] = [];
  for (let start = 0; start < writes.length; start += BATCH_CHUNK) {
    results.push(...(await runChunk(token, writes.slice(start, start + BATCH_CHUNK))));
  }
  return results;
}

/**
 * One chunk, through the batch endpoint and its fallback — and around again
 * for whatever came back rate-limited (FIX-8).
 *
 * **The sub-response is the case that actually bites.** A batch whose own POST
 * is answered 200 can still carry fifty sub-responses saying
 * `rateLimitExceeded`, and before this those were reported as fifty failed
 * blocks, which is precisely what Shreekant was seeing. The re-send goes back
 * through the same path rather than round the outside of it: a rate-limited
 * subset larger than one is re-sent *as a batch*, because answering a rate
 * limit with fifty individual requests is how a small one becomes a large one.
 * A subset of one takes the single-request path, which backs off on its own.
 *
 * The fallback for a write the batch never answered for is untouched, and the
 * diff above it is untouched with it: nothing here re-reads the calendar, and
 * a task is never asked about on its own.
 */
async function runChunk(token: string, chunk: CalendarWrite[]): Promise<CalendarWriteResult[]> {
  const settled = new Map<string, CalendarWriteResult>();
  let pending = chunk;

  for (let attempt = 0; ; attempt += 1) {
    const batched = pending.length > 1 ? await runBatch(token, pending) : null;
    const rateLimited: CalendarWrite[] = [];

    for (const write of pending) {
      const answered = batched?.get(write.key);
      if (answered === undefined) {
        settled.set(write.key, await runOneWrite(token, write));
        continue;
      }
      if (attempt < RATE_LIMIT_RETRIES && writeWasRateLimited(answered)) {
        rateLimited.push(write);
        continue;
      }
      settled.set(write.key, answered);
    }

    if (rateLimited.length === 0) break;
    await sleep(backoffDelay(attempt, 0));
    pending = rateLimited;
  }

  // Every write is settled by the loop above — the last attempt keeps whatever
  // Google said instead of queueing it again — so the order the caller gets
  // back is the order it handed in.
  return chunk.map((write) => settled.get(write.key)!);
}

// ── Dedicated notification calendar ────────────────────────────────────────

/**
 * The name of the app's own calendar, as the user sees it in Google Calendar.
 *
 * It was "Mutineer OS Notifications" while everything on it was an alert.
 * Item 3 made it the picture of the working day — every dated task draws a
 * block whether it pings or not — so the name narrowed to the app's, and the
 * old one became `LEGACY_CALENDAR_SUMMARIES` below rather than a second
 * calendar. APP-1 renamed the app itself, which moved "Mutineer OS" onto that
 * same list. Exported because the Notifications page tells the user which
 * calendar to look in, and two spellings of that would be one too many.
 */
export const NOTIFICATION_CALENDAR_SUMMARY = 'BASE';

/**
 * Names this calendar has gone by, newest first. A user who has been running
 * the app since before item 3 already owns a calendar called the last of
 * these, full of events under ids we still derive the same way — so it is
 * *renamed*, never abandoned. Searching for these is also what stops a second
 * calendar being created next to the first one.
 *
 * **This list is the whole migration, and the only reason APP-1's rename is
 * not destructive.** The calendar is resolved by its summary string, so a
 * constant changed without a name landing here means the app stops finding
 * the calendar it has been writing to and quietly creates a second one beside
 * it — every block item 3 ever drew orphaned on the first. Nothing is deleted
 * from this list, ever.
 */
const LEGACY_CALENDAR_SUMMARIES = ['Mutineer OS', 'Mutineer OS Notifications'];

/** A resolved app calendar: its id, and the name it currently carries in Google. */
export interface NotificationCalendar {
  id: string;
  summary: string;
}

/**
 * Creates a new secondary calendar — requires the `calendar.app.created`
 * (or broader `calendar`/`calendar.calendars`) scope. The events created on
 * a calendar made this way remain manageable by the app even with the
 * narrow `calendar.app.created` scope.
 */
export async function createCalendar(token: string, summary: string): Promise<GcalResult<{ id: string }>> {
  const result = await gcalFetch<{ id: string }>(token, `/calendars`, {
    method: 'POST',
    body: JSON.stringify({ summary }),
  });
  if (!result.ok) return result;
  if (!result.data?.id) return { ok: false, message: 'Calendar was created but returned no id' };
  return { ok: true, data: { id: result.data.id } };
}

/** Renames a calendar in place. The events on it are untouched — same ids, same everything. */
export async function renameCalendar(
  token: string,
  calendarId: string,
  summary: string,
): Promise<GcalResult<NotificationCalendar>> {
  const result = await gcalFetch<{ id: string; summary?: string }>(
    token,
    `/calendars/${encodeURIComponent(calendarId)}`,
    { method: 'PATCH', body: JSON.stringify({ summary }) },
  );
  if (!result.ok) return result;
  if (!result.data?.id) return { ok: false, message: 'Calendar rename returned no calendar' };
  return { ok: true, data: { id: result.data.id, summary: result.data.summary ?? summary } };
}

/**
 * Resolves the app's calendar, renaming it to `NOTIFICATION_CALENDAR_SUMMARY`
 * if it is still carrying an old name.
 *
 * `cachedName` is the fast path and the whole point of the parameter: with it
 * matching, this returns without touching the network, which is what this did
 * before item 3 and what it has to keep doing — it runs inside a reconcile
 * that fires two seconds after every store write. Without it (a user from
 * before the rename, or a fresh device) the rename costs exactly one PATCH,
 * once, after which the caller records the new name in settings and the fast
 * path takes over again.
 *
 * With no cached id at all it searches the calendar list for the current name
 * first and the old ones second — a calendar found under an old name is
 * renamed rather than left beside a new one — and only creates a calendar
 * when neither exists.
 */
export async function getOrCreateNotificationCalendar(
  token: string,
  cachedId?: string,
  cachedName?: string,
): Promise<GcalResult<NotificationCalendar>> {
  if (cachedId) {
    if (cachedName === NOTIFICATION_CALENDAR_SUMMARY) {
      return { ok: true, data: { id: cachedId, summary: cachedName } };
    }
    const renamed = await renameCalendar(token, cachedId, NOTIFICATION_CALENDAR_SUMMARY);
    if (renamed.ok) return renamed;
    // The cached id no longer resolves — the user deleted the calendar in
    // Google, most likely. Fall through and find or make one rather than
    // reporting a failure the next reconcile would only repeat.
  }

  const listResult = await listCalendars(token);
  if (listResult.ok) {
    const current = listResult.data.find((c) => c.summary === NOTIFICATION_CALENDAR_SUMMARY);
    if (current) return { ok: true, data: { id: current.id, summary: NOTIFICATION_CALENDAR_SUMMARY } };

    const legacy = listResult.data.find((c) => LEGACY_CALENDAR_SUMMARIES.includes(c.summary));
    if (legacy) {
      const renamed = await renameCalendar(token, legacy.id, NOTIFICATION_CALENDAR_SUMMARY);
      // A failed rename is not worth creating a second calendar over: the
      // events are on this one, so keep using it under its old name and try
      // again next pass.
      return renamed.ok ? renamed : { ok: true, data: { id: legacy.id, summary: legacy.summary } };
    }
  }

  const created = await createCalendar(token, NOTIFICATION_CALENDAR_SUMMARY);
  if (!created.ok) return created;
  return { ok: true, data: { id: created.data.id, summary: NOTIFICATION_CALENDAR_SUMMARY } };
}
