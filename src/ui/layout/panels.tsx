/**
 * Aurora Glass — page composition primitives.
 *
 * These six are not part of the design project's component list, but every
 * one of its eleven screen mockups defines them again at the top of the file.
 * Extracted once, so a screen migrating to Aurora Glass composes from the same
 * Card and Well as every other screen rather than re-deriving them.
 *
 * The pairing is the load-bearing idea, and it is easy to get backwards:
 *
 *   Card — a pane that ACTS. Comes out of the page. Glass fill, rim, cast.
 *   Well — a trough you put data INTO. Reads as carved in. Inputs, progress
 *          tracks, list containers, segmented backgrounds.
 *
 * Getting that inversion wrong is the fastest way to break the material.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from '../core/Icon';

/* Kickers are uppercase in the old system and sentence case in V3; the
   token says which (`tokens/v3.css`). csstype has no string escape for
   `textTransform`, hence the one cast. */
const KICKER_CASE = 'var(--kicker-transform)' as CSSProperties['textTransform'];

export interface CardProps {
  children?: ReactNode;
  /** Inner padding. Defaults to the standard card inset (24px). */
  pad?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * The standard level-2 pane.
 *
 * Written as raw tokens rather than as `<GlassSurface level={2}>` on purpose:
 * the mockups compose this exact shadow triplet — rim, inner, cast — and add
 * the `ag-condense` entrance, which is the design system's "panes arrive by
 * condensing" law. GlassSurface's `--glass-shadow-pane` is the same triplet,
 * but the animation is not part of it and a Card without it fades in from
 * nowhere, which the motion section explicitly forbids.
 */
export function Card({ children, pad = 'var(--pad-card)', style, className = '' }: CardProps) {
  return (
    <section
      className={className}
      style={{
        borderRadius: 'var(--r-card)',
        padding: pad,
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        ...style,
      }}
    >
      {children}
    </section>
  );
}

export interface WellProps {
  children?: ReactNode;
  pad?: string;
  style?: CSSProperties;
  className?: string;
}

/** The recessed counterpart to Card. Anything you read values out of. */
export function Well({ children, pad = 'var(--sp-5)', style, className = '' }: WellProps) {
  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--r-lg)',
        padding: pad,
        background: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export interface KickerProps {
  children?: ReactNode;
  /** Muted trailing note, e.g. "share of 8.1 KB". */
  trail?: ReactNode;
  /**
   * Ink for the run itself. The mockups' own `Kicker` takes one and spends it
   * on exactly two things: a warning while the field it names is outstanding
   * (grey since 29-1P2c2), and done once it is satisfied. Defaults to `--fg-3`; do not reach for it to
   * tell two labels apart.
   */
  tone?: string;
}

/**
 * The small uppercase mono run that labels a BLOCK. Keep it rare.
 *
 * The mockups define `Kicker` twice, and the two are different objects — see
 * `MetaKicker` below. This is the minority form (`notifications.html` and
 * `settings.html`): a block-level label with an optional trailing count,
 * inset `--sp-2` so it lines up with the pane's own padding.
 */
export function Kicker({ children, trail, tone = 'var(--fg-3)' }: KickerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '0 var(--sp-2)' }}>
      <span
        style={{
          font: 'var(--type-kicker)',
          letterSpacing: 'var(--tracking-kicker)',
          textTransform: KICKER_CASE,
          color: tone,
        }}
      >
        {children}
      </span>
      {trail != null && (
        <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)' }}>
          {trail}
        </span>
      )}
    </div>
  );
}

export interface MetaKickerProps {
  /** Leading 13px glyph, by name. The mockups always pass one. */
  icon?: IconName;
  children?: ReactNode;
  /** Ink for the glyph and the run. See `KickerProps.tone`. */
  tone?: string;
  /**
   * Ink for the glyph alone, over `tone`. A date's calendar glyph is sky
   * while its words stay grey (29-1P2c2, his call: the colour says "this is a
   * date" without making every row louder).
   */
  iconTone?: string;
  style?: CSSProperties;
}

/**
 * The uppercase mono run that labels a READING, inline beside it (UI-31).
 *
 * **The mockups define `Kicker` twice and the app had only taken the minority
 * one.** Five of the seven files that define one — `deadlines.html`,
 * `focus.html`, `scoring.html`, `session.html` and `TaskSheet.jsx` — define
 * *this*: an `inline-flex` span with a leading glyph and a `tone`, sitting on
 * the same baseline as the number it names ("COMMITTED 2h 30m", "DUE IN 3D").
 * `Kicker` above is the other two, and is a block. Neither is a variant of the
 * other: one labels a pane, one labels a value.
 *
 * UI-27 needed this shape for Set Deadlines' budget line and, with only one
 * caller, kept a local copy rather than widening `Kicker` for one screen.
 * UI-31's budget line is the second caller and reads the same
 * `sessionDuration`, so it is shared now — two copies of one vocabulary is
 * how two screens start disagreeing.
 */
export function MetaKicker({ icon, children, tone = 'var(--fg-3)', iconTone, style }: MetaKickerProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        font: 'var(--type-kicker)',
        textTransform: KICKER_CASE,
        letterSpacing: 'var(--tracking-kicker)',
        color: tone,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={13} style={iconTone ? { color: iconTone } : undefined} />}
      {children}
    </span>
  );
}

export interface FieldLabelProps {
  /** Leading 14px glyph. */
  icon?: ReactNode;
  children?: ReactNode;
  /** Right-aligned extra — usually a link out. */
  hint?: ReactNode;
  /** Ink for the label and its glyph. See `KickerProps.tone`. */
  tone?: string;
}

/** Kicker plus a leading glyph and an optional right-aligned hint. */
export function FieldLabel({ icon, children, hint, tone }: FieldLabelProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
      {icon && <span style={{ display: 'flex', color: tone ?? 'var(--fg-4)' }}>{icon}</span>}
      <span
        style={{
          font: 'var(--type-kicker)',
          letterSpacing: 'var(--tracking-kicker)',
          textTransform: KICKER_CASE,
          color: tone ?? 'var(--fg-3)',
        }}
      >
        {children}
      </span>
      <span style={{ flex: 1 }} />
      {hint}
    </div>
  );
}

export interface ChipProps {
  children?: ReactNode;
  /** Leading 13px glyph. */
  icon?: IconName;
  /** Makes it a button. A chip with no handler is a `<span>`. */
  onClick?: () => void;
  /** The chosen one of a set — lifts to `--glass-fill-3` and `--glass-rim-2`. */
  active?: boolean;
  /** A dot before the label, in a colour the system did not choose (a project's own). */
  dot?: string;
  style?: CSSProperties;
}

/**
 * A fact on a pill (UI-30).
 *
 * The fifth primitive every mockup redefines — `scoring.html`, `TaskSheet.jsx`,
 * `session.html`, `deadlines.html` and `focus.html` all open with their own
 * copy. All five agree on everything but the height — `--type-label` at
 * `--text-xs`, a `--glass-fill-1` pane at rest lifting to `--glass-fill-2` on
 * hover and `--glass-fill-3` when it is the chosen one of a set. The heights
 * are 28 (`deadlines`, `focus`), 30 (`session`) and 32 (`scoring`), so 32 is a
 * settled compromise rather than a number the source states; Set Deadlines
 * keeps a local 28px copy because that is what its own mockup draws.
 *
 * `dot` is the app's own and is UI-29's rule, not an invention: a project's
 * colour is the user's data rather than a design token, and the board settled
 * that this system spends it as *"a 4px dot and a hairline — never a card
 * glow"*. So the chip stays system-coloured and the dot carries the project.
 *
 * The source's `tone="amber"` variant is deliberately absent. UI-25 settled
 * that the `--status-*` set is this app's tone vocabulary and UI-26 built the
 * amber "needs a decision" chip out of `StatusPill status="review"`; a second
 * amber pill shape would be that decision drifting.
 */
export function Chip({ children, icon, onClick, active = false, dot, style }: ChipProps) {
  const [hover, setHover] = useState(false);
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto',
        height: 32, padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-pill)',
        cursor: onClick ? 'pointer' : 'default',
        backgroundImage: active
          ? 'var(--glass-fill-3)'
          : hover && onClick ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        boxShadow: active ? 'var(--glass-rim-2)' : 'var(--glass-rim-1)',
        color: active ? 'var(--fg-1)' : 'var(--fg-2)',
        font: 'var(--type-label)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
        maxWidth: '100%', minWidth: 0,
        transition: 'var(--t-hover)',
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{ width: 4, height: 4, borderRadius: '50%', flex: '0 0 auto', background: dot }}
        />
      )}
      {icon && <Icon name={icon} size={13} />}
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </Tag>
  );
}
