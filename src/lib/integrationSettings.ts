/**
 * Per-user third-party integration settings, stored (free tier) at
 * `users/{uid}/settings/integrations` in Firestore rather than in env vars —
 * so each account brings its own SimpleURL API key + branded domain. Loaded on
 * demand by `ShareModal`/`SettingsPage`; a tiny in-memory cache avoids a
 * redundant read every time the share modal opens within a session.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { DEFAULT_SHORT_DOMAIN } from './simpleUrl';

export interface IntegrationSettings {
  /** SimpleURL API key (secret) — sent as the `X-API-Key` header. */
  simpleUrlApiKey?: string;
  /** Branded short-link domain, e.g. `go.base.co.in` (must be verified in the SimpleURL dashboard). Defaults to `smplu.link`. */
  simpleUrlDomain?: string;
}

const cache = new Map<string, IntegrationSettings>();

function ref(uid: string) {
  return doc(db, 'users', uid, 'settings', 'integrations');
}

export async function loadIntegrationSettings(uid: string, force = false): Promise<IntegrationSettings> {
  if (!force && cache.has(uid)) return cache.get(uid)!;
  const snap = await getDoc(ref(uid)).catch(() => null);
  const data = snap && snap.exists() ? (snap.data() as IntegrationSettings) : {};
  cache.set(uid, data);
  return data;
}

export async function saveIntegrationSettings(uid: string, settings: IntegrationSettings): Promise<void> {
  await setDoc(ref(uid), settings, { merge: true });
  cache.set(uid, { ...cache.get(uid), ...settings });
}

/** The domain to use for a new short link — the user's configured branded domain, or SimpleURL's default. */
export function resolveShortDomain(settings: IntegrationSettings): string {
  return settings.simpleUrlDomain?.trim() || DEFAULT_SHORT_DOMAIN;
}
