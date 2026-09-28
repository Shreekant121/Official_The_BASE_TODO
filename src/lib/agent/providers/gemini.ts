import type {
  AgentMessage,
  JsonSchema,
  JsonSchemaType,
  MessagePart,
  TokenUsage,
  ToolDeclaration,
} from '../types';

/**
 * The Gemini adapter: everything in the app that knows what Gemini's wire
 * format looks like, apart from the HTTP and SSE in
 * `transports/geminiTransport.ts`.
 *
 * `core.ts` and the tool layer speak the neutral shapes in `types.ts`. This
 * file translates them into Gemini's `Content`/`Part`/`Schema` on the way out
 * and back into neutral messages on the way in. Nothing here does I/O, so the
 * translation is testable on its own — which is what
 * `providers/gemini.test.ts` does, byte for byte against the envelope the
 * transport used to build inline.
 *
 * The shapes below mirror `@google/genai`'s by value but not by nominal type:
 * the SDK types `Schema.type` as a string *enum*, which a plain string literal
 * is never assignable to. Declaring them locally keeps the tool layer
 * dependency-free (and out of the browser bundle's SDK graph). The JSON on the
 * wire is identical.
 */

/** Stamped on every message this adapter produces; checked before one is replayed. */
export const GEMINI_PROVIDER = 'gemini';

// ─── Gemini wire shapes ─────────────────────────────────────────────────────

export type GeminiSchemaType = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export interface GeminiSchema {
  type: GeminiSchemaType;
  description?: string;
  enum?: string[];
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: GeminiSchema;
}

export interface GeminiFunctionCall {
  /** Present when the model parallel-calls; echoed back on the response so they pair up. */
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
  /** True on a thinking part. Never shown to the user and never counted as answer text. */
  thought?: boolean;
  /**
   * An opaque token the model attaches to the parts it produced while
   * reasoning. It has to come back unaltered on the next request or the API
   * rejects the whole conversation — see `ProviderData` in `types.ts` for how
   * it survives the trip through the neutral layer.
   */
  thoughtSignature?: string;
}

/** Function responses go back as `role: 'user'` — the API has only two roles. */
export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
}

// ─── Neutral → Gemini ───────────────────────────────────────────────────────

const SCHEMA_TYPES: Record<JsonSchemaType, GeminiSchemaType> = {
  string: 'STRING',
  number: 'NUMBER',
  integer: 'INTEGER',
  boolean: 'BOOLEAN',
  array: 'ARRAY',
  object: 'OBJECT',
};

/** JSON Schema as written, in Gemini's uppercase dialect. Optional keys stay absent. */
export function toGeminiSchema(schema: JsonSchema): GeminiSchema {
  return {
    type: SCHEMA_TYPES[schema.type],
    ...(schema.description !== undefined ? { description: schema.description } : {}),
    ...(schema.enum !== undefined ? { enum: schema.enum } : {}),
    ...(schema.items !== undefined ? { items: toGeminiSchema(schema.items) } : {}),
    ...(schema.properties !== undefined
      ? {
          properties: Object.fromEntries(
            Object.entries(schema.properties).map(([key, value]) => [key, toGeminiSchema(value)]),
          ),
        }
      : {}),
    ...(schema.required !== undefined ? { required: schema.required } : {}),
  };
}

/** What goes into a request's `tools[].functionDeclarations`. */
export function toGeminiDeclarations(tools: ToolDeclaration[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiSchema(tool.parameters),
  }));
}

/**
 * One part, or `null` for a part Gemini must not be sent.
 *
 * ITEM 12: A LOCAL MODEL'S REASONING IS DROPPED HERE, AND THE COMPILER FOUND
 * THIS RATHER THAN A PERSON
 * ---------------------------------------------------------------------------
 * `ThinkingPart` joined the union for the history Atlas hands back, and this
 * switch stopped being exhaustive. The case matters even though nothing in
 * this browser produces one: an Atlas conversation carries gemma's reasoning,
 * and this app's fallback is what answers when the laptop shuts — so a history
 * that started on the laptop and continues here would otherwise send another
 * vendor's chain of thought to Google as ordinary text, where it would read as
 * something the assistant had said out loud.
 *
 * Gemini's *own* thoughts go the opposite way: `providerData` replays them
 * verbatim because a missing `thoughtSignature` gets the whole request
 * rejected. The two are not the same field and must not be made to share one.
 */
function toGeminiPart(part: MessagePart): GeminiPart | null {
  switch (part.type) {
    case 'text':
      return { text: part.text };
    case 'thinking':
      return null;
    case 'tool_call':
      return { functionCall: { id: part.id, name: part.name, args: part.args } };
    case 'tool_result':
      return { functionResponse: { id: part.id, name: part.name, response: part.result } };
  }
}

/**
 * One message.
 *
 * A turn Gemini itself produced is replayed exactly as it arrived rather than
 * rebuilt from `parts`: its `thoughtSignature`s have to survive untouched or
 * the next request is rejected outright. Everything else — the user's words,
 * the tool results — is built here, and `tool` collapses into `user` because
 * that is the only role Gemini has for it.
 */
export function toGeminiContent(message: AgentMessage): GeminiContent {
  if (message.providerData?.provider === GEMINI_PROVIDER) {
    return message.providerData.raw as GeminiContent;
  }
  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: message.parts
      .map(toGeminiPart)
      .filter((part): part is GeminiPart => part !== null),
  };
}

export function toGeminiContents(messages: AgentMessage[]): GeminiContent[] {
  return messages.map(toGeminiContent);
}

// ─── Gemini → neutral ───────────────────────────────────────────────────────

function fromGeminiPart(part: GeminiPart): MessagePart[] {
  if (part.functionCall) {
    return [{ type: 'tool_call', id: part.functionCall.id, name: part.functionCall.name, args: part.functionCall.args ?? {} }];
  }
  if (part.functionResponse) {
    return [
      {
        type: 'tool_result',
        id: part.functionResponse.id,
        name: part.functionResponse.name,
        result: part.functionResponse.response,
      },
    ];
  }
  if (typeof part.text === 'string') return [{ type: 'text', text: part.text }];
  // A part carrying nothing but a signature has no neutral reading; it still
  // travels, inside `providerData`.
  return [];
}

/**
 * The model's turn, as `core.ts` will append it to history. `parts` is the
 * readable version; `providerData` is the one that goes back on the wire.
 */
export function toAgentMessage(parts: GeminiPart[]): AgentMessage {
  return {
    role: 'assistant',
    parts: parts.flatMap(fromGeminiPart),
    providerData: { provider: GEMINI_PROVIDER, raw: { role: 'model', parts } satisfies GeminiContent },
  };
}

/**
 * `usageMetadata` arrives on most chunks and is cumulative for the request, so
 * the last one seen is the total — summing them would multiply the count by
 * the number of chunks.
 */
export function toTokenUsage(raw: GeminiUsageMetadata | undefined): TokenUsage {
  return {
    promptTokens: raw?.promptTokenCount ?? 0,
    responseTokens: raw?.candidatesTokenCount ?? 0,
    thoughtsTokens: raw?.thoughtsTokenCount ?? 0,
    totalTokens: raw?.totalTokenCount ?? 0,
    requests: 1,
  };
}
