/* Mode, thinking effort and the context window: the per-device dials that
   decide how the next turn runs. Moved out of `pages/ChatPage.tsx`, unchanged,
   when it was split (BUILD-7). */
import { useCallback, useMemo, useState } from 'react';
import type { AtlasEffort, AtlasMode } from '../../lib/atlas/client';
import { DEFAULT_CONTEXT_K, contextStepsFor } from '../../lib/atlas/contextReadings';
import { CONTEXT_K_KEY, EFFORT_KEY, MODE_KEY, readDeviceValue, writeDeviceValue } from '../../lib/atlas/devicePrefs';

/**
 * ITEM 13G — THE MODES MOVED, AND THIS IS WHERE THEY WENT.
 *
 * Item 12 drew them as a `SegmentedControl` on the instrument bar and put a
 * sentence about the chosen one under the composer. The re-exported
 * `atlas.html` draws neither: mode is a **bare pill under the field** that
 * opens a popover, and each mode's sentence sits beside it in that popover
 * where it is read at the moment the choice is made rather than standing on
 * screen describing a choice already taken.
 *
 * So `MODES` and `MODE_HINT` are gone from this file and live in
 * `components/chat/Composer.tsx` as one list carrying both. The three modes
 * themselves are unchanged, `chooseMode` is unchanged, and `atlas/src/agent/
 * modes.ts` never heard about any of this.
 *
 * The standing sentence the hint used to share the line with — *"It writes to
 * your real backlog…"* — survives only on the in-browser fallback, which has
 * no modes to describe and where that sentence is the only thing the row has
 * to say. See `Composer`'s `fallbackNote`.
 */

function parseMode(raw: string | null): AtlasMode {
  return raw === 'plan' || raw === 'ask' ? raw : 'auto';
}

function parseEffort(raw: string | null): AtlasEffort {
  // `off` was a real position until this session measured it out of existence,
  // so a device still holding one must land on the default rather than break.
  return raw === 'hard' ? 'hard' : 'some';
}

/**
 * `localModel` is the chosen model's id when it runs on the laptop, and `null`
 * for a Gemini model, which declares no context steps to keep the slider inside.
 */
export function useTurnDials(localModel: string | null) {
  /*
   * ITEM 12 — THE TWO DIALS.
   *
   * Per device, like the model and the context window beside them, and for the
   * same reason `devicePrefs.ts` gives: Atlas deliberately holds no opinion
   * about either, so that two devices in two rooms cannot change each other's
   * mid-sentence. Both ride on every request at their defaults, which an Atlas
   * built before this item simply ignores.
   */
  const [mode, setMode] = useState<AtlasMode>(() => parseMode(readDeviceValue(MODE_KEY)));
  const [effort, setEffort] = useState<AtlasEffort>(() => parseEffort(readDeviceValue(EFFORT_KEY)));

  const chooseMode = useCallback((next: string) => {
    const picked = parseMode(next);
    setMode(picked);
    writeDeviceValue(MODE_KEY, picked === 'auto' ? null : picked);
  }, []);

  const chooseEffort = useCallback((next: string) => {
    const picked = parseEffort(next);
    setEffort(picked);
    writeDeviceValue(EFFORT_KEY, picked === 'some' ? null : picked);
  }, []);

  /** Thousands of tokens (DESIGN.md §4.1). 64K unless he has moved it. */
  const [contextK, setContextK] = useState<number>(() => {
    const stored = Number(readDeviceValue(CONTEXT_K_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_CONTEXT_K;
  });

  /*
   * Keep the slider inside what the chosen model declares.
   *
   * Swapping from `qwen3.5:4b` at 262K to `gemma4:e4b`, whose ceiling is 131K,
   * would otherwise leave the control pointing at a number Atlas clamps —
   * which is the exact quiet wrongness §4.1 exists to prevent, arriving
   * through the control built to prevent it.
   */
  const contextSteps = useMemo(
    () => (localModel !== null ? contextStepsFor(localModel) : []),
    [localModel],
  );
  const effectiveContextK =
    contextSteps.length === 0 ? contextK : contextSteps.includes(contextK) ? contextK : contextSteps[contextSteps.length - 1];

  const chooseContextK = useCallback((k: number) => {
    setContextK(k);
    writeDeviceValue(CONTEXT_K_KEY, String(k));
  }, []);

  return { mode, chooseMode, effort, chooseEffort, effectiveContextK, chooseContextK };
}
