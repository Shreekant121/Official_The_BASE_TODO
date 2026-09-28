/**
 * What `pages/ChatPage.tsx` and the pieces it draws a conversation with all
 * need to agree on (BUILD-7): the shape of one turn, and the two lookups more
 * than one of them reads. Moved out of that page, unchanged, when it was split.
 */
import type { IconName } from '../../ui';
import { CHIP_ICON_NAMES, type ToolChipIcon } from '../../lib/agent/toolChip';
import type { AtlasHeldCall, AtlasMode, AtlasPendingApproval, AtlasTurnCost } from '../../lib/atlas/client';
import type { AgentToolCall, TokenUsage } from '../../lib/agent/types';
import type { AskCard } from '../../lib/askCard';

export interface ChatTurn {
  id: string;
  userText: string;
  assistantText: string;
  toolCalls: AgentToolCall[];
  status: 'running' | 'done' | 'error';
  error?: string;
  /** True when adding or swapping an API key is the fix. */
  keysWouldHelp?: boolean;
  /** The `useSnapshotStore` turn this wrote into, or `null` if it wrote nothing. */
  snapshotTurnId: string | null;
  usage?: TokenUsage;
  /**
   * Which model answered *this* turn, and how long it took (item 9D).
   *
   * `atlas.html` opens a turn's meta line with the model's name, and it is the
   * one field on that line this screen genuinely knows and was throwing away:
   * the picker shows what will answer the *next* turn, so a conversation that
   * began on `gemma4:e4b` and fell back to Gemini mid-way had no record of it.
   * Captured at send, then corrected on the Atlas path — Ollama's swaps fail
   * and `modelUsed` is the model that actually spoke.
   *
   * `elapsedMs` is measured here rather than reported, for `probeAtlas`'s
   * reason: the client is the only end that knows when the request left.
   * The mockup's fourth field is the turn's cost in rupees, which is item 13
   * and is deliberately absent — see the instrument bar.
   */
  model?: string;
  elapsedMs?: number;
  /**
   * Which machine ran **this** turn (item 9D).
   *
   * Not the same question as the page's `onAtlas`, and the difference is a bug
   * that was live for one build. `onAtlas` says where the *next* turn would
   * go; it flips the moment the laptop wakes or the picker changes. A finished
   * turn's changes container has to describe the machine that wrote those rows
   * — the in-browser one has a snapshot and a working Revert, an Atlas one has
   * neither — so reading the page's value made a Gemini turn claim Atlas had
   * written it, and took away a button that worked.
   */
  ranOnAtlas?: boolean;
  /**
   * Something Atlas said that is not the answer: a model that would not load,
   * a fallback onto whatever was resident. Shown under the turn, quietly.
   * Empty on the in-browser path, which has no models to swap.
   */
  notices?: string[];
  /**
   * The model's reasoning, one entry per round trip (item 12, DESIGN.md §3.3).
   *
   * `round` is Atlas's, so a thought is drawn above the tool call it led to
   * rather than a turn's thinking being run together into one block. `ms` is
   * how long the reasoning *streamed* for and is measured here rather than
   * reported, for `elapsedMs`'s reason — the client is the only end that knows
   * when the first character arrived. `startedAt` is the monotonic clock that
   * measurement is taken against and is not drawn.
   *
   * **Atlas-only.** The in-browser fallback runs on Gemini, whose thoughts are
   * an opaque `thoughtSignature` rather than text, so this is always empty
   * there — see `providerData` in `lib/agent/types.ts`.
   */
  thinking?: { round: number; text: string; ms: number; startedAt: number }[];
  /** Planning mode's steps, proposed and not started (item 12). */
  plan?: string[];
  /**
   * The question card Atlas stopped on (§7.3, BUILD-16). Never an approval.
   * Set live from the `ask` event; a reopened conversation has none, and
   * `TurnBlock` reads the card off the `ask_questions` call instead.
   */
  ask?: AskCard;
  /** The writes Planning or Ask-first stopped, with the arguments asked for. */
  held?: { mode: AtlasMode; calls: AtlasHeldCall[] };
  /**
   * Acts this turn asked a tap for (item 13, DESIGN.md §5.2).
   *
   * A list rather than one, because a turn can reach the door twice, and
   * **appended as they arrive** rather than gathered at the end like `held`.
   * The difference is the whole design: Atlas does not block on a tap, so the
   * turn carries on afterwards and the card belongs where in the answer it was
   * asked for.
   *
   * The card reads its live state — waiting, approved, discarded — from the
   * page's tray rather than from here, because a tap is a decision about the
   * *act*, not about the message that requested it, and it can be made from a
   * different device a week later.
   */
  approvals?: AtlasPendingApproval[];
  /**
   * What the turn cost, in rupees (item 12, §3.4).
   *
   * `rupees: null` is *not known* and draws as an em dash; `0` is *known to be
   * free*, which every local turn is. Absent on the in-browser path, which is
   * a third state again — that path has never counted, and `TurnFooter` prints
   * nothing rather than claiming either.
   */
  cost?: AtlasTurnCost;
  /**
   * The turn stopped at the per-turn spending ceiling (item 13A, §3.4).
   *
   * Present only when it did. `logTurnId` is what **Continue** resumes, and
   * its absence is why the button is not always drawn: an Atlas keeping no
   * action log has nowhere to have recorded the steps, and a button offering
   * to carry on from nothing would be a lie about what a tap does.
   */
  ceilingStop?: { rupees: number | null; logTurnId: string | null };
  /**
   * The monthly ceiling stopped this turn **before it ran** (item 13A, §3.4).
   *
   * Nothing happened: no model was called and nothing was spent. Deliberately
   * its own field rather than an `error`, because it is not one — §3.4 asks
   * Atlas to *ask* rather than decline, and an error message beside a button
   * that works would say the opposite.
   */
  monthlyStop?: { spent: number; limit: number; turns: number; model: string };
}

/*
 * The table moved to `toolChip.ts` at item 13, because `/log` draws the same
 * glyphs on its rows and two copies of it is one that goes stale. The reasons
 * behind the choices went with it.
 */
export const CHIP_ICONS = CHIP_ICON_NAMES as Record<ToolChipIcon, IconName>;

/**
 * The ink inside the assistant's mark. The source's own literal — a lifted
 * emerald that stays legible on `--glass-tint-accent`, where `--accent` itself
 * is too dark to read as a glyph.
 */
export const MARK_INK = 'oklch(0.93 0.07 162)';

/**
 * ITEM 13G — ONE COLUMN, 820, AND THE COMPOSER IS IN IT.
 *
 * The redrawn `atlas.html` puts the header, the transcript and the composer in
 * a single 820px column and the old screen had two — 880 for the conversation
 * and 800 for the composer, so the field sat 40px inside the answers above it
 * and neither edge lined up with anything. Nothing was gained by the
 * difference; it was inherited from `assistant.html`, which had no chat list
 * beside it to make room for.
 */
export const COLUMN_PX = 820;
