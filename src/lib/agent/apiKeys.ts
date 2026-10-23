import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { currentAssistantRoute } from '../accountAccess';
import {
  EMPTY_RING,
  atlasKeyOf,
  chosenKey,
  keyProblem,
  keysOf,
  parseRing,
  providerOf,
  withChosen,
  type KeyProvider,
  type KeyRing,
  type StoredApiKey,
} from './keyRing';

export type { KeyProvider, StoredApiKey } from './keyRing';

/**
 * The key sheet's store: this browser's copy, the synced Firestore document,
 * and the Zustand state the Settings card reads.
 *
 * Every rule about a key — whose it is, whether it can be added, which one a
 * turn spends — is in `keyRing.ts`, which is pure and tested. BIG-1 added
 * Claude and ChatGPT keys beside Gemini's; this file only learned to store
 * which provider a key belongs to and to pass that along.
 *
 * The storage key keeps its Gemini-era name so the keys already saved on his
 * two devices are found where they are.
 */

const STORAGE_KEY = 'mutineer_gemini_keys';

function readRing(): KeyRing {
  if (typeof localStorage === 'undefined') return EMPTY_RING;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseRing(JSON.parse(raw)) : EMPTY_RING;
  } catch {
    return EMPTY_RING;
  }
}

function writeRing(ring: KeyRing): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ring));
  } catch {
    // Private-mode / quota. The ring still works for this session.
  }
}

function agentKeysDoc(uid: string) {
  return doc(db, 'users', uid, 'settings', 'agentKeys');
}

let currentUid: string | null = auth.currentUser?.uid ?? null;
let loadedUid: string | null = null;
let userRingUnsubscribe: (() => void) | null = null;

async function loadUserRing(uid: string): Promise<KeyRing | null> {
  try {
    const snap = await getDoc(agentKeysDoc(uid));
    return snap.exists() ? parseRing(snap.data()) : null;
  } catch {
    return null;
  }
}

async function saveUserRing(ring: KeyRing): Promise<void> {
  if (!currentUid) return;
  try {
    await setDoc(agentKeysDoc(currentUid), ring, { merge: true });
  } catch {
    // Best-effort; local storage still retains the keys.
  }
}

async function syncUserRing(ring: KeyRing): Promise<void> {
  if (!currentUid) return;
  if (loadedUid !== currentUid) return;
  await saveUserRing(ring);
}

function watchUserRing(uid: string) {
  return onSnapshot(agentKeysDoc(uid), (snap) => {
    if (!snap.exists()) return;
    const ring = parseRing(snap.data());
    writeRing(ring);
    useApiKeyStore.setState(ring);
  }, () => {
    // Ignore snapshot failures; local state still works.
  });
}

async function hydrateUserRing(uid: string, localRing: KeyRing): Promise<KeyRing> {
  const persisted = await loadUserRing(uid);
  if (!persisted) {
    if (localRing.keys.length > 0) {
      await saveUserRing(localRing);
      return localRing;
    }
    return localRing;
  }
  const mergedKeys = [...persisted.keys];
  for (const localKey of localRing.keys) {
    if (!mergedKeys.some((k) => k.key === localKey.key)) {
      mergedKeys.push(localKey);
    }
  }
  return parseRing({
    keys: mergedKeys,
    activeId: persisted.activeId ?? localRing.activeId,
    activeByProvider: { ...localRing.activeByProvider, ...persisted.activeByProvider },
  });
}

function setUserRingListener(uid: string) {
  if (userRingUnsubscribe) {
    userRingUnsubscribe();
    userRingUnsubscribe = null;
  }
  userRingUnsubscribe = watchUserRing(uid);
}

interface ApiKeyState extends KeyRing {
  /** Returns an error string when the key is unusable, so the form can say why. */
  addKey: (label: string, key: string, provider?: KeyProvider) => string | null;
  removeKey: (id: string) => void;
  /** Chooses a key for its own provider. `null` selects the Gemini server proxy. */
  selectKey: (id: string | null, provider?: KeyProvider) => void;
}

function commit(next: KeyRing, set: (ring: KeyRing) => void): void {
  writeRing(next);
  set(next);
  void syncUserRing(next);
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  ...readRing(),

  addKey: (label, key, provider = 'gemini') => {
    const ring = get();
    const problem = keyProblem(ring, key, provider);
    if (problem) return problem;

    const entry: StoredApiKey = {
      id: crypto.randomUUID(),
      label: label.trim() === '' ? `Key ${keysOf(ring, provider).length + 1}` : label.trim(),
      key: key.trim(),
      addedAt: Date.now(),
      provider,
    };
    // A new key is the chosen one for its provider, as a new Gemini key always was.
    commit(withChosen({ ...ring, keys: [...ring.keys, entry] }, entry.id, provider), set);
    return null;
  },

  removeKey: (id) => {
    const ring = get();
    const gone = ring.keys.find((k) => k.id === id);
    const keys = ring.keys.filter((k) => k.id !== id);
    let next: KeyRing = { ...ring, keys };
    if (gone && chosenKey(ring, providerOf(gone))?.id === id) next = withChosen(next, null, providerOf(gone));
    commit(next, set);
  },

  selectKey: (id, provider = 'gemini') => {
    commit(withChosen(get(), id, provider), set);
  },
}));

/** The chosen Gemini key, or `null` for the proxy. */
export function activeApiKey(): StoredApiKey | null {
  return chosenKey(useApiKeyStore.getState(), 'gemini');
}

/**
 * What the in-browser Gemini transport asks for: the raw key, or `null` to use
 * the server proxy.
 *
 * BUILD-6 decides which. Only an account the proxy will answer — the owner, or
 * one he switched onto his key — has "none chosen" mean the proxy; any other
 * account spends the key it chose, or its first one. An account whose
 * assistant is switched off gets `null` whatever it holds, and the proxy's
 * refusal is the message it sees. None of this is the lock — the proxy checks
 * again on every call (`server/keyAccess.ts`).
 *
 * **Gemini keys only** since BIG-1: a Claude key sent to Google is a 400 that
 * says nothing useful.
 */
export function getActiveApiKey(): string | null {
  const route = currentAssistantRoute();
  if (route === 'off') return null;
  const chosen = activeApiKey();
  if (chosen) return chosen.key;
  if (route === 'owner-key') return null;
  return keysOf(useApiKeyStore.getState(), 'gemini')[0]?.key ?? null;
}

/**
 * The key a turn on Atlas carries for this provider (BIG-1), or `null`.
 * See `atlasKeyOf` for why Gemini's may differ from `getActiveApiKey`.
 */
export function atlasApiKey(provider: KeyProvider): string | null {
  return atlasKeyOf(useApiKeyStore.getState(), provider);
}

/** `AIza…9fQ4` — enough to tell two keys apart, not enough to use one. */
export function maskKey(key: string): string {
  return key.length <= 10 ? '••••' : `${key.slice(0, 4)}…${key.slice(-4)}`;
}

onAuthStateChanged(auth, async (user) => {
  currentUid = user?.uid ?? null;
  if (!currentUid) {
    loadedUid = null;
    if (userRingUnsubscribe) {
      userRingUnsubscribe();
      userRingUnsubscribe = null;
    }
    return;
  }
  const local = readRing();
  const ring = await hydrateUserRing(currentUid, local);
  writeRing(ring);
  loadedUid = currentUid;
  useApiKeyStore.setState(ring);
  setUserRingListener(currentUid);
});
