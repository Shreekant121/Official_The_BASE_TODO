/**
 * Step 4 — text-path Gemini proxy.
 *
 * Constraint C3: ephemeral tokens are served for the Live API only, so the
 * text path cannot hand the browser a short-lived credential of its own. The
 * real `GEMINI_API_KEY` therefore has to stay on a server, and every text
 * request goes through here (decision D8).
 *
 * This function is deliberately stateless and dumb. It holds no conversation,
 * no history, no tool registry and no system prompt: the browser owns the
 * agent loop (`src/lib/agent/core.ts`), executes tools locally against the
 * Zustand store, and sends the whole conversation on every call. All this does
 * is attach the key, forward the request, and stream the answer back verbatim
 * — including `usageMetadata`, which was a stated reason for going direct
 * rather than through Firebase AI Logic (decision D7).
 *
 * Auth is `authorizeKeySpend` (BUILD-6, `server/keyAccess.ts`): a verified
 * Firebase ID token, and either the owner's or one he switched onto his key
 * from the admin screen. `ALLOWED_UID` is no longer read. Every request that
 * reaches Gemini is counted at `keyUsage/{uid}` for that screen.
 *
 * Required Vercel env vars:
 *   GEMINI_API_KEY           — Gemini Developer API key (server-side ONLY)
 *   FIREBASE_SERVICE_ACCOUNT — service-account JSON (string) for token verification
 *
 * Docs: https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeKeySpend, recordKeyTurn } from './_lib/keyAccess.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Model ids are chosen in `src/lib/agent/constants.ts` (constraint C4 keeps
 * them in one place so a preview shutdown is a one-line change), so this is
 * not an allowlist — it only keeps the caller from smuggling anything into the
 * request path.
 */
const SAFE_MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,63}$/i;

interface ChatRequestBody {
  model?: unknown;
  systemInstruction?: unknown;
  contents?: unknown;
  tools?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // 1) Who is calling, and may they spend this key? (BUILD-6 — the owner, or
  //    an account he switched onto it. `server/keyAccess.ts` holds the rule.)
  const caller = await authorizeKeySpend(req.headers.authorization);
  // `in`, not `!caller.ok`: Vercel type-checks without strict mode, where a
  // boolean discriminant does not narrow.
  if ('error' in caller) {
    return res.status(caller.status).json({ error: caller.error, ...(caller.detail ? { detail: caller.detail } : {}) });
  }

  // 2) Validate the request shape. Everything else is passed through as sent —
  //    the browser owns the prompt and the tool declarations, not this file.
  const body = (typeof req.body === 'string' ? safeParse(req.body) : req.body) as ChatRequestBody | null;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'invalid_body', detail: 'expected a JSON object' });
  }

  const { model, systemInstruction, contents, tools } = body;
  if (typeof model !== 'string' || !SAFE_MODEL_ID.test(model)) {
    return res.status(400).json({ error: 'invalid_model' });
  }
  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'invalid_contents', detail: 'contents must be a non-empty array' });
  }
  if (systemInstruction !== undefined && typeof systemInstruction !== 'string') {
    return res.status(400).json({ error: 'invalid_system_instruction', detail: 'expected a string' });
  }
  if (tools !== undefined && !Array.isArray(tools)) {
    return res.status(400).json({ error: 'invalid_tools', detail: 'expected an array of function declarations' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'not_configured' });
  }

  // 3) Forward to Gemini and stream the SSE response straight back.
  const upstreamBody = {
    contents,
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    ...(Array.isArray(tools) && tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
  };

  // A browser that navigates away mid-turn should stop the upstream call
  // rather than leave it billing until it finishes on its own. Watched on the
  // response, not the request: `req` emits `close` as soon as its body has
  // been read, which is long before the answer has finished streaming.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  let upstream: Response;
  try {
    upstream = await fetch(`${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(upstreamBody),
      signal: abort.signal,
    });
  } catch (err) {
    if (abort.signal.aborted) return res.end();
    return res.status(502).json({
      error: 'gemini_unreachable',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  if (!upstream.ok || !upstream.body) {
    // Surface Gemini's own message — a bad model id, a quota wall and a
    // malformed tool declaration all land here and each needs a different fix.
    const detail = await upstream.text().catch(() => '');
    return res.status(upstream.status === 429 ? 429 : 502).json({
      error: 'gemini_request_failed',
      status: upstream.status,
      detail: detail.slice(0, 2000),
    });
  }

  // Counted once Gemini has accepted the request, and awaited below rather
  // than here: the handler's promise is what keeps the function alive.
  const counted = recordKeyTurn(caller.uid);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    // Without this some proxies buffer the whole response and the stream
    // arrives as one lump, which defeats the point of streaming.
    'X-Accel-Buffering': 'no',
  });

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
  } catch {
    // The socket died mid-stream (client navigated away, upstream reset).
    // There is no way to report it in-band; the client sees a truncated
    // stream and treats it as a failed turn.
  } finally {
    res.end();
    await counted;
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
