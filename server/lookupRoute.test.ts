/**
 * `api/lookup` (BIG-12, step 27A-4), driven for real: the route file, its
 * committed `_lib/lookup.js` bundle of Atlas's `lookup/remote.ts`, and the
 * `keyAccess` lock — with Firebase and the network stubbed.
 *
 * What it must keep: only an account allowed the owner's keys may use it (the
 * Brave key is his), a page on a private address is refused with Atlas's own
 * guard, and a missing Brave key is a sentence the model can pass on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNER_EMAIL } from '../src/lib/adminAccess';

type Claims = { uid: string; email?: string; email_verified?: boolean };

const TOKENS: Record<string, Claims> = {
  owner: { uid: 'owner-uid', email: OWNER_EMAIL, email_verified: true },
  stranger: { uid: 'stranger-uid', email: 'new@example.com', email_verified: true },
};

vi.mock('firebase-admin/app', () => ({
  cert: () => ({}),
  getApps: () => [],
  initializeApp: () => ({ name: 'base-keys' }),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      const claims = TOKENS[token];
      if (!claims) throw new Error('bad token');
      return claims;
    },
  }),
}));

vi.mock('firebase-admin/firestore', () => {
  const ref = (path: string) => ({ path, get: async () => ({ data: () => undefined }) });
  return {
    FieldValue: { increment: (n: number) => ({ increment: n }), delete: () => ({ delete: true }) },
    getFirestore: () => ({
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({ get: async () => ({ data: () => undefined }), set: () => undefined }),
    }),
  };
});

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
    setHeader() {
      return res;
    },
  };
  return res;
}

async function call(token: string | null, body: unknown, method = 'POST') {
  const { default: handler } = await import('../api/lookup');
  const res = fakeRes();
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, body } as never, res as never);
  return res;
}

beforeEach(() => {
  process.env.FIREBASE_SERVICE_ACCOUNT = '{}';
  delete process.env.BRAVE_SEARCH_API_KEY;
  vi.unstubAllGlobals();
});

describe('api/lookup — web lookup for Atlas on the tablet', () => {
  it('answers only POST', async () => {
    expect((await call('owner', {}, 'GET')).statusCode).toBe(405);
  });

  it('is locked like the owner’s Gemini key: no token, or an account he has not allowed, is refused', async () => {
    expect((await call(null, { kind: 'read', url: 'https://example.com' })).statusCode).toBe(401);
    expect((await call('stranger', { kind: 'read', url: 'https://example.com' })).statusCode).toBe(403);
  });

  it('refuses a page on a private address with Atlas’s own guard', async () => {
    const res = await call('owner', { kind: 'read', url: 'http://localhost:8787/health' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: false, refused: expect.any(String) });
  });

  it('says search is not switched on yet, in words, while the Brave key is missing', async () => {
    const res = await call('owner', { kind: 'search', query: 'rrule last friday' });
    expect(res.body).toMatchObject({ ok: false, unavailable: expect.stringMatching(/BRAVE_SEARCH_API_KEY/) });
  });

  it('searches Brave on the key in the environment', async () => {
    process.env.BRAVE_SEARCH_API_KEY = 'brave-test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ web: { results: [{ title: 'RFC 5545', url: 'https://www.rfc-editor.org/rfc/rfc5545', description: 'x' }] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const res = await call('owner', { kind: 'search', query: 'rrule last friday' });
    expect(res.body).toMatchObject({ ok: true, results: { hits: [{ title: 'RFC 5545' }] } });
  });

  it('turns away a request that is neither kind', async () => {
    expect((await call('owner', { kind: 'mail' })).statusCode).toBe(400);
  });
});
