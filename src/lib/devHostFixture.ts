/**
 * Dev-only fixture for `/atlas-host`, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every fact on that screen comes from one `fetch` to a laptop over Tailscale,
 * and the harness aborts everything off its own origin — so without this there
 * is exactly one photographable state, "asleep", and the screen's whole reason
 * for existing has no baseline. Worse, the three states it distinguishes are
 * the ones most worth guarding: **awake with hands**, **awake without them**
 * (the laptop is up and its MCP server did not start, which is a real fault
 * with a real fix), and **asleep**.
 *
 * It is a *rendering* fixture and nothing more. It contacts no laptop and
 * writes nothing; it hands the store a snapshot that a landed probe would have
 * produced. The numbers are what Shreekant's own machine reports, so the
 * baseline shows the screen as he sees it.
 *
 * Pair it with `__dev-model-fixture__` — the model residency panel lists what
 * Atlas says is installed, which is the other blocked fetch, and that file
 * already has the literal for it.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts`, `devShareFixture.ts`, `devChatFixture.ts`
 * and `devModelFixture.ts`. The whole body sits behind a bare
 * `import.meta.env.DEV`, which Vite replaces with the literal `false` for a
 * production build; the guard folds to a constant, the bundler drops
 * everything after it, and `scripts/check-shots-bypass.mjs` greps `dist/` for
 * the marker and fails the build if it survives. **Do not read that flag into
 * a variable first**, and **do not lift anything below out to module scope** —
 * a module-level `const` is initialised whether or not the guarded function is
 * reachable, which is how `devShareFixture`'s marker survived into `dist/` the
 * first time.
 */
import type { AtlasSnapshot } from './atlas/atlasStore';

/**
 * A landed probe, or `null` for every ordinary visit to `/atlas-host`.
 *
 * Takes `location.search` rather than reading it itself, so the caller's bare
 * `import.meta.env.DEV` is the only branch that decides anything.
 */
export function devHostFixture(search: string): AtlasSnapshot | null {
  if (!import.meta.env.DEV) return null;
  const match = /__dev-host-fixture__=([a-z-]+)/.exec(search);
  if (!match) return null;

  const baseUrl = 'https://your-laptop.your-tailnet.ts.net';

  if (match[1] === 'asleep') {
    return { status: 'asleep', baseUrl, health: null, roundTripMs: null };
  }

  const tools = match[1] !== 'no-tools';

  return {
    status: 'awake',
    baseUrl,
    roundTripMs: 38,
    health: {
      ok: true,
      version: '0.9.0',
      stage: { item: 9, tools },
      defaultModel: 'gemma4:e4b',
      numCtx: 32768,
      ollama: {
        reachable: true,
        base: 'http://127.0.0.1:11434',
        models: 3,
        // One entry, because this machine keeps one model resident
        // (DESIGN.md §2.6) — and it is the picker's default, which is what
        // makes the "resident" and "on disk" pills differ in the baseline.
        loaded: ['gemma4:e4b'],
      },
      gemini: { configured: true },
      /* BIG-1: this laptop's Atlas takes cloud turns, so the default Gemini pick
         runs there — the chat baselines stay Atlas chats. */
      hosted: { providers: ['gemini', 'anthropic', 'openai'], keysFromRequest: true },
      mcp: tools
        ? { connected: ['mutineer-os'], failed: [] }
        : {
            connected: [],
            /* The real failure, worded as Atlas words it. A laptop without the
               Firebase service-account key is the case item 9 shipped this
               field for, and the reason is the only part anyone can act on. */
            failed: [
              {
                name: 'mutineer-os',
                reason: 'FIREBASE_SERVICE_ACCOUNT is not set — the server exited before it connected.',
              },
            ],
          },
    },
  };
}
