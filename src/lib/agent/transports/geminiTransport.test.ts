import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGeminiTransport } from './geminiTransport';
import type { AgentMessage, ToolDeclaration } from '../types';

/**
 * The wire half of the Gemini adapter (item 5).
 *
 * `providers/gemini.test.ts` pins the translation; this pins the envelope the
 * two routes actually post — the proxy's, which `api/chat.ts` parses field by
 * field, and the direct one the browser builds when the user has a key of
 * their own. Both bodies are asserted whole, because the point of the item is
 * that moving the seam changed nothing Gemini can see.
 *
 * The last test is the one worth having: it plays a signed turn back through
 * the loop the way `core.ts` does, and checks the signature reaches Google on
 * the *second* request. That is the failure the abstraction could have
 * introduced, and it is invisible on the first.
 */

const TOOLS: ToolDeclaration[] = [
  {
    name: 'list_today',
    description: 'Read the focus queue.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

const HISTORY: AgentMessage[] = [{ role: 'user', parts: [{ type: 'text', text: 'What am I doing today?' }] }];

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** One SSE frame per chunk, CRLF-separated exactly as Gemini sends them. */
function sseResponse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\r\n\r\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function captureFetch(chunks: unknown[]): Sent[] {
  const sent: Sent[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
    sent.push({
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return Promise.resolve(sseResponse(chunks));
  });
  return sent;
}

const ANSWER = [
  { candidates: [{ content: { role: 'model', parts: [{ text: 'Two things.' }] } }] },
  {
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 12, totalTokenCount: 912 },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the proxy route', () => {
  it('posts the envelope api/chat.ts expects, with the id token attached', async () => {
    const sent = captureFetch(ANSWER);
    const transport = createGeminiTransport({ endpoint: '/api/chat', getIdToken: async () => 'id-token' });

    await transport.send({
      model: 'gemini-flash-latest',
      systemPrompt: 'You are the assistant.',
      messages: HISTORY,
      tools: TOOLS,
    });

    expect(sent[0].url).toBe('/api/chat');
    expect(sent[0].headers.Authorization).toBe('Bearer id-token');
    expect(sent[0].body).toStrictEqual({
      model: 'gemini-flash-latest',
      // A bare string here, not a `Content` — the proxy wraps it.
      systemInstruction: 'You are the assistant.',
      contents: [{ role: 'user', parts: [{ text: 'What am I doing today?' }] }],
      tools: [{ name: 'list_today', description: 'Read the focus queue.', parameters: { type: 'OBJECT', properties: {}, required: [] } }],
    });
  });

  it('omits tools entirely on the loop’s forced final answer', async () => {
    const sent = captureFetch(ANSWER);
    const transport = createGeminiTransport({ endpoint: '/api/chat', getIdToken: async () => 'id-token' });

    await transport.send({ model: 'gemini-flash-latest', systemPrompt: '', messages: HISTORY, tools: [] });

    expect('tools' in sent[0].body).toBe(false);
  });

  it('returns the answer, the usage and a replayable message', async () => {
    captureFetch(ANSWER);
    const transport = createGeminiTransport({ endpoint: '/api/chat', getIdToken: async () => 'id-token' });

    const response = await transport.send({
      model: 'gemini-flash-latest',
      systemPrompt: '',
      messages: HISTORY,
      tools: TOOLS,
    });

    expect(response.text).toBe('Two things.');
    expect(response.toolCalls).toStrictEqual([]);
    expect(response.finishReason).toBe('STOP');
    expect(response.usage).toStrictEqual({
      promptTokens: 900,
      responseTokens: 12,
      thoughtsTokens: 0,
      totalTokens: 912,
      requests: 1,
    });
    expect(response.message.role).toBe('assistant');
    expect(response.message.parts).toStrictEqual([{ type: 'text', text: 'Two things.' }]);
  });
});

describe('the direct route', () => {
  it('builds the envelope the proxy would have built, and sends the user’s key', async () => {
    const sent = captureFetch(ANSWER);
    const transport = createGeminiTransport({ getApiKey: () => 'user-key' });

    await transport.send({
      model: 'gemini-flash-latest',
      systemPrompt: 'You are the assistant.',
      messages: HISTORY,
      tools: TOOLS,
    });

    expect(sent[0].url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse',
    );
    expect(sent[0].headers['x-goog-api-key']).toBe('user-key');
    expect(sent[0].body).toStrictEqual({
      contents: [{ role: 'user', parts: [{ text: 'What am I doing today?' }] }],
      systemInstruction: { parts: [{ text: 'You are the assistant.' }] },
      tools: [
        {
          functionDeclarations: [
            { name: 'list_today', description: 'Read the focus queue.', parameters: { type: 'OBJECT', properties: {}, required: [] } },
          ],
        },
      ],
    });
  });
});

describe('a signed turn, all the way round', () => {
  it('sends the thoughtSignature back on the next request, unaltered', async () => {
    const sent = captureFetch([
      {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                { text: 'Checking.', thoughtSignature: 'sig-abc' },
                { functionCall: { id: 'call-1', name: 'list_today', args: {} } },
              ],
            },
          },
        ],
      },
      { candidates: [{ finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 40 } },
    ]);
    const transport = createGeminiTransport({ endpoint: '/api/chat', getIdToken: async () => 'id-token' });

    const first = await transport.send({
      model: 'gemini-flash-latest',
      systemPrompt: '',
      messages: HISTORY,
      tools: TOOLS,
    });
    expect(first.toolCalls).toStrictEqual([{ id: 'call-1', name: 'list_today', args: {} }]);

    // What `core.ts` does next: append the model's turn and the tool results,
    // then send the whole thing again.
    await transport.send({
      model: 'gemini-flash-latest',
      systemPrompt: '',
      messages: [
        ...HISTORY,
        first.message,
        { role: 'tool', parts: [{ type: 'tool_result', id: 'call-1', name: 'list_today', result: { ok: true, summary: 'Two.' } }] },
      ],
      tools: TOOLS,
    });

    expect(sent[1].body.contents).toStrictEqual([
      { role: 'user', parts: [{ text: 'What am I doing today?' }] },
      {
        role: 'model',
        parts: [
          { text: 'Checking.', thoughtSignature: 'sig-abc' },
          { functionCall: { id: 'call-1', name: 'list_today', args: {} } },
        ],
      },
      { role: 'user', parts: [{ functionResponse: { id: 'call-1', name: 'list_today', response: { ok: true, summary: 'Two.' } } }] },
    ]);
  });
});
