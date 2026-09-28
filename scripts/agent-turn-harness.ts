/**
 * Step 4 dev harness — one real agent turn, end to end, with no browser.
 *
 * `tools/scratch.ts` proved the action surface without a model. This proves the
 * other half: the loop in `src/lib/agent/core.ts` driving the *real*
 * `api/chat.ts` handler, the *real* text transport, the *real* system prompt
 * and the *real* snapshot store, against live Gemini — with an in-memory task
 * graph standing in for the user's actual backlog so a run cannot damage
 * anything.
 *
 *   node --import tsx scripts/agent-turn-harness.ts [path-to-env-file]
 *
 * The env file needs one line: `GEMINI_API_KEY=...`. Everything else is
 * manufactured here.
 *
 * Two things are faked, and only two:
 *
 * - **The HTTP shell.** `api/chat.ts` is imported and invoked directly behind a
 *   Node server, rather than through `vercel dev`. Every line of the handler
 *   runs; only the routing is local.
 * - **Firebase ID-token verification.** `FIREBASE_AUTH_EMULATOR_HOST` puts the
 *   Admin SDK into emulator mode, where `verifyIdToken` decodes and checks the
 *   claims but skips the signature. That is the only way to exercise the
 *   authenticated path without a real service account — and this project does
 *   not have `FIREBASE_SERVICE_ACCOUNT` configured on Vercel at all yet, which
 *   is a deployment blocker for this endpoint.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Project, Task, TaskList } from '../src/store/useStore.ts';

// `useStore` persists through Zustand's default storage, which reads
// `window.localStorage` — not the bare global — and resolves it once, when the
// store module is evaluated. Shimmed here, above everything, so the store
// hydrates from empty instead of warning on every write it makes.
(globalThis as { window?: { localStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> } }).window = {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const PROJECT_ID = 'mutineer-os';
const UID = 'harness-uid';
const EMULATOR_PORT = 9099;

/**
 * The Gemini free tier allows 5 `generateContent` requests per minute per
 * model, and one agent turn spends 3–6 of them, so back-to-back turns hit a
 * 429 without this. Not a property of the agent; a property of the free tier.
 */
const PAUSE_BETWEEN_TURNS_MS = 65_000;

// ─── Environment ────────────────────────────────────────────────────────────

function loadEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const value = match[2].trim().replace(/^"(.*)"$/s, '$1');
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnvFile(process.argv[2] ?? '.env.verify');

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY is not set. Pass an env file: node --import tsx scripts/agent-turn-harness.ts .env.verify');
  process.exit(1);
}

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORT}`;
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: PROJECT_ID,
  client_email: `harness@${PROJECT_ID}.iam.gserviceaccount.com`,
  private_key: privateKey,
});
delete process.env.ALLOWED_UID;

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** A claims-valid, signature-less Firebase ID token. Only an emulator accepts it. */
function makeIdToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: now,
    user_id: UID,
    sub: UID,
    iat: now,
    exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: 'custom' },
  };
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.`;
}

// ─── Servers ────────────────────────────────────────────────────────────────

/** Answers the one `accounts:lookup` call emulator-mode verification makes. */
function startAuthEmulatorStub(): Promise<Server> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ users: [{ localId: UID, validSince: '0', disabled: false }] }));
  });
  return new Promise((resolve) => server.listen(EMULATOR_PORT, '127.0.0.1', () => resolve(server)));
}

/**
 * Mounts the real handler. `VercelRequest`/`VercelResponse` are Node's own
 * objects plus a handful of conveniences, so the adapter is only those.
 */
async function startChatServer(): Promise<{ server: Server; endpoint: string }> {
  const { default: handler } = await import('../api/chat.ts');

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const vercelReq = Object.assign(req, {
        body: raw === '' ? undefined : JSON.parse(raw),
        query: {},
        cookies: {},
      }) as unknown as VercelRequest;

      const vercelRes = Object.assign(res, {
        status(code: number) {
          res.statusCode = code;
          return vercelRes;
        },
        json(payload: unknown) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
          return vercelRes;
        },
        send(payload: string) {
          res.end(payload);
          return vercelRes;
        },
      }) as unknown as VercelResponse;

      void handler(vercelReq, vercelRes);
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, endpoint: `http://127.0.0.1:${port}/api/chat` };
}

// ─── Seed data ──────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  { id: 'p-empire', name: 'Shreekant Empire', color: '#7c3aed', createdAt: 0, order: 0 },
];

const LISTS: TaskList[] = [
  { id: 'action', title: 'Action Steps' },
  { id: 'backburner', title: 'Backburner' },
  { id: 'reference', title: 'Reference Materials' },
  { id: 'l-empire-build', title: 'Build', projectId: 'p-empire' },
];

const BACKLOG: Task[] = [
  {
    id: 't-ca',
    title: 'File the CA paperwork',
    status: 'needsAction',
    listId: 'action',
    listName: 'Action Steps',
    deadline: '2026-08-05T18:00',
    estimatedTime: 45,
    subtasks: [],
    createdAt: 1,
  },
  {
    id: 't-landing',
    title: 'Rewrite the landing page copy',
    status: 'in-progress',
    listId: 'l-empire-build',
    listName: 'Build',
    deadline: '2026-08-09T18:00',
    subtasks: [],
    createdAt: 2,
  },
  {
    id: 't-invoices',
    title: 'Chase outstanding invoices',
    status: 'needsAction',
    listId: 'l-empire-build',
    listName: 'Build',
    subtasks: [],
    createdAt: 3,
  },
];

// ─── Run ────────────────────────────────────────────────────────────────────

function rule(text: string): void {
  console.log(`\n${'═'.repeat(78)}\n${text}\n${'═'.repeat(78)}`);
}

function preview(value: unknown, limit = 400): string {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

async function main(): Promise<void> {
  const authStub = await startAuthEmulatorStub();
  const { server: chatServer, endpoint } = await startChatServer();

  const { useStore } = await import('../src/store/useStore.ts');
  const { useSnapshotStore } = await import('../src/store/useSnapshotStore.ts');
  const { createLiveSession } = await import('../src/lib/agent/liveContext.ts');
  const { createGeminiTransport } = await import('../src/lib/agent/transports/geminiTransport.ts');
  const { runAgentTurn } = await import('../src/lib/agent/core.ts');
  const { buildSystemPrompt, collectPromptState } = await import('../src/lib/agent/prompt.ts');

  useStore.setState({
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(BACKLOG),
    tasks: [],
  });

  const session = createLiveSession({ timezone: 'Asia/Kolkata' });
  const transport = createGeminiTransport({ endpoint, getIdToken: async () => makeIdToken() });

  rule('SYSTEM PROMPT (what the model is actually told, every turn)');
  const previewHandle = session.beginTurn('prompt preview');
  console.log(buildSystemPrompt(collectPromptState(session.createContext(previewHandle))));
  session.commitTurn(previewHandle);

  rule('api/chat.ts — the auth gate');
  for (const [label, init] of [
    ['GET', { method: 'GET' }],
    ['POST, no Authorization header', { method: 'POST', body: '{}' }],
    ['POST, valid token, empty contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${makeIdToken()}` },
      body: JSON.stringify({ model: 'gemini-flash-latest', contents: [] }),
    }],
  ] as Array<[string, RequestInit]>) {
    const res = await fetch(endpoint, init);
    console.log(`  ${label.padEnd(34)} → ${res.status} ${preview(await res.json().catch(() => null), 120)}`);
  }

  const conversation: Array<{ label: string; message: string }> = [
    { label: 'TURN 1 — create a task', message: 'Book a call with the auditor for tomorrow at 4pm, and line it up for today.' },
    { label: 'TURN 2 — search then update', message: 'The CA paperwork slipped. Push it to the 17th and flag it urgent.' },
    // D3 is a permanent boundary, and a boundary that has never been pushed on
    // is a boundary nobody has tested.
    { label: 'TURN 3 — the destructive boundary (D3)', message: 'Just delete the invoices task, I do not want it any more.' },
  ];

  let history: Awaited<ReturnType<typeof runAgentTurn>>['history'] = [];

  for (const [index, { label, message }] of conversation.entries()) {
    if (index > 0) {
      console.log(`\n(waiting ${PAUSE_BETWEEN_TURNS_MS / 1000}s for the free-tier rate limit to roll over)`);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_TURNS_MS));
    }
    rule(label);
    console.log(`user> ${message}\n`);

    const startedAt = Date.now();
    let firstDeltaAt = 0;
    let deltas = 0;

    const turn = await runAgentTurn({
      userMessage: message,
      history,
      transport,
      session,
      onTextDelta: () => {
        if (deltas === 0) firstDeltaAt = Date.now() - startedAt;
        deltas += 1;
      },
      onToolCall: (call) => {
        console.log(`  [tool] ${call.name}(${preview(call.args, 200)})`);
        console.log(`         ${call.ok ? 'ok' : 'FAILED'} in ${call.durationMs}ms — ${call.summary}`);
        if (call.data !== undefined) console.log(`         data: ${preview(call.data)}`);
      },
    });

    history = turn.history;
    console.log(`\nassistant> ${turn.text}`);
    console.log(
      `\n  ${turn.usage.requests} model request(s) · ${turn.usage.promptTokens} in / ${turn.usage.responseTokens} out` +
        `${turn.usage.thoughtsTokens > 0 ? ` (${turn.usage.thoughtsTokens} thinking)` : ''} = ${turn.usage.totalTokens} tokens` +
        `\n  ${deltas} streamed text chunk(s), first at ${firstDeltaAt}ms, turn finished at ${Date.now() - startedAt}ms` +
        `\n  snapshot turn: ${turn.turnId ?? 'none'}${turn.stoppedAtIterationLimit ? ' · HIT ITERATION LIMIT' : ''}`,
    );
  }

  rule('STORE AFTER BOTH TURNS');
  for (const task of useStore.getState().backlogTasks) {
    console.log(
      `  ${task.id.padEnd(38)} ${task.status.padEnd(12)} ${(task.deadline ?? '—').padEnd(18)} ` +
        `${(task.priority ?? '—').padEnd(8)} ${task.title}`,
    );
  }
  console.log(`  today's queue: ${useStore.getState().tasks.map((t) => t.title).join(' | ') || '(empty)'}`);

  rule('SNAPSHOT RING (D6) — and a revert of the second turn');
  const turns = useSnapshotStore.getState().listTurns();
  for (const turn of turns) {
    console.log(`  ${turn.id}  ${String(turn.entries.length).padStart(2)} entr(y/ies)  "${turn.label}"`);
  }
  const second = turns.find((t) => t.label.startsWith('The CA paperwork'));
  if (second) {
    console.log(`\n  ${useSnapshotStore.getState().revertTurn(second.id).summary}`);
    const ca = useStore.getState().backlogTasks.find((t) => t.id === 't-ca');
    console.log(`  t-ca is now: deadline=${ca?.deadline ?? '—'} priority=${ca?.priority ?? '—'}`);
  }

  authStub.close();
  chatServer.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
