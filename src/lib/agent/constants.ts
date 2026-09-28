/**
 * Every model id the agent uses, in one place.
 *
 * Constraint C4: the Live models are previews whose shutdown dates are listed
 * as "to be determined". When one goes away the fix has to be a single edit
 * here, not a search across transports, so nothing else in the codebase is
 * allowed to name a model.
 *
 * Item 6 made most of that moot rather than harder: the picker's list is
 * FETCHED, from Google's own models endpoint and from Ollama's `/api/tags`, so
 * the app no longer names the models it offers and a shutdown takes it off the
 * list by itself. What is left here is only what has to be named — the two
 * fallbacks below, which answer "and if nothing has been chosen yet?".
 */

/**
 * The orchestrator on the text path — `transports/geminiTransport.ts`.
 *
 * Also the last resort in `models.ts`'s `resolveSelection`: the model a turn
 * runs on when nothing is stored and neither list came back. Used as an id
 * only, never as an entry in the picker.
 */
export const TEXT_MODEL = 'gemini-flash-latest';

/** Step 12's sub-agents. Same model; separate constant so it can diverge on cost. */
export const SUBAGENT_MODEL = 'gemini-flash-latest';

/** The speech-to-speech session — Step 8's `transports/liveTransport.ts`. Preview (C4). */
export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/**
 * How many model round trips one turn may take before the loop gives up.
 *
 * A turn is one request per iteration plus the tools it asks for, so this is
 * the ceiling on both latency and spend for a single user message. Eight is
 * comfortably above real usage — the deepest genuine chain in the wave-1 tool
 * set is search → get → update → add_to_today — and low enough that a model
 * stuck re-running the same search costs seconds rather than minutes.
 */
export const MAX_TOOL_ITERATIONS = 8;

/** Where the browser reaches the proxy that holds `GEMINI_API_KEY` (`api/chat.ts`). */
export const CHAT_ENDPOINT = '/api/chat';

/**
 * Gemini itself, for the bring-your-own-key path in `lib/agent/apiKeys.ts`.
 * Only reached when the user has added a key of their own; with none, every
 * text request goes through `CHAT_ENDPOINT` as decision D8 specifies.
 */
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Where the browser asks the proxy which Gemini models the deployment's key
 * can see (`api/models.ts`). The bring-your-own-key path does not come here —
 * it reads `${GEMINI_API_BASE}/models` directly, with the user's own key, for
 * the same reason the chat request does.
 */
export const MODELS_ENDPOINT = '/api/models';

// ─── Local models (item 6, relocated by item 8) ─────────────────────────────

/*
 * `OLLAMA_BASE` and `OLLAMA_NUM_CTX` used to live here and are gone.
 *
 * Both were facts about the machine a *model* runs on, and that machine is no
 * longer this one: Atlas holds the daemon address and the context window now
 * (`../../atlas/src/config.ts`), where they are configuration rather than
 * constants, because Atlas is the process sitting beside Ollama. This app no
 * longer opens a socket to a model of any kind — it talks to Atlas, and Atlas
 * talks to Ollama.
 *
 * What is left below is the one thing still decided here: which local model
 * the picker leads with.
 */

/**
 * Which local model answers when the user has not chosen one.
 *
 * **`gemma4:e4b`, reversing item 6's choice, and the reversal is the point.**
 * That decision was made from file size — 9.61 GB, which on an 8 GB card reads
 * as impossible. It is not a memory figure. Measured on Shreekant's own
 * machine (`../../atlas/DESIGN.md` §2): it loads into **3.23 GB, entirely on
 * the GPU, at 71.5 tok/s on charger**, because it is an E4B model — 8B
 * parameters stored, roughly 4B active per token. An 8B model wearing a 4B
 * suit, for the same footprint as the 4.7B this used to name.
 *
 * Still a *preference*, not a list: `models.ts` never invents an entry from
 * it, it only prefers this id among the models Atlas actually reported. A
 * machine that has never pulled it defaults to whatever else is there.
 */
export const OLLAMA_DEFAULT_MODEL = 'gemma4:e4b';
