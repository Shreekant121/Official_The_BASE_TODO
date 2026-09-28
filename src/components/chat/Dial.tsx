/**
 * The two dials under the composer, and the chrome they share (item 13G).
 *
 * `atlas.html` moves everything that decides how the next turn runs *out* of
 * the field and onto a bare row beneath it, and the rule it draws them by is
 * the one worth keeping: **a dial is a line of type until you touch it.** No
 * border, no fill, no shadow at rest — the row reads as a caption under the
 * composer, and each item becomes a control under the pointer. That is the
 * answer to Shreekant's *"showing too much information that is not required"*:
 * the information is still there, it has simply stopped being furniture.
 *
 * MOTION 5 OF 14 IS THE POPOVER, AND 13F'S ATLAS PANEL USES THE SAME ONE
 * ----------------------------------------------------------------------
 * `scale(.9) translateY(8px)` → `scale(1)`, radius `--r-pill` → `--r-lg`,
 * `blur(7px)` → `0`, with `visibility` switched on a zero-length transition
 * delayed by `--dur-fast` on the way out. The radius pair is the morph: the
 * panel starts the shape of the pill it came from. The delayed `visibility` is
 * what keeps it out of the tab order while closed **without** unmounting it,
 * which is what a fade needs — a panel that did not exist a frame ago has
 * nothing to fade from.
 *
 * MOTION 12 IS THE PILL: `box-shadow` on `--dur-base`, and `color` plus
 * `background-image` on `--dur-fast`. Three properties on two durations, which
 * is the house pattern everywhere in this file — the shadow settles after the
 * colour lands, so the control reads as lifting rather than switching.
 */
import { useState, type ReactNode } from 'react';
import { Icon } from '../../ui';

/**
 * The panel a dial opens onto.
 *
 * Absolutely positioned against the caller's own `position: relative` wrapper
 * and opening **upwards**, because every one of these sits at the bottom of
 * the screen with nothing below it.
 */
export function DialPopover({
  open,
  align = 'left',
  width,
  label,
  children,
}: {
  open: boolean;
  align?: 'left' | 'right';
  width: number;
  /** Names the panel for a screen reader; the visible kicker repeats it. */
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-label={label}
      aria-hidden={!open}
      style={{
        position: 'absolute', bottom: 'calc(100% + var(--sp-4))', zIndex: 80,
        left: align === 'left' ? 0 : 'auto',
        right: align === 'right' ? 0 : 'auto',
        width, boxSizing: 'border-box', padding: 'var(--sp-5)',
        borderRadius: open ? 'var(--r-lg)' : 'var(--r-pill)',
        /* An opaque floor under the glass fill. A popover over a transcript
           has type behind it, and `--glass-fill-1` alone is not enough to stop
           a sentence reading through the panel that covers it. */
        backgroundColor: 'oklch(0.155 0.004 260 / 0.94)',
        backgroundImage: 'var(--glass-fill-1)',
        backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)',
        transformOrigin: align === 'right' ? 'bottom right' : 'bottom left',
        transform: open ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(8px)',
        opacity: open ? 1 : 0,
        visibility: open ? 'visible' : 'hidden',
        filter: open ? 'blur(0)' : 'blur(7px)',
        pointerEvents: open ? 'auto' : 'none',
        transition:
          'transform var(--dur-morph) var(--ease-morph),' +
          ' border-radius var(--dur-morph) var(--ease-morph),' +
          ' opacity var(--dur-fast) var(--ease-glass),' +
          ' filter var(--dur-fast) var(--ease-glass),' +
          ` visibility 0s linear ${open ? '0s' : 'var(--dur-fast)'}`,
      }}
    >
      {children}
    </div>
  );
}

/** The bare pill that opens one. Label only, no chrome until you touch it. */
export function DialPill({
  open,
  onClick,
  label,
  children,
}: {
  open: boolean;
  onClick: () => void;
  /** What the control is, for a screen reader. The children are its *value*. */
  label: string;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const lit = open || hover;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 30,
        padding: '0 var(--sp-4)', border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
        backgroundImage: lit ? 'var(--glass-fill-2)' : 'none',
        boxShadow: open ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        color: lit ? 'var(--fg-1)' : 'var(--fg-3)',
        font: 'var(--type-caption)', letterSpacing: 'var(--tracking-ui)', whiteSpace: 'nowrap',
        transition:
          'box-shadow var(--dur-base) var(--ease-glass),' +
          ' color var(--dur-fast) var(--ease-glass),' +
          ' background-image var(--dur-fast) var(--ease-glass)',
      }}
    >
      {children}
    </button>
  );
}

/**
 * One option inside a dial's popover — motion 11, `background-image` on
 * `--dur-fast` and `box-shadow` on `--dur-base`, the same pair the rows
 * elsewhere use with the two durations the other way round.
 *
 * The tick fades rather than appearing: `opacity` on `--dur-fast` with the
 * glyph always in the tree, so the row's width does not change as the choice
 * moves down the list.
 */
export function DialOption({
  label,
  description,
  selected,
  onPick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center',
        gap: 'var(--sp-4)', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
        padding: 'var(--sp-3)', borderRadius: 'var(--r-sm)',
        backgroundImage: selected
          ? 'var(--glass-fill-2)'
          : hover
            ? 'var(--glass-fill-1)'
            : 'none',
        boxShadow: selected ? 'var(--glass-rim-1)' : 'none',
        transition:
          'background-image var(--dur-fast) var(--ease-glass),' +
          ' box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
          {label}
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          display: 'flex', color: 'var(--accent)',
          opacity: selected ? 1 : 0,
          transition: 'opacity var(--dur-fast) var(--ease-glass)',
        }}
      >
        <Icon name="check" size={14} />
      </span>
    </button>
  );
}
