import type { ModelOption } from '../agent/models';
import type { AtlasHealth } from './client';
import type { AtlasStatus } from './atlasStore';

/**
 * Which machine runs a turn: the laptop (Atlas) or this browser.
 *
 * Two callers ask, and they must agree: the chat (`pages/ChatPage.tsx`) and
 * the side panel (`lib/aiPanelRun.ts`). The rule used to be one expression
 * written in both — a local model goes to Atlas, a Gemini model runs here —
 * and BUILD-12 gave it a second clause.
 *
 * DOWNSHIFT SENDS A GEMINI PICK TO THE LAPTOP
 * --------------------------------------------
 * Downshift is his "do not spend money" switch, set on `/atlas-host` and kept
 * by Atlas. Atlas enforces it: a turn that asks it for a hosted model runs on
 * the local default and says so. But a Gemini pick never reached Atlas — it
 * ran here, on the in-browser assistant, spending — so with the switch on and
 * the laptop awake, a Gemini pick goes to the laptop as `gemini:<id>` and the
 * laptop pushes it down. The app does not swap the model itself: the laptop is
 * the one place the switch lives, and it names both models in the notice.
 *
 * **A sleeping laptop still falls back to the in-browser assistant**, switch
 * or no switch (his call, 2026-09-24). Refusing there would leave him with
 * nothing on a train, which is what the fallback exists to prevent.
 */
export function routesToAtlas(
  model: Pick<ModelOption, 'provider'>,
  status: AtlasStatus,
  baseUrl: string | null,
  /** `downshiftOn(health)`. A boolean so a caller can select just it from the store. */
  downshift: boolean,
): boolean {
  if (status !== 'awake' || baseUrl === null) return false;
  return model.provider === 'ollama' || downshift;
}

/** Whether the laptop says Downshift is on. An Atlas built before it never is. */
export function downshiftOn(health: AtlasHealth | null): boolean {
  return health?.spend?.downshift === true;
}

/**
 * What Atlas is asked for.
 *
 * A local model by its bare id, as every turn before BUILD-12 sent it; a
 * Gemini one by its key, `gemini:<id>`, which is the spelling Atlas's
 * `parseModel` reads as "the hosted path" — and Downshift then reroutes.
 */
export function atlasModelId(model: Pick<ModelOption, 'provider' | 'id' | 'key'>): string {
  return model.provider === 'ollama' ? model.id : model.key;
}
