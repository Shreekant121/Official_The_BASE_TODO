/**
 * The things about Atlas that belong to **this device**, not to the account.
 *
 * Same rule `modelStore.ts` states and for the same reason: which model
 * answers is a fact about where you are sitting, not about who you are, and a
 * choice synced from a device on the tailnet to one that is off it would
 * select a model that cannot answer. These two follow it.
 *
 * - **Which conversation is open.** The conversations themselves live on the
 *   laptop and every device sees all of them; *which one this tab was reading*
 *   is local. Syncing it would have the tablet yank the laptop's screen to a
 *   different chat mid-sentence.
 * - **The context window** (DESIGN.md §4.1). It is a claim about the machine
 *   running the model, so it is the same number wherever it is set from — but
 *   it is set on a device, changes often, and is worth nothing to anyone else.
 *   Keeping it out of `data/main` also keeps it out of the 1 MB budget, which
 *   is the app's standing rule about anything that is not a task.
 *
 * - **Whether the chat list is docked** (item 12). A window is a fact about a
 *   device if anything is: the laptop has room for the list beside the
 *   conversation and the tablet does not, and a preference synced between them
 *   would hide a column on the machine that has space for it.
 * - **The mode** (item 12, DESIGN.md §3.3; the thinking effort beside it went
 *   with its dial at OPT-8 — every turn is Max). It is a per-turn field on
 *   the request rather than settings Atlas holds — Atlas
 *   deliberately has no opinion, so that two devices in two rooms cannot change
 *   each other's mode mid-sentence — which leaves the *remembering* here.
 *
 * `localStorage` throws in a private window rather than returning null, so
 * every access is wrapped. A device with no storage gets the defaults, which
 * is a working app rather than a broken one.
 */

export const CHAT_ID_KEY = 'mutineer_atlas_conversation';
export const CONTEXT_K_KEY = 'mutineer_atlas_context_k';
export const LIST_DOCKED_KEY = 'mutineer_atlas_list_docked';
export const MODE_KEY = 'mutineer_atlas_mode';

/**
 * **Which voice Atlas speaks in, and whether it speaks at all** (items 24–25).
 *
 * The most device-local setting in the file, and the clearest illustration of
 * the rule above: his tablet reports **95 installed voices** and this laptop
 * reports three. A choice synced between them would name a voice the other
 * machine does not have — so `useVoiceChoice` falls back to the device default
 * rather than failing, and the pill says the voice is missing rather than
 * going blank.
 *
 * `SPEAK_REPLIES_KEY` is off unless set, which is deliberate: a tablet that
 * starts talking out loud because a setting synced from the laptop is a
 * genuinely bad surprise, and the one place speaking is *always* on is dock
 * mode, which he enters on purpose.
 */
export const VOICE_URI_KEY = 'mutineer_atlas_voice';
export const SPEAK_REPLIES_KEY = 'mutineer_atlas_speak';

export function readDeviceValue(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value === null || value.trim() === '' ? null : value.trim();
  } catch {
    return null;
  }
}

/** Writing `null` clears the key — which is what closing a conversation means. */
export function writeDeviceValue(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode. The choice holds for this tab and is forgotten on reload,
    // which is the behaviour before item 10 and not worth failing over.
  }
}
