import { describe, expect, it } from 'vitest';
import {
  toAgentMessage,
  toGeminiContents,
  toGeminiDeclarations,
  toTokenUsage,
  type GeminiPart,
} from './gemini';
import type { AgentMessage, ToolDeclaration } from '../types';

/**
 * The translation half of the Gemini adapter (item 5).
 *
 * `core.ts` and the tool layer stopped speaking Gemini; this file is what
 * makes that safe. The claim under test is not "the adapter works" but the
 * stronger one the item asks for — that the JSON Gemini receives is the same
 * JSON it received when the loop built it inline. So the expectations below
 * are written as the literal wire shapes, not as round trips through the code
 * that produced them.
 *
 * The one that would break the app silently is `thoughtSignature`: Gemini
 * rejects the whole conversation if a signature it issued does not come back
 * unaltered, and a conversation only fails on the *second* request, after the
 * first has already looked fine.
 */

const SIGNED_TURN: GeminiPart[] = [
  { text: 'Let me look that up.', thoughtSignature: 'sig-abc' },
  { functionCall: { id: 'call-1', name: 'search_tasks', args: { query: 'CA paperwork' } }, thoughtSignature: 'sig-def' },
];

describe('tool declarations', () => {
  it('uppercases JSON Schema into Gemini’s dialect, nested types included', () => {
    const tools: ToolDeclaration[] = [
      {
        name: 'create_task',
        description: 'Create one task.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The task itself.' },
            priority: { type: 'string', enum: ['low', 'urgent'] },
            tags: { type: 'array', items: { type: 'string' } },
            estimatedTime: { type: 'integer' },
            valueINR: { type: 'number' },
            urgent: { type: 'boolean' },
          },
          required: ['title'],
        },
      },
    ];

    expect(toGeminiDeclarations(tools)).toStrictEqual([
      {
        name: 'create_task',
        description: 'Create one task.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'The task itself.' },
            priority: { type: 'STRING', enum: ['low', 'urgent'] },
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
            estimatedTime: { type: 'INTEGER' },
            valueINR: { type: 'NUMBER' },
            urgent: { type: 'BOOLEAN' },
          },
          required: ['title'],
        },
      },
    ]);
  });

  it('leaves keys the schema did not set absent rather than undefined', () => {
    const [declaration] = toGeminiDeclarations([
      { name: 'list_today', description: 'Read the queue.', parameters: { type: 'object', properties: {}, required: [] } },
    ]);
    expect(Object.keys(declaration.parameters)).toStrictEqual(['type', 'properties', 'required']);
  });
});

describe('messages, neutral → Gemini', () => {
  it('maps the three roles onto the two Gemini has', () => {
    const history: AgentMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: 'Where is the CA task?' }] },
      toAgentMessage(SIGNED_TURN),
      {
        role: 'tool',
        parts: [
          { type: 'tool_result', id: 'call-1', name: 'search_tasks', result: { ok: true, summary: 'Found 1 task.' } },
        ],
      },
    ];

    expect(toGeminiContents(history)).toStrictEqual([
      { role: 'user', parts: [{ text: 'Where is the CA task?' }] },
      { role: 'model', parts: SIGNED_TURN },
      // A tool result is a `user` turn to Gemini — it has no third role.
      {
        role: 'user',
        parts: [{ functionResponse: { id: 'call-1', name: 'search_tasks', response: { ok: true, summary: 'Found 1 task.' } } }],
      },
    ]);
  });

  it('replays a Gemini turn verbatim, thoughtSignature and all', () => {
    const assistant = toAgentMessage(SIGNED_TURN);
    // Not just "a signature is somewhere in there": the parts have to come
    // back as the exact objects Gemini sent, in order.
    expect(toGeminiContents([assistant])[0].parts).toStrictEqual(SIGNED_TURN);
    expect(JSON.stringify(toGeminiContents([assistant]))).toContain('"thoughtSignature":"sig-abc"');
  });

  it('rebuilds from parts when the turn came from another provider', () => {
    // Item 6 puts a second provider behind this seam, and a conversation that
    // switches mid-session must not replay a shape Gemini cannot read.
    const fromElsewhere: AgentMessage = {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Done.' }],
      providerData: { provider: 'ollama', raw: { message: { role: 'assistant', content: 'Done.' } } },
    };
    expect(toGeminiContents([fromElsewhere])).toStrictEqual([{ role: 'model', parts: [{ text: 'Done.' }] }]);
  });

  it('drops an absent call id on the wire rather than sending null', () => {
    const message: AgentMessage = {
      role: 'tool',
      parts: [{ type: 'tool_result', name: 'list_today', result: { ok: true, summary: 'Empty.' } }],
    };
    expect(JSON.stringify(toGeminiContents([message]))).toBe(
      '[{"role":"user","parts":[{"functionResponse":{"name":"list_today","response":{"ok":true,"summary":"Empty."}}}]}]',
    );
  });
});

describe('messages, Gemini → neutral', () => {
  it('reads text and calls out of the parts and stamps the provider', () => {
    const message = toAgentMessage(SIGNED_TURN);

    expect(message.role).toBe('assistant');
    expect(message.parts).toStrictEqual([
      { type: 'text', text: 'Let me look that up.' },
      { type: 'tool_call', id: 'call-1', name: 'search_tasks', args: { query: 'CA paperwork' } },
    ]);
    expect(message.providerData?.provider).toBe('gemini');
  });

  it('keeps a signature-only part travelling even though it reads as nothing', () => {
    const parts: GeminiPart[] = [{ thoughtSignature: 'sig-lonely' }];
    const message = toAgentMessage(parts);
    expect(message.parts).toStrictEqual([]);
    expect(toGeminiContents([message])[0].parts).toStrictEqual(parts);
  });
});

describe('usage', () => {
  it('counts one request even when the metadata never arrived', () => {
    expect(toTokenUsage(undefined)).toStrictEqual({
      promptTokens: 0,
      responseTokens: 0,
      thoughtsTokens: 0,
      totalTokens: 0,
      requests: 1,
    });
  });

  it('renames Gemini’s counters onto the neutral ones', () => {
    expect(
      toTokenUsage({ promptTokenCount: 1200, candidatesTokenCount: 80, thoughtsTokenCount: 340, totalTokenCount: 1620 }),
    ).toStrictEqual({
      promptTokens: 1200,
      responseTokens: 80,
      thoughtsTokens: 340,
      totalTokens: 1620,
      requests: 1,
    });
  });
});
