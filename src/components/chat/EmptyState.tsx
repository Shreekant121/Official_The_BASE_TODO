/* The screen before the first message. Moved out of `pages/ChatPage.tsx`,
   unchanged, when it was split (BUILD-7). */
import { useState } from 'react';
import { AiPresence, Icon, type IconName } from '../../ui';

/**
 * The three the source picks, and its reason for them: *"they are the three
 * things the assistant is actually good at: reading today, writing one task,
 * finding what slipped. Anything longer than a line belongs in the composer."*
 */
const OPENERS: { icon: IconName; text: string }[] = [
  { icon: 'list-checks', text: 'What am I doing today?' },
  { icon: 'plus', text: 'Add a task to call the CA, due Thursday 6pm' },
  { icon: 'clock', text: 'What’s overdue?' },
];

/**
 * The same three questions asked of an assistant with no hands (item 8).
 *
 * Every opener above needs a tool, so on an assistant that has none all three
 * would be buttons producing the same refusal — the app setting up its own
 * user, three times, on the first screen he sees. These are picked from what
 * it can genuinely do without tools: think, draft, decompose.
 *
 * **Item 9 narrowed when these are shown rather than deleting them.** They now
 * appear only when Atlas is answering and its MCP server did not connect,
 * which is a real state on a laptop missing the service-account key — and the
 * one where three refusals in a row would be exactly as bad as before.
 */
const ATLAS_OPENERS: { icon: IconName; text: string }[] = [
  { icon: 'list-checks', text: 'Break "file the GST return" into the steps it actually takes' },
  { icon: 'pencil', text: 'Draft a short message chasing an overdue invoice' },
  { icon: 'clock', text: 'I have three hours and four jobs. Help me decide the order.' },
];

/**
 * The opening screen (item 13G, piece 10 of the ten).
 *
 * **This is the one piece of the redraw that got left out**, and it is the
 * first thing on the screen, which is most of why Shreekant said the AI page
 * "is not same". What was here: a `--text-2xl` heading reading *"Atlas is
 * idle."*, a paragraph listing what it can do, and three openers. What
 * `atlas.html` draws: a **46px sparkle**, one `--text-xl` line that is a
 * *question* — *"48 open. Where do you want to start?"* — and the openers
 * underneath at `max-width: 460`, staggered 44ms apart.
 *
 * The difference is not decoration. "Atlas is idle" is a status report about a
 * machine; the mockup's line is the app looking at his backlog and asking him
 * something, and the number in it is the only fact on the screen he cannot get
 * anywhere else at that moment.
 *
 * **The number is real, counted the way `Home` counts it** — top-level tasks
 * that are not completed. Not invented, and not Atlas's: this browser has the
 * backlog, so it is the same figure `Home` prints beside "Your projects" and
 * cannot disagree with it.
 *
 * **The paragraph is gone with the heading and the openers keep their glyphs.**
 * The sentence was there to say what the assistant could reach; the header line
 * above already says which assistant is answering, and the openers say what to
 * ask it. The glyphs are the one place this deliberately holds against the
 * mockup, which draws none — Shreekant asked for them back by name at UI-33
 * ("they say what KIND of thing each opener is — read, write, find") and that
 * has not been revisited.
 *
 * The **fallback keeps its own heading**, because "48 open. Where do you want
 * to start?" over an assistant that cannot read the backlog is a question it
 * cannot answer.
 */
export function EmptyState({
  onPick,
  onAtlas,
  atlasCanAct,
  openCount,
  docked,
}: {
  onPick: (text: string) => void;
  onAtlas: boolean;
  atlasCanAct: boolean;
  /** Open top-level tasks, counted in this browser. */
  openCount: number;
  /** Dock mode covers the screen: the orb stops drawing. */
  docked: boolean;
}) {
  // The hands-free openers are for an assistant that cannot act — which is now
  // an Atlas whose MCP server did not start, not every Atlas.
  const openers = onAtlas && !atlasCanAct ? ATLAS_OPENERS : OPENERS;
  const asking = atlasCanAct && openCount > 0;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--sp-8)', paddingBottom: 'var(--sp-10)', textAlign: 'center',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)' }}>
        {/* V3-8 — THE ORB, where the 46px sparkle badge was. `Atlas.dc.html`'s
            phone half puts it at the head of an empty chat at 170px, and he
            asked for it here (2026-09-24). It is the one moving object on an
            idle screen, which is the emission ration's own allowance: nothing
            else here is live, and this is the thing being addressed. Sized
            against the window's height so a short laptop window keeps the
            openers above the composer; the sphere fills the middle ~62% of
            its box, and the box's lower margin is its cast light. */}
        <AiPresence
          size="clamp(112px, 19vh, 170px)"
          paused={docked}
          decorative
          /* Hidden under dock mode as well as paused: the dock's stage is
             97% opaque, and the sphere showed through it as a dark blot. */
          style={{ marginBottom: 'calc(-1 * var(--sp-4))', visibility: docked ? 'hidden' : undefined }}
        />
        <h2
          style={{
            font: 'var(--type-display)', fontSize: 'var(--text-xl)',
            letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
            textWrap: 'pretty',
          }}
        >
          {asking
            ? `${openCount} open. Where do you want to start?`
            : onAtlas
              ? 'Atlas is idle.'
              : 'Ask for something.'}
        </h2>
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-3)', width: '100%', maxWidth: 460 }}>
        {openers.map((opener, index) => (
          <Opener
            key={opener.text}
            icon={opener.icon}
            label={opener.text}
            delay={index * 44}
            onPick={() => onPick(opener.text)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * *"An opener is a suggestion, not a control: hairline glass, and it lifts on
 * hover like every other clickable pane in the system."* — the source's own
 * comment. Not a `<Button>` for that reason: a Button here would put three
 * equal-weight controls under a heading that is asking a question.
 *
 * **The leading icon is a deliberate divergence from `screens/assistant.html`,
 * asked for by name.** UI-33 removed it when it reconciled this screen against
 * the mockup, which draws the label and the trailing arrow and nothing else;
 * Shreekant wanted the three glyphs back, because they say what *kind* of thing
 * each opener is — read, write, find — before the sentence is read. Do not strip
 * it again the next time this screen is diffed against the design system.
 */
function Opener({
  icon,
  label,
  delay,
  onPick,
}: {
  icon: IconName;
  label: string;
  delay: number;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
        minHeight: 52, padding: '0 var(--sp-6)', border: 0, cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--r-pill)',
        backgroundImage: hover ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        boxShadow: hover ? 'var(--glass-rim-2), var(--glass-cast-2)' : 'var(--glass-rim-1)',
        color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
        /* ITEM 13G — motion 10, and the `translateY(-2px)` that used to be
           here is gone with it. The mockup lifts an opener with light and not
           with position: `box-shadow` on `--dur-base` and `background-image`
           on `--dur-fast`, nothing moving. Four of these nudging upward under
           the pointer is the "UI is a mess" complaint in miniature — the row
           the eye is on is the one that shifts. */
        transition:
          'box-shadow var(--dur-base) var(--ease-glass),' +
          ' background-image var(--dur-fast) var(--ease-glass)',
        /* `readme.md`: lists stagger at 44ms per item. */
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
        animationDelay: `${delay}ms`,
      }}
    >
      {/* Inherits the label's own colour, as it did before UI-33: this glyph
          names the opener, it is not the affordance. The arrow below is. */}
      <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto' }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <span
        aria-hidden="true"
        style={{
          display: 'flex', flex: '0 0 auto',
          color: hover ? 'var(--accent)' : 'var(--fg-4)',
          transition: 'color var(--dur-fast) var(--ease-glass)',
        }}
      >
        <Icon name="arrow-up-right" size={15} />
      </span>
    </button>
  );
}
