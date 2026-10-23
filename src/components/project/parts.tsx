/**
 * Project board — the five small pieces its three surfaces share (UI-29).
 *
 * `screens/project.html` defines `Mono`, `Fact`, `Tag`, `Tick`, `BlockedLine`
 * and `Meter` once, above the card, and then uses the same six in the board
 * card, the list-view table row and the column header. These are those, in
 * the same order and with the same numbers.
 *
 * `Mono` is not here: the app already has `.ag-tnum` and `--type-numeric`,
 * and a component whose whole body is two style properties earns nothing.
 */
import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Icon, TickBox, type IconName } from '../../ui';
import { pressTick } from './pressTick';

/**
 * A measured fact: a 13px glyph and a mono value beside it.
 *
 * The mockup's own note — *"Never a coloured pill — colour means status
 * here, and status has its own pill."*
 *
 * This replaces UI-16's `Meta`, which set the same facts in the **uppercase**
 * `.ag-kicker` face and then had to carve out an exception (`prose`) for a
 * repeat rule, because "EVERY 2 WEEKS ON MON, THU" is shouting. The source
 * never had the problem: `--type-numeric` is mono without being uppercase, so
 * a rule and a duration can sit in one face and neither shouts.
 */
export function Fact({ icon, children, tone = 'var(--fg-3)', iconTone, title }: {
  icon: IconName;
  children: ReactNode;
  tone?: string;
  /** The glyph's own ink, over `tone`: a date's calendar is sky (29-1P2c2). */
  iconTone?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: tone, minWidth: 0 }}
    >
      <Icon name={icon} size={13} style={{ flex: '0 0 auto', color: iconTone ?? 'inherit' }} />
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: tone,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * A hairline trough. Two jobs on this screen, both the mockup's: subtask
 * progress on a card, and list completion in a column header.
 */
export function Meter({ pct, tone = 'var(--job-lime)', height = 3, style }: {
  pct: number;
  tone?: string;
  height?: number;
  style?: CSSProperties;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <span
      style={{
        display: 'block', height, borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span
        style={{
          display: 'block', height: '100%', width: `${width}%`, borderRadius: 'var(--r-pill)',
          background: width ? tone : 'transparent',
          boxShadow: width ? `0 0 10px -2px ${tone}` : 'none',
          transition: 'width var(--dur-slow) var(--ease-glass)',
        }}
      />
    </span>
  );
}

/**
 * The completion box. The whole point of `TaskRow.d.ts`'s `onToggle`:
 * *"Supplying this renders the completion box."*
 *
 * A 24px well and a tick that **draws itself** — `strokeDashoffset` from 16
 * to 0 — rather than appearing. The button
 * around it is 42px with a −9 margin, so the hit target clears the 44px floor
 * without the box growing to meet it.
 *
 * **IT IS DISABLED ON A LOCKED TASK, AND THAT REVERSES WHAT THIS NOTE USED TO
 * SAY.** The mockup greys the tick out on a task with an unfinished
 * prerequisite (`Tick({ done, disabled })`, `screens/project.html:328`) and
 * the port deliberately did not, because prerequisites were advisory then —
 * *"never hidden, reordered, or prevented from being worked on"*. **Item 19
 * withdrew that**, so the prototype and the settled decision now point the
 * same way and this is simply the mockup's own control: `disabled` and
 * `cursor: not-allowed` in the same 24px well. (It was also the tick at 40%
 * until V3-3 put a lock in the box instead — below.)
 *
 * `locked` is `isTaskLocked`, computed by the row, never re-derived here: this
 * component is drawn on two surfaces and a second reading of the graph is the
 * thing that lets two screens disagree about one task.
 *
 * The label goes with it. A disabled control that still announced "Mark done"
 * would be a button lying about what it does, so a locked tick names what it
 * is waiting for instead — the caller passes the whole sentence, exactly as it
 * does for the unlocked state.
 *
 * `BlockedLine` below still carries the blocker's *name* on the row. The two
 * are one statement in two registers: the tick says you cannot, the line says
 * what to go and finish.
 *
 * V3-3 RECONCILED BOTH ENDS AGAINST `screens/Task Row States.dc.html`:
 *   - **Done is an emerald stroke on the well, no fill.** *"Check is emerald
 *     stroke, no fill."* It was a filled emerald box under a glow, which is
 *     the treatment `readme.md` keeps for live things — and a finished task is
 *     the least live thing on the board. The emerald hairline inside the edge
 *     is what says the box is lit.
 *   - **A lock replaces the check on a locked task.** *"Lock replaces the
 *     checkbox."* Not the tick at 40% any more: a faded box reads as a control
 *     that failed to load, and the lock says why it will not press. Still
 *     `disabled`, still `not-allowed`, and the label still names the blocker.
 */
export function Tick({ done, label, onToggle, locked = false }: {
  done: boolean;
  label: string;
  onToggle: () => void;
  /** Waiting on unfinished work — `isTaskLocked` from the store. */
  locked?: boolean;
}) {
  const box = useRef<HTMLSpanElement>(null);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (locked) return;
        pressTick(box.current, done, onToggle);
      }}
      disabled={locked}
      aria-label={label}
      aria-pressed={done}
      title={locked ? label : undefined}
      style={{
        flex: '0 0 auto', width: 42, height: 42, margin: -9, padding: 0, border: 0,
        display: 'grid', placeItems: 'center', background: 'transparent',
        cursor: locked ? 'not-allowed' : 'pointer',
      }}
    >
      {/* The drawing is shared since 29-1P4b — every done box is this one. */}
      <TickBox ref={box} done={done} locked={locked} />
    </button>
  );
}

/**
 * "×14" — how many finished occurrences a folded repeat stands for (FIX-9's
 * `foldFinishedRepeats`). The design's chip (V3-3, `Task Row States.dc.html`):
 * a hairline pill with the repeat glyph. *"The count is a record, so it stays
 * unstruck"* — which is why it sits beside the title, never inside its
 * line-through.
 */
export function RepeatCount({ count }: { count: number }) {
  return (
    <span
      title={`${count} finished occurrences of this repeat`}
      style={{
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 4,
        height: 20, padding: '0 8px', borderRadius: 'var(--r-pill)',
        boxShadow: 'inset 0 0 0 1px var(--line-soft)',
        font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        textDecorationLine: 'none', verticalAlign: 'middle',
      }}
    >
      <Icon name="repeat" size={11} style={{ color: 'inherit' }} />
      ×{count}
    </span>
  );
}

/**
 * A milestone's mark (29-1P9b, idea 155): a small flag before the title, so a
 * big step reads as one on its card and in the list view. Plain ink — the
 * milestone line behind "40% done" is where its state is coloured.
 */
export function MilestoneMark() {
  return (
    <span
      title="Milestone"
      aria-label="Milestone"
      role="img"
      style={{ display: 'inline-flex', verticalAlign: '-1px', marginRight: 6, color: 'var(--fg-2)' }}
    >
      <Icon name="flag-triangle-right" size={13} style={{ color: 'inherit' }} />
    </span>
  );
}

/**
 * What this task is waiting on, named.
 *
 * The mockup's note is the whole argument: *"Blocked is stated, not shouted:
 * the blocker is named on a neutral well. A red box on a task you cannot
 * start is noise you can't act on."*
 *
 * UI-13 and UI-14 arrived at amber for this, reasoning that a prerequisite is
 * a decision waiting on you rather than a live problem. That was the right
 * rebuttal to rose and one step short of the answer: the source goes neutral,
 * because a warning colour on a row you cannot act on is still a warning you
 * cannot act on. The chip is a `--glass-well` and the blocker's *name* is the
 * information.
 */
/**
 * A part of a card that folds away (idea 159, the densities): the row it
 * sits in closes from `1fr` to `0fr`, a CSS transition, so a density switch
 * shrinks every card at once without a frame of script per row. Its spacing
 * is `gap` INSIDE and `paddingTop` above, never the parent's `gap` — a
 * parent's gap would stay behind a closed fold and keep the card tall. A
 * closed fold is `inert`, so the keyboard never lands on what it hides.
 * Render one only when it has something in it.
 */
export function Fold({ open, gap = 'var(--sp-3)', children }: {
  open: boolean;
  gap?: string;
  children: ReactNode;
}) {
  return (
    <div
      inert={!open}
      style={{
        display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0,
        transition: 'grid-template-rows var(--dur-base) var(--ease-glide), opacity var(--dur-fast) var(--ease-glass)',
      }}
    >
      {/* `clip` with a margin while open, not `hidden`: a step track's tall
          tap area and a focus ring reach a few px past the fold, and `hidden`
          cut both off (and their hit area with them). Closed, the margin goes
          to zero so nothing peeks out of a shut fold. */}
      <div style={{ minHeight: 0, minWidth: 0, overflow: 'clip', overflowClipMargin: open ? 12 : 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap, paddingTop: gap }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function BlockedLine({ on, extra, title, onPress }: {
  on: string;
  /** How many further prerequisites there are, if more than one. */
  extra?: number;
  title?: string;
  /**
   * 29-1P7c (idea 164): a press draws the wire to what it waits on — the
   * tablet's way in, where nothing hovers. A button then, so the press is
   * the line's own and never opens the card's sheet (`cardPress.ts`).
   */
  onPress?: () => void;
}) {
  const Tag = onPress ? 'button' : 'span';
  return (
    <Tag
      {...(onPress ? {
        type: 'button' as const,
        'data-wire-pin': '',
        onClick: (e: MouseEvent) => { e.stopPropagation(); onPress(); },
      } : {})}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0,
        padding: '4px var(--sp-4) 4px var(--sp-3)', borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
        color: 'var(--fg-3)',
        border: 0, backgroundColor: 'transparent', font: 'inherit', textAlign: 'left',
        cursor: onPress ? 'pointer' : undefined,
      }}
    >
      <Icon name="lock" size={13} style={{ flex: '0 0 auto', color: 'inherit' }} />
      <span
        className="ag-clamp-1"
        style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', minWidth: 0 }}
      >
        Waiting on <span style={{ color: 'var(--fg-2)' }}>{on}</span>
        {extra ? <span style={{ color: 'var(--fg-4)' }}> +{extra} more</span> : null}
      </span>
    </Tag>
  );
}
