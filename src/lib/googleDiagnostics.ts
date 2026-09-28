/**
 * Central, structured diagnostics log for the entire Google Calendar
 * notification pipeline (OAuth token requests, silent refresh, Calendar REST
 * calls, scope checks, reconcile passes, quick reminders).
 *
 * Why this exists: every failure point used to collapse to a bare `null`, so
 * "notifications aren't working" was impossible to pinpoint — a missing OAuth
 * client id, a blocked popup, denied consent, a disabled Calendar API, an
 * insufficient-scope 403, and a network blip all looked identical. This module
 * records *what actually happened* — phase, code, human message, and raw
 * detail — into a small persisted ring buffer so the Notifications page (and
 * the console) can show the real reason.
 *
 * Deliberately dependency-free and safe to import from anywhere (no React, no
 * Firestore). Never stores secrets — access tokens are never logged.
 */

export type DiagPhase =
  | 'connection' // Calendar connected/disconnected state transitions
  | 'token-silent' // background silent token refresh
  | 'token-interactive' // user-clicked Connect/Reconnect
  | 'calendar-api' // a Google Calendar REST call
  | 'scope-check' // tokeninfo scope verification
  | 'reconcile' // full deadline reconcile pass
  | 'reminder'; // quick-reminder sync

export type DiagLevel = 'info' | 'warn' | 'error';

export interface DiagEntry {
  id: string;
  /** Epoch ms. */
  time: number;
  level: DiagLevel;
  phase: DiagPhase;
  /** Short machine-readable code, e.g. `popup_closed`, `api_403`, `ok`. */
  code: string;
  /** Human-readable, user-facing explanation. */
  message: string;
  /** Optional raw technical detail (Google's own error body, status text, etc.). */
  detail?: string;
}

const STORAGE_KEY = 'mutineer_google_diagnostics';
const MAX_ENTRIES = 60;

let entries: DiagEntry[] = loadFromStorage();
const listeners = new Set<(entries: DiagEntry[]) => void>();

function loadFromStorage(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DiagEntry[];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Best-effort — a full/blocked localStorage just means diagnostics won't
    // survive a reload, which is non-critical.
  }
}

function notify(): void {
  const snapshot = entries;
  for (const l of listeners) l(snapshot);
}

const CONSOLE_STYLE: Record<DiagLevel, (msg: string, detail?: unknown) => void> = {
  info: (m, d) => console.info(`%c[GoogleDiag] ${m}`, 'color:#6ee7b7', d ?? ''),
  warn: (m, d) => console.warn(`[GoogleDiag] ${m}`, d ?? ''),
  error: (m, d) => console.error(`[GoogleDiag] ${m}`, d ?? ''),
};

/**
 * Records one diagnostic entry — mirrors it to the console and pushes it into
 * the persisted ring buffer, notifying any live subscribers (the Notifications
 * page). Returns the created entry so callers can chain (e.g. reuse `message`).
 */
export function logDiag(input: Omit<DiagEntry, 'id' | 'time'>): DiagEntry {
  // Dedupe consecutive identical entries. The reconcile/refresh pipeline can
  // re-log the exact same line many times in a row (e.g. `no_token` on every
  // store write while disconnected); collapsing them keeps the log — and the
  // console — readable instead of drowning the one event that actually
  // differs. Only the timestamp is bumped so it still reads as "last seen".
  const last = entries[entries.length - 1];
  if (
    last &&
    last.level === input.level &&
    last.phase === input.phase &&
    last.code === input.code &&
    last.message === input.message &&
    last.detail === input.detail
  ) {
    const bumped: DiagEntry = { ...last, time: Date.now() };
    entries = [...entries.slice(0, -1), bumped];
    persist();
    notify();
    return bumped;
  }

  const entry: DiagEntry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    time: Date.now(),
    ...input,
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  persist();
  notify();
  CONSOLE_STYLE[entry.level](
    `${entry.phase} · ${entry.code} — ${entry.message}`,
    entry.detail,
  );
  return entry;
}

/** Current diagnostics, oldest → newest. */
export function getDiagnostics(): DiagEntry[] {
  return entries;
}

/** The most recent warn/error entry, or null if the log is clean. */
export function getLatestIssue(): DiagEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].level !== 'info') return entries[i];
  }
  return null;
}

export function clearDiagnostics(): void {
  entries = [];
  persist();
  notify();
}

/** Subscribe to diagnostics changes. Returns an unsubscribe fn. */
export function subscribeDiagnostics(cb: (entries: DiagEntry[]) => void): () => void {
  listeners.add(cb);
  cb(entries);
  return () => {
    listeners.delete(cb);
  };
}

/** Plain-text dump of the whole log — for the "Copy diagnostics" button. */
export function formatDiagnosticsForCopy(): string {
  if (entries.length === 0) return 'Google diagnostics log is empty.';
  const header = `BASE — Google Calendar diagnostics (${entries.length} entries)\nGenerated ${new Date().toISOString()}\nUser agent: ${navigator.userAgent}\n${'-'.repeat(60)}`;
  const lines = entries.map((e) => {
    const ts = new Date(e.time).toISOString();
    const base = `[${ts}] ${e.level.toUpperCase()} ${e.phase}/${e.code}: ${e.message}`;
    return e.detail ? `${base}\n    detail: ${e.detail}` : base;
  });
  return [header, ...lines].join('\n');
}
