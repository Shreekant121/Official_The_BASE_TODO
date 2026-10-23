import { liveSnapshotCapture } from '../liveContext';
import { drawerOf, DRAWERS, frontDoorKindOf, getTool, mcpTools } from '../tools/index';
import type { AgentStore, ToolContext } from '../types';
import { ConsistencyGuard, idsIn } from './consistency';
import { applyUndo, beginCapture, endCapture } from './undo';
import { withoutUndoAsync } from '../../../store/undoGate';
import { asAtlas } from '../../../store/storyActor';

/**
 * The app's tools as an MCP server describes and runs them — one handler, two
 * hosts (BIG-12).
 *
 * On the laptop it is `mcp/index.ts`, a Node process Atlas spawns, which reads
 * Firestore fresh before every call and writes back after. With the lid shut
 * it is the tablet's own page, where Atlas now runs too (`lib/atlas/engine/`)
 * and the store in the page is already the live one. Everything that makes a
 * call safe — the preview that never writes, §5.4's "Shreekant always wins"
 * guard, the undo capture whose token Atlas files in its log — is here, once,
 * so neither host can drift from the other. Moved out of `mcp/index.ts`
 * verbatim; only the two things that differ are the host's: how state is
 * made fresh, and whose timezone "today" is.
 */

/** The server's name. An undo token is addressed to it, so both hosts must use this one. */
export const APP_TOOL_SERVER = 'mutineer-os';

/** One tool as `tools/list` returns it. `inputSchema` is JSON Schema, MCP's own spelling. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /**
   * Out-of-band metadata. MCP reserves the `_meta` key for exactly this, and
   * it is where the drawer a tool belongs to travels — a client that does not
   * know the word ignores it and gets a flat tool list, which is the correct
   * degradation.
   */
  _meta?: Record<string, unknown>;
}

/**
 * What `tools/call` returns.
 *
 * `content` is what a model reads; `isError` is a *tool* failure rather than a
 * protocol one — the call was well-formed and the tool said no. The
 * distinction is load-bearing: a protocol error aborts the turn, while a tool
 * error is a sentence the model reads and recovers from, which is the whole
 * design of `ToolResult.summary`.
 */
export interface McpToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
  /** The tool's own structured payload, echoed for a client that wants it unparsed. */
  structuredContent?: unknown;
  /**
   * Out-of-band data, the same `_meta` key `McpTool` uses (item 13).
   *
   * This is where an **undo token** rides home: a complete copy of every
   * entity the call touched, which Atlas files in its action log and hands
   * back here when Shreekant taps Revert. It is deliberately not
   * `structuredContent` — that field is the tool's own payload and goes to the
   * model, and this must never cost a model a single token.
   */
  _meta?: Record<string, unknown>;
}

export interface ToolServerHost {
  /** The store the tools act on. */
  agentStore: AgentStore;
  /**
   * Runs one call against fresh state. On the laptop that is a Firestore read
   * before and, for a write, a flush after; in the browser the store is
   * already live and this simply runs it.
   */
  withFreshState<T>(mutates: boolean, run: () => Promise<T>): Promise<T>;
  /** Shreekant's zone — "today" is his, not the machine's. */
  timezone(): string;
}

export interface ToolServer {
  listTools(): McpTool[];
  callTool(name: string, args: Record<string, unknown>, meta?: Record<string, unknown>): Promise<McpToolResult>;
}

/**
 * The registry, as MCP describes tools.
 *
 * The drawer travels in `_meta`, which MCP reserves for out-of-band data. A
 * client that ignores it sees a flat list of every tool and still works; Atlas
 * reads it and shows the model one drawer at a time (DESIGN.md §7.1). The
 * drawer definitions ride along on the first tool of each so a client can
 * render a drawer's own title and description without a second call.
 */
export function describeTools(): McpTool[] {
  return mcpTools.map((tool) => {
    const drawer = drawerOf(tool.name);
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parametersSchema as unknown as Record<string, unknown>,
      _meta: {
        drawer,
        drawerTitle: drawer ? DRAWERS[drawer].title : undefined,
        drawerDescription: drawer ? DRAWERS[drawer].description : undefined,
        mutates: tool.mutates,
        /*
         * Item 13, DESIGN.md §5.2. Declared by the server that owns the act,
         * because whether something can be taken back is a fact about the act
         * — Atlas holding a list of irreversible tool names would be Atlas
         * knowing what its servers do, which is the one thing the MCP boundary
         * exists to prevent. `tools/index.ts` throws at import if a
         * known-irreversible name is registered without it.
         */
        frontDoor: tool.frontDoor === true,
        /*
         * BUILD-3. WHY it is behind the door — `irreversible` (a share link,
         * mail) or `undoable` (a delete that takes a whole project or list, and
         * that Revert can still fetch back from the Trash). Atlas words the
         * waiting sentence, the tray card and the log from it, and treats a
         * front-door tool with no kind as irreversible, which is the safe
         * reading for a server that has never heard of this field.
         */
        frontDoorKind: frontDoorKindOf(tool),
      },
    };
  });
}

export function createToolServer(host: ToolServerHost): ToolServer {
  /* §5.4, per turn. One per server because one server serves one Atlas, and
     `enterTurn` empties it whenever the turn id changes. */
  const guard = new ConsistencyGuard();

  return {
    listTools: () => describeTools(),

    async callTool(name, args, meta): Promise<McpToolResult> {
    /*
     * ITEM 13: PUTTING A CHANGE BACK IS NOT A TOOL THE MODEL CAN SEE.
     *
     * `revert_actions` is handled here and is absent from `tools/list`, so
     * it costs no tokens and the model can never reach for it. Reverting is
     * something *Shreekant* does, from the action log, and routing it down
     * the same pipe is what lets Atlas offer the button without knowing what
     * undoing a task means (DESIGN.md §5.3, `undo.ts`).
     */
    if (name === 'revert_actions') {
      /* 29-1P4a: not his press, so not in his undo (`store/undoGate.ts`). */
      const report = await withoutUndoAsync(() => host.withFreshState(true, async () =>
        applyUndo((args as { payload?: unknown }).payload),
      ));
      return { content: [{ type: 'text', text: report.summary }], isError: !report.ok };
    }

    const tool = getTool(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: `There is no tool called "${name}". Available tools: ${mcpTools.map((t) => t.name).join(', ')}.`,
          },
        ],
        isError: true,
      };
    }

    /*
     * ITEM 13: A PREVIEW NEVER WRITES, AND THAT IS ENFORCED HERE RATHER THAN
     * TRUSTED OF THE TOOL.
     *
     * `preview` reaches the tool as `ctx.preview` so that it can *describe*
     * what it would do — which is what fills a front-door approval card. But
     * the safety does not rest on the tool honouring it: a preview runs
     * through the read-only path, which never flushes, and the next call
     * re-hydrates from Firestore. So a tool that ignored the flag entirely
     * would still change nothing outside this process's memory for one call.
     */
    const preview = meta?.preview === true;
    const mutates = tool.mutates && !preview;
    const turnId = typeof meta?.turnId === 'string' ? meta.turnId : null;
    guard.enterTurn(turnId);

    /* 29-1P4a: Atlas's writes run through the store actions his tick boxes
       call, and since BIG-12 in this page too. They are Atlas's to revert,
       from /log, never his undo's (`store/undoGate.ts`). */
    /* 29-1P9c: and the task's story says Atlas did it (`store/storyActor.ts`).
       A Revert, above, is his, so it is not wrapped. */
    const result = await asAtlas(() => withoutUndoAsync(() => host.withFreshState(mutates, async () => {
      /*
       * `now` is pinned per call rather than per turn, which is the one
       * place this host is weaker than the browser's. In the app a whole
       * turn shares one clock (decision D14) so six tool calls cannot
       * disagree about "tomorrow"; over MCP each call arrives on its own.
       * Item 13 puts a `turnId` in `_meta` — used below for §5.4 — so the
       * grouping now exists and pinning the clock to it is the obvious next
       * step; it is not taken here because it changes what dates a turn
       * resolves to, which is a behaviour change wanting its own session.
       *
       * The timezone is Shreekant's, not the laptop's, for the reason the
       * chat route already gives: the tablet decides what "today" is.
       */
      const ctx: ToolContext = {
        snapshotHandle: beginCapture(turnId ?? 'no-turn', name),
        now: new Date(),
        timezone: host.timezone(),
        store: host.agentStore,
        ...(preview ? { preview: true } : {}),
        /*
         * ITEM 13: THE SNAPSHOT RING RUNS HERE NOW.
         *
         * It used to be three no-ops with a note saying the action log would
         * replace them. It does — but not by replacing the *capture*, which
         * was always the right mechanism and the only one that knows to keep
         * the first value a turn saw. What the log adds is durability: the
         * entries are lifted out after the call and travel to Atlas, which
         * writes them to the laptop. See `undo.ts`.
         */
        snapshots: liveSnapshotCapture,
      };

      /*
       * §5.4, checked before the tool runs and after the fresh read.
       *
       * The targets come out of the *arguments* — every id the model named —
       * and are matched against what Atlas saw earlier in this turn. See
       * `consistency.ts` for why this is not the same thing as
       * `withFreshState` re-reading.
       */
      if (mutates) {
        const refusal = guard.check(host.agentStore.getState(), idsIn(args));
        if (refusal !== null) return { ok: false, summary: refusal, handle: ctx.snapshotHandle };
      }

      const outcome = await tool.execute(args, ctx);
      return { ...outcome, handle: ctx.snapshotHandle };
    })));

    const { handle, ...toolResult } = result;
    /* Closed unconditionally — a capture left open would pin every entity a
       refused call touched in a process that lives as long as Atlas does.
       Only a write that actually landed produces a token. */
    const captured = endCapture(handle);
    const undo = mutates && toolResult.ok ? captured : null;

    /*
     * What Atlas has now seen, recorded after the call rather than before.
     *
     * A read records what it returned; a successful write records the new
     * value, so Atlas writing the same task twice in one turn is not Atlas
     * fighting itself. Both come from the freshly-read state the call just
     * ran against.
     */
    const state = host.agentStore.getState();
    if (!mutates) guard.observe(state, idsIn(toolResult.data));
    else if (toolResult.ok) guard.refresh(state, idsIn(args));

    return {
      // `summary` is written to be read by a model on its next turn — that
      // is its whole purpose — so it is the text content, and the structured
      // payload rides alongside for a client that wants it.
      content: [{ type: 'text', text: toolResult.summary }],
      isError: !toolResult.ok,
      structuredContent: toolResult.data === undefined ? undefined : toolResult.data,
      /* Item 13. Beside the result, never inside it — this is a complete
         copy of everything the call touched and must not cost the model a
         token. `drawers.ts` on Atlas's side reads it. */
      ...(undo === null ? {} : { _meta: { undo: { payload: undo } } }),
    };
    },
  };
}
