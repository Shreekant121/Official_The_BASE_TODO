/**
 * BUILD-6 — who is the admin, and who may spend his key.
 *
 * The rules file is checked as text in `server/rules.test.ts` (this project has
 * no Node types to read it with). Whether the rules *do* what they say is
 * `npm run check:rules`, against Google's own evaluator.
 */
import { describe, expect, it } from 'vitest';
import {
  NO_ACCESS,
  OWNER_EMAIL,
  USAGE_DAYS_KEPT,
  assistantRoute,
  isOwner,
  isUnverifiedOwner,
  maySpendOwnerKey,
  readAccess,
  readUsage,
  staleUsageDays,
  usageSeries,
} from './adminAccess';

describe('isOwner', () => {
  it('is his address, verified', () => {
    expect(isOwner({ email: OWNER_EMAIL, emailVerified: true })).toBe(true);
  });

  it('is not his address unverified — anyone can type it into a sign-up form', () => {
    expect(isOwner({ email: OWNER_EMAIL, emailVerified: false })).toBe(false);
    expect(isOwner({ email: OWNER_EMAIL })).toBe(false);
    expect(isUnverifiedOwner({ email: OWNER_EMAIL, emailVerified: false })).toBe(true);
  });

  it('is not a look-alike address', () => {
    for (const email of [
      OWNER_EMAIL.toUpperCase(),
      ` ${OWNER_EMAIL}`,
      `${OWNER_EMAIL}.evil.com`,
      'owner@example.co',
      'owner@exarnple.com',
    ]) {
      expect(isOwner({ email, emailVerified: true })).toBe(false);
      expect(isUnverifiedOwner({ email, emailVerified: false })).toBe(false);
    }
  });

  it('is nobody when signed out', () => {
    expect(isOwner(null)).toBe(false);
    expect(isOwner(undefined)).toBe(false);
    expect(isOwner({})).toBe(false);
  });
});

describe('who spends which key', () => {
  it('a new account brings its own key, with the assistant off', () => {
    expect(readAccess(undefined)).toEqual(NO_ACCESS);
    expect(assistantRoute(false, NO_ACCESS)).toBe('off');
    expect(maySpendOwnerKey(false, NO_ACCESS)).toBe(false);
  });

  it('switching the assistant on means their own key', () => {
    const access = { assistant: true, ownerKey: false };
    expect(assistantRoute(false, access)).toBe('own-key');
    expect(maySpendOwnerKey(false, access)).toBe(false);
  });

  it('both switches on puts the account on his key', () => {
    const access = { assistant: true, ownerKey: true };
    expect(assistantRoute(false, access)).toBe('owner-key');
    expect(maySpendOwnerKey(false, access)).toBe(true);
  });

  it('the key switch alone spends nothing — the assistant switch stops it', () => {
    const access = { assistant: false, ownerKey: true };
    expect(assistantRoute(false, access)).toBe('off');
    expect(maySpendOwnerKey(false, access)).toBe(false);
  });

  it('the owner always spends his own key, whatever a document says', () => {
    expect(assistantRoute(true, NO_ACCESS)).toBe('owner-key');
    expect(maySpendOwnerKey(true, NO_ACCESS)).toBe(true);
  });

  it('only a real `true` counts as on', () => {
    expect(readAccess({ assistant: 'true', ownerKey: 1 })).toEqual(NO_ACCESS);
    expect(readAccess({ assistant: true, ownerKey: true, role: 'admin' })).toEqual({ assistant: true, ownerKey: true });
    expect(readAccess(null)).toEqual(NO_ACCESS);
  });
});

describe('turns on his key', () => {
  const now = Date.UTC(2026, 8, 17, 10, 0);

  it('reads a stored count and ignores anything malformed', () => {
    const usage = readUsage({ total: 9, lastAt: 5, days: { '2026-09-17': 4, 'yesterday': 3, '2026-09-16': 'x' } });
    expect(usage).toEqual({ total: 9, lastAt: 5, days: { '2026-09-17': 4 } });
    expect(readUsage(undefined)).toEqual({ total: 0, lastAt: null, days: {} });
  });

  it('draws seven UTC days ending today, oldest first, zeros for quiet days', () => {
    const series = usageSeries({ total: 7, lastAt: now, days: { '2026-09-17': 5, '2026-09-11': 2, '2026-09-10': 99 } }, now);
    expect(series.map((d) => d.day)).toEqual([
      '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
    ]);
    expect(series.map((d) => d.count)).toEqual([2, 0, 0, 0, 0, 0, 5]);
  });

  it(`keeps ${USAGE_DAYS_KEPT} days and drops the rest on write`, () => {
    const days = { '2026-09-17': 1, '2026-08-14': 1, '2026-08-13': 1, '2025-01-01': 1 };
    expect(staleUsageDays(days, now).sort()).toEqual(['2025-01-01', '2026-08-13']);
  });
});
