import { readSseStream } from '../agent/transports/sse';
import { AgentTransportError } from '../agent/transports/errors';
import type { AgentMessage, AgentToolCall, TokenUsage } from '../agent/types';
import { readAskCard, type AskCard } from '../askCard';

/**
 * How this app talks to Atlas (item 8).
 *
 * Atlas is a program on Shreekant's laptop — its own project, at
 * `../../atlas/`, with its own repository and its own `DESIGN.md`. The agent
 * loop that used to run *in this file's neighbours* runs there now, and this
 * app is a client of it. Everything here is the wire between the two.
 *
 * WHY THE LAPTOP AND NOT THE BROWSER, IN ONE PARAGRAPH
 * -----------------------------------------------------
 * `lib/agent/transports/ollamaTransport.ts` used to talk to
 * `localhost:11434` — the *browser's* localhost, which from the tablet is the
 * tablet, which is why local models were desktop-only and said so in the
 * picker. Atlas moves the loop to the machine the models are actually on, and
 * the tablet reaches it over **Tailscale**. Same models, same engine, now
 * answering a device on a train. That one substitution is what item 8 is for.
 *
 * HOW IT IS REACHED, AND WHY THE URL IS AN https:// ONE
 * ------------------------------------------------------
 * `https://<machine>.<tailnet>.ts.net`, served by `tailscale serve`, which
 * terminates TLS on the laptop with a real certificate and forwards to Atlas
 * on loopback. **The scheme is not a detail.** This app is served over HTTPS
 * from Vercel, and a browser refuses outright to let an HTTPS page fetch a
 * plain `http://` address — it is mixed content, it fails silently in the
 * console, and no amount of CORS configuration fixes it. A bare Tailscale IP
 * (`http://100.x.y.z:8787`) therefore cannot work from the deployed app, and
 * that is the whole reason the setup asks for MagicDNS and HTTPS certificates
 * rather than just "install Tailscale".
 *
 * **Never a public tunnel.** DESIGN.md §9 rejects ngrok-style tunnels
 * explicitly: an open door to this machine, guarding an assistant with full
 * access to his data, is the one networking mistake that cannot be walked
 * back. `tailscale serve` publishes to the tailnet and to nothing else.
 */

/**
 * Where Atlas is. Baked in at build time, overridable per device.
 *
 * The environment variable is the answer for every device at once — one value
 * in Vercel, and the tablet and the laptop both find it. `localStorage` is
 * the escape hatch for a second Atlas host or a test, and is checked first for
 * exactly that reason. Neither is synced: which Atlas a device should talk to
 * is a fact about the device, like the model choice next door in
 * `modelStore.ts`.
 */
export const ATLAS_URL_KEY = 'mutineer_atlas_url';

export function atlasBaseUrl(): string | null {
  try {
    const stored = localStorage.getItem(ATLAS_URL_KEY);
    if (stored !== null && stored.trim() !== '') return stored.trim().replace(/\/$/, '');
  } catch {
    // Private mode. Fall through to the build-time value.
  }
  const configured = import.meta.env.VITE_ATLAS_URL as string | undefined;
  const trimmed = (configured ?? '').trim();
  return trimmed === '' ? null : trimmed.replace(/\/$/, '');
}

// ─── Health ─────────────────────────────────────────────────────────────────

export interface AtlasHealth {
  ok: boolean;
  version: string;
  /** Which queue item Atlas is built to. `tools: false` until item 9. */
  stage: { item: number; tools: boolean };
  defaultModel: string;
  numCtx: number;
  ollama: {
    reachable: boolean;
    /** Where Ollama is, from Atlas's point of view — its loopback, not ours. */
    base?: string;
    models: number;
    /** What is in memory right now. One entry on this machine (DESIGN.md §2.6). */
    loaded: string[];
    error?: string;
  };
  gemini: { configured: boolean };
  /**
   * The cloud providers this Atlas runs on a key the request carries (BIG-1).
   *
   * **Absent on an Atlas built before BIG-1**, which only ever knew Gemini on
   * its own `.env` key. The app routes a cloud pick to the laptop only when
   * its provider is listed here, so a laptop that has not been restarted onto
   * the new build keeps getting exactly what it understands.
   */
  hosted?: { providers: string[]; keysFromRequest: boolean };
  /**
   * Which MCP servers came up, and why any did not (item 9B needs the *why*).
   *
   * `stage.tools` is the one-bit summary and this is the detail behind it.
   * They answer two different questions: "can Atlas act?" and "what is stopping
   * it?" — and only the second one can be fixed, which is why `/atlas-host`
   * shows `failed[].reason` verbatim rather than a sentence of its own.
   *
   * **Optional because an Atlas built to item 8 does not send it.** Same
   * reasoning as `stage.tools` itself: this app is deployed from Vercel and
   * Atlas is updated by hand on a laptop, so the two versions drift, and a
   * client that assumed a field into existence would crash on the older one.
   */
  mcp?: { connected: string[]; failed: { name: string; reason: string }[] };
  /**
   * What Atlas is holding on disk (item 10).
   *
   * Optional for `mcp`'s reason exactly: an Atlas built to item 9 does not
   * send it, and this app is deployed from Vercel while Atlas is updated by
   * hand on a laptop, so the two versions drift. `memoryReport` below is the
   * one place that decides what its absence means.
   */
  memory?: {
    ok: boolean;
    conversations: number;
    notes: number;
    /** Bullet lines across every note, against the budget. */
    memories: number;
    budget: number;
    /** Where the folder is on the laptop, so a screen can say what to open in Notepad. */
    dir: string;
    error?: string;
    /**
     * The cloud copy the tablet reads with the lid shut (BIG-4). Absent from
     * an Atlas older than it. `on` is the one thing the screens ask: with it,
     * the note files are a backup and the app is where a note is edited.
     */
    cloud?: {
      on: boolean;
      reason: string | null;
      ready: boolean;
      pending: number;
      lastOkAt: string | null;
      lastError: string | null;
    };
  };
  /**
   * The skills Atlas has, and how many are on (item 12).
   *
   * Optional for `memory`'s reason exactly: an Atlas built to item 11 does not
   * send it, and this app is deployed from Vercel while Atlas is updated by
   * hand on a laptop, so the two versions drift.
   */
  skills?: { total: number; enabled: number; dir: string };
  /**
   * What is waiting for a tap at the front door (item 13, DESIGN.md §5.2).
   *
   * Here rather than only on `/approvals` because the app already polls
   * `/health`, and the nav has to be able to show a dot on Atlas from any
   * screen. The tray never expires, so something waiting is a fact about the
   * host rather than about the chat that produced it.
   *
   * Optional for `skills`' reason exactly: an Atlas built to item 12 does not
   * send it, and a client that assumed it into existence would crash on the
   * older one.
   */
  frontDoor?: { waiting: number };
  /** The action log's own state (§5.3). `ok: false` means no data directory. */
  log?: { ok: boolean; days: number; entriesToday: number; dir: string };
  /**
   * Whether the laptop is on its battery (item 13A, DESIGN.md §3.5).
   *
   * **`onBattery: null` is not-known and must be drawn as nothing at all.**
   * 9B established this app cannot take the reading itself — the browser's
   * battery API describes the tablet, not the laptop — so this is the only
   * source, and a pill saying "on mains" that is really saying "Atlas could
   * not tell" is worse than no pill.
   *
   * Optional for `log`'s reason exactly: an Atlas built to item 13 does not
   * send it.
   */
  power?: { onBattery: boolean | null; at: string | null };
}

export type MemoryReport = NonNullable<AtlasHealth['memory']>;

/**
 * `health.memory`, or the empty report an Atlas without it implies.
 *
 * **Absent and `ok: false` are deliberately the same answer here**, which is
 * not the call `mcpReport` makes about servers. The difference is what the
 * screens do with it: a failed MCP server has a reason worth printing verbatim
 * because Shreekant can fix it, whereas "this Atlas has no conversations"
 * covers both an older Atlas and an unwritable folder, and both mean the same
 * thing to the chat list — there is no list. The `error` string is still
 * carried for the one screen that wants to say why.
 */
export function memoryReport(health: AtlasHealth | null): MemoryReport {
  return (
    health?.memory ?? { ok: false, conversations: 0, notes: 0, memories: 0, budget: 40, dir: '' }
  );
}

/** `health.mcp`, or the empty report an item-8 Atlas implies. */
export function mcpReport(health: AtlasHealth): { connected: string[]; failed: { name: string; reason: string }[] } {
  return health.mcp ?? { connected: [], failed: [] };
}

/**
 * How long to wait before calling the laptop asleep.
 *
 * Short on purpose. This runs before every conversation and its whole job is
 * to decide between Atlas and the fallback — a lid that closed mid-flight
 * should land the user on the working assistant in a second, not after the
 * default fetch timeout. A laptop that is awake answers this in milliseconds:
 * `/health` asks Ollama for a list and loads nothing.
 */
export const PROBE_TIMEOUT_MS = 2500;

/**
 * A landed probe: what Atlas said, and how long it took to say it.
 *
 * The timing is not instrumentation. `/atlas-host` reports the round trip
 * because the one thing between the tablet and the laptop is a network, and
 * "awake" with a 900ms round trip is a different day from "awake" at 38ms.
 * Measured here rather than on the page because this is the only place that
 * knows when the request left.
 */
export interface AtlasProbe {
  health: AtlasHealth;
  /** Request to parsed body, in whole milliseconds. */
  roundTripMs: number;
}

export async function probeAtlas(baseUrl: string): Promise<AtlasProbe | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const health = (await res.json()) as AtlasHealth;
    // A reachable Atlas that cannot answer is not an awake Atlas. Ollama down
    // with no Gemini key is a dead end, and routing a conversation into it
    // would be worse than the fallback that works.
    if (!health.ok) return null;
    return { health, roundTripMs: Math.round(performance.now() - startedAt) };
  } catch {
    // Asleep, off the tailnet, or not yet configured. All the same answer
    // here: use the fallback and say so.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── The model list ─────────────────────────────────────────────────────────

/**
 * The laptop's models, in Ollama's own shape.
 *
 * Atlas proxies `/api/tags` verbatim so `models.ts`'s `parseOllamaModels` —
 * with its `tools` filter and its `withoutTools` count — reads it unchanged.
 * This function is a drop-in for the `fetch` that used to go to
 * `localhost:11434`, which is why `modelStore.ts` barely moved.
 */
export async function fetchAtlasModels(baseUrl: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${baseUrl}/models/local`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Atlas answered ${res.status}.`);
  }
  return res.json();
}

/**
 * Claude's or ChatGPT's models, as the laptop lists them with his key (BIG-1).
 *
 * A POST because the key travels in the body — never in a URL, which is what
 * proxies and histories keep. An Atlas built before BIG-1 answers 404, which
 * is reported as "this laptop's Atlas is too old" rather than as a key problem.
 */
export async function fetchAtlasHostedModels(
  baseUrl: string,
  provider: 'anthropic' | 'openai',
  apiKey: string,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}/models/hosted`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
    signal,
  });
  if (res.status === 404) throw new Error('The laptop is running an older Atlas. Restart it to use Claude and ChatGPT.');
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Atlas answered ${res.status}.`);
  }
  return res.json();
}

// ─── One turn ───────────────────────────────────────────────────────────────

// ─── Modes, thinking and cost (item 12) ─────────────────────────────────────

/**
 * Planning / Auto / Ask-first (DESIGN.md §3.2, item 12).
 *
 * Sent with every turn rather than held by Atlas, deliberately: it is a fact
 * about what Shreekant wants from *this* request, and a mode Atlas remembered
 * would let two devices in two rooms change each other's mid-sentence. The app
 * remembers it per device.
 */
export type AtlasMode = 'plan' | 'auto' | 'ask';

/**
 * How hard to think (§3.3).
 *
 * **Two positions, not `atlas.html`'s three, and the reason is measured.**
 * Ollama accepts `think: "low"|"medium"|"high"` without error and ignores it,
 * and `think: false` does not stop a model reasoning — it stops Ollama
 * *separating* the reasoning, so the chain of thought lands in the answer. An
 * "Off" position would therefore either turn nothing off or make answers
 * messier at the setting labelled cheapest. Shreekant's call, made with the
 * numbers in front of him: drop it. `atlas/src/agent/modes.ts` holds the runs.
 */
export type AtlasEffort = 'some' | 'hard';

/** A write a mode stopped, exactly as the model asked for it. */
export interface AtlasHeldCall {
  name: string;
  args: Record<string, unknown>;
  /** The tool's own description, so the app can say what it would have done. */
  description: string;
}

/** What Atlas streams back. Mirrors `atlas/src/routes/chat.ts`'s `ChatEvent`. */
export type AtlasEvent =
  | {
      type: 'start';
      model: string;
      numCtx: number | null;
      provider: 'ollama' | 'gemini';
      /** Item 10. Absent from an older Atlas, which is why it is optional here. */
      conversationId?: string | null;
    }
  | { type: 'notice'; message: string }
  | { type: 'text'; delta: string }
  /**
   * A tool call Atlas finished, whole (item 9D).
   *
   * Item 9 gave Atlas hands and left them off the wire — its `routes/chat.ts`
   * passed `onTextDelta` and not `onToolCall` — so a turn that searched, wrote
   * and deleted arrived here as prose about having done so. `ChatPage` draws
   * reads as chips and writes as the container that owns Revert, and had
   * nothing to build either from on the path that is the default.
   *
   * **The shape is `AgentToolCall`, not a new one.** Atlas's `AgentToolCall`
   * and this app's are the same five fields, deliberately, and `toolChip.ts`
   * already knows every tool Atlas can call: `toolRegistry` is built from
   * `allTools`, which is what `mcpTools` exports to the MCP server. So a
   * `delete_task` from Atlas lands on the write side of a turn for the same
   * reason an in-browser one does — the registry's own `mutates` flag — with
   * nothing here mapping names to sides.
   */
  | { type: 'tool'; call: AgentToolCall }
  /** The model's reasoning, streamed (item 12). `round` pairs it with its round trip. */
  | { type: 'thinking'; delta: string; round: number }
  /** Planning mode's steps, proposed and not started (item 12). */
  | { type: 'plan'; steps: string[] }
  /**
   * Questions on one card (DESIGN.md §7.3, BUILD-16). Never an approval. The
   * turn has ended by the time it arrives: Atlas refuses writes in the round
   * that asked and sends no round after it. Item 12's `question` event, with
   * one question and two to four options, is gone.
   */
  | { type: 'ask'; card: unknown }
  /** Writes Planning or Ask-first stopped, with the arguments the model asked for. */
  | { type: 'held'; mode: AtlasMode; calls: AtlasHeldCall[] }
  /**
   * An act that cannot be undone, waiting for one tap (item 13, §5.2).
   *
   * Deliberately its own event and not a second flavour of `held`: a held
   * write is a mode Shreekant chose and can wave through with "Go ahead", and
   * this is a door that is always shut. The app draws them differently for the
   * same reason — see `ApprovalCard` in `ChatPage.tsx`.
   */
  | {
      type: 'approval';
      id: string;
      kind: AtlasApprovalKind;
      tool: string;
      args: Record<string, unknown>;
      preview: string;
      previewData?: unknown;
    }
  | {
      type: 'done';
      text: string;
      usage: TokenUsage;
      history: AgentMessage[];
      modelUsed: string;
      fellBack: boolean;
      stoppedAtIterationLimit: boolean;
      conversationId?: string | null;
      conversationTitle?: string | null;
      /** The log turn. `null` when Atlas kept no log. */
      logTurnId?: string | null;
    }
  | { type: 'error'; message: string; detail?: string };

export interface AtlasTurnOptions {
  baseUrl: string;
  userMessage: string;
  history: AgentMessage[];
  /** A local model name, or `gemini:<id>`. */
  model: string;
  timezone: string;
  /**
   * Which conversation to continue (item 10). When it is given, **Atlas's copy
   * of the history wins** and `history` above is ignored on the far side — a
   * tablet that has been asleep is holding a transcript that is behind, and
   * posting it back would drop whatever was said from the laptop meanwhile.
   */
  conversationId?: string | null;
  /** The context window to ask for, from the slider (DESIGN.md §4.1). */
  numCtx?: number;
  /** Planning / Auto / Ask-first (item 12). Absent means Auto. */
  mode?: AtlasMode;
  /** How hard to think (§3.3). Absent means `some`. */
  effort?: AtlasEffort;
  /**
   * A skill summoned with `/`, or `null` to turn the current one off.
   *
   * **`undefined` is a third state and the common one**: it means this turn
   * says nothing about skills, so whichever one the conversation is already
   * carrying stays in force. That is what makes a summoned skill last for the
   * conversation instead of for one message — the laptop holds it on the
   * conversation record, and the app only ever sends the change.
   */
  skill?: string | null;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  /**
   * The conversation this turn landed in, the moment Atlas says so (item 10).
   *
   * Fired on `start` rather than waited for on `done`, because a new chat has
   * no id until the request has gone out and the user may abandon the turn
   * before it finishes — the conversation still exists on the laptop, and the
   * list has to be able to find it.
   */
  onConversation?: (id: string) => void;
  /**
   * One tool call, as Atlas finishes it (item 9D). Named to match
   * `runAgentTurn`'s callback exactly, so `ChatPage`'s two branches keep
   * reading as the same shape rather than as two different screens.
   */
  onToolCall?: (call: AgentToolCall) => void;
  /** A retry or a model fallback — worth showing, and not part of the answer. */
  onNotice?: (message: string) => void;
  /**
   * Reasoning, as it arrives (item 12).
   *
   * Streamed rather than waited for, because on a 4B model it is frequently
   * the only thing arriving for the first several seconds of a turn — which is
   * exactly the window where a client with nothing to draw looks stuck.
   */
  onThinking?: (delta: string, round: number) => void;
  /** Planning mode's steps, the moment the model proposes them. */
  onPlan?: (steps: string[]) => void;
  /** The question card (§7.3, BUILD-16), read through `readAskCard`. Never an approval. */
  onAsk?: (card: AskCard) => void;
  /** The writes the mode stopped, once, at the end of the turn. */
  onHeld?: (mode: AtlasMode, calls: AtlasHeldCall[]) => void;
  /**
   * An irreversible act, intercepted and waiting for a tap (item 13).
   *
   * Fired the moment it happens rather than at the end of the turn, because
   * the turn **carries on** after it — Atlas does not block on a tap — and the
   * card belongs beside the point in the answer where it was asked for.
   */
  onApproval?: (approval: AtlasPendingApproval) => void;
  /**
   * Carry on a turn that stopped, rather than starting a new one (item 13A, §5.5).
   *
   * The action log's id for it, sent by the card shown when a conversation is
   * opened and Atlas was interrupted. Atlas reads the original ask out of the
   * log, so `userMessage` is ignored.
   */
  resumeTurnId?: string;
  /**
   * The key for the cloud provider `model` names (BIG-1), from the key sheet.
   * Atlas uses it for this turn and keeps it nowhere. Absent on a local turn.
   */
  apiKey?: string | null;
}

export interface AtlasTurn {
  text: string;
  usage: TokenUsage;
  history: AgentMessage[];
  /** Which model actually answered. Not always the one asked for — Ollama's swaps fail. */
  modelUsed: string;
  fellBack: boolean;
  stoppedAtIterationLimit: boolean;
  /** Where it was written down, and what that chat is now called (item 10). */
  conversationId: string | null;
  conversationTitle: string | null;
  /** The log turn. `null` on an Atlas keeping no log. */
  logTurnId: string | null;
}

/**
 * The request `/chat` takes, from a turn's options. Shared by both machines
 * since BIG-12: the laptop is sent it as JSON, and Atlas in this page with the
 * lid shut (`engine/runTabletAtlasTurn.ts`) is handed it as it is.
 */
export function chatBodyOf(options: Omit<AtlasTurnOptions, 'baseUrl'>): Record<string, unknown> {
  const { userMessage, history, model, timezone } = options;
  return {
    message: userMessage,
    /*
     * Still sent alongside `conversationId`, and not redundantly. Atlas
     * ignores it when it is holding the conversation itself, and uses it
     * when it is not — an Atlas built to item 9, or one whose data
     * directory would not open. The app cannot tell which it is talking
     * to from here, and sending both means it does not have to.
     */
    history,
    model,
    timezone,
    ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    ...(options.numCtx ? { numCtx: options.numCtx } : {}),
    /* Item 12. Always sent, even at their defaults: an Atlas built before
       this item ignores two fields it has never heard of, which is the
       same behaviour as not sending them, and always sending means the
       request body does not change shape with the dial. */
    mode: options.mode ?? 'auto',
    effort: options.effort ?? 'some',
    /* Sent only when it changes, unlike the two above — see `skill` on the
       options. `null` is a real value here ("turn it off") and must
       survive the check, so this tests for `undefined` rather than
       falsiness. An Atlas built before `/` ignores the field, which is the
       same behaviour as never being sent it. */
    ...(options.skill !== undefined ? { skill: options.skill } : {}),
    /* Item 13A. Sent only when they apply, unlike the two above: an older
       Atlas ignoring `mode` behaves the same as never being sent it, but
       an older Atlas ignoring `resumeTurnId` would silently re-run the
       original ask from the top — which is the double-write the resume
       path exists to prevent. `resumedOnAnOlderAtlas` below is how the
       page notices that and says so instead. */
    ...(options.resumeTurnId ? { resumeTurnId: options.resumeTurnId } : {}),
    /* BIG-1. Only on a cloud turn, and only when there is one to send. */
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
  };
}

/** Events, one at a time, from whichever machine is running the turn. Resolves when the turn is over. */
export type AtlasEventFeed = (onEvent: (event: AtlasEvent) => void) => Promise<void>;

/**
 * What a stream of Atlas's events adds up to — the callbacks fired as they
 * arrive, and the finished turn at the end. The one reader for both machines
 * (BIG-12): the laptop's events arrive over SSE, the tablet's straight from
 * Atlas's own code in this page, and the page cannot tell which it got.
 */
export async function readAtlasEvents(options: Omit<AtlasTurnOptions, 'baseUrl'>, feed: AtlasEventFeed): Promise<AtlasTurn> {
  const { onTextDelta, onToolCall, onNotice } = options;
  const { onThinking, onPlan, onAsk, onHeld, onApproval } = options;

  let done: Extract<AtlasEvent, { type: 'done' }> | null = null;
  let failure: AgentTransportError | null = null;

  await feed((event) => {
    switch (event.type) {
      case 'text':
        onTextDelta?.(event.delta);
        break;
      case 'tool':
        onToolCall?.(event.call);
        break;
      case 'thinking':
        onThinking?.(event.delta, event.round);
        break;
      case 'plan':
        onPlan?.(event.steps);
        break;
      case 'ask': {
        const card = readAskCard(event.card);
        if (card !== null) onAsk?.(card);
        break;
      }
      case 'held':
        onHeld?.(event.mode, event.calls);
        break;
      case 'approval':
        onApproval?.({
          id: event.id,
          kind: event.kind,
          tool: event.tool,
          args: event.args,
          preview: event.preview,
          previewData: event.previewData,
        });
        break;
      case 'notice':
        onNotice?.(event.message);
        break;
      case 'done':
        done = event;
        break;
      case 'error':
        // Kept rather than thrown: the stream has to be read to its end or
        // the connection is left open, and an error event is the *only* way
        // Atlas can report a failure once its headers have gone out.
        failure = new AgentTransportError(event.message, { detail: event.detail });
        break;
      case 'start':
        // Item 10. An older Atlas sends no id and the chat stays unlisted,
        // which is item 9's behaviour and still a working conversation.
        if (typeof event.conversationId === 'string') options.onConversation?.(event.conversationId);
        break;
    }
  });

  if (failure !== null) throw failure;
  if (done === null) {
    throw new AgentTransportError('Atlas stopped mid-answer without finishing the turn.');
  }

  const finished = done as Extract<AtlasEvent, { type: 'done' }>;
  return {
    text: finished.text,
    usage: finished.usage,
    history: finished.history,
    modelUsed: finished.modelUsed,
    fellBack: finished.fellBack,
    stoppedAtIterationLimit: finished.stoppedAtIterationLimit,
    conversationId: finished.conversationId ?? null,
    conversationTitle: finished.conversationTitle ?? null,
    logTurnId: finished.logTurnId ?? null,
  };
}

/**
 * One turn, run on the laptop, streamed here.
 *
 * Shaped deliberately like `agent/core.ts`'s `runAgentTurn`, so `ChatPage`'s
 * two branches read as the same shape rather than as two different screens:
 * same `onTextDelta`, same `AbortSignal`, same returned history to feed back
 * in next time.
 *
 * **The conversation is Atlas's now (item 10).** A `conversationId` names a
 * file on the laptop, and Atlas's copy of the history is the one that counts —
 * this browser's is sent as well, and Atlas ignores it when it has its own.
 * That is not belt-and-braces: an Atlas built to item 9, or one whose data
 * directory would not open, still needs the history from here, and the app
 * cannot tell which it is talking to before the request goes out.
 *
 * **`turnId` is deliberately absent, and item 9 made that matter rather than
 * settling it.** The app's own turns return the snapshot they wrote into, and
 * Revert undoes them. Atlas has hands now and its turns really do write — 9D
 * is what makes those writes visible here — but the ring is a Zustand store in
 * *this browser* and an Atlas turn never touches it. What makes an Atlas write
 * undoable is Atlas's own action log (DESIGN.md §5.3), which is item 13; until
 * then an Atlas deletion is undone from `/trash`. Returning a `null` id here
 * would suggest the ring is watching Atlas. It is not, and `ChangeList` says
 * so in words rather than offering a button that cannot work.
 */
export async function runAtlasTurn(options: AtlasTurnOptions): Promise<AtlasTurn> {
  const { baseUrl, signal } = options;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chatBodyOf(options)),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // The laptop went to sleep, left the tailnet, or the certificate is not
    // trusted. All the same to the user, and all the same fix: send it again,
    // and this device takes it — Atlas itself since BIG-12, when there is a
    // key of his own for the model, the basic assistant when there is not.
    throw new AgentTransportError(
      'Lost the laptop mid-answer. Send it again and this device will pick it up.',
      { detail: err instanceof Error ? err.message : String(err) },
    );
  }

  if (!res.ok || !res.body) {
    throw new AgentTransportError(`Atlas answered ${res.status}.`, { status: res.status });
  }

  const body = res.body;
  return readAtlasEvents(options, (onEvent) =>
    readSseStream(body, (payload) => onEvent(JSON.parse(payload) as AtlasEvent)),
  );
}

// ─── The conversation list, and the catalog (item 10) ───────────────────────

/**
 * The two groups of routes item 10 added, as plain fetches.
 *
 * **Every one of them can 503, and that is a state rather than a failure.**
 * Atlas answers 503 when it has no data directory — an older Atlas answers
 * 404 for the same call — and both mean "there is no list here". The screens
 * draw that as an honest empty state naming what is missing, never as an
 * error, because the assistant still works: `runAtlasTurn` falls back to the
 * history this browser is holding, which is exactly what item 9 did.
 */

export interface AtlasConversationSummary {
  id: string;
  title: string;
  untitled: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages: number;
  compactions: number;
}

export interface AtlasConversation extends AtlasConversationSummary {
  history: AgentMessage[];
  compactionRecords?: { at: string; before: number; after: number; note: string | null }[];
  /**
   * The skill summoned with `/` in this conversation, if any.
   *
   * Optional because an Atlas built before `/` does not send it, and a
   * conversation written before `/` does not have it. Both read as `null`.
   */
  activeSkill?: string | null;
}

/**
 * A memory route that could not answer.
 *
 * `tooOld` is assigned in the body rather than declared as a constructor
 * parameter property: `tsconfig`'s `erasableSyntaxOnly` forbids the shorthand,
 * because it is the one piece of TypeScript that emits code rather than being
 * erased.
 */
export class AtlasMemoryUnavailable extends Error {
  /** True when this Atlas simply predates item 10, rather than failing at it. */
  readonly tooOld: boolean;

  constructor(message: string, tooOld: boolean) {
    super(message);
    this.name = 'AtlasMemoryUnavailable';
    this.tooOld = tooOld;
  }
}

async function memoryFetch(baseUrl: string, path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new AtlasMemoryUnavailable('Could not reach the laptop.', false);
  }

  if (res.status === 404) {
    throw new AtlasMemoryUnavailable('This Atlas is older than the memory it would need.', true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AtlasMemoryUnavailable(body?.error ?? `Atlas answered ${res.status}.`, false);
  }
  return res.json();
}

export async function fetchConversations(
  baseUrl: string,
  query: string,
  signal?: AbortSignal,
): Promise<AtlasConversationSummary[]> {
  const suffix = query.trim() === '' ? '' : `?q=${encodeURIComponent(query.trim())}`;
  const body = (await memoryFetch(baseUrl, `/conversations${suffix}`, { signal })) as {
    conversations?: AtlasConversationSummary[];
  };
  return body.conversations ?? [];
}

export async function fetchConversation(baseUrl: string, id: string, signal?: AbortSignal): Promise<AtlasConversation> {
  const body = (await memoryFetch(baseUrl, `/conversations/${encodeURIComponent(id)}`, { signal })) as {
    conversation: AtlasConversation;
  };
  return body.conversation;
}

export async function createConversation(baseUrl: string): Promise<AtlasConversationSummary> {
  const body = (await memoryFetch(baseUrl, '/conversations', { method: 'POST' })) as {
    conversation: AtlasConversationSummary;
  };
  return body.conversation;
}

export async function patchConversation(
  baseUrl: string,
  id: string,
  patch: { title?: string; pinned?: boolean },
): Promise<AtlasConversationSummary> {
  const body = (await memoryFetch(baseUrl, `/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })) as { conversation: AtlasConversationSummary };
  return body.conversation;
}

export async function deleteConversation(baseUrl: string, id: string): Promise<void> {
  await memoryFetch(baseUrl, `/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─── The catalog ────────────────────────────────────────────────────────────

export type NoteAuthor = 'atlas' | 'you' | 'outside';

/** A note without its body. What `/catalog` lists, and all the prompt ever sees. */
export interface CatalogNoteHeader {
  path: string;
  folder: string;
  name: string;
  /** The one line saying when Atlas opens this. Frontmatter, and part of the memory. */
  trigger: string;
  bytes: number;
  /** Bullet lines — what the budget counts. */
  memories: number;
  updatedAt: string;
  author: NoteAuthor;
  opens: number;
  lastOpenedAt: string | null;
  stale: boolean;
}

export interface CatalogNote extends CatalogNoteHeader {
  body: string;
}

export interface CatalogIndex {
  /** Where the folder is on the laptop. Printed so he knows what to open in Notepad. */
  root: string;
  folders: string[];
  notes: CatalogNoteHeader[];
  memories: number;
  budget: number;
}

export async function fetchCatalog(baseUrl: string, signal?: AbortSignal): Promise<CatalogIndex> {
  return (await memoryFetch(baseUrl, '/catalog', { signal })) as CatalogIndex;
}

export async function fetchNote(baseUrl: string, path: string, signal?: AbortSignal): Promise<CatalogNote> {
  const body = (await memoryFetch(baseUrl, `/catalog/note?path=${encodeURIComponent(path)}`, { signal })) as {
    note: CatalogNote;
  };
  return body.note;
}

export async function saveNote(
  baseUrl: string,
  note: { path: string; body: string; trigger?: string },
): Promise<CatalogNote> {
  const body = (await memoryFetch(baseUrl, '/catalog/note', {
    method: 'PUT',
    body: JSON.stringify(note),
  })) as { note: CatalogNote };
  return body.note;
}

export async function deleteNote(baseUrl: string, path: string): Promise<void> {
  await memoryFetch(baseUrl, `/catalog/note?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

// ─── Skills (item 12, DESIGN.md §7.2) ───────────────────────────────────────

/**
 * The skills on the laptop, over the same routes the catalog uses.
 *
 * `memoryFetch` is shared deliberately: a skill is the same kind of thing a
 * note is — a plain file in Atlas's data directory — so it fails the same way
 * (503 with a reason when there is no data directory, 404 when this Atlas
 * predates the feature) and `AtlasMemoryUnavailable.tooOld` already tells the
 * two apart. A second fetch helper would have had to re-derive that.
 */

/** Who last wrote a skill. `outside` is the usual answer — it is how one arrives. */
export type SkillAuthor = 'atlas' | 'you' | 'outside';

/** A skill without its instructions. What the list draws, and all the prompt sees. */
export interface AtlasSkillHeader {
  /** The folder name. The id everywhere. */
  name: string;
  /** The `name:` in the frontmatter, when it disagrees with the folder. */
  declaredName: string;
  /** What decides whether Atlas ever loads it. Empty means it never will. */
  description: string;
  /** Supporting files beside SKILL.md. */
  files: string[];
  bytes: number;
  enabled: boolean;
  uses: number;
  lastUsedAt: string | null;
  updatedAt: string;
  author: SkillAuthor;
  /** False when there is no description — a folder Atlas cannot see. */
  valid: boolean;
  problem: string | null;
}

export interface AtlasSkill extends AtlasSkillHeader {
  body: string;
}

export interface AtlasSkillsIndex {
  /** The folder on the laptop, so the screen can say where to drop one. */
  root: string;
  skills: AtlasSkillHeader[];
  enabled: number;
  /** `SKILL.md`, named by Atlas rather than hardcoded here. */
  skillFile: string;
}

export async function fetchSkills(baseUrl: string, signal?: AbortSignal): Promise<AtlasSkillsIndex> {
  return (await memoryFetch(baseUrl, '/skills', { signal })) as AtlasSkillsIndex;
}

export async function fetchSkill(baseUrl: string, name: string, signal?: AbortSignal): Promise<AtlasSkill> {
  const body = (await memoryFetch(baseUrl, `/skills/${encodeURIComponent(name)}`, { signal })) as {
    skill: AtlasSkill;
  };
  return body.skill;
}

/** One of a skill's supporting files. Fetched only when the reader opens its tab. */
export async function fetchSkillFile(
  baseUrl: string,
  skill: string,
  file: string,
  signal?: AbortSignal,
): Promise<{ file: string; text: string }> {
  return (await memoryFetch(
    baseUrl,
    `/skills/${encodeURIComponent(skill)}/file?name=${encodeURIComponent(file)}`,
    { signal },
  )) as { file: string; text: string };
}

/**
 * Create or replace a skill.
 *
 * The description is required on this side too, and Atlas refuses without one.
 * A skill with no description is a folder that appears in the list, appears to
 * be on, and can never be loaded — which is a worse thing to hand somebody
 * than an error on a field.
 */
export async function saveSkill(
  baseUrl: string,
  skill: { name: string; description: string; body: string },
): Promise<AtlasSkill> {
  const body = (await memoryFetch(baseUrl, '/skills', {
    method: 'PUT',
    body: JSON.stringify(skill),
  })) as { skill: AtlasSkill };
  return body.skill;
}

/** The on/off switch. The folder stays either way — off means Atlas is not told about it. */
export async function setSkillEnabled(
  baseUrl: string,
  name: string,
  enabled: boolean,
): Promise<AtlasSkillHeader> {
  const body = (await memoryFetch(baseUrl, `/skills/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })) as { skill: AtlasSkillHeader };
  return body.skill;
}

export async function deleteSkill(baseUrl: string, name: string): Promise<void> {
  await memoryFetch(baseUrl, `/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ─── The front door and the action log (item 13, DESIGN.md §5.2 and §5.3) ───

/**
 * Three kinds: a share link, mail (declared ahead of item 22), and since
 * BUILD-3 a project or list delete — the one kind that Revert can still reach.
 *
 * `mail` exists because §5.2 names two acts and item 22 brings the second; the
 * tray draws them differently because what is being agreed to is different —
 * a recipient and a body, against a link and what is behind it.
 */
export type AtlasApprovalKind = 'share' | 'mail' | 'delete';

/** What arrives on the stream the moment an act is intercepted. */
export interface AtlasPendingApproval {
  id: string;
  kind: AtlasApprovalKind;
  tool: string;
  args: Record<string, unknown>;
  /** What the tool said it would do, run in preview. Never Atlas paraphrasing. */
  preview: string;
  previewData?: unknown;
}

export type AtlasApprovalState = 'waiting' | 'approved' | 'discarded';

/** One item in the tray, as Atlas stores it on the laptop. */
export interface AtlasApproval extends AtlasPendingApproval {
  createdAt: string;
  server: string;
  conversationId: string | null;
  conversationTitle: string | null;
  logTurnId: string | null;
  state: AtlasApprovalState;
  decidedAt: string | null;
  outcome: { ok: boolean; summary: string } | null;
}

export interface AtlasApprovalsIndex {
  approvals: AtlasApproval[];
  waiting: number;
}

export async function fetchApprovals(baseUrl: string, signal?: AbortSignal): Promise<AtlasApprovalsIndex> {
  return (await memoryFetch(baseUrl, '/approvals', { signal })) as AtlasApprovalsIndex;
}

export interface AtlasApprovalDecision {
  ok: boolean;
  approval: AtlasApproval | null;
  summary: string;
}

/**
 * The tap.
 *
 * **This is the one call in the app that performs something irreversible**, so
 * it is a POST that names the act rather than a PATCH setting a field, and the
 * summary that comes back is the tool's own words about what happened — never
 * a sentence composed here. A failure leaves it waiting, on purpose: a tap
 * that did not work must not read as a tap that did.
 */
export async function decideApproval(
  baseUrl: string,
  id: string,
  decision: 'approve' | 'discard',
): Promise<AtlasApprovalDecision> {
  return (await memoryFetch(baseUrl, `/approvals/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST',
  })) as AtlasApprovalDecision;
}

/** One thing Atlas did. The app turns `tool` and `args` into a sentence itself. */
export interface AtlasLogEntry {
  id: string;
  at: string;
  tool: string;
  drawer: string | null;
  args: Record<string, unknown>;
  ok: boolean;
  summary: string;
  data?: unknown;
  wrote: boolean;
  /**
   * How long the call took, in milliseconds (item 13D).
   *
   * Atlas has always measured this — `core.ts` times every tool call — and
   * until this item it threw the number away at the moment it wrote the entry,
   * so the log held a complete record of what Atlas did and nothing at all
   * about how long any of it took. Item 14 wants a distribution to measure
   * batching against, and there was none to read.
   *
   * **Optional because every entry written before this item has none.** Absent
   * is *not known* and is drawn as nothing; `0` is a call that genuinely took
   * under a millisecond, which most of them do.
   */
  durationMs?: number;
  /**
   * True when it went through the front door. Reversible only when `undoable`
   * says so — BUILD-3's project and list deletes are; a published link never is.
   */
  frontDoor: boolean;
  /** True when it can still be put back. The undo payload itself never leaves Atlas. */
  undoable: boolean;
  undoneAt: string | null;
  noUndoReason: string | null;
}

/** One thing Shreekant asked for, and everything it caused. */
export interface AtlasLogTurn {
  id: string;
  at: string;
  actor: 'atlas' | 'you';
  ask: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  model: string | null;
  provider: 'ollama' | 'gemini' | null;
  entries: AtlasLogEntry[];
  revertedAt: string | null;
  /**
   * BIG-12: read from the cloud copy, and it carries its undo — a turn Atlas
   * ran on this tablet with the lid shut — so Revert can run here. Absent on
   * the laptop's own route and on a laptop turn's cloud record, which keep
   * their undo on the laptop.
   */
  revertibleHere?: boolean;
}

export interface AtlasLogDay {
  day: string;
  turns: AtlasLogTurn[];
}

export type AtlasLogScope = 'today' | 'week' | 'all';

export interface AtlasLogIndex {
  days: AtlasLogDay[];
  /** Today in Shreekant's zone, from Atlas — so the first section is named, not guessed. */
  today: string;
  counts: { entries: number; undoable: number; frontDoor: number };
  undoRetentionDays: number;
}

export async function fetchLog(
  baseUrl: string,
  scope: AtlasLogScope,
  signal?: AbortSignal,
): Promise<AtlasLogIndex> {
  return (await memoryFetch(baseUrl, `/log?scope=${scope}`, { signal })) as AtlasLogIndex;
}

export interface AtlasRevertResult {
  ok: boolean;
  turn: AtlasLogTurn | null;
  outcomes: { id: string; tool: string; ok: boolean; summary: string }[];
  summary: string;
}

/**
 * Puts one turn back.
 *
 * The app sends a turn id and nothing else. What it means to undo a change is
 * the *server's* knowledge — restoring a deleted task means the Trash,
 * restoring an edited one means a field patch — and Atlas passes the request
 * down to whichever MCP server made the change. See `mcp/undo.ts`.
 */
export async function revertLogTurn(baseUrl: string, turnId: string): Promise<AtlasRevertResult> {
  return (await memoryFetch(baseUrl, `/log/${encodeURIComponent(turnId)}/revert`, {
    method: 'POST',
  })) as AtlasRevertResult;
}

// ─── Resumption (item 13A) ──────────────────────────────────────────────────

/**
 * A turn Atlas was in the middle of when it stopped (DESIGN.md §5.5).
 *
 * **`plannedSteps` is `null` on most turns and that is the honest answer.**
 * DESIGN.md's example wording is *"interrupted after 3 of 5 steps"*, and that
 * five only exists in Planning mode, where the model proposed a plan. In Auto
 * — most turns — Atlas calls tools until it is done and there is no total that
 * is not invented, so the card says "3 steps" and stops there. Shreekant's
 * call, made with the alternatives in front of him.
 */
export interface AtlasResumableTurn {
  turnId: string;
  day: string;
  at: string;
  ask: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  steps: number;
  plannedSteps: number | null;
  lastTool: string | null;
}

/**
 * Was Atlas in the middle of something in this conversation?
 *
 * Asked when a chat is opened, which is the whole shape of §5.5: **one tap to
 * carry on**, and nothing happens until he gives it. Atlas volunteers nothing
 * and resumes nothing on its own — the two alternatives put to him, resuming
 * when the tab loads and resuming at Atlas's start-up with nobody present,
 * both had Atlas writing hours later into a situation that may have changed.
 *
 * A host too old to know the question answers 404, which `memoryFetch` turns
 * into `AtlasMemoryUnavailable`. The caller draws nothing for it: no card is
 * exactly right, because an Atlas that cannot be interrupted-and-resumed has
 * nothing to offer.
 */
export async function fetchResumable(
  baseUrl: string,
  conversationId: string | null,
  signal?: AbortSignal,
): Promise<AtlasResumableTurn | null> {
  const suffix = conversationId === null ? '' : `?conversationId=${encodeURIComponent(conversationId)}`;
  const body = (await memoryFetch(baseUrl, `/resume${suffix}`, { signal })) as {
    turn?: AtlasResumableTurn | null;
  };
  return body.turn ?? null;
}

