import { create } from 'zustand';
import { atlasBaseUrl, probeAtlas, type AtlasHealth } from './client';

/**
 * Is the laptop awake?
 *
 * One question, asked in one place, because three parts of the app need the
 * answer and must not disagree about it: the model list (Atlas is where local
 * models come from now), the chat page's routing, and the line that tells
 * Shreekant which assistant he is talking to.
 *
 * **`asleep` is a normal state, not an error.** The laptop is a laptop: it
 * closes, it travels, it runs out of battery. DESIGN.md §9 says so plainly —
 * *"Laptop asleep, tablet on a train: the app says 'Atlas is asleep — you're
 * talking to the basic assistant' and a task can still be added."* Nothing
 * here throws, nothing retries in a loop, and the fallback is a working
 * assistant rather than a degraded one.
 *
 * **`unconfigured` is a third state and is worth keeping apart from `asleep`.**
 * A deployment with no `VITE_ATLAS_URL` has no laptop to be asleep; telling
 * someone their laptop is asleep when they never had one would send them
 * looking in the wrong place. It is silent instead.
 */

export type AtlasStatus =
  /** Not asked yet. The first render, before the probe lands. */
  | 'unknown'
  /** No `VITE_ATLAS_URL` and no override. There is no Atlas to reach. */
  | 'unconfigured'
  | 'awake'
  | 'asleep';

export interface AtlasSnapshot {
  status: AtlasStatus;
  baseUrl: string | null;
  health: AtlasHealth | null;
  roundTripMs: number | null;
}

interface AtlasState extends AtlasSnapshot {
  /** Asks the laptop. Safe to call repeatedly; overlapping calls collapse. */
  probe: () => Promise<void>;
  /** Dev-only: `lib/devHostFixture.ts` seeds the harness a landed probe. */
  setSnapshot: (snapshot: AtlasSnapshot) => void;
}

let inFlight: Promise<void> | null = null;

export const useAtlasStore = create<AtlasState>()((set) => ({
  status: 'unknown',
  baseUrl: atlasBaseUrl(),
  health: null,
  roundTripMs: null,

  setSnapshot: (snapshot) => set(snapshot),

  probe: () => {
    // The chat page, the host page and the model list all ask on mount, and
    // the answer is the same one. Three probes would be three fetches for one
    // fact.
    if (inFlight) return inFlight;

    const baseUrl = atlasBaseUrl();
    if (baseUrl === null) {
      set({ status: 'unconfigured', baseUrl: null, health: null, roundTripMs: null });
      return Promise.resolve();
    }

    inFlight = probeAtlas(baseUrl)
      .then((probe) => {
        set({
          status: probe === null ? 'asleep' : 'awake',
          baseUrl,
          health: probe?.health ?? null,
          /* Cleared rather than kept on a failed probe. A stale "38 ms" beside
             "Asleep" reads as a live measurement of a machine that did not
             answer, which is the one thing this reading must never say. */
          roundTripMs: probe?.roundTripMs ?? null,
        });
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  },
}));

/**
 * Whether to say "Atlas is asleep" out loud.
 *
 * Only when there *is* an Atlas to be asleep, and only once the probe has
 * actually answered — a line that flashes on every cold load while the fetch
 * is in flight would train him to ignore it, which is the one thing a status
 * line cannot afford.
 */
export function selectAtlasIsAsleep(state: AtlasState): boolean {
  return state.status === 'asleep';
}
