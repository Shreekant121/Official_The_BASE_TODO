import { create } from 'zustand';
import { GEMINI_API_BASE, MODELS_ENDPOINT } from './constants';
import { atlasBaseUrl, fetchAtlasModels } from '../atlas/client';
import { getActiveApiKey } from './apiKeys';
import {
  EMPTY_CATALOGUE,
  parseGeminiModels,
  parseOllamaModels,
  resolveSelection,
  type ModelCatalogue,
  type ModelOption,
} from './models';

/**
 * The two model lists, fetched, and which one the user picked (item 6).
 *
 * The I/O half of `models.ts` — same split as `transports/` and `providers/`,
 * and for the same reason: everything that decides anything is next door and
 * pure, and this file is the `fetch`, the Firebase token and the Zustand
 * store, none of which can be asserted against a literal.
 *
 * **The choice is stored in `localStorage` and nowhere else.** Not in the
 * persisted app store, not in `buildSyncPayload`, not in the `agentKeys`
 * document `apiKeys.ts` syncs.
 *
 * The *reason* changed under item 8 and the decision did not. It used to be
 * that which models exist is a fact about the machine the browser is on — the
 * desktop could reach Ollama and the tablet could not — so a synced choice
 * would push a model at a device with no way to run it. **Atlas ends that
 * asymmetry**: every device now sees the same laptop's models, so the tablet
 * and the desktop would agree. What is still device-local is whether Atlas is
 * reachable *at all* from here, and a choice synced from a device on the
 * tailnet to one that is off it would select a model that cannot answer. Same
 * failure, one layer up. Keep it local.
 */

const STORAGE_KEY = 'mutineer_model_choice';

function readChoice(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeChoice(key: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (key === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Private mode / quota. The choice still holds for this session.
  }
}

/**
 * Imported on demand, exactly as `geminiTransport.ts` does it: `lib/firebase.ts`
 * initialises an app the moment it is evaluated, which would make this module
 * unusable outside a Vite bundle and drag the SDK into every test that touches
 * a model list.
 */
async function firebaseIdToken(): Promise<string | null> {
  const { auth } = await import('../firebase');
  return (await auth.currentUser?.getIdToken()) ?? null;
}

// ─── The two fetches ────────────────────────────────────────────────────────

/**
 * Gemini's list, by whichever route the active key implies — the user's own
 * key goes straight to Google, and with none the proxy answers with the
 * deployment's. The same fork the chat request makes, for the same reason
 * (D8): the browser never holds `GEMINI_API_KEY`.
 */
async function fetchGeminiModels(signal: AbortSignal): Promise<{ models: ModelOption[]; withoutChat: number }> {
  const apiKey = getActiveApiKey();

  const res = apiKey
    ? await fetch(`${GEMINI_API_BASE}/models?pageSize=200`, {
        headers: { 'x-goog-api-key': apiKey },
        signal,
      })
    : await fetch(MODELS_ENDPOINT, {
        headers: await proxyHeaders(),
        signal,
      });

  if (!res.ok) {
    // Plain `vite` has no serverless runtime, so `/api/models` falls through to
    // the SPA's index.html. Same trap as the chat endpoint, same answer.
    if (!apiKey && (res.headers.get('content-type') ?? '').includes('text/html')) {
      throw new Error('The models endpoint is not running here — `npm run dev:full` serves it.');
    }
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const code = typeof body?.error === 'string' ? body.error : res.status;
    throw new Error(
      code === 'not_configured'
        ? 'The server has no GEMINI_API_KEY, so it cannot list models.'
        : code === 'own_key_required'
          ? 'Add your own Gemini key in Settings → Connections to see these models.'
          : code === 'assistant_off'
            ? 'The assistant is switched off for this account.'
            : `Could not list Gemini's models (${code}).`,
    );
  }

  // A 200 that is not JSON is the dev-server fall-through again, this time
  // without an error status to notice it by.
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    throw new Error('The models endpoint is not running here — `npm run dev:full` serves it.');
  }

  return parseGeminiModels(await res.json());
}

async function proxyHeaders(): Promise<Record<string, string>> {
  const token = await firebaseIdToken();
  if (!token) throw new Error('Sign in to see the hosted models.');
  return { Authorization: `Bearer ${token}` };
}

/**
 * What is installed **on the laptop**, asked of Atlas (item 8).
 *
 * THIS FETCH IS THE WHOLE OF WHY LOCAL MODELS WORK ON THE TABLET NOW
 * -------------------------------------------------------------------
 * It used to go to `OLLAMA_BASE` — `http://localhost:11434`, the *browser's*
 * own machine. That single URL was the reason the picker carried a permanent
 * caveat: from the tablet, `localhost` is the tablet, there is no daemon
 * there, and the local group was always empty. It now goes to Atlas over
 * Tailscale, so the list is the laptop's list wherever the app is open.
 *
 * The payload is unchanged — Atlas proxies Ollama's `/api/tags` verbatim —
 * so `parseOllamaModels` and its tests did not move a line. That is the seam
 * item 6 built paying for itself: the parser never knew which machine it was
 * reading about.
 *
 * Its failure is still the ordinary case rather than an exception. An app
 * opened with the laptop shut has no local models and says so in a line.
 */
async function fetchLocalModels(signal: AbortSignal): Promise<{ models: ModelOption[]; withoutTools: number }> {
  const baseUrl = atlasBaseUrl();
  if (baseUrl === null) {
    throw new Error('No Atlas host is configured, so there is no laptop to ask.');
  }

  try {
    return parseOllamaModels(await fetchAtlasModels(baseUrl, signal));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Asleep, off the tailnet, or Ollama stopped. The picker's empty state
    // covers all three, because the fix for all three is the same: wake the
    // laptop.
    throw new Error(
      err instanceof Error && err.message.startsWith('Atlas answered')
        ? err.message
        : 'Atlas is not answering, so the laptop’s models cannot be listed.',
      { cause: err },
    );
  }
}

// ─── The store ──────────────────────────────────────────────────────────────

interface ModelState extends ModelCatalogue {
  /** `null` means "nothing chosen" — `resolveSelection` then decides. */
  selectedKey: string | null;
  loading: boolean;
  select: (key: string | null) => void;
  /** Re-reads both lists. Safe to call repeatedly; a run in flight is abandoned. */
  refresh: () => Promise<void>;
  /** Dev-only: `lib/devModelFixture.ts` seeds the harness a literal catalogue. */
  setCatalogue: (catalogue: ModelCatalogue) => void;
}

let inFlight: AbortController | null = null;

export const useModelStore = create<ModelState>()((set) => ({
  ...EMPTY_CATALOGUE,
  selectedKey: readChoice(),
  loading: false,

  select: (key) => {
    writeChoice(key);
    set({ selectedKey: key });
  },

  setCatalogue: (catalogue) => set({ ...catalogue, loading: false }),

  refresh: async () => {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    set({ loading: true });

    // Settled, not `all`: one list failing is the normal state of the other
    // one, and a browser with no Ollama must still see Gemini's models.
    const [hosted, local] = await Promise.allSettled([
      fetchGeminiModels(controller.signal),
      fetchLocalModels(controller.signal),
    ]);

    if (controller.signal.aborted) return;
    inFlight = null;

    set({
      hosted: hosted.status === 'fulfilled' ? hosted.value.models : [],
      hostedWithoutChat: hosted.status === 'fulfilled' ? hosted.value.withoutChat : 0,
      hostedError: hosted.status === 'rejected' ? messageOf(hosted.reason) : null,
      local: local.status === 'fulfilled' ? local.value.models : [],
      localWithoutTools: local.status === 'fulfilled' ? local.value.withoutTools : 0,
      localError: local.status === 'rejected' ? messageOf(local.reason) : null,
      loading: false,
    });
  },
}));

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** The catalogue as `models.ts` reads it, out of the store's flat state. */
export function catalogueOf(state: ModelState): ModelCatalogue {
  return {
    hosted: state.hosted,
    local: state.local,
    hostedWithoutChat: state.hostedWithoutChat,
    localWithoutTools: state.localWithoutTools,
    hostedError: state.hostedError,
    localError: state.localError,
  };
}

/** Which model answers the next turn. A selector, so the header re-renders with it. */
export function selectEffectiveModel(state: ModelState): ModelOption {
  return resolveSelection(catalogueOf(state), state.selectedKey);
}
