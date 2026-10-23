/**
 * Dev-only fixture for the model picker, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Both of the picker's lists are fetched — Google's models endpoint and
 * Ollama's `/api/tags` — and neither can be photographed as it stands. The
 * harness aborts every request off localhost, so Google's list never arrives;
 * and Ollama listens **on** localhost, so it is the one remote thing a shot
 * could accidentally reach. That second half is the real reason this file is
 * here: without it the `/chat` baselines would say something different on a
 * machine with Ollama running than on one without, and the diff would be a
 * fact about the room rather than about the code. (`screenshots.ts` closes
 * that door too, by allowing only the dev server's own origin — belt and
 * braces, because the two failures look identical in a diff.)
 *
 * So the harness navigates to `/chat?__dev-model-fixture__=1` and this module
 * hands back a literal catalogue instead. It is a *rendering* fixture and
 * nothing more: it contacts no model, and selecting a row in the shot would
 * store a choice and change nothing else.
 *
 * The entries are what Shreekant's own machine and key report, so the baseline
 * shows the picker as he sees it — four hosted, three Claude and ChatGPT, three
 * local, and Gemini Flash lit because `resolveSelection` prefers it since BIG-1.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts`, `devShareFixture.ts` and `devChatFixture.ts`.
 * The whole body sits behind a bare `import.meta.env.DEV`, which Vite replaces
 * with the literal `false` for a production build; the guard folds to a
 * constant, the bundler drops everything after it, and
 * `scripts/check-shots-bypass.mjs` greps `dist/` for the marker and fails the
 * build if it survives. **Do not read that flag into a variable first**, and
 * **do not lift anything below out to module scope** — a module-level `const`
 * is initialised whether or not the guarded function is reachable, which is
 * exactly how `devShareFixture`'s marker survived into `dist/` the first time.
 */
import type { ModelCatalogue } from './agent/models';

/**
 * The catalogue, or `null` for every ordinary visit to `/chat`.
 *
 * Takes `location.search` rather than reading it itself, so the caller's bare
 * `import.meta.env.DEV` is the only branch that decides anything.
 */
export function devModelFixture(search: string): ModelCatalogue | null {
  if (!import.meta.env.DEV) return null;
  if (!search.includes('__dev-model-fixture__')) return null;

  return {
    /*
     * `detail` is empty on the first three and set on the fourth, because that
     * is exactly what `parseGeminiModels` produces: it drops an id that is
     * only its display name slugified, and keeps one that surprises. The
     * fixture has to agree with the parser or the baseline photographs a row
     * shape the real list never has.
     */
    hosted: [
      {
        key: 'gemini:gemini-flash-latest',
        provider: 'gemini',
        id: 'gemini-flash-latest',
        label: 'Gemini Flash Latest',
        detail: '',
      },
      {
        key: 'gemini:gemini-flash-lite-latest',
        provider: 'gemini',
        id: 'gemini-flash-lite-latest',
        label: 'Gemini Flash-Lite Latest',
        detail: '',
      },
      {
        key: 'gemini:gemini-pro-latest',
        provider: 'gemini',
        id: 'gemini-pro-latest',
        label: 'Gemini Pro Latest',
        detail: '',
      },
      {
        key: 'gemini:gemini-2.0-flash-exp',
        provider: 'gemini',
        id: 'gemini-2.0-flash-exp',
        label: 'Gemini 2.0 Flash Experimental',
        detail: 'gemini-2.0-flash-exp',
      },
    ],
    local: [
      { key: 'ollama:qwen3.5:4b', provider: 'ollama', id: 'qwen3.5:4b', label: 'qwen3.5:4b', detail: '4.7B · 3.4 GB' },
      { key: 'ollama:qwen3.5:9b', provider: 'ollama', id: 'qwen3.5:9b', label: 'qwen3.5:9b', detail: '9.7B · 6.6 GB' },
      { key: 'ollama:gemma4:e4b', provider: 'ollama', id: 'gemma4:e4b', label: 'gemma4:e4b', detail: '8.0B · 9.6 GB' },
    ],
    /* BIG-1: what the laptop lists for one Claude key and one ChatGPT key —
       real ids, in the shape `parseCloudModels` produces. */
    cloud: [
      { key: 'anthropic:claude-sonnet-5', provider: 'anthropic', id: 'claude-sonnet-5', label: 'Claude Sonnet 5', detail: 'Claude' },
      { key: 'anthropic:claude-haiku-4-5', provider: 'anthropic', id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', detail: 'Claude' },
      { key: 'openai:gpt-5-mini', provider: 'openai', id: 'gpt-5-mini', label: 'gpt-5-mini', detail: 'ChatGPT' },
    ],
    cloudError: null,
    hostedWithoutChat: 0,
    localWithoutTools: 0,
    hostedError: null,
    localError: null,
  };
}
