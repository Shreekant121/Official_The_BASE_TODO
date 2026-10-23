/**
 * One turn of the conversation, and the small pieces only a turn draws. Moved
 * out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7), with
 * the part of that page's opening note that is about a turn; the cards a turn
 * can end in are in `TurnCards.tsx`.
 *
 * WHAT UI-33 TOOK FROM THE REAL MOCKUP
 * ------------------------------------
 * **1. A turn is now three objects, not one stream of chips.** This is the
 * source's central claim and the reason it comments its own container: *"this
 * container IS the revert unit — the turn's changes and the button that undoes
 * them share one surface, so there is never a doubt what 'revert' covers."*
 * Ours had the changes as loose pills and Revert on a bare row underneath, so
 * the button's scope was a guess. Now:
 *   - what it **found** is a stack of `TaskRow`s (ported at UI-33 for this),
 *     because `search_tasks` and `list_today` return whole rows and the
 *     mockup draws them rather than paraphrasing them;
 *   - what it **wrote** is one bordered container, one row per change, with
 *     the count and Revert in its own footer, and a spent state that dims,
 *     strikes through and swaps every glyph for `undo-2`;
 *   - a turn that wrote nothing says `Read only · nothing changed`.
 * A read that returns no rows, and any call that FAILED, stays a chip — the
 * app's own device, and the honest place for "could not do it".
 *
 * **2. The assistant's replies sit beside a mark.** A 30px sparkles badge in a
 * gutter column, with the reply at `--fg-2` capped to 62ch. The source is
 * explicit that this is not a persona: *"the product has no assistant persona,
 * so its output is plain text on the page and only its CHANGES get a
 * container."*
 *
 * **3. Waiting is that badge pulsing, not a `Skeleton`.** `Thinking` is the
 * source's answer for this exact moment, and it is a better one: a skeleton
 * promises the shape of what is coming and `Skeleton.prompt.md` asks it to
 * *"mirror the real content's shape and count"*, which nobody knows for a
 * reply that has not been written yet. **This also retires the `Waveform` in
 * the header.** `Waveform.prompt.md` opens *"voice capture, visualised"* and
 * asks to be paired with a mic button; this app has no voice input, the real
 * assistant screen never reaches for it, and a level meter that is not
 * metering anything is decoration. See the note at the top of that file.
 *
 * **4. The composer is one surface with Send inside it**, which is what the
 * mockup draws and what UI-8 guessed the other way round ("a trough you type
 * into… Send is a round emerald button *beside* it"). It stays a **well**
 * rather than the mockup's raised `--glass-fill-2` pill: `Input.prompt.md`
 * says flatly *"do not put a raised `--glass-fill-*` background on an input"*
 * and `readme.md`'s wells-vs-panes law says the same, so the documented rule
 * wins over the sketch. `Textarea` grew a `trailing` slot for it, which is
 * `Input`'s own `suffix` idiom.
 *
 * **5. The openers are suggestions, not buttons.** Hairline glass pills that
 * lift on hover with an `arrow-up-right` on the right, staggered at the 44ms
 * `readme.md` prescribes for a list. The left-hand `list-checks`/`plus`/`clock`
 * glyphs are gone: the source's opener has one glyph and it points outward.
 *
 * ITEM 9D — A TURN, AS `screens/atlas.html` ORDERS IT
 * ----------------------------------------------------
 * **A turn is ordered the way the source orders it**: tool chips, then the
 * reply, then the rows the reply is about, then the changes container. And
 * **every read draws a chip now**. Before, a read that came back with rows
 * drew the rows *instead of* a chip, so `list_today` and `search_tasks` — the
 * two reads that matter — never showed the call behind them. The source draws
 * both, and it can afford to because the chip opens: `ToolChipRow` is the
 * mockup's expander, and what it opens onto is the call as it was made, not a
 * literal in a demo.
 *
 * **Whether Atlas ran a turn is a fact about the turn, not about the page.**
 * `ChatTurn.ranOnAtlas` is pinned at send. Reading the page's `onAtlas`
 * instead was a live bug for one build: it flips when the laptop wakes, so an
 * earlier Gemini turn would claim Atlas had written it and lose a Revert
 * button that worked.
 *
 * **What is deliberately NOT here**, because it is items 10 to 13: the
 * conversation list and the context slider (10), the modes, the effort dial,
 * the question card (12), the approval card and the
 * waiting-for-you tray (13). They were read in `atlas.html` first, which is
 * what the instrument bar has room for.
 *
 * **The composer stays a well and did not become the mockup's raised pill.**
 * `Input.prompt.md` — *"do not put a raised `--glass-fill-*` background on an
 * input. Wells go in, controls come out"* — and `readme.md`'s wells-vs-panes
 * law both forbid it. That is CLAUDE.md's rule doing its job, and UI-33 had
 * already made the same call for the same reason.
 */
import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AskCard, AskReceipt, Icon, IconButton, Remembered, Well, useWordReveal } from '../../ui';
import { catalogLink, noteName, rememberedNotes } from '../../lib/atlas/remembered';
import { isAskTool, parseAnswerMessage, readAskCard } from '../../lib/askCard';
import { describeTaskRows, describeToolCall, type ToolChip } from '../../lib/agent/toolChip';
import type { AtlasMode } from '../../lib/atlas/client';
import type { AgentToolCall, TokenUsage } from '../../lib/agent/types';
import { Markdown } from './Markdown';
import { ToolResult } from './ToolResult';
import { WorkingPill } from './WorkingPill';
import { CHIP_ICONS, MARK_INK, type ChatTurn } from './chatShared';
import { PlanCard, HeldCard } from './TurnCards';
import { ChangeList } from './ChangeList';
import { ApprovalCard } from './ApprovalCard';

export function TurnBlock({
  turn,
  timezone,
  isLast,
  answeredBelow,
  busy,
  onSend,
  onEdit,
  approvalStateOf,
  failureOf,
  deciding,
  onDecide,
}: {
  turn: ChatTurn;
  timezone: string;
  /**
   * Whether this is the turn at the bottom (item 12).
   *
   * Three of this session's four new surfaces are **live controls, not
   * records** — a plan waiting to be approved, a question waiting to be
   * answered, writes waiting to be released — and all three stop meaning
   * anything the moment another turn is underneath them. A "Go ahead" button
   * four turns up would re-run a plan the conversation has moved past. So they
   * are drawn on the last turn and drawn as history above it.
   */
  isLast: boolean;
  /**
   * The next turn is this turn's question card, answered (BUILD-16). The card
   * then gives way to that turn's receipt instead of being drawn twice.
   */
  answeredBelow: boolean;
  busy: boolean;
  /** Answer a question, or approve a plan — always as an ordinary next message. */
  onSend: (text: string, runFor?: AtlasMode) => void;
  /** Take the last message back into the composer to change it. */
  onEdit: () => void;
  /**
   * The live state of one approval, looked up in the page's tray (item 13).
   *
   * Passed as a function rather than the state itself, because it is the
   * *act's* state and not the turn's: a tap made on another device a week
   * later has to change what this card says, and this turn knows only that it
   * once asked. `waiting` is the answer when the tray has never been read —
   * an unread tray must never make something look already dealt with.
   */
  approvalStateOf: (id: string) => 'waiting' | 'approved' | 'discarded';
  /** Why the last tap on an approval did not happen, or null (BUILD-8). */
  failureOf: (id: string) => string | null;
  /** The approval currently being decided, so its buttons wait rather than repeat. */
  deciding: string | null;
  onDecide: (id: string, choice: 'approve' | 'discard') => Promise<void>;
}) {
  /* Which machine ran THIS turn, so the waiting line does not claim a read
     that cannot happen and the changes container does not withdraw a Revert
     that works. Falls back to the in-browser answer for a turn that predates
     the field — the `devChatFixture` transcript, and nothing else. */
  const onAtlas = turn.ranOnAtlas ?? false;
  /* 29-1P15a, idea 20: the reply is drawn a word at a time as it arrives,
     and finishes typing after the turn does (`useWordReveal`). */
  const reveal = useWordReveal(turn.assistantText, turn.status === 'running');
  const thinking = turn.status === 'running' && turn.assistantText === '' && turn.toolCalls.length === 0;

  /*
   * ITEM 13G — the one tool the pill is allowed to name.
   *
   * **The newest, and only the newest.** The mockup's rule is that the
   * indicator *"is never a log"*, and a turn on `gemma4:e4b` routinely calls
   * four tools — naming all four is the log it is not allowed to be. Naming
   * the latest is the truthful answer to "what is it doing", which is the
   * question somebody watching a spinner is asking.
   */
  const runningTool =
    turn.status === 'running' && turn.assistantText === ''
      ? turn.toolCalls[turn.toolCalls.length - 1]?.name
      : undefined;

  /*
   * The two halves of a turn. `wrote` comes off the tool registry's own
   * `mutates` flag (see `toolChip.ts`), so a tool added later cannot land on
   * the wrong side by being left out of a list here. A failed mutating call
   * counts as a read: it changed nothing, and the container is what did.
   */
  /* BUILD-16. The question card is drawn as itself, never as a chip: live
     from the `ask` event, and off the call's own arguments on a reopened
     conversation, where the event is gone and the call is in the log. */
  const ask =
    turn.ask ?? readAskCard(turn.toolCalls.find((call) => isAskTool(call.name) && call.ok)?.args);
  /* And this turn may BE the answers — one ordinary message, drawn as the
     receipt the card became rather than as a speech bubble of `→` lines. */
  const receipt = parseAnswerMessage(turn.userText);

  const chips = turn.toolCalls.filter((call) => !isAskTool(call.name)).map((call) => ({
    call,
    chip: describeToolCall(call, timezone),
    rows: describeTaskRows(call, timezone),
  }));
  const writes = chips.filter((entry) => entry.chip.wrote);
  const reads = chips.filter((entry) => !entry.chip.wrote);
  /* 29-1P15b, idea 94: the notes Atlas saved in this turn, as "Remembered"
     under the reply once it has finished writing itself out. */
  const remembered = rememberedNotes(turn.toolCalls);
  const navigate = useNavigate();

  /* Item 12. Editable only where taking the turn back loses nothing: the last
     turn, nothing running, and no writes on it — a turn holding a Revert must
     not vanish with the button that undoes it. A turn Ask-first *held* wrote
     nothing by definition, so it stays editable, which is the case where
     changing the wording is most useful. */
  const canEdit = isLast && !busy && turn.status !== 'running' && writes.length === 0 && receipt === null;

  /* The one approval affordance, and only ever one. Held writes own the button
     when there are any, because they are the concrete thing being agreed to;
     a plan owns it otherwise. Two Go-ahead buttons on one turn would be two
     answers to one question. */
  const live = isLast && !busy && turn.status !== 'running';
  const goAhead = live && (turn.held !== undefined || turn.plan !== undefined);

  return (
    <div
      style={{
        /* A fixed column for OPT-1's reason; see the Atlas column below. */
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-7)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 'var(--sp-4)' }}>
        {/* Edit and resend (item 12).
            Offered only on the last turn, only while nothing is running, and
            **only when the turn wrote nothing** — see `onEdit`. A turn holding
            a working Revert must not be quietly dropped out of the transcript
            with the button that undoes it. `atlas.html` reveals the same
            control on hover; it is always in the tree here rather than mounted
            on hover, so a keyboard reaches it. */}
        {canEdit && (
          <span className="ag-reveal">
            <IconButton label="Edit and resend" title="Edit and resend" variant="ghost" onClick={onEdit}>
              <Icon name="pencil" size={15} />
            </IconButton>
          </span>
        )}
        {receipt !== null ? (
          <AskReceipt receipt={receipt} style={{ maxWidth: '74%' }} />
        ) : (
          <div
            style={{
              maxWidth: '74%',
              padding: 'var(--sp-4) var(--sp-6)',
              borderRadius: 'var(--r-lg)',
              backgroundImage: 'var(--glass-fill-3)',
              backdropFilter: 'var(--glass-bd-sm)',
              WebkitBackdropFilter: 'var(--glass-bd-sm)',
              boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
              font: 'var(--type-body)',
              color: 'var(--fg-1)',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              textWrap: 'pretty',
            }}
          >
            {turn.userText}
          </div>
        )}
      </div>

      {/* ITEM 13G — waiting is one pill that renames itself, never a log.
          It names the tool being run when there is one, and says "Thinking"
          when there is not. `WorkingPill` holds motion 4 and the 420ms
          ellipsis; `Mark` is gone from this state, because the pill carries
          its own pulsing badge and two emitting sparkles on one line was the
          screen shouting. */}
      {thinking ? (
        <WorkingPill
          label={onAtlas ? 'Thinking on the laptop' : 'Reading your backlog'}
          tool={runningTool}
          since={turn.startedAt}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 'var(--sp-5)' }}>
          <Mark />

          {/* `--sp-6` inside an Atlas turn, which is the redrawn mockup's
              innermost gap and one step up from what was here. A turn now
              stacks a thought, six rows of result, prose and a card; at
              `--sp-5` those four ran together.
              `minmax(0, 1fr)` is OPT-1's fix, and `minWidth: 0` alone is not
              it: a grid with no columns makes one `auto` column as wide as its
              widest unbreakable child, and a change row (a title that never
              wraps, then its date) is wider than a phone. The column grew to
              448px in a 304px space and took the whole reply off the right
              edge, text and all. A fixed column makes the row truncate. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-6)', minWidth: 0 }}>
            {/* ── What it did, before what it concluded ────────────────
                `atlas.html` puts the tool chips *above* the reply and the task
                rows below it, and the order is the argument: the chips are the
                work, the reply is the answer, and the rows are what the answer
                is about. UI-33 had the reply first because it had no expandable
                chip to put above it — a static pill above the answer would have
                been a label on nothing.

                **Every read draws one now.** Before, a read that came back with
                rows drew the rows *instead of* a chip, so `list_today` and
                `search_tasks` — the two reads that matter — never showed the
                call that produced them. The mockup draws both, and it can now
                afford to: the chip opens onto the call itself. */}
            {/* What it was thinking, before what it did (item 12, §3.3).
                `atlas.html` puts `Thought for 3.1s` at the very top of a turn
                and opens it closed, which is the right default on a 4B model:
                the reasoning is routinely longer than the answer, so shown
                open it would bury the thing that was asked for.

                The **first** thought sits here, above the chips, because it is
                the reasoning that produced them. Later rounds are drawn beside
                their own chips further down. */}
            {(turn.thinking ?? []).slice(0, 1).map((thought) => (
              <Thought key={`${turn.id}-thought-${thought.round}`} text={thought.text} ms={thought.ms} />
            ))}

            {reads.map((entry, index) => (
              <ToolChipRow key={`${turn.id}-chip-${index}`} chip={entry.chip} call={entry.call} />
            ))}

            {/* Every round after the first. Kept together rather than
                interleaved one-per-chip: a turn's chips are already in order,
                a round can produce several of them, and threading each thought
                to its own chip needs a pairing Atlas does not send. This says
                honestly "it thought again, here is what about". */}
            {(turn.thinking ?? []).slice(1).map((thought) => (
              <Thought key={`${turn.id}-thought-${thought.round}`} text={thought.text} ms={thought.ms} again />
            ))}

            {/* ITEM 13B — Atlas writes Markdown, so the reply is drawn rather
                than printed. What used to be here was one `<p>` at
                `white-space: pre-wrap`, which is why every `**bold**` and every
                numbered list reached Shreekant as punctuation.

                The type is the mockup's `.md-*` block (`ui/screens.css`), and
                the 62ch that used to be on this element is gone with it — the
                spec caps a paragraph at 64ch, and it has to be on the paragraph
                rather than the container so a fenced code block can still use
                the full width and scroll inside itself.

                The caret moves in here. A streaming reply is several blocks,
                so `Markdown` puts it at the end of whichever one is last.
                Since 29-1P15a (idea 20) it is Atlas's violet and still — the
                words arriving are the motion — and it stays until the last
                word is typed out, which can be just after the turn ends. */}
            {turn.assistantText !== '' && (
              <Markdown
                text={reveal.shown}
                caret={turn.status === 'running' || reveal.revealing ? <Caret /> : null}
              />
            )}

            {/* 29-1P15b, idea 94 — "Remembered", under the reply that saved
                something. It lands once the reply is written out, and a tap
                opens the note (his call, 2026-10-15). */}
            {remembered.length > 0 && turn.status !== 'running' && !reveal.revealing && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)', minWidth: 0 }}>
                {remembered.map((path) => (
                  <Remembered key={path} name={noteName(path)} onOpen={() => navigate(catalogLink(path))} />
                ))}
              </div>
            )}

            {/* What it found, under the sentence describing it. `search_tasks`
                and `list_today` return whole rows and the source draws them
                rather than paraphrasing them; every other read has no rows and
                stops at its chip above.

                ITEM 13G — this was a stack of `TaskRow`s, one card each, with
                no cap on how many. Asking "what is still open" drew
                forty-eight cards inside a sentence, which is most of *"the UI
                is a mess"* and all of *"it's out of several view"*. It is six
                rows of type on hairlines now, then "Show all 48" — motion 1 of
                4 — and the rest opens into a 320px scroller. `ToolResult`
                holds both, and its header says why it is not `TaskRow`. */}
            {reads.map((entry, index) =>
              entry.rows ? (
                <ToolResult
                  key={`${turn.id}-rows-${index}`}
                  name={entry.call.name}
                  count={entry.rows.length}
                  rows={entry.rows}
                />
              ) : null,
            )}

            {/* What it wrote. */}
            {writes.length > 0 && (
              <ChangeList chips={writes.map((entry) => entry.chip)} onAtlas={onAtlas} />
            )}

            {/* ── Item 12's three cards ─────────────────────────────────
                A plan waiting to be approved, writes waiting to be released,
                and a question waiting to be answered. All three are drawn only
                on the last turn while nothing is running — see `isLast` — and
                every one of them answers by sending an **ordinary next
                message**, which is why none of them needs a special case
                anywhere in history, compaction or the transcript rebuild. */}
            {turn.plan !== undefined && (
              <PlanCard
                steps={turn.plan}
                live={live}
                owns={goAhead && turn.held === undefined}
                superseded={!isLast}
                onGo={() => onSend('Go ahead with that plan.', 'auto')}
              />
            )}

            {turn.held !== undefined && (
              <HeldCard
                held={turn.held}
                live={live}
                superseded={!isLast}
                onGo={() => onSend('Yes — go ahead and make those changes.', 'auto')}
              />
            )}

            {/* ITEM 13 — the front door (DESIGN.md §5.2).
                **Not one of the three cards above, and that is the safety
                rule.** Those are drawn only on the last turn and answered by
                sending an ordinary message; this one is drawn wherever it was
                asked for, however far back, because the act is still sitting
                on the laptop until it is answered — and it is answered by a
                tap that runs something irreversible rather than by a sentence.
                §5.2: *"approvals look different, so that tapping through cards
                never becomes a habit that carries someone through a door they
                meant to notice."* */}
            {(turn.approvals ?? []).map((approval) => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                state={approvalStateOf(approval.id)}
                failure={failureOf(approval.id)}
                busy={deciding === approval.id}
                onApprove={() => void onDecide(approval.id, 'approve')}
                onDiscard={() => void onDecide(approval.id, 'discard')}
              />
            ))}

            {/* BUILD-16 — the question card. Live on the last turn; once
                answered it gives way to the receipt on the turn below; left
                unanswered under a message he typed instead, it stays as a
                faded record of what was asked. */}
            {ask !== null && !answeredBelow && (
              <AskCard card={ask} live={live} onSubmit={(message) => onSend(message)} />
            )}

            {turn.error && (
              <Well
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
                  /* A turn that failed is coral (29-1P2c2: failed is coral's job). */
                  backgroundImage: 'var(--glass-tint-coral)',
                  boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 1, color: 'var(--status-overrun)' }}>
                  <Icon name="triangle-alert" size={16} />
                </span>
                <div style={{ minWidth: 0, display: 'grid', gap: 'var(--sp-4)', justifyItems: 'flex-start' }}>
                  <span
                    style={{
                      font: 'var(--type-caption)', color: 'var(--fg-2)',
                      textWrap: 'pretty', overflowWrap: 'anywhere',
                    }}
                  >
                    {turn.error}
                  </span>
                </div>
              </Well>
            )}

            {/* What happened on the way to the answer, but is not the answer:
                a model that would not load, and the resident one that
                answered instead (item 8). It rides here rather than in the
                prose because it is Atlas's own voice, not the model's — and
                it is not an error, so it does not get the amber well. */}
            {(turn.notices ?? []).map((notice, index) => (
              <span
                key={`${turn.id}-notice-${index}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)',
                  font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty',
                }}
              >
                <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 1 }}>
                  <Icon name="refresh-cw" size={13} />
                </span>
                {notice}
              </span>
            ))}

            {/* ITEM 13G — the pill again, at the foot of a turn that has
                already run something and has not started answering. The state
                above it draws the pill *instead of* the turn, which is right
                while there is nothing to show; once a tool has come back there
                is, and hiding the rows to keep the spinner would be the screen
                withholding what it already knows. */}
            {runningTool !== undefined && (
              <WorkingPill label={onAtlas ? 'Working on the laptop' : 'Working'} tool={runningTool} since={turn.startedAt} />
            )}

            {/* ITEM 13G — motion 7. The per-turn bar, revealed on hover and
                on focus, at `opacity` and nothing else.

                It rides `ag-reveal`, which is this app's own answer to that
                and is already on five screens — so the duration is
                `--dur-base` rather than the mockup's `--dur-fast`, and the
                resting state is a third opacity rather than nothing. That is
                deliberate: one reveal that behaves the same everywhere beats
                matching a sketch on this screen alone, and `ag-reveal`'s
                header explains why it never goes fully invisible. The other
                two sites of motion 7 — the mode tick and the char counter —
                are on the mockup's `--dur-fast` exactly.

                **Two controls, not the mockup's three.** It draws copy, retry
                and a thumbs-up; the thumbs has nowhere to go — Atlas records
                no rating and no screen reads one — and `/atlas-host`'s own
                rule is that a control with no fact behind it is left out
                rather than drawn inert. Copy and retry both do a real thing.

                `ag-reveal` rather than a `hover` state on this component: it
                keeps the buttons in the tree at all times, so a keyboard
                reaches them, which a mounted-on-hover bar never does. */}
            {turn.status !== 'running' && turn.assistantText !== '' && (
              <span className="ag-reveal" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                <IconButton
                  label="Copy this answer"
                  title="Copy this answer"
                  variant="ghost"
                  size="sm"
                  onClick={() => void navigator.clipboard?.writeText(turn.assistantText)}
                >
                  <Icon name="copy" size={14} />
                </IconButton>
                {/* Retry is "ask it again", which is an ordinary next message
                    carrying the same words — the same device every card on
                    this screen answers with, and the reason none of them needs
                    a special case in the transcript rebuild. Offered only
                    where sending one is safe: nothing running, and this turn
                    is the last. */}
                {isLast && !busy && (
                  <IconButton
                    label="Ask that again"
                    title="Ask that again"
                    variant="ghost"
                    size="sm"
                    onClick={() => onSend(turn.userText)}
                  >
                    <Icon name="rotate-ccw" size={14} />
                  </IconButton>
                )}
              </span>
            )}

            {turn.status !== 'running' && (
              <TurnFooter
                /* A note saved is a change: "nothing changed" under
                   "Remembered" would contradict it (29-1P15b). */
                readOnly={writes.length === 0 && remembered.length === 0 && !turn.error && turn.held === undefined}
                usage={turn.usage}
                model={turn.model}
                elapsedMs={turn.elapsedMs}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The violet caret at the end of a reply being written (idea 20). */
function Caret() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block', width: 2, height: '1em', marginLeft: 2,
        verticalAlign: 'text-bottom', background: 'var(--job-violet)',
      }}
    />
  );
}

/** The mark every assistant turn sits beside. `live` is the one thing that emits. */
function Mark({ live = false }: { live?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid', placeItems: 'center', width: 30, height: 30, marginTop: 2, flex: '0 0 auto',
        borderRadius: '50%', backgroundImage: 'var(--glass-tint-violet)',
        boxShadow: live ? 'var(--glass-rim-2), var(--job-violet-shine)' : 'var(--glass-rim-2)',
        color: MARK_INK,
        animation: live ? 'var(--kf-pulse) 1600ms var(--ease-glass) infinite' : undefined,
      }}
    >
      <Icon name="sparkles" size={15} />
    </span>
  );
}

/**
 * The reasoning, kept and shown (item 12, DESIGN.md §3.3).
 *
 * Item 6 threw `message.thinking` away deliberately and §3.3 asked for it
 * back: *"Stop discarding it. All three local models declare `thinking`… Atlas
 * keeps it, gives it an effort dial, and shows it when asked."*
 *
 * **It opens closed, and that is the design rather than a preference.** On
 * `gemma4:e4b` the reasoning routinely runs longer than the answer — 2,400
 * characters of thinking against 1,200 of reply, measured while building this
 * — so a block that opened by default would bury the thing that was asked for
 * under the working. `atlas.html` draws it exactly this way.
 *
 * `ms` is how long the reasoning **streamed** for, measured in `send`. It is
 * not "how long the model thought", which nothing on this side can know, and
 * the label says "Thought for" because that is what the mockup says and what
 * the number means in practice on a machine emitting tokens one at a time.
 */
function Thought({ text, ms, again = false }: { text: string; ms: number; again?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <button
        type="button"
        onClick={() => setOpen((cur) => !cur)}
        aria-expanded={open}
        style={{
          justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
          border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
          /* Capitals outside a V3 scope, sentence case inside (V3-8). */
          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-4)',
        }}
      >
        <Icon name="brain" size={13} />
        {/* No duration on a reopened conversation. How long the reasoning
            streamed for is measured in this browser as the characters arrive
            and is never written down, so a rebuilt turn has no number — and
            `transcript.ts` prefers no timing to a made-up one, which is the
            same call it already makes about a tool call's duration. */}
        {ms > 0
          ? `${again ? 'Thought again for ' : 'Thought for '}${(ms / 1000).toFixed(1)}s`
          : again
            ? 'Thought again'
            : 'Thought'}
        <span
          style={{
            display: 'flex',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--dur-base) var(--ease-morph)',
          }}
        >
          <Icon name="chevron-down" size={13} />
        </span>
      </button>

      {/* The mockup's `grid-template-rows: 0fr → 1fr` morph, which animates to
          the content's own height without anyone measuring it. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
        }}
      >
        {/* ITEM 13B — a model's thinking is Markdown too, and a small one's is
            usually the *most* marked-up thing in a turn: it numbers its steps.
            So this is the same renderer as the reply, at this aside's own
            scale — `--text-sm` and `--fg-3` on the wrapper, which everything
            inside either inherits or sizes in `em` against.

            The hairline and the inset stay on a wrapper rather than moving
            into the renderer. They are what makes this an aside, and they are
            about where it sits on the page, not about the Markdown. */}
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            style={{
              paddingLeft: 'var(--sp-5)',
              borderLeft: '1px solid var(--line-soft)',
              margin: '0 0 var(--sp-2)',
            }}
          >
            <Markdown
              text={text.trim()}
              style={{ fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What a finished turn says about itself, on one line.
 *
 * `atlas.html` draws four fields — `{model} · {tokens} tk · {secs}s · ₹{cost}`
 * — and this screen draws the first three. The cost went with the rest of the
 * AI spending (OPT-4, 2026-10-06).
 *
 * **The model is the one that was missing and the one that mattered.** The
 * picker in the bar says what will answer the *next* turn; a conversation that
 * began on `gemma4:e4b` and fell back to Gemini when the lid closed had no
 * record anywhere of which turn was which. On the Atlas path it is
 * `modelUsed`, not the model asked for, because Ollama's swaps fail and the
 * resident one answers instead.
 */
function TurnFooter({
  readOnly,
  usage,
  model,
  elapsedMs,
}: {
  readOnly: boolean;
  usage?: TokenUsage;
  model?: string;
  elapsedMs?: number;
}) {
  const spent = usage && usage.totalTokens > 0 ? usage : null;
  const facts = [
    model,
    spent ? `${spent.totalTokens.toLocaleString()} tokens` : null,
    spent ? `${spent.requests} request${spent.requests === 1 ? '' : 's'}` : null,
    // Sub-second turns round to `0.0s`, which reads as broken rather than fast.
    elapsedMs !== undefined && elapsedMs >= 100 ? `${(elapsedMs / 1000).toFixed(1)}s` : null,
  ].filter((fact): fact is string => Boolean(fact));

  if (!readOnly && facts.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
      {readOnly && (
        <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>Read only · nothing changed</span>
      )}
      {facts.length > 0 && (
        <span
          style={{
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
            color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {facts.join(' · ')}
        </span>
      )}
    </div>
  );
}

/**
 * One tool call, and the call itself underneath it (item 9D).
 *
 * `atlas.html`'s comment is the whole design: *"what it did, how much of it,
 * and the call underneath. Collapsed by default — the conversation is the
 * page."* UI-33's version was a static well pill carrying `verb · subject ·
 * detail` and a `title` tooltip, which is the summary a phone cannot reach and
 * a screen reader reads out of order. This is the same three facts with the
 * evidence behind them.
 *
 * **It is a fill now, not a well.** `readme.md`'s inversion decides it: it was
 * a label and it is a control, and *"anything that acts uses a fill and comes
 * out"*. The failed state keeps its amber ring and its reason — that call was
 * always the honest place for "could not do it".
 *
 * **What the open panel shows is composed here and stored nowhere.** The
 * mockup's `detail` is a literal in a demo; the real one is the call as it was
 * made — name, arguments, and the summary the tool wrote back for the model to
 * read. All three are already on `AgentToolCall`, and 9D is what makes them
 * arrive on the Atlas path as well as the in-browser one.
 */
function ToolChipRow({ chip, call }: { chip: ToolChip; call: AgentToolCall }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const lit = open || hover;

  /*
   * The call, printed. `JSON.stringify` with no arguments object at all is
   * `{}` rather than nothing, which is right: `list_today()` takes none, and
   * showing the empty object says so instead of leaving a reader wondering
   * whether the arguments were hidden.
   */
  const detail = [
    `${call.name}(${JSON.stringify(call.args)})`,
    `→ ${call.summary}`,
    `  ${call.durationMs} ms`,
  ].join('\n');

  /*
   * THE CHIP NEVER OUTGROWS ITS COLUMN (2026-09-24, his screenshot).
   *
   * The detail used to be `flex: 0 0 auto` with `max-width: 40%`. A percentage
   * of a pill that sizes itself to its own content is circular: the pill took
   * the detail's FULL width first, then the detail was clamped to 40% of that,
   * and a tool that answered with a long sentence (item 12's `ask_choice` said
   * "STOP HERE — …") drew a 1,362px pill with a 667px empty tail running past
   * the column and the window. The detail is capped in `ch` now, which is known
   * before the pill is sized, and may shrink; the track is `minmax(0, 1fr)`, so
   * no child's min-content can widen it past the column.
   */
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-3)', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
          minHeight: 32, padding: '0 var(--sp-3) 0 var(--sp-5)', maxWidth: '100%', minWidth: 0,
          border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
          backgroundImage: lit ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
          /* A failed call is coral since 29-1P2c2, his call: failed and broken
             are coral's job (it was amber, which is gold's hue). */
          boxShadow: chip.ok
            ? lit
              ? 'var(--glass-rim-2), var(--glass-cast-1)'
              : 'var(--glass-rim-1)'
            : `${lit ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'var(--glass-rim-1)'}, 0 0 0 1px var(--job-coral-line)`,
          font: 'var(--type-caption)', color: 'var(--fg-2)',
          transition: 'var(--t-hover)',
          animation: 'var(--kf-condense) var(--dur-fast) var(--ease-glass) both',
        }}
      >
        <span
          aria-hidden="true"
          style={{ display: 'flex', flex: '0 0 auto', color: chip.ok ? 'var(--fg-3)' : 'var(--status-overrun)' }}
        >
          <Icon name={CHIP_ICONS[chip.icon]} size={14} />
        </span>
        <span
          style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: chip.ok ? 'var(--fg-2)' : 'var(--job-coral-text)',
          }}
        >
          {chip.verb}
          {chip.subject && ` ‘${chip.subject}’`}
        </span>
        {chip.detail && (
          <span
            className="ag-kicker"
            style={{ color: 'var(--fg-4)', flex: '0 1 auto', minWidth: 0, maxWidth: '36ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {chip.detail}
          </span>
        )}
        <span
          aria-hidden="true"
          style={{
            display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--dur-base) var(--ease-morph)',
          }}
        >
          <Icon name="chevron-down" size={14} />
        </span>
      </button>

      {/* 0fr → 1fr, the app's own morph for an expander — the same one
          `/trash`'s row opens with. A `height` transition would need the
          panel's size measured, and this needs no number. */}
      <div
        style={{
          display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <pre
            style={{
              margin: '0 0 var(--sp-2)', padding: 'var(--sp-5) var(--sp-6)',
              borderRadius: 'var(--r-sm)',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
              color: 'var(--fg-2)',
              /* `.ag-code` in the mockup is `white-space: pre` with
                 `overflow-x: auto`, and it can afford to be: its details are
                 hand-written literals, already wrapped at the newline. A real
                 `summary` is a whole sentence and a real `args` can be long,
                 so that pairing put a horizontal scrollbar inside a pane of
                 glass — which the same file's `.ag-scroll` rule calls out as
                 the thing to avoid, *"a browser scrollbar in a glass pane
                 reads as a browser part, not a surface"*. It wraps instead. */
              whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}
          >
            {detail}
          </pre>
        </div>
      </div>
    </div>
  );
}
