/**
 * MCP, over stdio, by hand.
 *
 * WHY THERE IS NO SDK HERE
 * -------------------------
 * MCP is JSON-RPC 2.0 with a handful of named methods and a handshake. The
 * whole of what this server needs is below in about two hundred lines, and
 * writing it means Atlas — which is deliberately a zero-runtime-dependency
 * program (its `package.json` has no `dependencies` block at all) — can hold
 * the *client* half on the same terms. Pulling in a package for this would put
 * a dependency on both sides of a wire that carries newline-delimited JSON.
 *
 * THE TRANSPORT IS stdio, AND THAT IS THE SECURITY BOUNDARY
 * ----------------------------------------------------------
 * Atlas spawns this as a child process and talks to it down a pipe. There is
 * no socket, no port and no origin: nothing on any network can reach this
 * server, in the same way and for the same reason that Atlas itself binds to
 * loopback (DESIGN.md §9). It also means the Firebase service-account key this
 * process holds never leaves the machine it was put on.
 *
 * FRAMING
 * -------
 * One JSON object per line, both directions — the newline-delimited framing
 * MCP's stdio transport specifies. A message must therefore contain no raw
 * newline, which `JSON.stringify` guarantees (it escapes them inside strings),
 * and stdout must carry *nothing else*: a stray `console.log` anywhere in this
 * process corrupts the stream. Everything diagnostic goes to stderr, which is
 * why `log()` exists and why nothing here prints.
 */

import { createInterface } from 'node:readline';

/** The revision of MCP this server implements. Sent in the handshake and checked by nothing else. */
export const PROTOCOL_VERSION = '2025-06-18';

// ─── JSON-RPC shapes ────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  /** Absent on a notification, which takes no reply. */
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  /**
   * `null` only for a parse error, and the specification is explicit that this
   * is the case for it: a message that will not parse has no id to read back,
   * so there is nothing else honest to answer with.
   */
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

/** The subset of the JSON-RPC error codes this server can actually produce. */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// ─── MCP shapes ─────────────────────────────────────────────────────────────

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

export interface McpServerHandlers {
  /** Name and version, as the client displays them. */
  serverInfo: { name: string; version: string };
  listTools(): Promise<McpTool[]> | McpTool[];
  /**
   * Runs one tool.
   *
   * `meta` is the request's own `_meta` (item 13) — facts about the *call*
   * rather than arguments to the tool, which is the distinction MCP reserves
   * that field for. Two things arrive in it, and a client that sends neither
   * behaves exactly as one did before this item:
   *
   * - `turnId` — which of Atlas's turns this call belongs to. It is what lets
   *   §5.4's "Shreekant always wins" check know the window that matters:
   *   between Atlas reading a task and Atlas writing it.
   * - `preview` — look up what the call *would* do and write nothing, which
   *   is what fills a front-door approval card (§5.2).
   */
  callTool(
    name: string,
    args: Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): Promise<McpToolResult>;
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

/**
 * stderr, always. stdout is the protocol stream and one stray byte on it
 * desynchronises the client — see the framing note above.
 */
export function log(...parts: unknown[]): void {
  process.stderr.write(`${parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')}\n`);
}

// ─── The server loop ────────────────────────────────────────────────────────

function isRequest(value: unknown): value is JsonRpcRequest {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === '2.0' && typeof candidate.method === 'string';
}

/**
 * The two streams the protocol runs on. Injectable for the same reason
 * `AgentStore` and `AgentTransport` are in the app: so the whole of this file
 * can be driven from a test with no child process, no Firebase and no model.
 * Defaults to the real pipes, which is what `index.ts` uses.
 */
export interface StdioChannel {
  input: NodeJS.ReadableStream;
  output: { write(chunk: string): unknown };
}

/**
 * Reads requests from stdin and writes responses to stdout until the pipe
 * closes.
 *
 * Resolves when stdin ends, which is how Atlas stops this process: it closes
 * the pipe and the loop falls out. There is no shutdown method in MCP's stdio
 * transport and none is needed.
 */
export async function serveStdio(handlers: McpServerHandlers, channel?: StdioChannel): Promise<void> {
  const io: StdioChannel = channel ?? { input: process.stdin, output: process.stdout };

  const send = (message: JsonRpcResponse): void => {
    io.output.write(`${JSON.stringify(message)}\n`);
  };

  const fail = (id: string | number, code: number, message: string, data?: unknown): void => {
    send({ jsonrpc: '2.0', id, error: { code, message, ...(data === undefined ? {} : { data }) } });
  };

  /** Whether `initialize` has been answered. Everything else waits for it. */
  let ready = false;

  const handle = async (request: JsonRpcRequest): Promise<void> => {
    // A notification has no id and takes no reply — `notifications/initialized`
    // is the one this server actually receives. Answering it would be a
    // protocol violation, so the absence of an id is checked before anything
    // else.
    if (request.id === undefined) return;
    const id = request.id;

    if (request.method === 'initialize') {
      ready = true;
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          // Only `tools`. No resources, no prompts, no sampling: this server
          // exposes actions on a task list and nothing else, and advertising a
          // capability it does not implement is how a client ends up calling a
          // method that returns an error instead of a feature.
          capabilities: { tools: { listChanged: false } },
          serverInfo: handlers.serverInfo,
        },
      });
      return;
    }

    if (!ready) {
      fail(id, RPC.INVALID_REQUEST, 'The client must call "initialize" before anything else.');
      return;
    }

    try {
      switch (request.method) {
        case 'ping':
          // MCP's keepalive. An empty result is the whole specified response.
          send({ jsonrpc: '2.0', id, result: {} });
          return;

        case 'tools/list':
          send({ jsonrpc: '2.0', id, result: { tools: await handlers.listTools() } });
          return;

        case 'tools/call': {
          const params = request.params ?? {};
          const name = params.name;
          if (typeof name !== 'string' || name === '') {
            fail(id, RPC.INVALID_PARAMS, '"name" is required and must be a tool name.');
            return;
          }
          const rawArgs = params.arguments;
          const args =
            rawArgs === undefined || rawArgs === null
              ? {}
              : typeof rawArgs === 'object' && !Array.isArray(rawArgs)
                ? (rawArgs as Record<string, unknown>)
                : null;
          if (args === null) {
            fail(id, RPC.INVALID_PARAMS, '"arguments" must be an object.');
            return;
          }
          /* Item 13. A malformed `_meta` is ignored rather than refused: it is
             out-of-band by definition, and failing a real tool call over
             decoration would be the wrong trade. */
          const rawMeta = params._meta;
          const meta =
            typeof rawMeta === 'object' && rawMeta !== null && !Array.isArray(rawMeta)
              ? (rawMeta as Record<string, unknown>)
              : undefined;
          send({ jsonrpc: '2.0', id, result: await handlers.callTool(name, args, meta) });
          return;
        }

        default:
          fail(id, RPC.METHOD_NOT_FOUND, `This server does not implement "${request.method}".`);
      }
    } catch (err) {
      /*
       * A throw that escapes a handler is a bug in this server, not a tool
       * saying no — `defineTool` already turns the latter into an ordinary
       * result. It is reported as a protocol error and the loop keeps running:
       * killing the process would take out every later call in the turn over
       * one bad one.
       */
      const detail = err instanceof Error ? err.message : String(err);
      log(`[mcp] ${request.method} threw:`, detail);
      fail(id, RPC.INTERNAL_ERROR, detail);
    }
  };

  const lines = createInterface({ input: io.input });

  /*
   * Requests are handled strictly in order, and that is deliberate rather than
   * lazy. Every write goes through one hydrated copy of the app's store, so two
   * calls running concurrently would interleave reads and writes on it and the
   * second would overwrite the first's changes. JSON-RPC allows out-of-order
   * responses; this server simply never produces any.
   */
  let queue: Promise<void> = Promise.resolve();
  /** Every reply goes through the queue, so none can overtake an earlier one. */
  const enqueue = (work: () => void | Promise<void>) => {
    queue = queue.then(work);
  };

  for await (const line of lines) {
    const text = line.trim();
    if (text === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      /*
       * No id to answer with — a message that will not parse has no id to read
       * — so the specification's null-id error response is the only honest
       * reply.
       *
       * Queued rather than written straight out, which is not fussiness: a
       * direct write is synchronous and would jump ahead of a reply still
       * waiting on the queue, so a bad line arriving during a slow tool call
       * would be answered BEFORE the call it followed. That is legal JSON-RPC
       * and it makes the ordering claim above false, which is worse than the
       * microsecond it costs.
       */
      enqueue(() => {
        send({ jsonrpc: '2.0', id: null, error: { code: RPC.PARSE_ERROR, message: 'Invalid JSON.' } });
      });
      continue;
    }

    if (!isRequest(parsed)) {
      const id = (parsed as { id?: string | number })?.id;
      if (id !== undefined) enqueue(() => fail(id, RPC.INVALID_REQUEST, 'Not a JSON-RPC 2.0 request.'));
      continue;
    }

    enqueue(() => handle(parsed as JsonRpcRequest));
  }

  await queue;
}
