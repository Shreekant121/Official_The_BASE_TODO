import { create } from 'zustand';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { currentAssistantRoute } from '../accountAccess';

const STORAGE_KEY = 'mutineer_gemini_keys';

/** Enough to rotate through a few free keys; not a key manager. */
const MAX_KEYS = 6;

export interface StoredApiKey {
  id: string;
  /** What the user calls it — "personal", "work", "the paid one". */
  label: string;
  key: string;
  addedAt: number;
}

interface KeyRing {
  keys: StoredApiKey[];
  /** `null` means "use the server proxy", which is the default. */
  activeId: string | null;
}

const EMPTY: KeyRing = { keys: [], activeId: null };

function readRing(): KeyRing {
  if (typeof localStorage === 'undefined') return EMPTY;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<KeyRing>;
    const keys = Array.isArray(parsed.keys)
      ? parsed.keys.filter((k): k is StoredApiKey => typeof k?.id === 'string' && typeof k?.key === 'string')
      : [];
    const activeId = keys.some((k) => k.id === parsed.activeId) ? (parsed.activeId as string) : null;
    return { keys, activeId };
  } catch {
    return EMPTY;
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
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<KeyRing>;
    const keys = Array.isArray(data.keys)
      ? data.keys.filter((k): k is StoredApiKey => typeof k?.id === 'string' && typeof k?.key === 'string')
      : [];
    const activeId = keys.some((k) => k.id === data.activeId) ? (data.activeId as string) : null;
    return { keys, activeId };
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
    const data = snap.data() as Partial<KeyRing>;
    const keys = Array.isArray(data.keys)
      ? data.keys.filter((k): k is StoredApiKey => typeof k?.id === 'string' && typeof k?.key === 'string')
      : [];
    const activeId = keys.some((k) => k.id === data.activeId) ? (data.activeId as string) : null;
    const ring: KeyRing = { keys, activeId };
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
  const activeId = persisted.activeId ?? localRing.activeId;
  return { keys: mergedKeys, activeId: mergedKeys.some((k) => k.id === activeId) ? activeId : null };
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
  addKey: (label: string, key: string) => string | null;
  removeKey: (id: string) => void;
  /** `null` selects the server proxy. */
  selectKey: (id: string | null) => void;
}

export const useApiKeyStore = create<ApiKeyState>()((set, get) => ({
  ...readRing(),

  addKey: (label, key) => {
    const trimmed = key.trim();
    if (trimmed === '') return 'Paste a key first.';
    if (/\s/.test(trimmed)) return 'That has whitespace in it — keys never do.';
    if (trimmed.length < 20) return 'That is too short to be a Gemini API key.';

    const { keys } = get();
    if (keys.length >= MAX_KEYS) return `That is ${MAX_KEYS} keys already. Remove one first.`;
    if (keys.some((k) => k.key === trimmed)) return 'That key is already here.';

    const entry: StoredApiKey = {
      id: crypto.randomUUID(),
      label: label.trim() === '' ? `Key ${keys.length + 1}` : label.trim(),
      key: trimmed,
      addedAt: Date.now(),
    };
    const next: KeyRing = { keys: [...keys, entry], activeId: entry.id };
    writeRing(next);
    set(next);
    void syncUserRing(next);
    return null;
  },

  removeKey: (id) => {
    const { keys, activeId } = get();
    const next: KeyRing = {
      keys: keys.filter((k) => k.id !== id),
      activeId: activeId === id ? null : activeId,
    };
    writeRing(next);
    set(next);
    void syncUserRing(next);
  },

  selectKey: (id) => {
    const { keys } = get();
    const next: KeyRing = { keys, activeId: id !== null && keys.some((k) => k.id === id) ? id : null };
    writeRing(next);
    set(next);
    void syncUserRing(next);
  },
}));

export function activeApiKey(): StoredApiKey | null {
  const { keys, activeId } = useApiKeyStore.getState();
  return keys.find((k) => k.id === activeId) ?? null;
}

/**
 * What the transport asks for: the raw key, or `null` to use the server proxy.
 *
 * BUILD-6 decides which. Only an account the proxy will answer — the owner, or
 * one he switched onto his key — has "none chosen" mean the proxy; any other
 * account spends the key it chose, or its first one. An account whose
 * assistant is switched off gets `null` whatever it holds, and the proxy's
 * refusal is the message it sees. None of this is the lock — the proxy checks
 * again on every call (`server/keyAccess.ts`).
 */
export function getActiveApiKey(): string | null {
  const route = currentAssistantRoute();
  if (route === 'off') return null;
  const chosen = activeApiKey();
  if (chosen) return chosen.key;
  if (route === 'owner-key') return null;
  return useApiKeyStore.getState().keys[0]?.key ?? null;
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
