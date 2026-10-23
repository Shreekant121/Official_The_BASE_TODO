import type { ModelOption } from '../agent/models';
import type { AtlasHealth } from './client';
import type { AtlasStatus } from './atlasStore';

/**
 * Which machine runs a turn: the laptop (Atlas) or this browser.
 *
 * Two callers ask, and they must agree: the chat (`pages/ChatPage.tsx`) and
 * the side panel (`lib/aiPanelRun.ts`). The rule used to be one expression
 * written in both — a local model goes to Atlas, a Gemini model runs here —
 * and BIG-1 gave it a clause.
 *
 * BIG-1: THE CLOUD MODEL RUNS ON ATLAS TOO
 * -----------------------------------------
 * A Gemini pick used to drop him into the in-browser assistant — eight tools
 * instead of Atlas's full set, no skills, no modes, no memory, no log, no
 * undo. Now it goes to the laptop whenever the laptop can run it, and gets
 * everything a local pick gets. Claude and ChatGPT go nowhere else: their
 * lists come from the laptop, so they are only ever picked while it is awake.
 *
 * "Can run it" has two halves for Gemini, and both are facts, not hopes:
 * the laptop's Atlas says it takes cloud turns (`health.hosted`, absent on an
 * Atlas built before BIG-1), **and** there is a key for it to spend — his
 * Gemini key from the sheet, or one in Atlas's own `.env`. With neither, the
 * browser answers as it always has, through the proxy, and the chat says so.
 *
 * BUILD-12's Downshift switch, which sent every cloud pick to the laptop's
 * local model, was removed with the AI spending (OPT-4, 2026-10-06).
 */
export interface CloudRouting {
  /** `health.hosted.providers` — what this laptop's Atlas takes a key for. Empty on an older Atlas. */
  atlasProviders: readonly string[];
  /** Whether a Gemini turn on the laptop would have a key: his sheet's, or Atlas's own `.env`. */
  geminiKeyForAtlas: boolean;
}

export function routesToAtlas(
  model: Pick<ModelOption, 'provider'>,
  status: AtlasStatus,
  baseUrl: string | null,
  cloud: CloudRouting = { atlasProviders: [], geminiKeyForAtlas: false },
): boolean {
  if (status !== 'awake' || baseUrl === null) return false;
  if (model.provider === 'ollama') return true;
  if (!cloud.atlasProviders.includes(model.provider)) return false;
  return model.provider !== 'gemini' || cloud.geminiKeyForAtlas;
}

/** `health.hosted.providers`, or none for an Atlas built before BIG-1. */
export function atlasCloudProviders(health: AtlasHealth | null): readonly string[] {
  return health?.hosted?.keysFromRequest === true ? health.hosted.providers : NO_PROVIDERS;
}

const NO_PROVIDERS: readonly string[] = [];

/**
 * The cloud half of the rule, from what the laptop said and whether his sheet
 * holds a Gemini key. One function so the chat and the side panel cannot
 * disagree about it.
 */
export function cloudRoutingOf(health: AtlasHealth | null, geminiKeyInSheet: boolean): CloudRouting {
  return {
    atlasProviders: atlasCloudProviders(health),
    geminiKeyForAtlas: geminiKeyInSheet || health?.gemini?.configured === true,
  };
}

/**
 * What Atlas is asked for.
 *
 * A local model by its bare id; a
 * cloud one by its key, `gemini:<id>`, `anthropic:<id>` or `openai:<id>`,
 * which is the spelling Atlas's `parseModel` reads as a cloud turn.
 */
export function atlasModelId(model: Pick<ModelOption, 'provider' | 'id' | 'key'>): string {
  return model.provider === 'ollama' ? model.id : model.key;
}
