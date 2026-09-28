/**
 * The screen's header: the chat-list toggle, the chat's name, the one line
 * that speaks only when something is wrong, the tray pill, new chat, and the
 * laptop-on-battery row. Moved out of `pages/ChatPage.tsx` when it
 * was split (BUILD-7). V3-8 redraws it here.
 *
 * ITEM 9D — THE SCREEN CATCHES UP TO `screens/atlas.html`
 * --------------------------------------------------------
 * Items 8 and 9 built the plumbing with the design sitting unopened in
 * `../design-export/`. This is the catch-up, and it is deliberately only *as
 * far as items 8 and 9 reach*.
 *
 * **The header is two rows now, which is the mockup's own split.** An identity
 * row saying who you are talking to, and an **instrument bar** under it
 * holding everything that decides how the next turn runs — the source's
 * comment on that bar is *"furniture — quiet, and it never moves"*, so the
 * machine state moved off the identity row into it. Two of its controls are
 * real (the model pill, the key) and three are drawn and inert.
 *
 * **Drawing the three was Shreekant's call, asked before anything was
 * written**, and it is 9B's treatment for the same problem: `disabled`, under
 * one `archived` "not built" pill and one amber line naming items 10, 12 and
 * 13, with **no value invented** — the spend reads `₹—` rather than `₹0.00`.
 * The item's own instruction is that the controls it does not have must *leave
 * visible, deliberate room rather than a gap*, so those sessions decorate this
 * bar instead of rebuilding it. See `NotBuilt`, which is inert three ways
 * because a greyed control that still takes a click would change the mode
 * segment and imply the mode had changed.
 *
 * **The mockup's third header row is a battery banner and this machine cannot
 * know that** — 9B established the browser's battery API describes the
 * *tablet*. So the slot carries the "not built" line instead, in the mockup's
 * own hairline-pill shape.
 *
 * THE INSTRUMENT BAR IS FINISHED, AND THIS NOTE IS THE RECEIPT.
 *
 * 9D drew this bar with three of its five controls inert, under 9B's
 * treatment — an `archived` "not built" pill and one amber line naming the
 * session that would make each real — because its own instruction was that
 * *"the controls it does not yet have leave visible, deliberate room rather
 * than a gap"*. Item 10 made the context slider real, item 12 the modes, the
 * thinking dial and what a turn costs, and **item 13A the last of them**: the
 * per-turn ceiling now sits in the tuning popover and its number is on the
 * cost line, exactly as `atlas.html` draws them.
 *
 * So `NOT_BUILT_LINE` is gone rather than shortened. The banner slot it
 * occupied was borrowed — the mockup's own content for that row is the battery
 * pill, which 9B could not build because the browser's battery API describes
 * the tablet. Atlas reads the laptop's power now, so the slot has gone back to
 * what it was drawn for.
 *
 * V3-8 — THE ORB, AND NO WORDS UNDER IT
 * --------------------------------------
 * `Atlas.dc.html` puts a 48px presence orb before the title with a status
 * line under it ("Ready", "Thinking", "Answering"). The orb is here (his
 * call, 2026-09-24); the line is not, for the reason written at the title
 * below — he took "Awake on the laptop" and its green light out on
 * 2026-09-08, and a word that says "Ready" every ordinary day is that line
 * back. The orb carries the state instead: its ripples quicken while a turn
 * runs. It is decorative to a screen reader, because the heading beside it
 * already says who this is. It stops drawing, and is hidden, while dock mode
 * covers the screen. The two header buttons are round glass, as Back is on the other
 * V3 screens.
 *
 * The rule that governed it stands and is what the ceilings were held to:
 * **no value is invented**. A ceiling Atlas does not have is left out of this
 * bar entirely rather than drawn at a plausible number.
 */
import { useState } from 'react';
import { AiPresence, Icon, IconButton } from '../../ui';
import type { AtlasApproval } from '../../lib/atlas/client';
import { useAtlasStore } from '../../lib/atlas/atlasStore';
import { COLUMN_PX } from './chatShared';

export function ChatHeader({
  wide,
  showList,
  toggleList,
  conversationTitle,
  answering,
  waiting,
  setTrayOpen,
  isEmpty,
  newConversation,
  busy,
  docked,
  copyHandoff,
}: {
  wide: boolean;
  /** Whether the chat list is showing, which is what the toggle's label says it will undo. */
  showList: boolean;
  toggleList: () => void;
  conversationTitle: string;
  /** `whoIsAnswering`'s answer; only a warning is drawn. */
  answering: { text: string; warn: boolean };
  /** What is waiting in the tray; the pill is drawn only when something is. */
  waiting: AtlasApproval[];
  setTrayOpen: (open: boolean) => void;
  isEmpty: boolean;
  newConversation: () => void;
  /** A turn is running: the orb thinks. */
  busy: boolean;
  /** Dock mode covers the screen: the orb stops drawing. */
  docked: boolean;
  /**
   * Copies this conversation as a hand-off prompt (BUILD-12). `undefined`
   * when there is nothing on the laptop to copy — the in-browser path, or a
   * chat not yet saved — and then the button is not drawn.
   */
  copyHandoff?: () => void;
}) {
  /*
   * ITEM 13A: IS THE LAPTOP ON ITS BATTERY (DESIGN.md §3.5)?
   *
   * Read off `/health`, which is the only place it can come from: 9B
   * established the browser's battery API describes **the tablet**, which is
   * why `atlas.html`'s battery pill was drawn and never built. Atlas is the
   * program on the laptop and takes the reading there.
   *
   * `null` is not-known and draws nothing at all — an older Atlas, a machine
   * that is not Windows, a probe that failed. A pill saying "on mains" that is
   * really saying "Atlas could not tell" is worse than no pill, which is
   * `hostReadings.ts`'s rule applied to a boolean.
   */
  const onBattery = useAtlasStore((s) => s.health?.power?.onBattery ?? null);

  /*
   * §3.5: *"Atlas says so once and never nags."* The mockup's own mechanism
   * for "once" is the dismiss X on the pill, and this is it.
   *
   * **Reset when the cable comes out again**, not remembered for ever. "Once"
   * is once per time he unplugs — a pill dismissed on Tuesday should not
   * silently stay dismissed for a train journey on Friday, because then the
   * one thing §3.5 asks Atlas to mention would go unmentioned. Session-only
   * for the same reason: this is a fact about right now.
   *
   * The reset happens during render, the moment the reading stops being
   * `true` — the pill is not drawn then anyway, so nothing on screen waits on
   * it.
   */
  const [batteryNoted, setBatteryNoted] = useState(false);
  if (onBattery !== true && batteryNoted) setBatteryNoted(false);

  return (
    /* ── Header ─────────────────────────────────────────────────—
        `atlas.html` splits this in two, and 9D takes the split: an
        identity row that says who you are talking to, and an **instrument
        bar** underneath it holding everything that decides how the next
        turn runs. The mockup's comment on the bar is *"furniture — quiet,
        and it never moves"*, which is why the machine state moved off the
        identity row into it. */
    <header
      style={{
        flex: '0 0 auto',
        width: '100%', maxWidth: COLUMN_PX, margin: '0 auto',
        display: 'grid', gap: 'var(--sp-5)',
        padding: wide ? 'var(--sp-9) 0 var(--sp-8)' : 'var(--sp-8) 0 var(--sp-6)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
        {/* The way to the chat list, at both widths (item 12).
            `atlas.html` puts exactly this control here and gives it both
            jobs: below 1100 it opens the sheet, at and above it hides and
            shows the docked column. Item 10 built only the first half.
            The label says which of the two it is about to do, because
            "Show chats" on a screen already showing them is a lie the
            screen reader gets told. */}
        <IconButton
          label={showList ? 'Hide chats' : 'Show chats'}
          title={showList ? 'Hide chats' : 'Show chats'}
          onClick={toggleList}
        >
          <Icon name="panel-left" size={18} />
        </IconButton>

        {/* Hidden, not only paused, under dock mode: its stage is 97% opaque
            and a bright blue sphere showed through it as a dark blot. */}
        <AiPresence
          state={busy ? 'thinking' : 'idle'}
          size={48}
          paused={docked}
          decorative
          style={{ visibility: docked ? 'hidden' : undefined }}
        />

        {/* ITEM 13G — THE 40px MARK IS GONE FROM THE HEADER.
            The redrawn `atlas.html` header is four things: the panel
            toggle, the title, the live dot under it, and new chat. The
            badge was a second sparkle on a screen whose nav cell is
            already a sparkle and whose every assistant turn carries one,
            and it pushed the title far enough right that a long chat name
            started truncating at 820. `Mark` itself stays — it is the
            turn's, and that is where it means something. */}
        <div style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
          <h1
            style={{
              font: 'var(--type-title)', fontSize: 'var(--text-lg)',
              letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {conversationTitle}
          </h1>
          {/* IT ONLY SPEAKS WHEN SOMETHING IS WRONG. Shreekant's call,
              2026-09-08: *"remove the text and the green light: Awake on
              the laptop, it's no need"*.

              He is right about the healthy states and it is the same
              argument the tray pill on this row already won: a line that
              says the same thing on every ordinary day teaches you to stop
              reading it, and then it cannot tell you anything on the day it
              changes. "Awake on the laptop" is that line, and "Working" is
              said better by the pill in the transcript, which is where he
              is looking while a turn runs.

              **The warnings stay, and that is not a compromise.** A
              sleeping laptop, or an Atlas whose MCP server never connected,
              are facts he has no other way to learn on this screen — and
              each of those sentences is the difference between "it did not
              do that" and "it could not". `whoIsAnswering` still decides
              what they say; this only stops drawing the two that say
              nothing.

              The dot goes with the text rather than surviving alone: on a
              warning it is amber, which is emission earning its ration
              (`readme.md`: live, selected, running or overrun), and on a
              healthy screen there is nothing left for it to report. */}
          {answering.warn && (
            <span
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                font: 'var(--type-caption)', color: 'var(--status-warn)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%',
                  background: 'var(--status-warn)',
                  boxShadow: '0 0 8px var(--status-warn)',
                }}
              />
              <span style={{ minWidth: 0 }}>{answering.text}</span>
            </span>
          )}
        </div>

        {/* ITEM 13 — the way into the tray, in `atlas.html`'s own slot.
            It is drawn **only when something is waiting**, which is the
            one place this screen departs from the mockup: that draws a
            permanent "Nothing waiting" pill, and a control that says
            nothing on all but a handful of days is furniture teaching
            Shreekant to stop looking at it. The empty state lives inside
            the tray, where it is read by somebody who went looking. */}
        {waiting.length > 0 && (
          <button
            type="button"
            onClick={() => setTrayOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', height: 38, flex: '0 0 auto',
              padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
              backgroundImage: 'var(--glass-tint-amber)',
              boxShadow: 'var(--glass-rim-2), var(--glow-amber-md)',
              color: 'var(--fg-1)', font: 'var(--type-label)', transition: 'var(--t-hover)',
            }}
          >
            <Icon name="hand" size={15} />
            {waiting.length} waiting
          </button>
        )}

        {/* BUILD-12. Beside new chat because it is the same moment: this
            one has gone as far as it will go here. Not while a turn runs —
            the laptop's copy would stop short of the answer being written. */}
        {copyHandoff !== undefined && !isEmpty && (
          <IconButton
            label="Copy hand-off prompt"
            title="Copy this chat as a prompt for another AI"
            disabled={busy}
            onClick={copyHandoff}
          >
            <Icon name="copy" size={18} />
          </IconButton>
        )}

        {!isEmpty && (
          <IconButton
            label="Start a new conversation"
            title="Start a new conversation"
            onClick={newConversation}
          >
            <Icon name="message-square-plus" size={18} />
          </IconButton>
        )}
      </div>

      {/* THE INSTRUMENT BAR IS GONE. Shreekant's call, 2026-09-08, and
          it reverses the one he made earlier the same day.

          9D drew this row, items 10 to 13A made its five controls real,
          and the re-exported `atlas.html` deleted it outright. Asked
          whether to follow the design, he chose to keep the controls where
          they were — and then, looking at the built screen, moved every
          one of them himself:

            - the **model picker** went to the foot of the chat list, as a
              row with a glyph and a line of text like the ones above it;
            - **customize** (context and the per-turn ceiling) went under
              the composer, beside Mode and Thinking, where the rest of
              what decides a turn already sits;
            - the **Gemini keys** went to Settings, under SimpleURL, which
              is where every other credential in this app lives;
            - the **cost readout** — *"this chat ₹— · ceiling ₹5/turn"* —
              he asked to delete outright, for the space.

          So the header is now the four things the mockup draws and nothing
          else: the panel toggle, the title, the live dot, new chat. The
          controls did not go away; each went to the screen that is about
          the thing it changes. */}

      {/* ── The banner row, and item 13A gives it back its own content ──
          This slot is `atlas.html`'s third header row, and the mockup's
          content for it was always the battery pill — *"On battery —
          about 30% slower. Nothing is deferred."* 9B could not build it,
          because the browser's battery API describes **the tablet** rather
          than the laptop doing the work, so the slot was borrowed for the
          amber "not built" line naming the two ceilings.

          Both halves of that are settled now. The ceilings are real, so
          the line has nothing left to name; and Atlas takes the power
          reading on the laptop and puts it on `/health`, so the pill has
          its fact. The slot goes back to what it was drawn for.

          **It draws nothing when the answer is not known** — an older
          Atlas, a machine that is not Windows, a probe that failed — and
          nothing when the laptop is plugged in, which is most of the time.
          §3.5: it *"says so once and never nags"*, and a row that is
          always there saying "on mains" is a nag. */}
      {onBattery === true && !batteryNoted && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            minHeight: 40, padding: 'var(--sp-2) var(--sp-6)',
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
          }}
        >
          <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-3)' }}>
            <Icon name="battery-low" size={16} />
          </span>
          <span
            style={{
              flex: 1, minWidth: 0,
              font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty',
            }}
          >
            {/* The second sentence is the one that matters, and it is
                §3.5's whole point: Atlas does **not** defer work, because
                "an assistant that silently declines to act is the worst
                possible failure". This is a fact he asked to be told, not
                a warning he has to act on — so there is no button. */}
            On battery — about 30% slower. Nothing is deferred.
          </span>
          <IconButton
            label="Dismiss"
            title="Dismiss"
            variant="ghost"
            size="sm"
            onClick={() => setBatteryNoted(true)}
          >
            <Icon name="x" size={14} />
          </IconButton>
        </div>
      )}
    </header>
  );
}
