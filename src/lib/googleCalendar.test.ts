/**
 * The two pieces of the Calendar wrapper that nothing local can show you.
 *
 * Everything else in `googleCalendar.ts` is a thin `fetch` around one REST
 * call, and a wrong one announces itself the first time a reminder does not
 * arrive. These two do not:
 *
 * 1. **The batch transport.** Item 3 put every dated task on the calendar, so
 *    the reconcile pass now sends its writes fifty to a request as
 *    `multipart/mixed` — a format we hand-build and hand-parse. A parser that
 *    silently returns nothing looks exactly like "nothing needed writing",
 *    which is the *normal* result of a healthy pass. It would be invisible.
 * 2. **The rename.** The calendar went from "Mutineer OS Notifications" to
 *    "Mutineer OS" at item 3, and from "Mutineer OS" to "BASE" at APP-1 when
 *    the app itself was renamed. The requirement both times is that an
 *    existing calendar is renamed rather than orphaned beside a fresh one.
 *    Getting that wrong costs a user their history and shows up months later.
 *    The calendar is resolved *by its name*, so every hop needs its own case
 *    here — the one added last is the one nobody has run against Google yet.
 *
 * FIX-8 added a third, for the same reason: **the rate limit**. It cannot be
 * reproduced locally on demand — you would have to provoke Google into
 * refusing you — and getting it wrong is invisible in both directions. Retry
 * too little and his writes keep failing for no visible reason, which is the
 * bug. Retry too much and a missing OAuth scope, which will never succeed,
 * spends the backoff before it reports the one thing that would have told him
 * to reconnect. Those two arrive as the *same status code*.
 *
 * `fetch` is stubbed with real `Response` objects rather than duck-typed
 * ones, so the code under test reads status, headers and body the same way it
 * will in the browser.
 *
 * The backoff sleeps for real seconds, so the rate limit block runs on fake
 * timers: `runAllTimersAsync` flushes the microtasks between one attempt and
 * the next, which is what lets a chain of awaited `setTimeout`s resolve
 * without the suite waiting out the actual delay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getOrCreateNotificationCalendar,
  runCalendarWrites,
  NOTIFICATION_CALENDAR_SUMMARY,
  type CalendarWrite,
} from './googleCalendar';

const TOKEN = 'test-token';
const CALENDAR = 'cal-1';

interface Call {
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
}

let calls: Call[] = [];
/** Answers, in the order the code asks. A queue rather than a router: these tests care about the sequence. */
let responses: Response[] = [];

function record(input: unknown, init?: RequestInit): Call {
  const headers = Object.fromEntries(
    Object.entries((init?.headers ?? {}) as Record<string, string>),
  );
  return {
    url: String(input),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? init.body : '',
    headers,
  };
}

beforeEach(() => {
  calls = [];
  responses = [];
  vi.stubGlobal('fetch', (input: unknown, init?: RequestInit) => {
    calls.push(record(input, init));
    const next = responses.shift();
    if (!next) throw new Error(`unexpected fetch: ${init?.method ?? 'GET'} ${String(input)}`);
    return Promise.resolve(next);
  });
  // The wrapper warns on every non-2xx, which is the point of it — but these
  // tests drive failures on purpose and the noise buries the real output.
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/**
 * The two 403s, as Google sends them. They differ only in the body, which is
 * the entire reason `isRateLimitBody` reads text rather than a status code.
 */
const RATE_LIMITED = {
  error: {
    errors: [{ domain: 'usageLimits', reason: 'rateLimitExceeded', message: 'Rate Limit Exceeded' }],
    code: 403,
    message: 'Rate Limit Exceeded',
  },
};
const MISSING_SCOPE = {
  error: {
    errors: [{ domain: 'global', reason: 'insufficientPermissions', message: 'Insufficient Permission' }],
    code: 403,
    message: 'Request had insufficient authentication scopes.',
  },
};

/** A `multipart/mixed` batch reply in the shape Google actually sends one. */
function batchReply(parts: { item: number; status: number; body?: unknown }[]): Response {
  const boundary = 'batch_HDoc_00001';
  const chunks = parts.map((part) => {
    const payload = part.body === undefined ? '' : JSON.stringify(part.body);
    return (
      `--${boundary}\r\n` +
      'Content-Type: application/http\r\n' +
      `Content-ID: <response-item-${part.item}>\r\n\r\n` +
      `HTTP/1.1 ${part.status} ${part.status === 200 ? 'OK' : 'Error'}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${payload}\r\n\r\n`
    );
  });
  return new Response(`${chunks.join('')}--${boundary}--\r\n`, {
    status: 200,
    headers: { 'Content-Type': `multipart/mixed; boundary=${boundary}` },
  });
}

const write = (key: string, over: Partial<CalendarWrite> = {}): CalendarWrite => ({
  key,
  method: 'PATCH',
  path: `/calendars/${CALENDAR}/events/d1${key}`,
  body: { summary: `Deadline: ${key}` },
  ...over,
});

describe('sending a pass’s writes as one batch', () => {
  it('sends one request for many writes, not one per write', () => {
    // The whole reason this exists. Three writes, one HTTP call.
    responses = [batchReply([
      { item: 0, status: 200, body: { id: 'd1a' } },
      { item: 1, status: 200, body: { id: 'd1b' } },
      { item: 2, status: 200, body: { id: 'd1c' } },
    ])];

    return runCalendarWrites(TOKEN, [write('a'), write('b'), write('c')]).then((results) => {
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('https://www.googleapis.com/batch/calendar/v3');
      expect(results.map((r) => r.ok)).toEqual([true, true, true]);
    });
  });

  it('builds a sub-request per write, each addressed to the full API path', async () => {
    responses = [batchReply([
      { item: 0, status: 200, body: { id: 'd1a' } },
      { item: 1, status: 204 },
    ])];

    await runCalendarWrites(TOKEN, [
      write('a', { method: 'POST', path: `/calendars/${CALENDAR}/events`, body: { id: 'd1a' } }),
      write('b', { method: 'DELETE', path: `/calendars/${CALENDAR}/events/d1b`, body: undefined }),
    ]);

    const body = calls[0].body;
    expect(calls[0].headers['Content-Type']).toMatch(/^multipart\/mixed; boundary=/);
    expect(body).toContain('Content-ID: <item-0>');
    expect(body).toContain(`POST /calendar/v3/calendars/${CALENDAR}/events HTTP/1.1`);
    expect(body).toContain('Content-ID: <item-1>');
    expect(body).toContain(`DELETE /calendar/v3/calendars/${CALENDAR}/events/d1b HTTP/1.1`);
    // A DELETE carries no JSON body, so it must not announce one.
    expect(body.split('Content-ID: <item-1>')[1]).not.toContain('application/json');
  });

  it('matches replies by Content-ID, not by the order they arrive in', async () => {
    // Google's own docs say the order is not guaranteed. Trusting position
    // here would hand one task's result to another task.
    responses = [batchReply([
      { item: 1, status: 200, body: { id: 'd1b', htmlLink: 'https://cal/b' } },
      { item: 0, status: 403, body: { error: { message: 'Insufficient scope' } } },
    ])];

    const results = await runCalendarWrites(TOKEN, [write('a'), write('b')]);
    const byKey = new Map(results.map((r) => [r.key, r]));

    expect(byKey.get('a')?.ok).toBe(false);
    expect(byKey.get('a')?.message).toBe('Insufficient scope');
    expect(byKey.get('b')?.ok).toBe(true);
    expect(byKey.get('b')?.event?.htmlLink).toBe('https://cal/b');
  });

  it('reports a deleted-already DELETE as done, because it is', async () => {
    responses = [batchReply([
      { item: 0, status: 404, body: { error: { message: 'Not Found' } } },
      { item: 1, status: 410, body: { error: { message: 'Resource has been deleted' } } },
    ])];

    const results = await runCalendarWrites(TOKEN, [
      write('a', { method: 'DELETE', body: undefined }),
      write('b', { method: 'DELETE', body: undefined }),
    ]);

    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('keeps a 404 on a PATCH a failure — only DELETE gets that pass', async () => {
    responses = [batchReply([
      { item: 0, status: 404, body: { error: { message: 'Not Found' } } },
      { item: 1, status: 200, body: { id: 'd1b' } },
    ])];

    const results = await runCalendarWrites(TOKEN, [write('a'), write('b')]);

    expect(results[0].ok).toBe(false);
    expect(results[0].status).toBe(404);
  });

  it('falls back to one request each when the batch endpoint itself will not answer', async () => {
    responses = [
      json(503, { error: { message: 'Service Unavailable' } }), // the batch POST
      json(200, { id: 'd1a' }),
      json(200, { id: 'd1b' }),
    ];

    const results = await runCalendarWrites(TOKEN, [write('a'), write('b')]);

    expect(calls).toHaveLength(3);
    expect(calls[1].url).toContain('/calendar/v3/calendars/');
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('retries alone any single write the batch simply did not answer for', async () => {
    // A dropped part must never be read as a silent success — that is a write
    // the user asked for that never happened, and nothing would say so.
    responses = [
      batchReply([{ item: 0, status: 200, body: { id: 'd1a' } }]),
      json(200, { id: 'd1b' }),
    ];

    const results = await runCalendarWrites(TOKEN, [write('a'), write('b')]);

    expect(calls).toHaveLength(2);
    expect(calls[1].method).toBe('PATCH');
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('sends a lone write on its own rather than wrapping one item in a batch', async () => {
    responses = [json(200, { id: 'd1a' })];

    await runCalendarWrites(TOKEN, [write('a')]);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/calendar/v3/calendars/');
  });

  it('does nothing at all when the diff found nothing to write', async () => {
    const results = await runCalendarWrites(TOKEN, []);

    expect(calls).toEqual([]);
    expect(results).toEqual([]);
  });
});

describe('being told to slow down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Lets every backoff fire at once instead of waiting out the real delay. */
  async function settle<T>(pending: Promise<T>): Promise<T> {
    await vi.runAllTimersAsync();
    return pending;
  }

  it('re-sends a 429 and keeps the answer the retry got', async () => {
    responses = [
      json(429, { error: { message: 'Rate Limit Exceeded' } }),
      json(200, { id: 'd1a' }),
    ];

    const results = await settle(runCalendarWrites(TOKEN, [write('a')]));

    expect(calls).toHaveLength(2);
    expect(results[0].ok).toBe(true);
    expect(results[0].event?.id).toBe('d1a');
  });

  it('re-sends a 403 that is a rate limit', async () => {
    responses = [json(403, RATE_LIMITED), json(200, { id: 'd1a' })];

    const results = await settle(runCalendarWrites(TOKEN, [write('a')]));

    expect(calls).toHaveLength(2);
    expect(results[0].ok).toBe(true);
  });

  it('never re-sends a 403 that is a missing scope', async () => {
    // The guard this whole classifier exists for. A scope is not granted by
    // asking again, so a retry here only delays the one message that tells
    // him to reconnect Google — and `responses` running dry would throw.
    responses = [json(403, MISSING_SCOPE)];

    const results = await settle(runCalendarWrites(TOKEN, [write('a')]));

    expect(calls).toHaveLength(1);
    expect(results[0].ok).toBe(false);
    expect(results[0].status).toBe(403);
    expect(results[0].message).toBe('Request had insufficient authentication scopes.');
  });

  it('waits as long as Google asked before trying again', async () => {
    responses = [
      json(429, { error: { message: 'Rate Limit Exceeded' } }, { 'Retry-After': '20' }),
      json(200, { id: 'd1a' }),
    ];

    const pending = runCalendarWrites(TOKEN, [write('a')]);
    // Our own first backoff step is well under a second, so anything still
    // waiting here is waiting on the header rather than on the ladder.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(20_000);
    const results = await pending;

    expect(calls).toHaveLength(2);
    expect(results[0].ok).toBe(true);
  });

  it('re-sends rate-limited sub-responses as a batch, not as one request each', async () => {
    // The case that actually bites: the batch POST is answered 200 and the
    // refusal is inside it. Answering that with one request per write is how
    // a small rate limit becomes a large one.
    responses = [
      batchReply([
        { item: 0, status: 403, body: RATE_LIMITED },
        { item: 1, status: 403, body: RATE_LIMITED },
      ]),
      batchReply([
        { item: 0, status: 200, body: { id: 'd1a' } },
        { item: 1, status: 200, body: { id: 'd1b' } },
      ]),
    ];

    const results = await settle(runCalendarWrites(TOKEN, [write('a'), write('b')]));

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.url)).toEqual([
      'https://www.googleapis.com/batch/calendar/v3',
      'https://www.googleapis.com/batch/calendar/v3',
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('re-sends only the write that was refused, and keeps the one that landed', async () => {
    responses = [
      batchReply([
        { item: 0, status: 200, body: { id: 'd1a' } },
        { item: 1, status: 429, body: { error: { message: 'Rate Limit Exceeded' } } },
      ]),
      json(200, { id: 'd1b' }),
    ];

    const results = await settle(runCalendarWrites(TOKEN, [write('a'), write('b')]));

    expect(calls).toHaveLength(2);
    // One write left over is one request, not a batch of one.
    expect(calls[1].url).toContain('/calendar/v3/calendars/');
    expect(results.map((r) => [r.key, r.ok])).toEqual([['a', true], ['b', true]]);
  });

  it('backs off the batch transport itself rather than falling straight through', async () => {
    // Without this, a 429 on the batch POST is answered by the fallback
    // sending every write in the chunk separately — the exact opposite of
    // what the status code asked for.
    responses = [
      json(429, { error: { message: 'Rate Limit Exceeded' } }),
      batchReply([
        { item: 0, status: 200, body: { id: 'd1a' } },
        { item: 1, status: 200, body: { id: 'd1b' } },
      ]),
    ];

    const results = await settle(runCalendarWrites(TOKEN, [write('a'), write('b')]));

    expect(calls).toHaveLength(2);
    expect(calls[1].url).toBe('https://www.googleapis.com/batch/calendar/v3');
    expect(results.map((r) => r.ok)).toEqual([true, true]);
  });

  it('gives up eventually, reporting Google’s own words', async () => {
    // Five sends: the first, then the four retries. A rate limit that never
    // lifts has to end as a failure the user can be shown, not as a loop.
    responses = Array.from({ length: 5 }, () =>
      json(429, { error: { message: 'Rate Limit Exceeded' } }),
    );

    const results = await settle(runCalendarWrites(TOKEN, [write('a')]));

    expect(calls).toHaveLength(5);
    expect(results[0].ok).toBe(false);
    expect(results[0].message).toBe('Rate Limit Exceeded');
  });

  it('does not retry a read that failed for any other reason', async () => {
    // `gcalFetch` carries the same backoff, and the same restraint: a 404 is
    // an answer, not a queue.
    responses = [json(404, { error: { message: 'Not Found' } }), json(200, { items: [] }), json(200, { id: 'fresh' })];

    const result = await settle(getOrCreateNotificationCalendar(TOKEN, 'gone-1', 'Mutineer OS'));

    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'GET', 'POST']);
    expect(result.ok).toBe(true);
  });

  it('retries a read Google rate-limited', async () => {
    responses = [
      json(429, { error: { message: 'Rate Limit Exceeded' } }),
      json(200, { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY }),
    ];

    const result = await settle(getOrCreateNotificationCalendar(TOKEN, CALENDAR, 'Mutineer OS'));

    expect(calls).toHaveLength(2);
    expect(result).toEqual({ ok: true, data: { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });
});

describe('resolving the calendar after the rename', () => {
  it('touches the network not at all once the cached name matches', async () => {
    const result = await getOrCreateNotificationCalendar(TOKEN, CALENDAR, NOTIFICATION_CALENDAR_SUMMARY);

    expect(calls).toEqual([]);
    expect(result).toEqual({ ok: true, data: { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('renames the calendar it already has, keeping the id and everything on it', async () => {
    responses = [json(200, { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY })];

    const result = await getOrCreateNotificationCalendar(TOKEN, CALENDAR, 'Mutineer OS Notifications');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain(`/calendars/${CALENDAR}`);
    expect(JSON.parse(calls[0].body)).toEqual({ summary: NOTIFICATION_CALENDAR_SUMMARY });
    expect(result).toEqual({ ok: true, data: { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('renames a calendar found under the old name instead of making a second one', async () => {
    responses = [
      json(200, { items: [{ id: 'legacy-1', summary: 'Mutineer OS Notifications' }] }),
      json(200, { id: 'legacy-1', summary: NOTIFICATION_CALENDAR_SUMMARY }),
    ];

    const result = await getOrCreateNotificationCalendar(TOKEN);

    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH']);
    expect(result).toEqual({ ok: true, data: { id: 'legacy-1', summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('keeps using the old calendar under its old name when the rename fails', async () => {
    // The events are on that calendar. A second one would strand them.
    responses = [
      json(200, { items: [{ id: 'legacy-1', summary: 'Mutineer OS Notifications' }] }),
      json(403, { error: { message: 'Insufficient Permission' } }),
    ];

    const result = await getOrCreateNotificationCalendar(TOKEN);

    expect(calls).toHaveLength(2);
    expect(result).toEqual({ ok: true, data: { id: 'legacy-1', summary: 'Mutineer OS Notifications' } });
  });

  /*
   * APP-1's hop, and the one with something real on the other end: Shreekant's
   * own account has a calendar called "Mutineer OS" carrying every block item 3
   * has drawn since.
   *
   * **The first of these is the guard** — take "Mutineer OS" back out of
   * `LEGACY_CALENDAR_SUMMARIES` and it fails, which is the app creating a
   * second, empty calendar called BASE and stranding that history on the first.
   * The second still passes without the list, because the cached-id path
   * PATCHes on any name mismatch and never consults it; it is here to pin the
   * shape every already-running device actually arrives in, not to catch that.
   */
  it('renames the calendar the app has been writing to since item 3', async () => {
    responses = [
      json(200, { items: [{ id: 'cal-live', summary: 'Mutineer OS' }] }),
      json(200, { id: 'cal-live', summary: NOTIFICATION_CALENDAR_SUMMARY }),
    ];

    const result = await getOrCreateNotificationCalendar(TOKEN);

    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH']);
    expect(JSON.parse(calls[1].body)).toEqual({ summary: NOTIFICATION_CALENDAR_SUMMARY });
    // Same id — so every event already on it is still on it.
    expect(result).toEqual({ ok: true, data: { id: 'cal-live', summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('renames in place from the cached name, without listing anything', async () => {
    // The shape every device that was already running the app arrives in: a
    // cached id and the pre-APP-1 name beside it.
    responses = [json(200, { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY })];

    const result = await getOrCreateNotificationCalendar(TOKEN, CALENDAR, 'Mutineer OS');

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain(`/calendars/${CALENDAR}`);
    expect(result).toEqual({ ok: true, data: { id: CALENDAR, summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('takes the already-renamed calendar without renaming it again', async () => {
    responses = [json(200, { items: [{ id: 'cal-9', summary: NOTIFICATION_CALENDAR_SUMMARY }] })];

    const result = await getOrCreateNotificationCalendar(TOKEN);

    expect(calls).toHaveLength(1);
    expect(result).toEqual({ ok: true, data: { id: 'cal-9', summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('creates one under the new name when the account has neither', async () => {
    responses = [json(200, { items: [] }), json(200, { id: 'fresh-1' })];

    const result = await getOrCreateNotificationCalendar(TOKEN);

    expect(calls[1].method).toBe('POST');
    expect(JSON.parse(calls[1].body)).toEqual({ summary: NOTIFICATION_CALENDAR_SUMMARY });
    expect(result).toEqual({ ok: true, data: { id: 'fresh-1', summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });

  it('finds or makes one when the cached id has been deleted in Google', async () => {
    responses = [
      json(404, { error: { message: 'Not Found' } }), // the rename PATCH
      json(200, { items: [] }),
      json(200, { id: 'fresh-2' }),
    ];

    const result = await getOrCreateNotificationCalendar(TOKEN, 'gone-1', 'Mutineer OS Notifications');

    expect(calls.map((c) => c.method)).toEqual(['PATCH', 'GET', 'POST']);
    expect(result).toEqual({ ok: true, data: { id: 'fresh-2', summary: NOTIFICATION_CALENDAR_SUMMARY } });
  });
});
