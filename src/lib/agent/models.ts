import { OLLAMA_DEFAULT_MODEL, TEXT_MODEL } from './constants';

/**
 * What the model picker offers, and how the two lists are read (item 6).
 *
 * **Nothing here names a model.** Both lists are fetched — Gemini's from
 * Google's own models endpoint with whichever key is active, the local one
 * from Ollama's `/api/tags` — so a preview shutting down or a `ollama rm`
 * takes an entry off the list by itself, and constraint C4's "one place names
 * the models" becomes "no place does". The two ids in `constants.ts` are
 * *preferences*, used only to choose among what came back; `resolveSelection`
 * never invents an entry from either.
 *
 * This file is pure on purpose, the way `providers/` is: the parsing is the
 * part worth asserting against a literal payload, and `modelStore.ts` holds
 * the `fetch`, the Firebase token and the Zustand store that cannot be.
 */

export type ModelProvider = 'gemini' | 'ollama';

export interface ModelOption {
  /** `gemini:gemini-flash-latest`. Unique across providers, and what gets stored. */
  key: string;
  provider: ModelProvider;
  /** What goes on the wire as `TransportRequest.model`. */
  id: string;
  /** The name in the row — the vendor's own, where it has one. */
  label: string;
  /** One line under it: the id, or the size on disk. */
  detail: string;
}

export interface ModelCatalogue {
  hosted: ModelOption[];
  local: ModelOption[];
  /**
   * Models Google returned that cannot hold a conversation — embeddings,
   * Imagen, the TTS voices. Counted rather than discarded silently, so an
   * empty `hosted` list can say **which** empty it is: a reply that carried
   * nothing at all is a different problem from a reply full of models this
   * app cannot drive, and "no models" alone sends you looking in the wrong
   * place. That distinction is the whole reason this number exists.
   */
  hostedWithoutChat: number;
  /**
   * Local models Ollama reported that declare no `tools` capability. They are
   * left out of `local` — the agent is nothing but tools, and a model that
   * cannot call one answers every request by describing what it would do — and
   * counted here for the same reason as `hostedWithoutChat`.
   */
  localWithoutTools: number;
  /** Why `hosted` is empty, when it is. Shown in the picker, not thrown. */
  hostedError: string | null;
  localError: string | null;
}

export const EMPTY_CATALOGUE: ModelCatalogue = {
  hosted: [],
  local: [],
  hostedWithoutChat: 0,
  localWithoutTools: 0,
  hostedError: null,
  localError: null,
};

export function modelKey(provider: ModelProvider, id: string): string {
  return `${provider}:${id}`;
}

/**
 * What a turn runs on when neither list has arrived — the first message after
 * a cold load, and every turn on a browser that can reach neither. It is the
 * behaviour the app had before this item, unchanged.
 */
export const FALLBACK_MODEL: ModelOption = {
  key: modelKey('gemini', TEXT_MODEL),
  provider: 'gemini',
  id: TEXT_MODEL,
  label: TEXT_MODEL,
  detail: 'Hosted by Google',
};

// ─── Google's models endpoint ───────────────────────────────────────────────

interface GeminiModelRow {
  /** `models/gemini-flash-latest` — the prefix is Google's resource name, not the id. */
  name?: unknown;
  displayName?: unknown;
  supportedGenerationMethods?: unknown;
}

/**
 * The generation methods that mean "this model can hold a conversation".
 *
 * **`generateContent` is the one that decides it, and that is a fix, not a
 * preference.** This filter was `streamGenerateContent` alone — the method
 * `geminiTransport.ts` literally calls — and it matched *nothing*, so the
 * hosted group came back empty against a working key. Google does not
 * advertise the streaming variant for every model that serves it: it is the
 * same method with a different suffix, and the list names the base one. Either
 * spelling is accepted here, so the filter cannot fail closed again.
 *
 * It is still a filter on **capability, not on name**, which is what keeps
 * this file from naming models by the back door: embeddings advertise
 * `embedContent`, Imagen advertises `predict`, and neither can answer a
 * message.
 */
const CHAT_METHODS = ['generateContent', 'streamGenerateContent'];

/**
 * The models this app can drive, and how many it had to leave behind.
 *
 * The count is the half that earns its keep when something is wrong: an empty
 * list with a zero count means the reply carried no models at all, and an
 * empty list with a count of forty means the key can see plenty but none of
 * them chat. Those need different fixes, and "no hosted models" says neither.
 */
export function parseGeminiModels(payload: unknown): { models: ModelOption[]; withoutChat: number } {
  const rows = (payload as { models?: unknown })?.models;
  if (!Array.isArray(rows)) return { models: [], withoutChat: 0 };

  const models: ModelOption[] = [];
  let withoutChat = 0;

  for (const row of rows as GeminiModelRow[]) {
    const id = typeof row?.name === 'string' ? row.name.replace(/^models\//, '') : '';
    if (id === '') continue;

    const methods = Array.isArray(row.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
    if (!methods.some((method) => CHAT_METHODS.includes(method as string))) {
      withoutChat += 1;
      continue;
    }

    const label = typeof row.displayName === 'string' && row.displayName !== '' ? row.displayName : id;
    models.push({
      key: modelKey('gemini', id),
      provider: 'gemini',
      id,
      label,
      // The id, but only when it is not simply the display name slugified —
      // which it almost always is. "Gemini 2.5 Flash" beside
      // "gemini-2.5-flash" is the same string twice, and printing it in every
      // row (ellipsised, because it does not fit) made the list harder to read
      // rather than easier. Kept where it genuinely surprises: "Gemini 2.0
      // Flash Experimental" is served by `gemini-2.0-flash-exp`, and that is
      // worth seeing.
      detail: sameName(label, id) ? '' : id,
    });
  }

  return { models, withoutChat };
}

/** Ignoring case, spaces and punctuation — the difference between a name and its slug. */
function sameName(label: string, id: string): boolean {
  const flatten = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return flatten(label) === flatten(id);
}

// ─── Ollama's /api/tags ─────────────────────────────────────────────────────

interface OllamaTagRow {
  name?: unknown;
  size?: unknown;
  details?: { parameter_size?: unknown };
  capabilities?: unknown;
}

/** `3.4 GB`. Ollama reports bytes; nobody reads bytes. */
export function formatModelSize(bytes: unknown): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  const gb = bytes / 1e9;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/**
 * The local models, and how many were left out.
 *
 * `capabilities` is read defensively: a build of Ollama that does not report
 * it at all leaves every model in the list, because "this version does not say"
 * is not the same claim as "this model cannot". Only an explicit capability
 * list without `tools` in it excludes a model.
 */
export function parseOllamaModels(payload: unknown): { models: ModelOption[]; withoutTools: number } {
  const rows = (payload as { models?: unknown })?.models;
  if (!Array.isArray(rows)) return { models: [], withoutTools: 0 };

  const models: ModelOption[] = [];
  let withoutTools = 0;

  for (const row of rows as OllamaTagRow[]) {
    const id = typeof row?.name === 'string' ? row.name : '';
    if (id === '') continue;

    if (Array.isArray(row.capabilities) && !row.capabilities.includes('tools')) {
      withoutTools += 1;
      continue;
    }

    const params = typeof row.details?.parameter_size === 'string' ? row.details.parameter_size : '';
    const size = formatModelSize(row.size);
    models.push({
      key: modelKey('ollama', id),
      provider: 'ollama',
      id,
      label: id,
      detail: [params, size].filter(Boolean).join(' · '),
    });
  }

  return { models, withoutTools };
}

// ─── Which one answers ──────────────────────────────────────────────────────

export function allModels(catalogue: ModelCatalogue): ModelOption[] {
  return [...catalogue.hosted, ...catalogue.local];
}

/**
 * The model a turn runs on, given what is available and what the user picked.
 *
 * The order is the decision. **A stored choice always wins**, so the picker is
 * not a suggestion — but only while the model is still there, because an id
 * that has been `ollama rm`'d or retired by Google would otherwise fail every
 * turn with a 404 and no way to see why.
 *
 * With nothing chosen it prefers `OLLAMA_DEFAULT_MODEL`, which means an
 * awake laptop answers locally and for free out of the box, on **every**
 * device — item 8's whole point is that the tablet gets the same list. And a
 * sleeping laptop returns no local list at all, so this falls straight
 * through to Gemini and the conversation keeps working. **That fall-through
 * is the fallback**: `ChatPage` labels it, but the routing is this function,
 * unchanged since item 6, doing what it already did for a tablet that had no
 * Ollama.
 */
export function resolveSelection(catalogue: ModelCatalogue, selectedKey: string | null): ModelOption {
  const options = allModels(catalogue);
  return (
    options.find((option) => option.key === selectedKey) ??
    catalogue.local.find((option) => option.id === OLLAMA_DEFAULT_MODEL) ??
    catalogue.hosted.find((option) => option.id === TEXT_MODEL) ??
    catalogue.hosted[0] ??
    catalogue.local[0] ??
    FALLBACK_MODEL
  );
}
