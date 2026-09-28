/**
 * Aurora Glass — IconButton
 * Ported from design-system/components/actions/IconButton.{jsx,d.ts}.
 * Guidance: design-system/components/actions/IconButton.prompt.md
 *
 * The round glass affordance from the references: a circle of glass
 * holding one 1.5-stroke line icon and nothing else.
 *
 * `label` is required and not decorative — the button has no visible
 * text, so it is the only accessible name it will ever have. The design
 * system deliberately ships no Tooltip: on a touch-and-desktop product
 * a tooltip duplicates this name and never fires on tablet.
 *
 * FIXED ON IMPORT — the source styles the badge with
 * `var(--accent-rose)`, which is defined nowhere in the design system
 * (colors.css has `--hue-rose` and `--status-overrun`). An undefined
 * custom property makes `background` invalid-at-computed-value-time, so
 * the badge rendered transparent in the mockups. Pointed at
 * `--status-overrun`, which is the semantic token for this meaning.
 *
 * Note also that IconButton.d.ts describes `active` as adding "the blue
 * emission ring" — leftover wording from an earlier palette. The code
 * adds `--glow-accent-sm`, which is emerald, and emerald is correct
 * here: `active` means this control is the live one.
 *
 * V3 (V3-2, from v4's `IconButton.jsx`): inside a `<V3Scope>` the press is
 * v4's — no hover growth, a 0.94 squeeze with a slight dim, a settle on
 * release and the release bloom (`PressBloom`). Outside a scope it is the
 * old spring, unchanged.
 */
import { useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useV3 } from '../core/v3Context';
import { PressBloom } from './PressBloom';

const SIZE = { sm: 34, md: 44, lg: 54, xl: 64 } as const;

const TINT = {
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-rose)',
  frost:  'var(--glass-frost)',
} as const;

export type IconButtonSize = keyof typeof SIZE;
export type IconButtonTone = keyof typeof TINT;
export type IconButtonVariant = 'glass' | 'ghost' | 'tint';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 34 / 44 / 54 / 64px. `sm` is desktop-toolbar only. */
  size?: IconButtonSize;
  /** `glass` default · `ghost` for dense toolbars · `tint` for a hued or frost pane. */
  variant?: IconButtonVariant;
  /** Hue when `variant="tint"`. */
  tone?: IconButtonTone;
  /** Rounded square instead of a circle — for icon tiles in a grid. */
  square?: boolean;
  /** Selected / toggled on. Adds the accent emission ring. */
  active?: boolean;
  /** Count or dot rendered top-right. */
  badge?: ReactNode;
  /** Required accessible name — the button has no visible text. */
  label: string;
}

export function IconButton({
  size = 'md',
  variant = 'glass',
  tone,
  square = false,
  active = false,
  badge,
  disabled = false,
  label,
  className = '',
  style,
  children,
  ...rest
}: IconButtonProps) {
  const v3 = useV3();
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const [bloom, setBloom] = useState(0);
  const d = SIZE[size] ?? SIZE.md;

  let fill = hover ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)';
  let color = 'var(--fg-1)';
  let shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--glass-cast-2)' : 'var(--glass-cast-1)'].join(', ');

  if (variant === 'ghost') {
    fill = hover ? 'var(--glass-fill-1)' : 'transparent';
    color = hover ? 'var(--fg-1)' : 'var(--fg-3)';
    shadow = 'none';
  } else if (variant === 'tint' && tone) {
    fill = TINT[tone];
    color = tone === 'frost' ? 'var(--fg-on-light)' : 'var(--fg-1)';
    shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--shadow-3)' : 'var(--glass-cast-1)'].join(', ');
  }
  if (active) {
    shadow = `${shadow}, var(--glow-accent-sm)`;
    color = 'var(--fg-1)';
  }

  const composed: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: d,
    height: d,
    border: 0,
    padding: 0,
    borderRadius: square ? 'var(--r-tile)' : 'var(--r-circle)',
    color,
    background: fill,
    backdropFilter: variant === 'ghost' ? undefined : 'var(--glass-bd-md)',
    WebkitBackdropFilter: variant === 'ghost' ? undefined : 'var(--glass-bd-md)',
    boxShadow: shadow,
    transform: press ? 'scale(0.93)' : hover ? 'scale(1.04)' : 'scale(1)',
    opacity: disabled ? 0.42 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition:
      'background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-spring), color var(--dur-fast) var(--ease-glass)',
    ...(v3
      ? {
          transform: press ? 'scale(0.94)' : 'scale(1)',
          opacity: disabled ? 0.42 : press ? 0.8 : 1,
          transition:
            `background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform ${press ? 'var(--dur-instant) var(--ease-glass)' : 'var(--dur-slow) var(--ease-settle)'}, color var(--dur-fast) var(--ease-glass), opacity var(--dur-fast) var(--ease-glass)`,
        }
      : {}),
    ...style,
  };

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => { if (v3 && press && !disabled) setBloom((b) => b + 1); setPress(false); }}
      className={['ag-icon-btn', className].filter(Boolean).join(' ')}
      style={composed}
      {...rest}
    >
      {v3 && <PressBloom k={bloom} />}
      {children}
      {badge != null && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            minWidth: 20,
            height: 20,
            padding: '0 5px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--r-pill)',
            background: 'var(--status-overrun)',
            color: 'var(--fg-1)',
            font: 'var(--type-kicker)',
            fontSize: 'var(--text-2xs)',
            fontWeight: 'var(--weight-medium)',
            boxShadow: 'var(--glow-rose-md), inset 0 1px 0 oklch(1 0 0 / 0.3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
