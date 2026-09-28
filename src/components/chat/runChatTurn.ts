/**
 * Runs one turn on whichever machine is answering, and hands back what both
 * branches have in common. Moved out of `pages/ChatPage.tsx`'s `send`,
 * unchanged, when that page was split (BUILD-7); the page keeps everything
 * around the call — the turn on screen, the busy flag, Stop, and what a
 * failure says.
 *
 * ITEM 6 — WHO ANSWERS THIS
 * -------------------------
 * The header carries a second piece of machine state now: `ModelPicker`, over
 * Google's models and the ones running on this computer together. This page is
 * where the two providers meet and it is the *only* place that knows there are
 * two — it builds both transports and hands `runAgentTurn` whichever the
 * chosen model implies. Everything under `lib/agent/` below the transports is
 * untouched by that choice: same loop, same system prompt, same eight tools,
 * same snapshot and the same Revert, whether the answer came from Google or
 * from a 4B model three inches away.
 *
 * ITEM 8 — THE LOOP LEFT THIS BUILDING
 * -------------------------------------
 * The agent moved to **Atlas**, a program on Shreekant's laptop with its own
 * repository at `../../atlas/` and its own `DESIGN.md`. This page is now a
 * *client* of it, and the branch item 6 left here got wider rather than
 * different: it used to choose between two transports handed to one loop in
 * this browser, and it now chooses between two **machines**.
 *
 * - **A local model runs on Atlas**, reached over Tailscale. That is what
 *   makes local models work on the tablet at last: `localhost:11434` from a
 *   tablet is the tablet, and Atlas is not.
 * - **A Gemini model runs here**, through `runAgentTurn` and the eight tools,
 *   exactly as it has since item 5.
 *
 * **The second is the fallback, and it is kept on purpose** (DESIGN.md §9).
 * Laptop shut, tablet on a train: `resolveSelection` finds no local models,
 * falls through to Gemini on its own, and a task can still be added. Nothing
 * routes that — the model list simply comes back empty and item 6's existing
 * preference order does the rest. What this page adds is the *sentence*
 * (`whoIsAnswering`), because a silent downgrade is the failure worth
 * avoiding.
 *
 * ITEM 9 — ATLAS GREW HANDS, AND THIS PAGE ASKS RATHER THAN ASSUMES
 * ------------------------------------------------------------------
 * Atlas reaches the app over **MCP** now, so an Atlas turn can create, edit
 * every field on a task, break one into steps, and delete one into the Trash.
 * Item 8 left four pieces of copy conditional on it not being able to, and
 * said they "revert at item 9" — they did not simply revert, and the reason is
 * worth keeping:
 *
 * **"Atlas is up" and "Atlas can change tasks" are two different facts.** Its
 * MCP server needs a Firebase service-account key on that laptop, and without
 * one Atlas still answers, still holds a conversation, and still cannot touch
 * a task. So the copy is keyed on `health.stage.tools`, which Atlas derives
 * from whether a server is actually connected — the field item 9 put there
 * precisely so a client would not have to guess from a version number.
 *
 * **There is still no Revert on the Atlas path**, and that is not the same
 * gap. The snapshot ring is a Zustand store in this browser and an Atlas turn
 * never touches it; what replaces it is the action log (DESIGN.md §5.3), which
 * is item 13. Until then an Atlas deletion is undone from the Trash. The
 * in-browser fallback keeps its ring and its Revert, unchanged.
 *
 * The fallback also keeps exactly its original **eight** tools rather than the
 * full MCP surface: it has no drawer mechanism to keep a declaration small,
 * and its job is that a task can still be added from a train.
 *
 * **The Gemini transport is built once and kept.** It reads its key per
 * request on purpose, so swapping a key lands on the very next turn; giving
 * it a shorter lifetime would quietly undo that.
 *
 * ITEM 9D, THE WIRE
 * -----------------
 * **ATLAS'S TOOL CALLS ARE ON THE WIRE, AND THAT IS A CHANGE IN BOTH REPOS.**
 * Item 9 gave Atlas hands and left them invisible: `routes/chat.ts` passed
 * `onTextDelta` into its `runAgentTurn` and not `onToolCall`, so every call ran
 * on the laptop and this page saw only the prose that came after it. Chips and
 * `TaskRow`s were named in 9D's scope and could only ever appear on the
 * in-browser fallback — the path that is *not* the default. Atlas's
 * `ChatEvent` gained `{ type: 'tool', call }`; `lib/atlas/client.ts` gained the
 * matching `onToolCall`, named to match `runAgentTurn`'s so the two branches
 * here still read as one shape.
 *
 * `toolChip.ts` needed the other half: `fallbackTools` is eight and `mcpTools`
 * is fifteen, so seven tool names had never reached that file and fell to its
 * `default` — which drew a `delete_task` as the words *"delete task"* under a
 * `file-text` glyph, inside the changes container. All seven have cases now.
 */
import { runAgentTurn, type RunAgentTurnOptions } from '../../lib/agent/core';
import {
  runAtlasTurn,
  type AtlasEffort,
  type AtlasMode,
  type AtlasTurnCost,
} from '../../lib/atlas/client';
import { tokensForStep } from '../../lib/atlas/contextReadings';
import type { AgentMessage } from '../../lib/agent/types';
import type { ChatTurn } from './chatShared';

export interface ChatTurnRun {
  /**
   * The laptop's address when Atlas runs this turn, `null` when this browser
   * does. The page passes it only when `onAtlas` holds, so the choice between
   * the two machines is made there, once.
   */
  atlasBase: string | null;
  message: string;
  history: AgentMessage[];
  model: { id: string; label: string };
  timezone: string;
  conversationId: string | null;
  /** The context slider's stop, in thousands of tokens. */
  contextK: number;
  mode: AtlasMode;
  /** Go ahead's one-turn override of `mode` (item 12). */
  runFor?: AtlasMode;
  effort: AtlasEffort;
  carryOn?: { resumeTurnId?: string; overMonthlyCeiling?: boolean };
  /** The `/` summon waiting to be sent, read and cleared in one step; `undefined` for none. */
  takeSkill: () => string | null | undefined;
  signal: AbortSignal;
  geminiTransport: RunAgentTurnOptions['transport'];
  session: RunAgentTurnOptions['session'];
  /** Applies an update to the turn on screen. */
  patch: (update: (turn: ChatTurn) => ChatTurn) => void;
  onConversation: (id: string) => void;
  /** An act was put in the tray; the page re-reads it. */
  onApproval: () => void;
}

export function runChatTurn({
  atlasBase,
  message,
  history,
  model,
  timezone,
  conversationId,
  contextK,
  mode,
  runFor,
  effort,
  carryOn,
  takeSkill,
  signal,
  geminiTransport,
  session,
  patch,
  onConversation,
  onApproval,
}: ChatTurnRun) {
  const stream = (delta: string) =>
    patch((turn) => ({ ...turn, assistantText: turn.assistantText + delta }));

  /*
   * The two machines, and everything after this is shared.
   *
   * Both branches stream into the same turn, hand back the same history
   * to feed in next time, and report the same `usage`. What differs is
   * the two things only one of them can have: **tools**, which is why
   * only the in-browser branch has a `snapshotTurnId` to revert, and
   * **model swaps**, which is why only the Atlas branch has notices.
   */
  return atlasBase !== null
    ? runAtlasTurn({
        baseUrl: atlasBase,
        userMessage: message,
        history,
        model: model.id,
        timezone,
        /* Item 10. `null` on the first message of a new chat — Atlas
           makes one and says which on `start`, which is why the callback
           below adopts the id rather than waiting for `done`: the turn
           can be abandoned and the conversation still exists. */
        conversationId,
        /* The exact count for the chosen stop, never the label times a
           multiplier — the two disagree at 131 and 262, and one token
           over the declared maximum is silently clamped (§2.4). */
        numCtx: tokensForStep(contextK) ?? undefined,
        /* Item 12. `runFor` is the Go-ahead override; the dial is what
           every other turn runs as. */
        mode: runFor ?? mode,
        /* The `/` summon, sent only on the turn it changes — the laptop
           carries it on the conversation afterwards. Read and cleared in
           one step so a retry does not announce it twice. */
        ...((): { skill?: string | null } => {
          const asked = takeSkill();
          return asked !== undefined ? { skill: asked } : {};
        })(),
        /* Item 13A. Only ever set by a button — the interrupted card and
           the ceiling's Continue — and both are the same act to Atlas. */
        ...(carryOn?.resumeTurnId ? { resumeTurnId: carryOn.resumeTurnId } : {}),
        ...(carryOn?.overMonthlyCeiling ? { overMonthlyCeiling: true } : {}),
        /* §3.4's tap, before the turn rather than after it. Recorded on
           the turn instead of thrown, so the card sits where the answer
           would have been rather than beside an error saying Atlas
           broke — it did not, it asked a question. */
        onMonthlyCeiling: (report) => patch((turn) => ({ ...turn, monthlyStop: report })),
        effort,
        onConversation,
        signal,
        onTextDelta: stream,
        /* Item 9D. The same callback the in-browser branch below hands
           `runAgentTurn`, doing the same thing to the same turn — which
           is the point of `runAtlasTurn` being shaped like it. Before
           this, an Atlas turn that searched, wrote and deleted arrived
           as prose claiming to have done so and nothing else. */
        onToolCall: (call) =>
          patch((turn) => ({
            ...turn,
            toolCalls: [...turn.toolCalls, call],
            // Anything said before reaching for a tool is a preamble,
            // not part of the answer that follows it.
            assistantText: turn.assistantText === '' ? '' : `${turn.assistantText.trimEnd()}\n\n`,
          })),
        onNotice: (notice) =>
          patch((turn) => ({ ...turn, notices: [...(turn.notices ?? []), notice] })),
        /* Item 12. The reasoning, kept and timed.
           `ms` is measured here rather than reported for `elapsedMs`'s
           reason — the client is the only end that knows when the first
           character arrived — and it is the time the thought *streamed*
           for, which is the honest thing the mockup's "Thought for 3.1s"
           can mean from this side. */
        onThinking: (delta, round) =>
          patch((turn) => {
            const existing = turn.thinking ?? [];
            const at = existing.findIndex((entry) => entry.round === round);
            const now = performance.now();
            if (at === -1) {
              return { ...turn, thinking: [...existing, { round, text: delta, ms: 0, startedAt: now }] };
            }
            const next = [...existing];
            next[at] = { ...next[at], text: next[at].text + delta, ms: now - next[at].startedAt };
            return { ...turn, thinking: next };
          }),
        onPlan: (steps) => patch((turn) => ({ ...turn, plan: steps })),
        onAsk: (card) => patch((turn) => ({ ...turn, ask: card })),
        onHeld: (heldMode, calls) =>
          patch((turn) => ({ ...turn, held: { mode: heldMode, calls } })),
        /* Item 13. Appended rather than replaced, and the tray refreshed
           straight after: the act is now on the laptop and the pill in
           the header has to say so even if this turn is abandoned. */
        onApproval: (approval) => {
          patch((turn) => ({ ...turn, approvals: [...(turn.approvals ?? []), approval] }));
          onApproval();
        },
      }).then((atlas) => ({
        text: atlas.text,
        history: atlas.history,
        usage: atlas.usage,
        /* The chat's name, which the first message of a new one decides.
           Refreshing the list here rather than polling it: this is the
           one moment it is known to be out of date. */
        conversationTitle: atlas.conversationTitle,
        /* Atlas has hands (item 9) and its turns really do write, but
           what makes that work undoable is Atlas's own action log rather
           than this browser's snapshot ring — so there is never a ring
           entry here to point at. `ChangeList` says so on that path
           instead of offering a button that cannot reach the laptop. */
        turnId: null,
        /* Not the model that was asked for: Ollama's swaps fail, and
           whatever was already resident is what answered. */
        model: atlas.modelUsed,
        /* Item 12. Worked out on the laptop from the model that actually
           answered — see `atlas/src/agent/pricing.ts` for why a model
           with no price gets `null` rather than a zero. */
        cost: atlas.cost,
        /* Item 13A. Carried out of the turn so the block below can draw
           the Continue button; `undefined` on the in-browser path, which
           has no ceilings and never stopped at one. */
        ceilingStop: atlas.stoppedAtCeiling
          ? { rupees: atlas.ceilingRupees, logTurnId: atlas.logTurnId }
          : undefined,
      }))
    : runAgentTurn({
        userMessage: message,
        history,
        transport: geminiTransport,
        model: model.id,
        session,
        signal,
        onTextDelta: stream,
        onToolCall: (call) =>
          patch((turn) => ({
            ...turn,
            toolCalls: [...turn.toolCalls, call],
            // Anything the model said before reaching for a tool is a
            // preamble, not part of the answer that follows it.
            assistantText: turn.assistantText === '' ? '' : `${turn.assistantText.trimEnd()}\n\n`,
          })),
      }).then((agent) => ({
        ...agent,
        model: model.label,
        conversationTitle: null,
        /* The in-browser path has never counted what a turn cost and
           does not start here: this whole branch is the fallback for a
           closed lid, its usage is reported by Gemini in this browser,
           and item 13's ceilings are Atlas's. `TurnFooter` prints
           nothing rather than a zero. */
        cost: undefined as AtlasTurnCost | undefined,
        /* The fallback has no ceilings — item 13A's are Atlas's, and
           this branch is what runs when there is no Atlas. */
        ceilingStop: undefined as ChatTurn['ceilingStop'],
      }));
}
