import { defineConfig } from 'vitest/config';

/**
 * Unit tests, deliberately narrow. `npm run shots` covers what the app *looks*
 * like; this covers the two things a picture cannot show — that deleting
 * something leaves nothing behind pointing at it, and that restoring it puts
 * everything back. Both are pure data transforms by design (see
 * `src/lib/cascadeDelete.ts`), which is what makes them testable at all.
 *
 * Node environment, no jsdom: the store under test is a plain Zustand store
 * and the modules around it hold no DOM. `setup.ts` supplies the two browser
 * globals Zustand's `persist` middleware expects.
 *
 * `mcp/` is included as well as `src/` (item 9). It is the MCP server Atlas
 * talks to, it runs on Node, and its wire protocol is the one thing here that
 * fails *silently* when it is wrong — a desynchronised stdio stream looks like
 * a hang rather than an error, so it is worth asserting rather than watching.
 *
 * `server/` too (BUILD-6): `keyAccess.test.ts` drives the real `api/chat.ts`
 * to prove a new account cannot spend the owner's Gemini key. The test lives
 * there and not in `api/`, where Vercel would try to deploy it as a function.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'mcp/**/*.test.ts', 'server/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
