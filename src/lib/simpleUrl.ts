/**
 * Thin SimpleURL API client (https://www.simpleurl.tech). Every call is made
 * directly browser → API (zero Vercel Functions), authenticated with a
 * per-user `X-API-Key` header. The key is loaded from Firestore at call time
 * (see `lib/integrationSettings.ts`), never bundled into env vars.
 *
 * IMPORTANT: the base host MUST be `www.simpleurl.tech`. The bare
 * `simpleurl.tech` host answers every request with a 301 redirect to the
 * `www.` host, and that redirect carries NO CORS headers — so the browser's
 * preflight (triggered by our custom `X-API-Key` header) is blocked and every
 * call fails with an opaque "Failed to fetch". The `www.` host returns the
 * proper `Access-Control-Allow-Origin` headers and works.
 *
 * Endpoints/behaviour verified against the official SimpleURL n8n node and a
 * live probe of the account API:
 *   POST   /api/v1/short-urls              create
 *   GET    /api/v1/short-urls/{keyword}    read (accepts ?domain=)
 *   DELETE /api/v1/short-urls/{keyword}    delete (accepts ?domain=)
 *   POST   /api/v1/qr-codes                enable QR for a keyword
 *   GET    /api/v1/analytics/{keyword}     click analytics
 * Responses are wrapped as `{ success, data, message, pagination? }`.
 *
 * Branded / custom domains (e.g. `go.base.co.in`) are passed as the
 * `domain` field — the domain must already be verified in the SimpleURL
 * dashboard; the default branded domain for this account is `smplu.link`.
 */

export const SIMPLEURL_BASE = 'https://www.simpleurl.tech';
export const DEFAULT_SHORT_DOMAIN = 'smplu.link';

/** How long (ms) we wait before giving up on a single request. */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Machine-readable buckets for every way a call can go wrong. Each maps to a
 * plain-language message + hint below so the UI (and the console) can tell the
 * user exactly what's wrong.
 */
export type SimpleUrlErrorCode =
  | 'no-key'
  | 'offline'
  | 'timeout'
  | 'network' // network failure OR CORS block — the browser can't tell them apart
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limit'
  | 'bad-request'
  | 'server'
  | 'bad-response'
  | 'unknown';

export class SimpleUrlError extends Error {
  status?: number;
  code: SimpleUrlErrorCode;
  /** A short, actionable next step in plain language. */
  hint?: string;

  constructor(code: SimpleUrlErrorCode, message: string, opts: { status?: number; hint?: string } = {}) {
    super(message);
    this.name = 'SimpleUrlError';
    this.code = code;
    this.status = opts.status;
    this.hint = opts.hint;
  }

  /** message + hint on one line, for compact UI surfaces. */
  get full(): string {
    return this.hint ? `${this.message} ${this.hint}` : this.message;
  }
}

export interface ShortUrl {
  id?: number;
  keyword: string;
  shortUrl: string;
  url: string;
  domain: string;
  description?: string | null;
  hasQrCode?: boolean;
  qrCodeUrl?: string;
  isPublic?: boolean;
}

export interface AnalyticsSummary {
  clicks: number;
  raw: unknown;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

interface RequestOptions {
  body?: Record<string, unknown>;
  qs?: Record<string, string | number | undefined>;
}

/* ------------------------------------------------------------------ */
/* Logging                                                            */
/* ------------------------------------------------------------------ */

const LOG_PREFIX = '[SimpleURL]';

/** Redact the key so it never lands in the console/logs in full. */
function maskKey(key: string): string {
  if (!key) return '(empty)';
  if (key.length <= 12) return `${key.slice(0, 3)}…`;
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}

function logInfo(...args: unknown[]) {
  console.info(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

/* ------------------------------------------------------------------ */
/* Error classification                                               */
/* ------------------------------------------------------------------ */

/** Turn an HTTP status (+ any server message) into a friendly SimpleUrlError. */
function errorForStatus(status: number, serverMessage?: string): SimpleUrlError {
  const server = serverMessage ? ` (SimpleURL said: "${serverMessage}")` : '';
  switch (true) {
    case status === 400:
      return new SimpleUrlError(
        'bad-request',
        `SimpleURL rejected the request${server}.`,
        { status, hint: 'This usually means the custom domain isn\'t verified in your SimpleURL dashboard yet, or the keyword has invalid characters. Try leaving the domain as the default, or use a simple keyword (letters, numbers, dashes).' },
      );
    // SimpleURL returns 401 AND 403 for a missing / wrong / expired key.
    case status === 401:
    case status === 403:
      return new SimpleUrlError(
        status === 401 ? 'unauthorized' : 'forbidden',
        'SimpleURL rejected the request because the API key is missing, wrong, or expired.',
        { status, hint: 'Open Settings, delete the key field, re-paste the full key from simpleurl.tech → Dashboard → API keys (it starts with "sk_"), then Save and Test again. Make sure there are no extra spaces and the whole key was copied.' },
      );
    case status === 404:
      return new SimpleUrlError(
        'not-found',
        'That short link no longer exists on SimpleURL.',
        { status, hint: 'It may have been deleted from the SimpleURL dashboard. You can create a fresh short link.' },
      );
    case status === 409:
      return new SimpleUrlError(
        'conflict',
        `That custom keyword is already taken on this domain${server}.`,
        { status, hint: 'Pick a different keyword, or leave the keyword blank to let SimpleURL generate one.' },
      );
    case status === 429:
      return new SimpleUrlError(
        'rate-limit',
        'You\'ve hit SimpleURL\'s rate limit.',
        { status, hint: 'Wait about a minute, then try again.' },
      );
    case status >= 500:
      return new SimpleUrlError(
        'server',
        `SimpleURL's server had an error (status ${status})${server}.`,
        { status, hint: 'This is on SimpleURL\'s side, not yours. Try again in a little while.' },
      );
    default:
      return new SimpleUrlError(
        'unknown',
        `SimpleURL request failed (status ${status})${server}.`,
        { status },
      );
  }
}

/** Classify a thrown fetch error (before we ever get an HTTP status). */
function errorForThrow(err: unknown): SimpleUrlError {
  // Timeout via AbortController.
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new SimpleUrlError(
      'timeout',
      `SimpleURL took too long to respond (over ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds).`,
      { hint: 'Their service may be slow or temporarily down. Check https://www.simpleurl.tech and try again shortly.' },
    );
  }

  // Genuinely offline is worth calling out specifically.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new SimpleUrlError(
      'offline',
      'Your device looks offline.',
      { hint: 'Check your Wi-Fi / internet connection and try again.' },
    );
  }

  // Everything else here is a browser-level "Failed to fetch" (TypeError).
  // The browser deliberately hides whether it was a network drop or a CORS
  // block, so we list the realistic causes.
  return new SimpleUrlError(
    'network',
    'The browser couldn\'t reach SimpleURL.',
    { hint: 'Likely one of: (1) a browser extension / ad-blocker / privacy shield is blocking simpleurl.tech, (2) you briefly lost internet, or (3) a network firewall is in the way. Try disabling ad-blockers for this site, then reload. Open the browser Console (F12) for the exact error.' },
  );
}

/* ------------------------------------------------------------------ */
/* Core request                                                       */
/* ------------------------------------------------------------------ */

async function request<T>(
  apiKey: string,
  method: string,
  path: string,
  { body, qs }: RequestOptions = {},
): Promise<T> {
  if (!apiKey) {
    throw new SimpleUrlError('no-key', 'No SimpleURL API key is saved yet.', {
      hint: 'Open Settings and paste your key (it starts with "sk_").',
    });
  }

  const url = new URL(SIMPLEURL_BASE + path);
  if (qs) {
    for (const [k, v] of Object.entries(qs)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const startedAt = performance.now();
  logInfo(`→ ${method} ${url.toString()}`, { key: maskKey(apiKey), body: body ?? null });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const friendly = errorForThrow(err);
    logError(`✗ ${method} ${path} — ${friendly.code}: could not complete fetch`, {
      raw: err,
      elapsedMs: Math.round(performance.now() - startedAt),
      online: typeof navigator !== 'undefined' ? navigator.onLine : 'unknown',
      hint: friendly.hint,
    });
    throw friendly;
  } finally {
    clearTimeout(timeout);
  }

  let json: Envelope<T> | undefined;
  let rawText = '';
  try {
    rawText = await res.text();
    json = rawText ? (JSON.parse(rawText) as Envelope<T>) : undefined;
  } catch {
    // Non-JSON / empty body — leave `json` undefined; handled below.
  }

  const elapsedMs = Math.round(performance.now() - startedAt);

  if (!res.ok) {
    const friendly = errorForStatus(res.status, json?.message || json?.error);
    logError(`✗ ${method} ${path} — HTTP ${res.status} (${elapsedMs}ms)`, {
      body: rawText.slice(0, 500),
      code: friendly.code,
      hint: friendly.hint,
    });
    throw friendly;
  }

  if (json && json.success === false) {
    const friendly = new SimpleUrlError('bad-request', json.message || json.error || 'SimpleURL reported the request was unsuccessful.', {
      status: res.status,
      hint: 'See the message above from SimpleURL for the specific reason.',
    });
    logError(`✗ ${method} ${path} — success:false (${elapsedMs}ms)`, { body: json });
    throw friendly;
  }

  // Response was OK but we couldn't understand it.
  if (json === undefined && rawText && !rawText.trim().startsWith('{') && !rawText.trim().startsWith('[')) {
    logError(`✗ ${method} ${path} — OK but non-JSON body (${elapsedMs}ms)`, { body: rawText.slice(0, 500) });
    throw new SimpleUrlError('bad-response', 'SimpleURL replied, but the response wasn\'t in the format we expected.', {
      status: res.status,
      hint: 'Their API may have changed, or a proxy returned an HTML page. Open the Console (F12) to see the raw response.',
    });
  }

  logInfo(`✓ ${method} ${path} — HTTP ${res.status} (${elapsedMs}ms)`);
  return (json && json.data !== undefined ? (json.data as T) : ((json as unknown) as T));
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

/** Lightweight key check — used by the Settings "Test connection" button. */
export async function testConnection(apiKey: string): Promise<boolean> {
  await request<unknown>(apiKey, 'GET', '/api/v1/short-urls', { qs: { page: 1, pageSize: 1 } });
  return true;
}

export type DiagnosticStatus = 'ok' | 'warn' | 'fail' | 'skip';

export interface DiagnosticStep {
  label: string;
  status: DiagnosticStatus;
  detail: string;
}

export interface DiagnosticsResult {
  ok: boolean;
  steps: DiagnosticStep[];
}

/**
 * Runs an ordered set of checks and returns a human-readable report so a
 * non-technical user can see exactly which stage failed. Used by the Settings
 * "Test connection" button.
 */
export async function runDiagnostics(apiKey: string, domain?: string): Promise<DiagnosticsResult> {
  const steps: DiagnosticStep[] = [];
  const key = apiKey.trim();

  // 1) API key present + shape.
  if (!key) {
    steps.push({ label: 'API key', status: 'fail', detail: 'No key entered. Paste your SimpleURL key (it starts with "sk_").' });
    return { ok: false, steps };
  }
  if (!key.startsWith('sk_')) {
    steps.push({ label: 'API key format', status: 'warn', detail: 'This doesn\'t look like a SimpleURL key — they normally start with "sk_". Double-check you copied the whole key.' });
  } else {
    steps.push({ label: 'API key format', status: 'ok', detail: `Looks right (${maskKey(key)}).` });
  }

  // 2) Browser online?
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    steps.push({ label: 'Internet connection', status: 'fail', detail: 'Your device reports it is offline. Check Wi-Fi / network and try again.' });
    return { ok: false, steps };
  }
  steps.push({ label: 'Internet connection', status: 'ok', detail: 'Your device is online.' });

  // 3) Reach SimpleURL + validate the key.
  try {
    await testConnection(key);
    steps.push({ label: 'Reach SimpleURL & verify key', status: 'ok', detail: 'Connected and the key was accepted.' });
  } catch (e) {
    const err = e instanceof SimpleUrlError ? e : new SimpleUrlError('unknown', 'Unexpected error.');
    steps.push({ label: 'Reach SimpleURL & verify key', status: 'fail', detail: err.full });
    return { ok: false, steps };
  }

  // 4) Branded domain note (informational only — a bad domain fails at create time).
  if (domain && domain.trim() && domain.trim() !== DEFAULT_SHORT_DOMAIN) {
    steps.push({
      label: 'Branded domain',
      status: 'warn',
      detail: `Using "${domain.trim()}". Make sure this domain is added and verified in your SimpleURL dashboard, otherwise creating links will fail with a 400 error.`,
    });
  }

  return { ok: true, steps };
}

export interface CreateShortUrlInput {
  url: string;
  keyword?: string;
  description?: string;
  domain?: string;
  createQrCode?: boolean;
}

export async function createShortUrl(apiKey: string, input: CreateShortUrlInput): Promise<ShortUrl> {
  const body: Record<string, unknown> = { url: input.url, isPublic: true };
  if (input.keyword) body.keyword = input.keyword;
  if (input.description) body.description = input.description;
  if (input.domain) body.domain = input.domain;
  if (input.createQrCode) body.createQrCode = true;
  return request<ShortUrl>(apiKey, 'POST', '/api/v1/short-urls', { body });
}

export async function getShortUrl(apiKey: string, keyword: string, domain?: string): Promise<ShortUrl> {
  return request<ShortUrl>(apiKey, 'GET', `/api/v1/short-urls/${encodeURIComponent(keyword)}`, {
    qs: { domain },
  });
}

export async function deleteShortUrl(apiKey: string, keyword: string, domain?: string): Promise<void> {
  await request<unknown>(apiKey, 'DELETE', `/api/v1/short-urls/${encodeURIComponent(keyword)}`, {
    qs: { domain },
  });
}

/** Enable a QR code on an existing short link. Returns whatever the API gives back (may include `qrCodeUrl`). */
export async function enableQrCode(apiKey: string, keyword: string, domain?: string): Promise<Partial<ShortUrl>> {
  return request<Partial<ShortUrl>>(apiKey, 'POST', '/api/v1/qr-codes', {
    body: { keyword, domain: domain || DEFAULT_SHORT_DOMAIN },
  });
}

export async function getAnalyticsSummary(apiKey: string, keyword: string, domain?: string): Promise<AnalyticsSummary> {
  const raw = await request<Record<string, unknown>>(apiKey, 'GET', `/api/v1/analytics/${encodeURIComponent(keyword)}`, {
    qs: { domain },
  });
  const clicks = pickClicks(raw);
  return { clicks, raw };
}

function pickClicks(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return 0;
  const obj = raw as Record<string, unknown>;
  for (const key of ['totalClicks', 'clicks', 'clickCount', 'total', 'visits', 'totalVisits']) {
    const v = obj[key];
    if (typeof v === 'number') return v;
  }
  return 0;
}

/**
 * The QR PNG URL. Prefers whatever the API returned (`qrCodeUrl`), otherwise
 * builds the deterministic public URL SimpleURL serves QR images from
 * (`https://{domain}/qr/{keyword}.png`) so the image can render without a
 * second round trip.
 */
export function qrImageUrl(short: Partial<ShortUrl> | null, keyword: string, domain?: string): string {
  if (short?.qrCodeUrl) return short.qrCodeUrl;
  return `https://${domain || short?.domain || DEFAULT_SHORT_DOMAIN}/qr/${encodeURIComponent(keyword)}.png`;
}
