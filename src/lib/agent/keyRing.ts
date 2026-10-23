/**
 * The key sheet's rules, pure (BIG-1).
 *
 * `apiKeys.ts` is the store — localStorage, the Firestore document, the
 * Zustand state — and imports Firebase the moment it loads, which makes it
 * unusable in a test. Everything that *decides* something about a key lives
 * here instead, so `keyRing.test.ts` can hold it.
 *
 * WHAT BIG-1 CHANGED
 * -------------------
 * The sheet held Gemini keys and nothing else; validation said "too short to
 * be a Gemini API key" and no key said whose it was. Claude and ChatGPT join
 * it now, **bring your own key only** (his call, 2026-09-22 — he shares
 * Gemini with other accounts and nothing else, so only Gemini has a proxy).
 *
 * A stored key carries its provider. **One written before BIG-1 has none and
 * is Gemini's**, which is the only thing it could have been — so the synced
 * document needs no migration and an older build reading a newer one still
 * sees its Gemini keys.
 *
 * Which key is *chosen* is per provider. Gemini's is `activeId`, where `null`
 * still means the server proxy (BUILD-6); Claude's and ChatGPT's live in
 * `activeByProvider`, and with none chosen the first one of that provider is
 * the one used.
 */

export type KeyProvider = 'gemini' | 'anthropic' | 'openai';

export const KEY_PROVIDERS: readonly KeyProvider[] = ['gemini', 'anthropic', 'openai'];

/** What each provider is called on screen. */
export const KEY_PROVIDER_NAMES: Record<KeyProvider, string> = {
  gemini: 'Gemini',
  anthropic: 'Claude',
  openai: 'ChatGPT',
};

export interface StoredApiKey {
  id: string;
  /** What the user calls it — "personal", "work", "the paid one". */
  label: string;
  key: string;
  addedAt: number;
  /** Whose key this is. Absent on every key stored before BIG-1, and those are Gemini's. */
  provider?: KeyProvider;
}

export interface KeyRing {
  keys: StoredApiKey[];
  /** The chosen Gemini key. `null` means "use the server proxy", which is the default. */
  activeId: string | null;
  /** The chosen Claude and ChatGPT keys (BIG-1). Absent means the first of that provider. */
  activeByProvider?: Partial<Record<Exclude<KeyProvider, 'gemini'>, string>>;
}

export const EMPTY_RING: KeyRing = { keys: [], activeId: null };

/** Enough to rotate through a few free keys; not a key manager. Per provider. */
export const MAX_KEYS_PER_PROVIDER = 6;

export function providerOf(entry: StoredApiKey): KeyProvider {
  return entry.provider ?? 'gemini';
}

export function keysOf(ring: KeyRing, provider: KeyProvider): StoredApiKey[] {
  return ring.keys.filter((entry) => providerOf(entry) === provider);
}

/**
 * Whose key this looks like, from its spelling. Each vendor prefixes its own:
 * `AIza` for Google, `sk-ant-` for Anthropic, `sk-` for OpenAI. Used to fill
 * the provider in as he pastes and to catch a key pasted under the wrong one;
 * never to refuse a key that matches none, since prefixes do change.
 */
export function detectProvider(raw: string): KeyProvider | null {
  const key = raw.trim();
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-')) return 'openai';
  if (key.startsWith('AIza')) return 'gemini';
  return null;
}

/** Why a key cannot be added, in a sentence, or `null` when it can. */
export function keyProblem(ring: KeyRing, raw: string, provider: KeyProvider): string | null {
  const key = raw.trim();
  const name = KEY_PROVIDER_NAMES[provider];
  if (key === '') return 'Paste a key first.';
  if (/\s/.test(key)) return 'That has whitespace in it — keys never do.';
  if (key.length < 20) return `That is too short to be a ${name} API key.`;
  const looksLike = detectProvider(key);
  if (looksLike !== null && looksLike !== provider) {
    return `That looks like a ${KEY_PROVIDER_NAMES[looksLike]} key, not a ${name} one. Pick ${KEY_PROVIDER_NAMES[looksLike]} above.`;
  }
  if (keysOf(ring, provider).length >= MAX_KEYS_PER_PROVIDER) {
    return `That is ${MAX_KEYS_PER_PROVIDER} ${name} keys already. Remove one first.`;
  }
  if (ring.keys.some((entry) => entry.key === key)) return 'That key is already here.';
  return null;
}

/** The key he picked for a provider, if he picked one that is still there. */
export function chosenKey(ring: KeyRing, provider: KeyProvider): StoredApiKey | null {
  const id = provider === 'gemini' ? ring.activeId : ring.activeByProvider?.[provider];
  return keysOf(ring, provider).find((entry) => entry.id === id) ?? null;
}

/**
 * The key a turn on Atlas carries for `provider` (BIG-1): the chosen one, or
 * the first of that provider.
 *
 * **For Gemini this can differ from what the browser spends.** With the proxy
 * row chosen, the in-browser assistant sends no key and Vercel's answers; but
 * Vercel's key never reaches the laptop, so Atlas is handed his first Gemini
 * key instead, and with none in the sheet it gets none and the turn stays in
 * the browser (`routing.ts`).
 */
export function atlasKeyOf(ring: KeyRing, provider: KeyProvider): string | null {
  return (chosenKey(ring, provider) ?? keysOf(ring, provider)[0] ?? null)?.key ?? null;
}

/** The ring with `id` chosen for its own provider. An unknown id changes nothing. */
export function withChosen(ring: KeyRing, id: string | null, provider: KeyProvider): KeyRing {
  if (provider === 'gemini') {
    return { ...ring, activeId: id !== null && keysOf(ring, 'gemini').some((k) => k.id === id) ? id : null };
  }
  const next = { ...(ring.activeByProvider ?? {}) };
  if (id !== null && keysOf(ring, provider).some((k) => k.id === id)) next[provider] = id;
  else delete next[provider];
  return { ...ring, activeByProvider: next };
}

/** A ring read from storage or Firestore, with anything malformed dropped. */
export function parseRing(data: unknown): KeyRing {
  const raw = (data ?? {}) as Partial<KeyRing>;
  const keys = Array.isArray(raw.keys)
    ? raw.keys
        .filter((k): k is StoredApiKey => typeof k?.id === 'string' && typeof k?.key === 'string')
        .map((k) => (k.provider !== undefined && !KEY_PROVIDERS.includes(k.provider) ? { ...k, provider: undefined } : k))
    : [];
  const ring: KeyRing = { keys, activeId: null };
  const withGemini = withChosen(ring, typeof raw.activeId === 'string' ? raw.activeId : null, 'gemini');
  const chosen = raw.activeByProvider ?? {};
  let result: KeyRing = { ...withGemini, activeByProvider: {} };
  for (const provider of ['anthropic', 'openai'] as const) {
    const id = chosen[provider];
    if (typeof id === 'string') result = withChosen(result, id, provider);
  }
  return result;
}
