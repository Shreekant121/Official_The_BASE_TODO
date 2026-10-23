/**
 * The app's picker vocabulary — one trigger, one option row, one popover
 * scroller (UI-15, generalised by UI-18).
 *
 * UI-15 wrote this for New Session's three popovers: the toolbar's **list
 * filter**, the New-list form's **project picker** and the Add-task form's
 * **list picker**. All three were separately hand-written `hover:bg-white/8`
 * blocks that had already drifted apart — three row heights, three left
 * insets, and three different ways of showing which option is currently
 * chosen (bold white, bold white on a tint, and a tick). They are one option
 * row now, so the next change to it cannot land on only one of them.
 *
 * **UI-18 moved it out of `session/` and pointed `CustomDropdown` at it**, so
 * the same three parts now draw every option list in the app: the six
 * `<select>` replacements in the task editors, the bulk-move bar on the
 * project board, Capture Idea's list chooser, and New Session's original
 * three. That is the whole reason it moved up a directory — a file under
 * `session/` that the task editors imported would be lying about who owns it.
 *
 * WHY THIS IS NOT `MorphMenu`
 * ---------------------------
 * `MorphMenu` cannot serve these. Its panel is `position: absolute` inside its
 * own wrapper, and two of New Session's three triggers sit inside a form whose
 * open/close animation needs `overflow: hidden` on the wrapper — so the panel
 * would be clipped by the very form it belongs to. The third opens from a
 * toolbar inside a card that must not grow, or "Selected for Today" gets
 * squeezed off the screen. Escaping both is exactly what `PortalDropdown` is
 * for. So: same portal, these contents.
 *
 * The deeper reason is the one UI-15 drew and UI-18 kept: **a menu and a
 * picker are different objects.** A menu is a list of things to DO and every
 * row is a verb; a picker is a list of values to BE and exactly one of them is
 * currently true. `MorphMenu` says so by morphing out of its trigger; these say
 * so with `aria-pressed` and a tick, which is the idiom this app already uses
 * for a group of exclusive choices (`.ag-status-choice` in `screens.css`,
 * written for `task-fields/StatusPills.tsx`).
 */
import { forwardRef, useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon, LitLine } from '../ui';

export interface PickerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Whether the popover this button opens is showing — lights the rim, spins the chevron. */
  open: boolean;
  /** Leading glyph. A project's own emoji, usually. */
  glyph?: ReactNode;
  /** Nothing chosen yet, so the label is a prompt rather than a value. */
  muted?: boolean;
  /**
   * `sm` 38px for a toolbar, `md` 46px for a form. The two numbers are
   * `Input`'s own, and that is the point: UI-18 put this trigger next to real
   * `Input`s in six task editors, and a picker a pixel off the field beside it
   * is the drift this file exists to stop.
   */
  size?: PickerButtonSize;
}

export type PickerButtonSize = 'sm' | 'md';

/**
 * The trigger. A carved pill, not a raised one: it reads out a value you are
 * about to change, which is the Well half of the Card/Well pairing.
 */
export const PickerButton = forwardRef<HTMLButtonElement, PickerButtonProps>(
  function PickerButton({ open, glyph, muted = false, size = 'sm', children, style, ...rest }, ref) {
    const md = size === 'md';
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: md ? 'var(--sp-4)' : 'var(--sp-3)',
          minHeight: md ? 46 : 38,
          padding: md ? '0 var(--sp-6)' : '0 var(--sp-5)',
          border: 0,
          borderRadius: 'var(--r-control)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: open
            ? 'var(--glass-well-shadow), 0 0 0 1px var(--job-lime-line)'
            : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
          font: 'var(--type-body)',
          fontSize: md ? 'var(--text-md)' : 'var(--text-sm)',
          letterSpacing: 'var(--tracking-ui)',
          color: muted ? 'var(--fg-4)' : 'var(--fg-1)',
          cursor: 'pointer',
          transition: 'box-shadow var(--dur-base) var(--ease-glass)',
          ...style,
        }}
        {...rest}
      >
        {glyph}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textAlign: 'left',
          }}
        >
          {children}
        </span>
        <Icon
          name="chevron-down"
          size={14}
          style={{
            color: 'var(--fg-4)',
            transform: open ? 'rotate(180deg)' : undefined,
            transition: 'transform var(--dur-base) var(--ease-glass)',
          }}
        />
      </button>
    );
  },
);

/**
 * The popover's own scroller. `ag-scroll` for the reason the sheets use it —
 * a visible track inside a pane of glass reads as browser chrome resting on
 * the surface — and a max height so a long list of lists cannot grow past the
 * window it is portalled into.
 *
 * **`minmax(0, 1fr)` is load-bearing, and it is item 1's bug in a second
 * place.** A grid's implicit column is sized by its widest item's *min-content*,
 * and a row here is a flex line whose min-content includes an un-shrinkable
 * `meta` column. So one long option — measured: `Gemini 2.0 Flash Experimental`
 * with an id beside it, 360px of min-content in a 318px list — widened the
 * single column past the panel, and `PortalDropdown` is `overflow: hidden`, so
 * everything at the right-hand end of *every* row (the tick, a count, a
 * control) was silently clipped rather than scrolled. The rows already
 * truncate correctly on their own; they were never given a track narrow enough
 * to have to. This pins the column to the container and lets them.
 *
 * It is fixed here rather than in `ModelPicker`, where it was found, because
 * the nine other pickers share this list and the next long label lands in one
 * of them — the same call item 1 made about `.ag-labelled`.
 */
export function PickerList({ maxHeight, children }: { maxHeight: string; children: ReactNode }) {
  return (
    <div
      className="ag-scroll ag-fade"
      style={{
        maxHeight,
        overflowY: 'auto',
        padding: 'var(--sp-3)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 2,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Names what the list below is choosing. Only the filter needs one — and
 * `ModelPicker`, which puts two lists in one panel and so has to say which is
 * which.
 *
 * `trailing` is the right-hand slot: a count, or a control belonging to this
 * group rather than to the panel. It exists because the model picker's two
 * groups fail independently — one can be empty while the other is fine — so
 * "how many, and try again" has to live per group. A heading with nothing
 * passed draws exactly what it always did.
 */
export function PickerHeading({
  icon,
  trailing,
  children,
}: {
  icon?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
        borderBottom: '1px solid var(--line-soft)',
      }}
    >
      {icon && <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>{icon}</span>}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: 'var(--type-kicker)',
          letterSpacing: 'var(--tracking-kicker)',
          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
          color: 'var(--fg-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      {trailing != null && (
        <span style={{ display: 'flex', alignItems: 'center', flex: '0 0 auto', gap: 'var(--sp-3)' }}>
          {trailing}
        </span>
      )}
    </div>
  );
}

export interface PickerOptionProps {
  /** How far down a tree the row sits — a project inside a project (BIG-2). */
  depth?: number;
  /**
   * Whether this row is the value currently in force. **Omit it entirely for
   * a row that ADDS something** rather than choosing among alternatives —
   * `DependencyPicker`'s search results, where every row is a fresh
   * prerequisite and none of them is "the current one". Undefined drops both
   * `aria-pressed` and the tick, so the row stops announcing itself as an
   * unpressed toggle; `false` keeps them, which is what a picker with nothing
   * chosen yet means and what all nine existing call sites pass.
   */
  selected?: boolean;
  /** Leading glyph — a project emoji, or a colour dot. */
  glyph?: ReactNode;
  /** Right-aligned mono value. A count, usually. */
  meta?: ReactNode;
  onClick: () => void;
  children: ReactNode;
}

/**
 * One option. `--hit-min` tall, because half of this product is a tablet and
 * these rows used to be 38px of padding-derived height.
 */
export function PickerOption({ selected, glyph, meta, onClick, depth = 0, children }: PickerOptionProps) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        width: '100%',
        minHeight: 'var(--hit-min)',
        padding: depth > 0 ? `0 var(--sp-4) 0 calc(var(--sp-4) + ${depth * 16}px)` : '0 var(--sp-4)',
        border: 0,
        borderRadius: 'var(--r-sm)',
        textAlign: 'left',
        background: selected
          ? 'oklch(1 0 0 / 0.10)'
          : hover
            ? 'oklch(1 0 0 / 0.06)'
            : 'transparent',
        color: selected || hover ? 'var(--fg-1)' : 'var(--fg-2)',
        font: 'var(--type-body)',
        fontSize: 'var(--text-sm)',
        letterSpacing: 'var(--tracking-ui)',
        cursor: 'pointer',
        transition: 'background var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)',
      }}
    >
      {glyph}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      {meta != null && (
        <span
          style={{
            flex: '0 0 auto',
            font: 'var(--type-kicker)',
            letterSpacing: 'var(--tracking-kicker)',
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {meta}
        </span>
      )}
      {/* Lime as an interaction mark, not a status: this is which row you
          picked, the same job it does on the focus ring (29-1P2c1). It is reserved even
          when nothing is chosen, so the rows of one list stay aligned — but a
          list where nothing CAN be chosen (`selected` undefined) has no mark
          to reserve room for. */}
      {selected !== undefined && (
        <Icon
          name="check"
          size={14}
          style={{ color: 'var(--job-lime)', opacity: selected ? 1 : 0, transition: 'opacity var(--dur-fast) var(--ease-glass)' }}
        />
      )}
    </button>
  );
}

/** What a picker says when there is nothing to pick. A string is a lit
 *  sentence (`**` lights words, 29-1P14c); anything else is drawn as it is. */
export function PickerEmpty({ children }: { children: ReactNode }) {
  const style = {
    padding: 'var(--sp-6) var(--sp-5)',
    textAlign: 'center',
    font: 'var(--type-caption)',
    color: 'var(--fg-4)',
    textWrap: 'pretty',
  } as const;
  return typeof children === 'string'
    ? <LitLine as="p" text={children} style={style} />
    : <p style={style}>{children}</p>;
}
