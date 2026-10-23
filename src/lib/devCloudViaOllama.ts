/**
 * Dev-only: Claude and ChatGPT answered by Ollama on this laptop, for testing
 * Atlas on the tablet path (BIG-12) without a cloud call.
 *
 * WHY THIS EXISTS
 * ---------------
 * With the lid shut the tablet runs Atlas itself and calls the three clouds
 * straight from the browser. Shreekant's rule is that nothing is judged on a
 * cloud model and no cloud call is made without asking him (the session
 * protocol, rule 6). Ollama speaks both Anthropic's `/v1/messages` and
 * OpenAI's `/v1/responses` (measured on 0.34.4, 2026-09-29, for BIG-1), so a
 * turn picked as `anthropic:gemma4:e4b` runs every line of the Claude path —
 * the SDK in the browser, streaming, tool calls — on gemma, for nothing.
 *
 * Switched on per tab with `localStorage['__dev-cloud-via-ollama__'] =
 * 'http://127.0.0.1:11434'`. Ollama allows a `localhost` page's origin by
 * default, so the dev server can reach it; a deployed page never can.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * The fixtures' mechanism (`devModelFixture.ts` has the whole argument): the
 * body sits behind a bare `import.meta.env.DEV`, nothing is lifted to module
 * scope, and `scripts/check-shots-bypass.mjs` fails the build if the marker
 * survives into `dist/`.
 */
export function devCloudViaOllama(): { anthropicBaseUrl: string; openaiBaseUrl: string } | undefined {
  if (!import.meta.env.DEV) return undefined;
  let base: string | null;
  try {
    base = localStorage.getItem('__dev-cloud-via-ollama__');
  } catch {
    return undefined;
  }
  if (base === null || base.trim() === '') return undefined;
  const origin = base.trim().replace(/\/$/, '');
  return { anthropicBaseUrl: origin, openaiBaseUrl: `${origin}/v1` };
}
