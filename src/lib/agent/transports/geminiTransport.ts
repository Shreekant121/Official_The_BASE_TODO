import { CHAT_ENDPOINT, GEMINI_API_BASE } from '../constants';
import { AgentTransportError } from './errors';
export { AgentTransportError } from './errors';
import { readSseStream } from './sse';
import {
  toAgentMessage,
  toGeminiContents,
  toGeminiDeclarations,
  toTokenUsage,
  type GeminiFunctionDeclaration,
  type GeminiContent,
  type GeminiPart,
  type GeminiUsageMetadata,
} from '../providers/gemini';
import type {
  AgentTransport,
  ToolCall,
  TokenUsage,
  TransportEvents,
  TransportRequest,
  TransportResponse,
} from '../types';

/**
 * The Gemini text transport: one round trip of the agent loop, over HTTP.
 *
 * It posts the whole conversation to `api/chat.ts` with the caller's Firebase
 * ID token — the same credential `calendarBackend.ts` sends — and reads back
 * Gemini's SSE stream. It holds no state between calls; `core.ts` owns the
 * conversation and the tool loop, and this file owns nothing but the wire.
 *
 * With `providers/gemini.ts` it makes up the whole Gemini adapter: the pure
 * translation lives there, and everything Gemini-shaped that is left — the two
 * request envelopes, the stream chunk, the error messages — lives here.
 * `core.ts` hands it neutral messages and gets a neutral message back.
 *
 * `getApiKey` switches it to a second route: when the user has added a key of
 * their own (`lib/agent/apiKeys.ts`), the browser calls Gemini directly and the
 * proxy is not involved. The proxy stays the default, and the two routes differ
 * only in URL, credential and request envelope — the response is the same SSE
 * stream either way, read by the same code below.
 *
 * Streaming is not decoration. A turn that searches, updates and then explains
 * itself can take several seconds, and the answer text of the final round trip
 * is worth showing as it arrives rather than after. `onTextDelta` fires per
 * chunk; the resolved `TransportResponse` is the same content assembled.
 */

// ─── What Gemini sends back ─────────────────────────────────────────────────

interface WireChunk {
  candidates?: Array<{
    content?: { role?: string; parts?: GeminiPart[] };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

interface ErrorBody {
  error?: string;
  detail?: string;
  status?: number;
}

/**
 * Turns a non-streaming response into an error worth reading. The endpoint's
 * failure modes are each actionable and each different, so they do not get
 * collapsed into "request failed".
 */
async function describeFailure(res: Response): Promise<AgentTransportError> {
  const contentType = res.headers.get('content-type') ?? '';

  // Plain `vite` dev has no serverless runtime, so `/api/chat` falls through to
  // the SPA's index.html with a 200. Without this the failure looks like a
  // malformed model response instead of "you are running the wrong dev server".
  if (!contentType.includes('application/json')) {
    if (res.status === 404 || contentType.includes('text/html')) {
      return new AgentTransportError(
        'The chat endpoint is not running here. Use `vercel dev` (or a deployment) — plain `vite` serves no serverless functions.',
        { status: res.status },
      );
    }
    return new AgentTransportError(`The chat endpoint returned ${res.status}.`, { status: res.status });
  }

  const body = (await res.json().catch(() => ({}))) as ErrorBody;
  const messages: Record<string, string> = {
    missing_id_token: 'Not signed in — the chat endpoint needs a Firebase ID token.',
    invalid_id_token: 'Your session has expired. Sign in again.',
    forbidden: 'This account is not allowed to use the chat endpoint.',
    // BUILD-6 — the proxy spends the owner's key, and only for accounts he
    // switched onto it.
    own_key_required: 'This account uses its own Gemini key. Add one in Settings → Connections.',
    assistant_off: 'The assistant is switched off for this account.',
    access_unreadable: 'Could not check whether this account may use the assistant. Try again in a moment.',
    not_configured: 'The server is missing GEMINI_API_KEY or FIREBASE_SERVICE_ACCOUNT.',
    gemini_unreachable: 'Could not reach Gemini.',
    gemini_request_failed: 'Gemini rejected the request.',
  };
  const message = messages[body.error ?? ''] ?? `The chat endpoint failed (${body.error ?? res.status}).`;
  return new AgentTransportError(message, { status: res.status, detail: body.detail });
}

/**
 * The direct route's failures come from Gemini itself, in its own error shape.
 * Quota is the one that matters day to day: the free tier allows 5 requests a
 * minute and 20 a day, and a single turn spends several, so 429 is a normal
 * outcome rather than an exceptional one and has to read like an instruction.
 */
async function describeDirectFailure(res: Response): Promise<AgentTransportError> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
  const detail = body?.error?.message;

  if (res.status === 429) {
    return new AgentTransportError(
      'This key is out of quota. On the free tier that is 5 requests a minute and 20 a day, and one turn spends several — switch to another key or wait it out.',
      { status: 429, detail },
    );
  }
  if (res.status === 400 && (detail ?? '').includes('API key not valid')) {
    return new AgentTransportError('That API key was rejected by Google. Check it in the key panel.', {
      status: 400,
      detail,
    });
  }
  if (res.status === 403) {
    return new AgentTransportError('Google refused this key — it may be restricted to other referrers or APIs.', {
      status: 403,
      detail,
    });
  }
  return new AgentTransportError(detail ?? `Gemini returned ${res.status}.`, { status: res.status, detail: body?.error?.status });
}

export interface GeminiTransportOptions {
  endpoint?: string;
  /** Overridable so a harness can drive the endpoint without Firebase in the picture. */
  getIdToken?: () => Promise<string>;
  /**
   * A user-supplied Gemini key, read per request so swapping one takes effect
   * on the next turn. `null` (the default) means go through the proxy.
   */
  getApiKey?: () => string | null;
}

/**
 * Imported on demand rather than at module load: `lib/firebase.ts` reads
 * `import.meta.env` and initialises an app the moment it is evaluated, which
 * makes this transport unusable outside a Vite bundle. Deferring it is what
 * lets the harness in `scripts/` drive the real endpoint with its own token.
 */
async function firebaseIdToken(): Promise<string> {
  const { auth } = await import('../../firebase');
  const user = auth.currentUser;
  if (!user) throw new AgentTransportError('Not signed in.');
  return user.getIdToken();
}

/** The neutral request, translated once per round trip. */
interface WireRequest {
  contents: GeminiContent[];
  declarations: GeminiFunctionDeclaration[];
}

export function createGeminiTransport(options: GeminiTransportOptions = {}): AgentTransport {
  const endpoint = options.endpoint ?? CHAT_ENDPOINT;
  const getIdToken = options.getIdToken ?? firebaseIdToken;
  const getApiKey = options.getApiKey ?? (() => null);

  /** Through the proxy (D8): the server attaches the key and forwards verbatim. */
  const sendViaProxy = async (
    request: TransportRequest,
    wire: WireRequest,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const idToken = await getIdToken();
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({
        model: request.model,
        systemInstruction: request.systemPrompt,
        contents: wire.contents,
        // Omitted entirely when empty: an empty `tools` array is how the
        // loop's final forced answer says "no tools this time".
        ...(wire.declarations.length > 0 ? { tools: wire.declarations } : {}),
      }),
      signal,
    });
  };

  /**
   * Straight to Gemini with the user's own key. The envelope the proxy would
   * have built has to be built here instead — `systemInstruction` as a
   * `Content`, and the declarations wrapped in a single `Tool`.
   */
  const sendDirect = async (
    request: TransportRequest,
    wire: WireRequest,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<Response> =>
    fetch(`${GEMINI_API_BASE}/models/${request.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: wire.contents,
        ...(request.systemPrompt ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } } : {}),
        ...(wire.declarations.length > 0 ? { tools: [{ functionDeclarations: wire.declarations }] } : {}),
      }),
      signal,
    });

  return {
    name: 'gemini',

    async send(request: TransportRequest, events: TransportEvents = {}): Promise<TransportResponse> {
      const wire: WireRequest = {
        contents: toGeminiContents(request.messages),
        declarations: toGeminiDeclarations(request.tools),
      };

      const apiKey = getApiKey();
      const res = apiKey
        ? await sendDirect(request, wire, apiKey, events.signal)
        : await sendViaProxy(request, wire, events.signal);

      if (!res.ok || !res.body || !(res.headers.get('content-type') ?? '').includes('text/event-stream')) {
        throw apiKey ? await describeDirectFailure(res) : await describeFailure(res);
      }

      let text = '';
      const toolCalls: ToolCall[] = [];
      /**
       * The model's turn, assembled as it streams. Built by appending the
       * parts Gemini actually sent rather than by reconstructing them at the
       * end, because `thoughtSignature` has to survive the round trip
       * untouched — drop it and the next request is rejected outright. These
       * are the parts `toAgentMessage` stows in `providerData`.
       */
      const contentParts: GeminiPart[] = [];
      let usage: TokenUsage = toTokenUsage(undefined);
      let finishReason: string | undefined;
      let blockReason: string | undefined;

      const consume = (chunk: WireChunk) => {
        if (chunk.error) {
          throw new AgentTransportError(chunk.error.message ?? 'Gemini returned an error mid-stream.', {
            status: chunk.error.code,
            detail: chunk.error.status,
          });
        }
        if (chunk.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;
        if (chunk.usageMetadata) usage = toTokenUsage(chunk.usageMetadata);

        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) finishReason = candidate.finishReason;

        for (const part of candidate?.content?.parts ?? []) {
          // Thinking parts are billed and reported but are not the answer, and
          // are neither shown to the user nor replayed as the model's turn.
          if (part.thought) continue;

          if (part.functionCall) {
            toolCalls.push({
              id: part.functionCall.id,
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            });
            contentParts.push(part);
            continue;
          }

          if (typeof part.text === 'string' && part.text !== '') {
            text += part.text;
            events.onTextDelta?.(part.text);
            // Answer text arrives split across chunks; merge it back into one
            // part, but never across a signature, which belongs to its own.
            const last = contentParts[contentParts.length - 1];
            if (last?.text !== undefined && !last.thoughtSignature && !part.thoughtSignature) {
              last.text += part.text;
            } else {
              contentParts.push({ ...part });
            }
          }
        }
      };

      await readSseStream(res.body, (payload) => consume(JSON.parse(payload) as WireChunk));

      if (contentParts.length === 0) {
        // An empty `Content` cannot go into history — the next request would be
        // rejected — so this has to fail here, where the reason is still known.
        throw new AgentTransportError(
          blockReason
            ? `Gemini blocked the response (${blockReason}).`
            : `Gemini returned nothing usable${finishReason ? ` (finish reason: ${finishReason})` : ''}.`,
        );
      }

      return { text, toolCalls, message: toAgentMessage(contentParts), usage, finishReason };
    },
  };
}
