/**
 * The types of `atlasEngine.generated.js` — Atlas's own turn code, bundled for
 * the tablet by `scripts/build-atlas-engine.mjs` (BIG-12).
 *
 * Written by hand, and only the surface the app touches, in the same spirit as
 * `lib/atlas/client.ts` mirroring Atlas's HTTP routes: the source of truth is
 * `../atlas/src/browser/engine.ts`, and the events it hands back are read by
 * the same code that reads them off the wire (`client.ts` `readAtlasEvents`),
 * which already treats them as untrusted shapes. Keep this in step when
 * `engine.ts`'s exports change.
 */
import type { McpTool, McpToolResult } from '../../agent/toolServer/index';

export interface CloudRecord {
  id: string;
  json: string;
  updatedAt: string;
  by: 'laptop' | 'app';
  deleted?: boolean;
}

export interface CloudChange {
  records: CloudRecord[];
  removed: string[];
}

export interface CloudCollection {
  readonly name: string;
  list(): Promise<CloudRecord[]>;
  get(id: string): Promise<CloudRecord | null>;
  put(record: CloudRecord, options?: { keepNewerEdit?: boolean }): Promise<'written' | 'kept'>;
  remove(id: string): Promise<void>;
  watch(onChange: (change: CloudChange) => void, onError: (err: unknown) => void): () => void;
}

export interface CloudPort {
  collection(name: string): CloudCollection;
  close(): Promise<void>;
}

export interface McpToolSource {
  readonly name: string;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<McpToolResult>;
}

/** What `/chat` takes on the laptop; the same fields, handed over in the page. */
export interface ChatRequestBody {
  message?: string;
  conversationId?: string;
  history?: unknown[];
  skill?: string | null;
  model?: string;
  apiKey?: string;
  timezone?: string;
  mode?: string;
  effort?: string;
  resumeTurnId?: string;
}

export interface RevertResponse {
  ok: boolean;
  turn: unknown;
  outcomes: { id: string; tool: string; ok: boolean; summary: string }[];
  summary: string;
}

/** What a tray decision comes back as — the laptop's `POST /approvals/:id` answer, the same shape. */
export interface DecideResponse {
  ok: boolean;
  approval: { id: string; state: 'waiting' | 'approved' | 'discarded' } | null;
  summary: string;
}

export interface BrowserAtlas {
  readonly ready: Promise<void>;
  /** One turn. `onEvent` receives exactly what `/chat` would have streamed, as objects. */
  chat(body: ChatRequestBody, onEvent: (event: unknown) => void, signal: AbortSignal): Promise<void>;
  revert(turnId: string, day: string): Promise<RevertResponse>;
  /** Runs a tray item, as the laptop's Approve does (27A-3). */
  approve(id: string): Promise<DecideResponse>;
  /** Drops a tray item without running it (27A-3). */
  discard(id: string): Promise<DecideResponse>;
  flush(): Promise<void>;
  stop(): void;
}

export interface BrowserAtlasOptions {
  cloud: CloudPort;
  tools: McpToolSource[];
  /** Test addresses for Claude and ChatGPT. Development only (`devCloudViaOllama.ts`). */
  hosted?: { anthropicBaseUrl?: string; openaiBaseUrl?: string };
  onLine?: (line: string) => void;
  root?: string;
  readyTimeoutMs?: number;
  /** Web lookup through the app's `api/lookup` route (27A-4). Absent means no web drawer. */
  lookup?: {
    read(url: string): Promise<
      | { ok: true; page: { finalUrl: string; status: number; contentType: string; body: string; truncated: boolean } }
      | { ok: false; refused: string }
    >;
    search(query: string, page: number): Promise<
      | { ok: true; results: { hits: { title: string; url: string; snippet: string }[]; page: number; more: boolean } }
      | { ok: false; unavailable: string }
    >;
  };
  /** The owner's Gemini key through the app's `api/chat` (27A-5), for a Gemini turn with no key of its own. */
  geminiThroughApp?: { endpoint: string; getIdToken: () => Promise<string | null> };
  /** Tests only: a scripted model in place of the three clouds. */
  transportFor?: (provider: 'gemini' | 'anthropic' | 'openai', apiKey: string) => {
    readonly name: string;
    send(request: unknown, events?: unknown): Promise<unknown>;
  };
}

export function createBrowserAtlas(options: BrowserAtlasOptions): BrowserAtlas;

export interface HostedModelsPayload {
  models: Array<{ id: string; label: string }>;
  withoutChat: number;
}

export function listHostedModelsHere(provider: 'anthropic' | 'openai', apiKey: string): Promise<HostedModelsPayload>;

export class HostedListError extends Error {
  status: number;
}

export const APP_SERVER: string;
