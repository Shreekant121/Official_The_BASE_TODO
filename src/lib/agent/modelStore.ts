import { create } from 'zustand';
import { GEMINI_API_BASE, MODELS_ENDPOINT } from './constants';
import { atlasBaseUrl, fetchAtlasHostedModels, fetchAtlasModels } from '../atlas/client';
import { useAtlasStore } from '../atlas/atlasStore';
import { atlasApiKey, getActiveApiKey } from './apiKeys';
import {
  EMPTY_CATALOGUE,
  parseGeminiModels,
  parseCloudModels,
  parseOllamaModels,
  choiceFromLegacy,
  resolveChoice,
  sideOf,
  type CloudProvider,
  type ModelChoice,
  type ModelSide,
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

/**
 * OPT-8: three keys now, not one. Which side the composer's Local | Cloud switch
 * is on, and the default model of each side, picked in Settings → Atlas. All
 * three stay on this device for the reason above. The one key before them,
 * `mutineer_model_choice`, is read once into the side it was on and removed.
 */
const LEGACY_KEY = 'mutineer_model_choice';
const SIDE_KEY = 'base.model.side';
const LOCAL_KEY = 'base.model.local';
const CLOUD_KEY = 'base.model.cloud';

function readKey(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode / quota. The choice still holds for this session.
  }
}

function writeChoice(choice: ModelChoice): void {
  writeKey(SIDE_KEY, choice.side);
  writeKey(LOCAL_KEY, choice.local);
  writeKey(CLOUD_KEY, choice.cloud);
}

function readChoice(): ModelChoice {
  const legacy = readKey(LEGACY_KEY);
  if (legacy !== null && readKey(SIDE_KEY) === null) {
    const moved = choiceFromLegacy(legacy);
    writeChoice(moved);
    writeKey(LEGACY_KEY, null);
    return moved;
  }
  return {
    side: readKey(SIDE_KEY) === 'local' ? 'local' : 'cloud',
    local: readKey(LOCAL_KEY),
    cloud: readKey(CLOUD_KEY),
  };
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

/**
 * Claude's and ChatGPT's lists, asked of the laptop with his keys (BIG-1).
 *
 * **Only providers he has a key for are asked**, so an empty group with no
 * error is the ordinary state of a sheet with no Claude or ChatGPT key in it.
 * Each provider fails on its own — a rejected Claude key must not hide a
 * working ChatGPT list — and the failures are joined into the one line the
 * picker shows.
 *
 * **With the lid shut they are asked for here (BIG-12).** Claude and ChatGPT
 * used to answer only through the laptop (his call, 2026-09-24), so a sleeping
 * laptop emptied the group. The tablet runs Atlas itself now, on these same
 * keys, so it lists them itself too — with Atlas's own listing code, from the
 * engine bundle, which is loaded only on this path: the probe has landed by the
 * time this runs (`useModelLists`), so an awake laptop never pulls it in.
 */
async function fetchCloudModels(signal: AbortSignal): Promise<{ models: ModelOption[]; error: string | null }> {
  const providers = (['anthropic', 'openai'] as CloudProvider[])
    .map((provider) => ({ provider, key: atlasApiKey(provider) }))
    .filter((entry): entry is { provider: CloudProvider; key: string } => entry.key !== null);
  if (providers.length === 0) return { models: [], error: null };

  const baseUrl = atlasBaseUrl();
  const status = useAtlasStore.getState().status;
  const here = status === 'asleep' || status === 'unconfigured' || baseUrl === null;
  if (status === 'unknown' && !here) return { models: [], error: null };

  const listHere = here ? (await import('../atlas/engine/tabletAtlas')).listHostedModelsHere : null;
  const results = await Promise.allSettled(
    providers.map(async ({ provider, key }) =>
      parseCloudModels(
        provider,
        listHere !== null
          ? await listHere(provider, key)
          : await fetchAtlasHostedModels(baseUrl as string, provider, key, signal),
      ),
    ),
  );
  const models = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  const errors = results.flatMap((result, i) =>
    result.status === 'rejected'
      ? [`${providers[i].provider === 'anthropic' ? 'Claude' : 'ChatGPT'}: ${cloudReason(result.reason)}`]
      : [],
  );
  return { models, error: errors.length > 0 ? errors.join(' ') : null };
}

function cloudReason(reason: unknown): string {
  if (reason instanceof TypeError) return useAtlasStore.getState().status === 'awake'
      ? 'the laptop is not answering, so these models cannot be listed.'
      : 'could not be reached from this device. Check the connection.';
  return messageOf(reason);
}

// ─── The store ──────────────────────────────────────────────────────────────

interface ModelState extends ModelCatalogue {
  /** The switch and the two defaults; `resolveChoice` turns them into a model. */
  choice: ModelChoice;
  loading: boolean;
  /** The composer's Local | Cloud switch. */
  chooseSide: (side: ModelSide) => void;
  /** A side's default, from Settings → Atlas; `null` is the app's own default. Leaves the switch alone. */
  chooseDefault: (side: ModelSide, key: string | null) => void;
  /** This model, now: it becomes its side's default and the switch moves to it (`/atlas-host`'s cards). */
  select: (option: ModelOption) => void;
  /** Re-reads both lists. Safe to call repeatedly; a run in flight is abandoned. */
  refresh: () => Promise<void>;
  /** Dev-only: `lib/devModelFixture.ts` seeds the harness a literal catalogue. */
  setCatalogue: (catalogue: ModelCatalogue) => void;
}

let inFlight: AbortController | null = null;

export const useModelStore = create<ModelState>()((set) => ({
  ...EMPTY_CATALOGUE,
  choice: readChoice(),
  loading: false,

  chooseSide: (side) =>
    set((state) => {
      const choice = { ...state.choice, side };
      writeChoice(choice);
      return { choice };
    }),

  chooseDefault: (side, key) =>
    set((state) => {
      const choice = { ...state.choice, [side]: key };
      writeChoice(choice);
      return { choice };
    }),

  select: (option) =>
    set((state) => {
      const side = sideOf(option.provider);
      const choice = { ...state.choice, side, [side]: option.key };
      writeChoice(choice);
      return { choice };
    }),

  setCatalogue: (catalogue) => set({ ...catalogue, loading: false }),

  refresh: async () => {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    set({ loading: true });

    // Settled, not `all`: one list failing is the normal state of the other
    // one, and a browser with no Ollama must still see Gemini's models.
    const [hosted, local, cloud] = await Promise.allSettled([
      fetchGeminiModels(controller.signal),
      fetchLocalModels(controller.signal),
      fetchCloudModels(controller.signal),
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
      cloud: cloud.status === 'fulfilled' ? cloud.value.models : [],
      cloudError: cloud.status === 'fulfilled' ? cloud.value.error : messageOf(cloud.reason),
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
    cloud: state.cloud,
    cloudError: state.cloudError,
    hostedWithoutChat: state.hostedWithoutChat,
    localWithoutTools: state.localWithoutTools,
    hostedError: state.hostedError,
    localError: state.localError,
  };
}

/** Which model answers the next turn. A selector, so the header re-renders with it. */
export function selectEffectiveModel(state: ModelState): ModelOption {
  return resolveChoice(catalogueOf(state), state.choice);
}
