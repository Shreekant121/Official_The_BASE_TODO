/**
 * BUILD-6 — `firestore.rules`, read as text.
 *
 * Rules cannot import `OWNER_EMAIL`, so this is what stops the two spellings
 * drifting apart, and what fails if someone gives the admin a write under
 * another account. It lives in `server/` because the app's own type project has
 * no Node types to read a file with.
 *
 * Whether the rules *do* what they say is `npm run check:rules`, against
 * Google's own evaluator — it needs the network and a Firebase Rules role, so
 * it is not part of this suite.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OWNER_EMAIL } from '../src/lib/adminAccess';

const rules = readFileSync(resolve(import.meta.dirname, '..', 'firestore.rules'), 'utf8');

describe('firestore.rules', () => {
  it('names the same admin as the app, and requires it verified', () => {
    const emails = [...rules.matchAll(/request\.auth\.token\.email == '([^']+)'/g)].map((m) => m[1]);
    expect(emails).toEqual([OWNER_EMAIL]);
    expect(rules).toContain('request.auth.token.email_verified == true');
  });

  it('gives the admin no write anywhere under /users', () => {
    const users = rules.slice(rules.indexOf('match /users/{userId}'), rules.indexOf('match /accountAccess/'));
    expect(users).toContain('match /data/main');
    expect(users).not.toMatch(/allow[^;]*(write|create|update|delete)[^;]*isAdmin/);
  });

  it('lets nobody but the proxy write a turn count', () => {
    const usage = rules.slice(rules.indexOf('match /keyUsage/'));
    expect(usage).toMatch(/allow write: if false;/);
  });
});
