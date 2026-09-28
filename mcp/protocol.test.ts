import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { RPC, serveStdio, type McpServerHandlers, type McpTool } from './protocol.ts';

/**
 * The MCP wire, driven in process.
 *
 * This is the half of item 9 that a type-checker cannot see: framing, the
 * handshake gate, which failures are *protocol* errors and which are ordinary
 * tool results. The tools themselves are covered by `tools/scratch.ts` and the
 * client half by Atlas's own tests; what is left is exactly this file, and it
 * is worth its own test because a stdio protocol fails silently — a
 * desynchronised stream looks like a hang, not like an error.
 */

const TOOLS: McpTool[] = [
  { name: 'search_tasks', description: 'Find tasks.', inputSchema: { type: 'object', properties: {} }, _meta: { drawer: 'tasks' } },
];

/** Runs the server against two pipes and returns every response it wrote. */
async function exchange(
  requests: unknown[],
  handlers: Partial<McpServerHandlers> = {},
): Promise<Record<string, unknown>[]> {
  const input = new PassThrough();
  const written: string[] = [];
  const output = { write: (chunk: string) => written.push(chunk) };

  const done = serveStdio(
    {
      serverInfo: { name: 'mutineer-os', version: '1.0.0' },
      listTools: () => TOOLS,
      callTool: async (name, args) => ({ content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }] }),
      ...handlers,
    },
    { input, output },
  );

  for (const request of requests) {
    input.write(`${typeof request === 'string' ? request : JSON.stringify(request)}\n`);
  }
  input.end();
  await done;

  return written.join('').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line));
}

const INIT = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };

describe('the MCP wire', () => {
  it('answers the handshake and advertises only tools', async () => {
    const [reply] = await exchange([INIT]);

    expect(reply.id).toBe(1);
    const result = reply.result as Record<string, unknown>;
    expect(result.serverInfo).toEqual({ name: 'mutineer-os', version: '1.0.0' });
    // Advertising a capability this server does not implement is how a client
    // ends up calling a method that returns an error instead of a feature.
    expect(Object.keys(result.capabilities as object)).toEqual(['tools']);
  });

  it('refuses everything before initialize', async () => {
    const [reply] = await exchange([{ jsonrpc: '2.0', id: 7, method: 'tools/list' }]);

    expect((reply.error as { code: number }).code).toBe(RPC.INVALID_REQUEST);
  });

  it('carries a tool\'s drawer through in _meta', async () => {
    const [, list] = await exchange([INIT, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]);

    const tools = (list.result as { tools: McpTool[] }).tools;
    // The drawer is the one thing the client cannot work out for itself, and
    // `_meta` is where MCP puts data like this.
    expect(tools[0]._meta).toEqual({ drawer: 'tasks' });
  });

  it('passes arguments through and returns the tool\'s text', async () => {
    const [, call] = await exchange([
      INIT,
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_tasks', arguments: { query: 'tax' } } },
    ]);

    expect((call.result as { content: { text: string }[] }).content[0].text).toBe('search_tasks:{"query":"tax"}');
  });

  it('never answers a notification', async () => {
    // `notifications/initialized` has no id. Replying to one is a protocol
    // violation, and this is the notification the client actually sends.
    const replies = await exchange([INIT, { jsonrpc: '2.0', method: 'notifications/initialized' }]);

    expect(replies).toHaveLength(1);
  });

  it('reports an unknown method rather than dying on it', async () => {
    const [, reply] = await exchange([INIT, { jsonrpc: '2.0', id: 4, method: 'resources/list' }]);

    expect((reply.error as { code: number }).code).toBe(RPC.METHOD_NOT_FOUND);
  });

  it('answers a line of broken JSON and keeps serving', async () => {
    const replies = await exchange([INIT, 'not json at all', { jsonrpc: '2.0', id: 5, method: 'ping' }]);

    expect((replies[1].error as { code: number }).code).toBe(RPC.PARSE_ERROR);
    // The parse error has no id to answer with, so the specification's null is
    // the only honest reply — and the next request still lands.
    expect(replies[1].id).toBeNull();
    expect(replies[2]).toMatchObject({ id: 5, result: {} });
  });

  it('turns a handler that throws into a protocol error, not a dead server', async () => {
    const replies = await exchange(
      [
        INIT,
        { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'boom', arguments: {} } },
        { jsonrpc: '2.0', id: 7, method: 'ping' },
      ],
      {
        callTool: async (name) => {
          if (name === 'boom') throw new Error('the store exploded');
          return { content: [] };
        },
      },
    );

    expect((replies[1].error as { code: number; message: string })).toMatchObject({
      code: RPC.INTERNAL_ERROR,
      message: 'the store exploded',
    });
    // Killing the process over one bad call would take out every later call in
    // the same turn.
    expect(replies[2]).toMatchObject({ id: 7 });
  });

  it('rejects a call with no tool name', async () => {
    const [, reply] = await exchange([INIT, { jsonrpc: '2.0', id: 8, method: 'tools/call', params: { arguments: {} } }]);

    expect((reply.error as { code: number }).code).toBe(RPC.INVALID_PARAMS);
  });

  it('handles requests strictly in order, because they share one hydrated store', async () => {
    const order: string[] = [];
    const replies = await exchange(
      [
        INIT,
        { jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'slow', arguments: {} } },
        { jsonrpc: '2.0', id: 11, method: 'tools/call', params: { name: 'fast', arguments: {} } },
      ],
      {
        callTool: async (name) => {
          if (name === 'slow') await new Promise((resolve) => setTimeout(resolve, 40));
          order.push(name);
          return { content: [{ type: 'text', text: name }] };
        },
      },
    );

    // Two calls running at once would interleave reads and writes on the one
    // copy of the app's store, and the second would overwrite the first.
    expect(order).toEqual(['slow', 'fast']);
    expect(replies.map((reply) => reply.id)).toEqual([1, 10, 11]);
  });
});
