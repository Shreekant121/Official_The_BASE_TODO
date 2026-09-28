/* The cards a turn can end in — a plan, held writes and the two spending
   ceilings — plus the interrupted-turn card the page draws under the
   transcript. Moved out of `pages/ChatPage.tsx`, unchanged, when it was split
   (BUILD-7). The front door is not one of these; it is `ApprovalCard.tsx`. The
   question card was one until BUILD-16 and is `ui/data/AskCard.tsx` now. */
import { Button, Icon } from '../../ui';
import { relativeWhen } from '../../lib/atlas/relativeWhen';
import type { AtlasHeldCall, AtlasMode, AtlasResumableTurn } from '../../lib/atlas/client';

/**
 * A plan, proposed and not started (item 12).
 *
 * The item's claim for this is the strongest one it makes: planning mode is
 * *"the single feature that makes a small local model behave like a much
 * larger one, for the same reason decomposition beats repetition"* — and §3.2
 * calls decomposition *"the best-established finding in the whole
 * literature"*. What is drawn here is the visible half of that: the steps, and
 * one button.
 *
 * **Approving sends an ordinary message.** No special protocol, no resumable
 * turn: the plan is already in the conversation, so "Go ahead with that plan"
 * followed by a turn in Auto is enough for the model to carry out what it just
 * wrote down. That is why `runFor` exists on `send` and why nothing else in
 * this file needed to learn about planning.
 */
export function PlanCard({
  steps,
  live,
  owns,
  superseded,
  onGo,
}: {
  steps: string[];
  live: boolean;
  /** Whether this card carries the Go-ahead button, or the held card does. */
  owns: boolean;
  /** True only when a later turn exists — NOT while this one is still running. */
  superseded: boolean;
  onGo: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>
        The plan · {steps.length} {steps.length === 1 ? 'step' : 'steps'} · nothing written yet
      </span>

      <ol style={{ display: 'grid', gap: 'var(--sp-4)', margin: 0, padding: 0, listStyle: 'none' }}>
        {steps.map((step, index) => (
          <li
            key={`${index}-${step}`}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minWidth: 0 }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'grid', placeItems: 'center', width: 22, height: 22, flex: '0 0 auto',
                borderRadius: '50%', backgroundImage: 'var(--glass-fill-1)',
                boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-3)',
                font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
              }}
            >
              {index + 1}
            </span>
            <span
              style={{
                font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                textWrap: 'pretty', minWidth: 0, overflowWrap: 'anywhere',
              }}
            >
              {step}
            </span>
          </li>
        ))}
      </ol>

      {owns ? (
        <Button
          variant="tint"
          tone="accent"
          size="sm"
          iconLeft={<Icon name="play" size={14} />}
          onClick={onGo}
          style={{ justifySelf: 'start' }}
        >
          Go ahead
        </Button>
      ) : (
        /*
         * Three reasons there is no button, and they must not be collapsed
         * into one sentence — the first version said "no longer the last thing
         * in the conversation" while the turn was **still running**, which was
         * simply untrue and read as though the plan had been abandoned.
         */
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {live
            ? 'Approve it with the changes below.'
            : superseded
              ? 'This plan is no longer the last thing in the conversation.'
              : 'Still working…'}
        </span>
      )}
    </div>
  );
}

/**
 * The writes a mode stopped (item 12).
 *
 * Planning and Ask-first hold every mutating call: it runs nowhere, and its
 * arguments are kept exactly as the model asked for them. This is where they
 * are shown, and the arguments are the content — *"add a deadline of Thursday
 * 6pm to `Shortlist the CA`"* is a thing that can be agreed to; *"Atlas would
 * like to change something"* is not.
 *
 * **This is deliberately NOT item 13's approval, and the difference is a
 * safety rule.** §5.2's front door — sending mail, publishing a link — has no
 * undo and gets a heavier surface of its own that item 13 builds. Everything
 * held here is inside the undoable set: it goes to the Trash, or it can be
 * asked back. So this card is calm on purpose, and the loud one stays loud.
 */
/**
 * A turn that stopped because it had spent its ceiling (item 13A, DESIGN.md §3.4).
 *
 * WHY THIS IS THE CALM CARD AND NOT THE LOUD ONE
 * ------------------------------------------------
 * Same call `HeldCard` makes, for the same reason. §5.2's front door is loud
 * because what is behind it cannot be undone; this is a turn that stopped
 * *before* doing anything more, which is the safest state a turn can be in.
 * Nothing here is irreversible and nothing is waiting to go wrong, so it takes
 * the well-and-button shape rather than the door's.
 *
 * WHAT A TAP BUYS, WHICH IS SHREEKANT'S CALL
 * --------------------------------------------
 * **Another ceiling's worth, then it asks again** — not an uncapped run to the
 * end. Put to him against the alternatives; the reasoning is that one tap
 * meaning "finish the job whatever it costs" gives a genuinely stuck turn no
 * limit at all, which is the case §3.4 says the ceiling exists for. It needs
 * no machinery: the resumed turn is a new turn whose spending starts at zero.
 *
 * And it **carries on** rather than starting again — no message is sent, Atlas
 * reads the ask out of its log and continues from the results already there.
 * A turn that had created two tasks before it stopped would otherwise create
 * them twice.
 */
export function CeilingStopCard({
  stop,
  live,
  superseded,
  onCarryOn,
}: {
  stop: { rupees: number | null; logTurnId: string | null };
  live: boolean;
  superseded: boolean;
  onCarryOn: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      <span
        className="ag-kicker"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--fg-3)' }}
      >
        <Icon name="indian-rupee" size={14} />
        {stop.rupees === null ? 'stopped at the ceiling' : `stopped at ₹${stop.rupees} for this turn`}
      </span>

      <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
        Everything above actually happened — this stopped before spending more, not before doing
        anything.
      </span>

      {/* The button is drawn only when Atlas has somewhere to carry on *from*.
          `logTurnId` is null on a host keeping no action log, and offering to
          continue from nothing would be a lie about what a tap does. */}
      {live && stop.logTurnId !== null ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <Button variant="tint" tone="accent" size="sm" iconLeft={<Icon name="play" size={14} />} onClick={onCarryOn}>
            Carry on
          </Button>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            Picks up from the last step rather than starting again
            {stop.rupees === null ? '.' : `, and stops again at another ₹${stop.rupees}.`}
          </span>
        </div>
      ) : (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {superseded
            ? 'Not carried on — the conversation moved on.'
            : stop.logTurnId === null
              ? 'This Atlas keeps no action log, so there is no record to carry on from. Ask again to start over.'
              : 'Still working…'}
        </span>
      )}
    </div>
  );
}

/**
 * The month has reached its ceiling, and this turn has not run (item 13A, §3.4).
 *
 * WHY THIS ASKS RATHER THAN REFUSES
 * -----------------------------------
 * §3.4, in his words: *"he would rather be asked than have Atlas quietly
 * decline"* — which is §3.5's rule about battery pointed at money. An
 * assistant that silently stops working is the worst failure available to it,
 * so the ceiling is a question with a button and never an error.
 *
 * **Nothing has happened when this is drawn.** No model was called, no tool
 * ran, nothing was spent — which is exactly why it is not the front door's
 * tray. That tray is for acts that cannot be undone and it never expires; this
 * is a question about one turn, asked now, and it goes away when the
 * conversation moves on.
 *
 * The tap is good for **one turn**. §3.4 asks that at the limit *every* hosted
 * turn asks, so nothing is remembered — a flag Atlas kept would turn "ask
 * every time" into "ask once", which is the ceiling switching itself off.
 */
export function MonthlyCeilingCard({
  stop,
  live,
  superseded,
  onRunAnyway,
}: {
  stop: { spent: number; limit: number; turns: number; model: string };
  live: boolean;
  superseded: boolean;
  onRunAnyway: () => void;
}) {
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      <span
        className="ag-kicker"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--fg-3)' }}
      >
        <Icon name="indian-rupee" size={14} />
        this month ₹{stop.spent.toFixed(2)} of ₹{stop.limit}
      </span>

      <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
        Nothing has run yet. {stop.model} is a hosted model, and this month has reached the ceiling
        you set — {stop.turns} {stop.turns === 1 ? 'turn has' : 'turns have'} gone to it so far.
      </span>

      {live ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <Button variant="tint" tone="accent" size="sm" iconLeft={<Icon name="play" size={14} />} onClick={onRunAnyway}>
            Run it anyway
          </Button>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            For this turn only. Pick a model on your laptop instead and it costs nothing.
          </span>
        </div>
      ) : (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {superseded ? 'Not run — the conversation moved on.' : 'Still working…'}
        </span>
      )}
    </div>
  );
}

/**
 * Atlas was in the middle of something when it stopped (item 13A, §5.5).
 *
 * WHY THIS IS A CARD AND NOT SOMETHING THAT JUST HAPPENS
 * -------------------------------------------------------
 * **Shreekant's call, with the two alternatives in front of him: one tap to
 * carry on.** Resuming the moment the tab loads, and resuming on Atlas's
 * start-up with nobody present, both had Atlas writing into his data hours
 * later, into a situation that may have changed while nobody was looking. So
 * Atlas records, offers, and waits — and if he never taps, nothing happens.
 *
 * WHY MOST OF THESE SAY "3 STEPS" AND NOT "3 OF 5"
 * -------------------------------------------------
 * DESIGN.md's example wording is *"interrupted after 3 of 5 steps"*, and that
 * five is real only in Planning mode, where the model proposed a plan to count
 * against. In Auto — most turns — Atlas calls tools until it is done and there
 * is no total that is not invented. `MAX_TOOL_ITERATIONS` was the available
 * denominator and was rejected: 8 is a safety cap, not a plan, so "3 of 8"
 * would read as a measurement of progress that measures nothing. His call.
 *
 * **The age is on the card**, because §5.5's case is a lid closed an hour ago
 * and the offer stands for up to a week. Agreeing to carry on with something
 * from Tuesday is fine; not being told it is from Tuesday is not.
 *
 * DRAWN IN THE APP'S OWN IDIOM, AND OWED A DESIGN PASS
 * -----------------------------------------------------
 * This is the one surface in item 13A that is not in the bundle — both ceiling
 * sliders, the spend meter and the battery pill are all drawn in
 * `atlas-host.html` and `atlas.html`. §7A's rule is that Atlas's screens are
 * designed in Claude Design first, and its other rule is not to stall on the
 * dead connector. Shreekant's call: build it in the chat's existing calm-card
 * shape — the same well, kicker and single button `HeldCard` uses, no new
 * visual language invented — and record in IMPROVEMENTS.md that it is owed a
 * proper design pass.
 */
export function ResumeCard({
  turn,
  onCarryOn,
  onDismiss,
}: {
  turn: AtlasResumableTurn;
  onCarryOn: () => void;
  onDismiss: () => void;
}) {
  const steps =
    turn.plannedSteps === null
      ? `${turn.steps} ${turn.steps === 1 ? 'step' : 'steps'}`
      : `${turn.steps} of ${turn.plannedSteps} steps`;

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      <span
        className="ag-kicker"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--fg-3)' }}
      >
        <Icon name="rotate-ccw" size={14} />
        interrupted after {steps} · {relativeWhen(turn.at)}
      </span>

      {turn.ask !== null && (
        <span
          style={{
            font: 'var(--type-body)', color: 'var(--fg-2)',
            textWrap: 'pretty', overflowWrap: 'anywhere',
          }}
        >
          “{turn.ask}”
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        <Button variant="tint" tone="accent" size="sm" iconLeft={<Icon name="play" size={14} />} onClick={onCarryOn}>
          Carry on
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Leave it
        </Button>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {/* The sentence that makes the button safe to press. Everything
              already done goes back to the model as a result rather than being
              run again — see `atlas/src/resume/resume.ts`. */}
          Finishes the job from where it stopped. Nothing already done is done again.
        </span>
      </div>
    </div>
  );
}

export function HeldCard({
  held,
  live,
  superseded,
  onGo,
}: {
  held: { mode: AtlasMode; calls: AtlasHeldCall[] };
  live: boolean;
  /** True only when a later turn exists — NOT while this one is still running. */
  superseded: boolean;
  onGo: () => void;
}) {
  const count = held.calls.length;

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
        /* ITEM 13G — the same arrival as the front-door card below, because
           the two are one family drawn apart on purpose: this is the *safe*
           kind of asking card and it has to be recognisable as the same kind
           of object, or the difference between them stops meaning anything.
           Everything else about them differs — plain glass against amber, a
           tick against a globe, an undo promise against a warning. */
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
      }}
    >
      {/* The mockup's safe kicker is *"Needs your tap"*, against the front
          door's *"Cannot be undone · needs your tap"* — the same sentence with
          the clause that matters added. The count rides along because it is
          what the tap covers (item 13D: one tap, the whole batch). */}
      <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>
        Needs your tap · {count} {count === 1 ? 'change' : 'changes'}, nothing written yet
      </span>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {held.calls.map((call, index) => (
          <div
            key={`${index}-${call.name}`}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
              padding: 'var(--sp-4) var(--sp-5)', borderRadius: 'var(--r-sm)',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              minWidth: 0,
            }}
          >
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-3)' }}>
              <Icon name="pencil" size={14} />
            </span>
            <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
              <span
                style={{
                  font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
                }}
              >
                {call.name}
              </span>
              {/* The arguments, as JSON, because they ARE the thing being
                  agreed to and paraphrasing them would be this screen
                  inventing a summary of somebody else's tool. It scrolls
                  sideways rather than wrapping a long id into nonsense. */}
              <span
                className="ag-scroll"
                style={{
                  font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)',
                  overflowX: 'auto', whiteSpace: 'pre', maxWidth: '100%',
                }}
              >
                {JSON.stringify(call.args)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {live ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <Button variant="tint" tone="accent" size="sm" iconLeft={<Icon name="check" size={14} />} onClick={onGo}>
            Go ahead
          </Button>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            Or say what to change instead — nothing has happened yet.
          </span>
        </div>
      ) : (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {superseded ? 'Not carried out — the conversation moved on.' : 'Still working…'}
        </span>
      )}
    </div>
  );
}
