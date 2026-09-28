import type { TurnHandle } from '../../store/useSnapshotStore';
import { MAX_TOOL_ITERATIONS, TEXT_MODEL } from './constants';
import { buildSystemPrompt, collectPromptState } from './prompt';
import { fallbackTools, runTool, toToolDeclarations } from './tools/index';
import type {
  AgentMessage,
  AgentToolCall,
  AgentTransport,
  AgentTurn,
  TokenUsage,
  ToolContext,
  ToolDef,
  ToolResult,
  ToolResultPart,
} from './types';

/**
 * The agent loop.
 *
 * Send the conversation, run whatever tools come back, send the results, repeat
 * until the model answers in words. That is the whole algorithm; the care is in
 * where the pieces live.
 *
 * **Tools run here, in the browser.** `api/chat.ts` is a stateless key-holder:
 * it never sees the store, never dispatches a tool, and could not mutate a task
 * if it wanted to. Everything that writes runs against the local Zustand store
 * and syncs exactly the way a hand edit does. The server only ever sees
 * messages.
 *
 * **One turn, one snapshot.** The turn opens before the first model call and
 * commits on the way out — including when the transport throws — so a turn that
 * died after a write is still revertible (D6). A turn that only answered a
 * question captured nothing and commits as `null` rather than burning a slot in
 * the ring.
 *
 * **The transport is injected, and nothing here names a vendor.** The messages
 * this file builds are the neutral shapes in `types.ts`; the adapter behind the
 * transport turns them into whatever its provider puts on the wire. Step 8's
 * Live session and item 6's local models implement the same interface and reuse
 * this file unchanged (D10).
 */

/**
 * The two stateful things a turn needs, behind an interface for the same
 * reason the tool layer has one: so the loop can be driven against an
 * in-memory fake with no Zustand and no browser. `createLiveSession()` in
 * `liveContext.ts` is the real one.
 */
export interface AgentSession {
  beginTurn(label: string): TurnHandle;
  /** Returns the committed turn's id, or `null` if the turn touched nothing. */
  commitTurn(handle: TurnHandle): string | null;
  /** One context per turn, so every tool call in it agrees on `now` (D14). */
  createContext(handle: TurnHandle): ToolContext;
}

export interface RunAgentTurnOptions {
  userMessage: string;
  /** Prior turns. Ephemeral and session-only (D11) — the caller owns it. */
  history?: AgentMessage[];
  transport: AgentTransport;
  session: AgentSession;
  /** Defaults to `fallbackTools` — the eight this path declares, not the whole registry (item 9). */
  tools?: ToolDef[];
  model?: string;
  /** Learned notes for `<preferences>`. Wired to `agentMemory` in Step 6. */
  preferences?: string[];
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
  onToolCall?: (call: AgentToolCall) => void;
}

const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  responseTokens: 0,
  thoughtsTokens: 0,
  totalTokens: 0,
  requests: 0,
};

function addUsage(total: TokenUsage, next: TokenUsage): TokenUsage {
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    responseTokens: total.responseTokens + next.responseTokens,
    thoughtsTokens: total.thoughtsTokens + next.thoughtsTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    requests: total.requests + next.requests,
  };
}

/** What the model reads back. `ToolResult.summary` is written for exactly this moment. */
function toResultPayload(result: ToolResult): Record<string, unknown> {
  return result.data === undefined
    ? { ok: result.ok, summary: result.summary }
    : { ok: result.ok, summary: result.summary, data: result.data };
}

/** Labels the snapshot turn, so the revert list reads like the conversation did. */
function snapshotLabel(userMessage: string): string {
  const oneLine = userMessage.replace(/\s+/g, ' ').trim();
  if (oneLine === '') return 'Agent turn';
  return oneLine.length > 60 ? `${oneLine.slice(0, 59)}…` : oneLine;
}

export async function runAgentTurn(options: RunAgentTurnOptions): Promise<AgentTurn> {
  const { userMessage, transport, session, signal, onTextDelta, onToolCall } = options;
  // `fallbackTools`, not the whole registry: this loop is the in-browser
  // assistant that answers when the laptop is asleep, and item 9 gave the
  // registry twice as many tools without giving this path the drawers that
  // keep a declaration small. See `tools/index.ts`.
  const tools = options.tools ?? fallbackTools;
  const model = options.model ?? TEXT_MODEL;

  const handle = session.beginTurn(snapshotLabel(userMessage));
  const ctx = session.createContext(handle);
  const systemPrompt = buildSystemPrompt(collectPromptState(ctx, options.preferences));
  const declarations = toToolDeclarations(tools);

  const history: AgentMessage[] = [
    ...(options.history ?? []),
    { role: 'user', parts: [{ type: 'text', text: userMessage }] },
  ];
  const toolCalls: AgentToolCall[] = [];
  let usage = EMPTY_USAGE;

  const drive = async (): Promise<{ text: string; stoppedAtIterationLimit: boolean }> => {
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
      const response = await transport.send(
        { model, systemPrompt, messages: history, tools: declarations },
        { signal, onTextDelta },
      );

      usage = addUsage(usage, response.usage);
      history.push(response.message);

      if (response.toolCalls.length === 0) {
        return { text: response.text, stoppedAtIterationLimit: false };
      }

      // Everything the model asked for in this round trip is answered in one
      // message, in the order it asked — that is how a provider pairs parallel
      // calls back up with their responses.
      const resultParts: ToolResultPart[] = [];
      for (const call of response.toolCalls) {
        if (signal?.aborted) throw new DOMException('Turn aborted', 'AbortError');

        const startedAt = Date.now();
        const result = await runTool(call.name, call.args, ctx);
        const executed: AgentToolCall = {
          name: call.name,
          args: call.args,
          ok: result.ok,
          summary: result.summary,
          data: result.data,
          durationMs: Date.now() - startedAt,
        };
        toolCalls.push(executed);
        onToolCall?.(executed);

        resultParts.push({ type: 'tool_result', id: call.id, name: call.name, result: toResultPayload(result) });
      }

      history.push({ role: 'tool', parts: resultParts });
    }

    // Out of iterations with the model still reaching for tools. One last
    // round trip with none declared makes it say what it has, which beats a
    // canned "I gave up" — and it is a single bounded call, so a model stuck
    // in a search loop still cannot run away.
    const forced = await transport.send(
      { model, systemPrompt, messages: history, tools: [] },
      { signal, onTextDelta },
    );
    usage = addUsage(usage, forced.usage);
    history.push(forced.message);
    return { text: forced.text, stoppedAtIterationLimit: true };
  };

  try {
    const { text, stoppedAtIterationLimit } = await drive();
    return { text, toolCalls, turnId: session.commitTurn(handle), usage, history, stoppedAtIterationLimit };
  } catch (err) {
    // The turn still has to be committed: the tools that already ran wrote to
    // the real store, and the only way back is the snapshot. It lands in the
    // ring under the user's own message, so it is revertible from the turn
    // list even though this call is about to throw.
    session.commitTurn(handle);
    throw err;
  }
}
