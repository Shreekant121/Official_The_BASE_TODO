import { liveAgentStore } from '../../agent/liveContext';
import { resolveUserTimeZone } from '../../agent/dates';
import { APP_TOOL_SERVER, createToolServer } from '../../agent/toolServer/index';
import type { McpToolSource } from './atlasEngine.generated';

/**
 * The app's tools as Atlas sees a server, for Atlas running in this page with
 * the lid shut (BIG-12).
 *
 * The handler is the laptop's MCP server's own (`toolServer/index.ts`) — the
 * preview that never writes, §5.4's guard, the undo capture — and the name is
 * the laptop's too, so an undo token made here is applied there and the other
 * way round. What differs is only the host: the store in this page is already
 * the live one, so there is no read before a call and no flush after it;
 * `firestoreSync` pushes a change as it would a hand edit.
 */
export function appToolSource(): McpToolSource {
  const server = createToolServer({
    agentStore: liveAgentStore,
    withFreshState: (_mutates, run) => run(),
    timezone: () => resolveUserTimeZone(),
  });
  return {
    name: APP_TOOL_SERVER,
    listTools: async () => server.listTools(),
    callTool: (name, args, meta) => server.callTool(name, args, meta),
  };
}
