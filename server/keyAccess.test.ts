/**
 * BUILD-6 — "a new account cannot spend his key", asked of the real route.
 *
 * This drives `api/chat.ts` itself, through the committed bundle it imports
 * (`api/_lib/keyAccess.js`), with Firebase Admin replaced by a fake that knows
 * a handful of ID tokens and `accountAccess` documents. What is being watched
 * is `fetch`: a refused caller must be refused before anything is sent to
 * Gemini with `GEMINI_API_KEY` on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNER_EMAIL } from '../src/lib/adminAccess';

type Claims = { uid: string; email?: string; email_verified?: boolean };

const TOKENS: Record<string, Claims> = {
  owner: { uid: 'owner-uid', email: OWNER_EMAIL, email_verified: true },
  impostor: { uid: 'impostor-uid', email: OWNER_EMAIL, email_verified: false },
  stranger: { uid: 'stranger-uid', email: 'new@example.com', email_verified: true },
  ownkey: { uid: 'ownkey-uid', email: 'own@example.com', email_verified: true },
  keyonly: { uid: 'keyonly-uid', email: 'keyonly@example.com', email_verified: true },
  friend: { uid: 'friend-uid', email: 'friend@example.com', email_verified: true },
};

const DOCS: Record<string, Record<string, unknown>> = {
  'accountAccess/ownkey-uid': { assistant: true, ownerKey: false },
  'accountAccess/keyonly-uid': { assistant: false, ownerKey: true },
  'accountAccess/friend-uid': { assistant: true, ownerKey: true },
};

const writes: { path: string; data: Record<string, unknown> }[] = [];

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
  const ref = (path: string) => ({ path, get: async () => ({ data: () => DOCS[path] }) });
  return {
    FieldValue: { increment: (n: number) => ({ increment: n }), delete: () => ({ delete: true }) },
    getFirestore: () => ({
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: async (r: { path: string }) => ({ data: () => DOCS[r.path] }),
          set: (r: { path: string }, data: Record<string, unknown>) => writes.push({ path: r.path, data }),
        }),
    }),
  };
});

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    written: '',
    writableEnded: false,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; res.writableEnded = true; return res; },
    setHeader() { return res; },
    writeHead(code: number) { res.statusCode = code; return res; },
    write(chunk: Buffer) { res.written += chunk.toString(); return true; },
    end() { res.writableEnded = true; return res; },
    on() { return res; },
  };
  return res;
}

const fetchSpy = vi.fn(async () =>
  new Response('data: {"candidates":[]}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
);

async function callChat(token: string | null) {
  const { default: handler } = await import('../api/chat');
  const res = fakeRes();
  const req = {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: { model: 'gemini-test', contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
  };
  await handler(req as never, res as never);
  return res;
}

beforeEach(() => {
  process.env.FIREBASE_SERVICE_ACCOUNT = '{}';
  process.env.GEMINI_API_KEY = 'the-owners-key';
  delete process.env.ALLOWED_UID;
  fetchSpy.mockClear();
  writes.length = 0;
  vi.stubGlobal('fetch', fetchSpy);
});

describe('api/chat — who may spend the key', () => {
  it.each([
    ['no token at all', null, 401, 'missing_id_token'],
    ['a token Firebase rejects', 'forged', 401, 'invalid_id_token'],
    ['a new account (no switches)', 'stranger', 403, 'assistant_off'],
    ['his address, unverified', 'impostor', 403, 'assistant_off'],
    ['an account on its own key', 'ownkey', 403, 'own_key_required'],
    ['"my key" on but the assistant off', 'keyonly', 403, 'assistant_off'],
  ])('refuses %s, and never calls Gemini', async (_label, token, status, error) => {
    const res = await callChat(token);
    expect(res.statusCode).toBe(status);
    expect(res.body).toMatchObject({ error });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('lets the owner through, on the server key, and counts the turn', async () => {
    const res = await callChat('owner');
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('the-owners-key');
    expect(writes.map((w) => w.path)).toEqual(['keyUsage/owner-uid']);
  });

  it('lets an account he switched onto his key through', async () => {
    const res = await callChat('friend');
    expect(res.statusCode).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(writes.map((w) => w.path)).toEqual(['keyUsage/friend-uid']);
  });

  it('no longer reads ALLOWED_UID — it cannot let a stranger in or lock him out', async () => {
    process.env.ALLOWED_UID = 'stranger-uid';
    expect((await callChat('stranger')).statusCode).toBe(403);
    process.env.ALLOWED_UID = 'someone-else';
    expect((await callChat('owner')).statusCode).toBe(200);
  });
});

describe('api/admin-accounts — the admin only', () => {
  it.each([
    ['a new account', 'stranger'],
    ['a friend on his key', 'friend'],
    ['his address, unverified', 'impostor'],
  ])('refuses %s', async (_label, token) => {
    const { default: handler } = await import('../api/admin-accounts');
    const res = fakeRes();
    await handler({ method: 'GET', headers: { authorization: `Bearer ${token}` } } as never, res as never);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });
});
