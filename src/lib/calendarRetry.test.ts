/**
 * BUILD-15's retry policy, pinned.
 *
 * The behaviour worth a test here is not "does a 500 retry" — it is the two
 * places this could quietly do the wrong thing to somebody's calendar: giving
 * up on a transient failure too early, and *not* giving up on a scope 403,
 * which would turn an instant, legible "reconnect Google" into a slow one.
 */
import { describe, it, expect } from 'vitest';
import {
  SYNC_FAILURE_TTL_MS,
  SYNC_RETRY_ATTEMPTS,
  classifyCalendarFailure,
  isFailureLive,
  recordFailure,
  shouldRetry,
  shouldWarn,
  type SyncFailureState,
} from './calendarRetry';

describe('classifyCalendarFailure', () => {
  it('retries what waiting can fix', () => {
    expect(classifyCalendarFailure(0)).toBe('retry'); // never reached Google
    expect(classifyCalendarFailure(429)).toBe('retry');
    expect(classifyCalendarFailure(500)).toBe('retry');
    expect(classifyCalendarFailure(503)).toBe('retry');
  });

  it('treats an unknown failure as retryable — a crashed pass has no status', () => {
    expect(classifyCalendarFailure(undefined)).toBe('retry');
  });

  it('NEVER retries a 403: it is the missing-scope status and waiting cannot fix it', () => {
    expect(classifyCalendarFailure(403)).toBe('reconnect');
    expect(shouldRetry(recordFailure(null, 0, 'insufficient scopes', 'reconnect'))).toBe(false);
  });

  it('sends a 401 to him rather than round a timer', () => {
    expect(classifyCalendarFailure(401)).toBe('reconnect');
  });

  it('reports a malformed request once instead of repeating it', () => {
    expect(classifyCalendarFailure(400)).toBe('permanent');
    expect(classifyCalendarFailure(404)).toBe('permanent');
    expect(classifyCalendarFailure(409)).toBe('permanent');
  });
});

describe('recordFailure', () => {
  it('counts consecutive failures and keeps the first one’s time', () => {
    const first = recordFailure(null, 1_000, 'offline', 'retry');
    expect(first).toMatchObject({ failedAt: 1_000, attempts: 1 });
    const second = recordFailure(first, 121_000, 'offline', 'retry');
    expect(second).toMatchObject({ failedAt: 1_000, attempts: 2 });
  });

  it('starts a fresh run of bad luck once the old one is stale', () => {
    const old = recordFailure(null, 1_000, 'offline', 'retry');
    const next = recordFailure(old, 1_000 + SYNC_FAILURE_TTL_MS + 1, 'offline', 'retry');
    // Not attempts: 2. A failure today must not inherit a spent attempt from
    // one last week, or it would speak up with two of its three sends unused.
    expect(next).toMatchObject({ failedAt: 1_000 + SYNC_FAILURE_TTL_MS + 1, attempts: 1 });
  });
});

describe('shouldRetry / shouldWarn', () => {
  const retryable = (attempts: number): SyncFailureState => ({
    failedAt: 0,
    attempts,
    reason: 'network',
    kind: 'retry',
  });

  it('spends exactly his three attempts, then stops', () => {
    expect(shouldRetry(retryable(1))).toBe(true);
    expect(shouldRetry(retryable(2))).toBe(true);
    expect(shouldRetry(retryable(SYNC_RETRY_ATTEMPTS))).toBe(false);
  });

  it('stays silent while a transient failure still has attempts in hand', () => {
    // "A transient failure heals itself without him noticing" — the item's own
    // done-when. A banner on attempt one would be exactly the noticing.
    expect(shouldWarn(retryable(1))).toBe(false);
    expect(shouldWarn(retryable(SYNC_RETRY_ATTEMPTS))).toBe(true);
  });

  it('speaks at once about anything waiting cannot fix', () => {
    expect(shouldWarn({ failedAt: 0, attempts: 1, reason: 'scope', kind: 'reconnect' })).toBe(true);
    expect(shouldWarn({ failedAt: 0, attempts: 1, reason: 'bad id', kind: 'permanent' })).toBe(true);
  });
});

describe('isFailureLive', () => {
  it('is false for no failure at all, and for one that has gone stale', () => {
    expect(isFailureLive(null, 5_000)).toBe(false);
    const state = recordFailure(null, 1_000, 'offline', 'retry');
    expect(isFailureLive(state, 2_000)).toBe(true);
    expect(isFailureLive(state, 1_000 + SYNC_FAILURE_TTL_MS)).toBe(false);
  });
});
