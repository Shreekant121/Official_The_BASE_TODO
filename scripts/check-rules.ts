/**
 * `npm run check:rules` — proves `firestore.rules` against Google's own rules
 * engine, before it is deployed. BUILD-6.
 *
 * WHY NOT THE EMULATOR
 * --------------------
 * The emulator needs Java, and this laptop has none. Firebase's Rules API has
 * a `test` method that takes a ruleset *source* and a list of pretend requests
 * — who is asking, for what, with which fields — and says whether each one
 * would be allowed. It evaluates the file on disk, not the deployed rules; it
 * **reads and writes no data**; and the answer comes from the same evaluator
 * production uses, which a hand-written model of the rules would not.
 *
 * It needs `FIREBASE_SERVICE_ACCOUNT` in `.env` (the Admin key, used here only
 * to get an access token for that API) and it needs the network, which is why
 * it is a script and not part of `npm run test`.
 *
 * BUILD-6's "done when" is the first block: a second account's board is
 * readable only by his, tried as the other account.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert } from 'firebase-admin/app';
import { OWNER_EMAIL } from '../src/lib/adminAccess';

const root = resolve(import.meta.dirname, '..');
const PROJECT = 'mutineer-os';
const DB = '/databases/(default)/documents';

try {
  process.loadEnvFile(resolve(root, '.env'));
} catch {
  // Fall through to the check below.
}
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not in .env — this check needs it to reach the Rules API.');
  process.exit(1);
}
const account = JSON.parse(raw) as Record<string, string>;
if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');

type Who = { uid: string; email: string; verified: boolean } | null;

/* Three people. None of these uids exists; the engine does not look. */
const ADMIN: Who = { uid: 'admin-uid', email: OWNER_EMAIL, verified: true };
const IMPOSTOR: Who = { uid: 'impostor-uid', email: OWNER_EMAIL, verified: false };
const FRIEND: Who = { uid: 'friend-uid', email: 'friend@example.com', verified: true };
const STRANGER: Who = { uid: 'stranger-uid', email: 'stranger@example.com', verified: true };
const NOBODY: Who = null;

interface Case {
  name: string;
  who: Who;
  method: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  data?: Record<string, unknown>;
  allow: boolean;
}

const access = { assistant: true, ownerKey: true };

const CASES: Case[] = [
  // ── The "done when": a board is readable only by its owner and by him. ──
  { name: 'another account cannot read the friend\'s board', who: STRANGER, method: 'get', path: 'users/friend-uid/data/main', allow: false },
  { name: 'the friend cannot read the admin\'s board', who: FRIEND, method: 'get', path: 'users/admin-uid/data/main', allow: false },
  { name: 'the admin can read the friend\'s board', who: ADMIN, method: 'get', path: 'users/friend-uid/data/main', allow: true },
  { name: 'his email, unverified, cannot', who: IMPOSTOR, method: 'get', path: 'users/friend-uid/data/main', allow: false },
  { name: 'signed out cannot', who: NOBODY, method: 'get', path: 'users/friend-uid/data/main', allow: false },
  { name: 'the friend can still read their own board', who: FRIEND, method: 'get', path: 'users/friend-uid/data/main', allow: true },
  { name: 'the friend can still write their own board', who: FRIEND, method: 'update', path: 'users/friend-uid/data/main', data: { backlogTasks: [] }, allow: true },

  // ── Read-only, and only the board. ──
  { name: 'the admin cannot write the friend\'s board', who: ADMIN, method: 'update', path: 'users/friend-uid/data/main', data: { backlogTasks: [] }, allow: false },
  { name: 'the admin cannot create in the friend\'s board', who: ADMIN, method: 'create', path: 'users/friend-uid/data/main', data: { backlogTasks: [] }, allow: false },
  { name: 'the admin cannot delete the friend\'s board', who: ADMIN, method: 'delete', path: 'users/friend-uid/data/main', allow: false },
  { name: 'the admin cannot read the friend\'s saved Gemini keys', who: ADMIN, method: 'get', path: 'users/friend-uid/settings/agentKeys', allow: false },
  { name: 'the admin cannot read the friend\'s Trash', who: ADMIN, method: 'get', path: 'users/friend-uid/data/trash', allow: false },
  { name: 'the admin cannot read the friend\'s devices', who: ADMIN, method: 'get', path: 'users/friend-uid/pushSubscriptions/abc', allow: false },

  // ── The switches: only he sets them. ──
  { name: 'the friend cannot put themselves on his key', who: FRIEND, method: 'create', path: 'accountAccess/friend-uid', data: access, allow: false },
  { name: 'the friend cannot update their own switches', who: FRIEND, method: 'update', path: 'accountAccess/friend-uid', data: access, allow: false },
  { name: 'his email, unverified, cannot set a switch', who: IMPOSTOR, method: 'create', path: 'accountAccess/impostor-uid', data: access, allow: false },
  { name: 'the friend can read their own switches', who: FRIEND, method: 'get', path: 'accountAccess/friend-uid', allow: true },
  { name: 'the friend cannot read another account\'s switches', who: FRIEND, method: 'get', path: 'accountAccess/stranger-uid', allow: false },
  { name: 'the friend cannot list everyone\'s switches', who: FRIEND, method: 'list', path: 'accountAccess/stranger-uid', allow: false },
  { name: 'the admin can set a friend\'s switches', who: ADMIN, method: 'create', path: 'accountAccess/friend-uid', data: access, allow: true },
  { name: 'the admin can list everyone\'s switches', who: ADMIN, method: 'list', path: 'accountAccess/friend-uid', allow: true },
  { name: 'the admin cannot add another field', who: ADMIN, method: 'update', path: 'accountAccess/friend-uid', data: { ...access, role: 'admin' }, allow: false },
  { name: 'the admin cannot store a non-boolean', who: ADMIN, method: 'update', path: 'accountAccess/friend-uid', data: { assistant: 'yes', ownerKey: true }, allow: false },

  // ── The turn counts: his to read, nobody's to write. ──
  { name: 'the friend cannot read their own count', who: FRIEND, method: 'get', path: 'keyUsage/friend-uid', allow: false },
  { name: 'the friend cannot write a count', who: FRIEND, method: 'create', path: 'keyUsage/friend-uid', data: { total: 0 }, allow: false },
  { name: 'the admin can read counts', who: ADMIN, method: 'list', path: 'keyUsage/friend-uid', allow: true },
  { name: 'the admin cannot write a count', who: ADMIN, method: 'update', path: 'keyUsage/friend-uid', data: { total: 0 }, allow: false },

  // ── What was already there still holds. ──
  { name: 'nobody reads a Google refresh token, not even him', who: ADMIN, method: 'get', path: 'googleTokens/friend-uid', allow: false },
  { name: 'a public share is still public', who: NOBODY, method: 'get', path: 'publicShares/abc', allow: true },
];

function authOf(who: Who) {
  if (!who) return null;
  return { uid: who.uid, token: { email: who.email, email_verified: who.verified } };
}

function testCase(c: Case) {
  const request: Record<string, unknown> = {
    auth: authOf(c.who),
    path: `${DB}/${c.path}`,
    method: c.method,
  };
  if (c.data) request.resource = { data: c.data };
  const tc: Record<string, unknown> = { expectation: c.allow ? 'ALLOW' : 'DENY', request };
  // An update or delete is of something that exists.
  if (c.method === 'update' || c.method === 'delete') tc.resource = { data: c.data ?? {} };
  return tc;
}

const token = (await cert(account as never).getAccessToken()).access_token;
const source = readFileSync(resolve(root, 'firestore.rules'), 'utf8');

const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: { files: [{ name: 'firestore.rules', content: source }] },
    testSuite: { testCases: CASES.map(testCase) },
  }),
});

const body = (await res.json()) as {
  issues?: { description: string; severity: string; sourcePosition?: { line: number } }[];
  testResults?: { state: string; debugMessages?: string[] }[];
  error?: { message: string };
};

if (!res.ok) {
  console.error(`Rules API answered ${res.status}: ${body.error?.message ?? JSON.stringify(body)}`);
  process.exit(1);
}
for (const issue of body.issues ?? []) {
  console.error(`${issue.severity} line ${issue.sourcePosition?.line ?? '?'}: ${issue.description}`);
}

let failed = 0;
CASES.forEach((c, i) => {
  const result = body.testResults?.[i];
  const ok = result?.state === 'SUCCESS';
  if (!ok) failed += 1;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${c.allow ? 'allow' : 'deny '}  ${c.name}`);
  if (!ok && result?.debugMessages?.length) console.log(`        ${result.debugMessages.join(' | ')}`);
});

console.log(`\n${CASES.length - failed}/${CASES.length} as expected`);
process.exit(failed || (body.issues ?? []).some((i) => i.severity === 'ERROR') ? 1 : 0);
