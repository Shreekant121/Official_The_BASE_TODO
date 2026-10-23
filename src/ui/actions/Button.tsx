/**
 * Aurora Glass — Button
 * Ported from design-system/components/actions/Button.{jsx,d.ts}.
 * Guidance: design-system/components/actions/Button.prompt.md
 *
 * Pill-only by house rule. Five variants cover every job in the
 * references: glass (default), solid (one primary per view), frost
 * (white pane, dark label — the "Get in touch" treatment), tint
 * (accent glass, for affirmative actions), ghost (low stakes).
 *
 * House rules worth not re-learning:
 *   - Exactly ONE `solid` button per view. Two primaries means none.
 *   - Press feedback is a 0.965 scale, never a colour-only change.
 *   - `size="sm"` is 34px and breaks the 44px hit-target rule — keep it
 *     inside desktop toolbars only.
 *
 * V3 (V3-2, ported from v4's `Button.jsx`). Inside a `<V3Scope>` there is a
 * sixth variant, `gel`: a lit emerald object, and in V3 the primary action
 * of a screen is gel rather than `solid`. Gel's tokens exist only inside a
 * scope, so OUTSIDE one `gel` draws as `solid` — a component shared by a V3
 * screen and an old one can ask for gel and still look right on both. The
 * scope also brings v4's press: a 0.955 squeeze, a settle on release and the
 * release bloom (`PressBloom`). Everything else about the old variants is
 * untouched, so an unconverted screen renders byte for byte as it did.
 * v4's loading field (hues drifting under the label instead of a spinner)
 * is not ported yet; no V3 screen has needed it.
 */
import { useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useV3 } from '../core/v3Context';
import { PressBloom } from './PressBloom';

const SIZE = {
  sm: { h: 34, px: 'var(--sp-5)', fs: 'var(--text-sm)', gap: 'var(--sp-2)' },
  md: { h: 44, px: 'var(--sp-7)', fs: 'var(--text-md)', gap: 'var(--sp-3)' },
  lg: { h: 54, px: 'var(--sp-9)', fs: 'var(--text-base)', gap: 'var(--sp-4)' },
} as const;

const TONE_SOLID = {
  accent: ['var(--accent)', 'var(--accent-lift)', 'var(--accent-sink)', 'var(--glow-accent-md)'],
  cyan:   ['var(--hue-cyan)', 'oklch(0.78 0.14 210)', 'oklch(0.60 0.13 210)', 'var(--glow-cyan-md)'],
  violet: ['var(--job-violet)', 'oklch(0.8 0.162 300)', 'oklch(0.56 0.171 300)', 'var(--job-violet-shine-md)'],
  /* `rose` is the tone for a delete or an error, which is coral's job since
     29-1P2c2; the name stays so no caller moves. Rose the colour (his
     routine, hue 355) is `--job-rose`. */
  rose:   ['var(--job-coral)', 'oklch(0.8 0.162 28)', 'oklch(0.56 0.171 28)', 'var(--job-coral-shine-md)'],
} as const;

/* v4's gel table, keyed by this file's tones: fill, cast shadow, label.
   `cyan` takes v4's sky gel and `rose` its coral — the nearest it draws.
   Each casts its own colour, idea 64 (29-1P1), pressed or not. */
const GEL = {
  accent: ['var(--gel-emerald)', 'var(--cast-emerald)', 'var(--fg-on-accent)'],
  cyan:   ['var(--gel-sky)', 'var(--cast-sky)', 'var(--fg-on-brand)'],
  violet: ['var(--job-violet-gel)', 'var(--job-violet-glow)', 'var(--job-violet-ink)'],
  amber:  ['var(--gel-amber)', 'var(--cast-amber)', 'var(--fg-on-light)'],
  rose:   ['var(--job-coral-gel)', 'var(--job-coral-glow)', 'var(--job-coral-ink)'],
} as const;

const TINT_FILL = {
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-coral)',
} as const;

const TINT_TEXT = {
  accent: 'oklch(0.93 0.07 162)',
  cyan:   'oklch(0.93 0.07 210)',
  violet: 'var(--job-violet-text)',
  amber:  'oklch(0.95 0.07 82)',
  rose:   'var(--job-coral-text)',
} as const;

/* Inside a scope the label and icons sit on their own positioned boxes, as
   in v4, so the bloom (absolute, and so painted over plain content) passes
   under them rather than washing over the text. */
const LIFT: CSSProperties = { position: 'relative', display: 'inline-flex' };

export type ButtonVariant = 'glass' | 'solid' | 'frost' | 'tint' | 'ghost' | 'gel';
export type ButtonTone = keyof typeof TINT_FILL;
export type ButtonSize = keyof typeof SIZE;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `glass` default · `solid` one primary per view · `frost` white pane with dark label · `tint` accent glass · `ghost` low stakes · `gel` V3's primary (draws as `solid` outside a V3 scope). */
  variant?: ButtonVariant;
  /** Hue for `solid` and `tint`. Ignored by the others. */
  tone?: ButtonTone;
  /** `sm` 34px is toolbar-only — anything a finger touches uses `md` (44px) or larger. */
  size?: ButtonSize;
  /** Leading icon node. 16–18px line icons at 1.5 stroke. */
  iconLeft?: ReactNode;
  /** Trailing icon node. Use for direction, not decoration. */
  iconRight?: ReactNode;
  /** Swaps the leading icon for a spinner and blocks interaction. */
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
}

export function Button({
  variant = 'glass',
  tone = 'accent',
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
  block = false,
  className = '',
  style,
  children,
  ...rest
}: ButtonProps) {
  const v3 = useV3();
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const [bloom, setBloom] = useState(0);
  const s = SIZE[size] ?? SIZE.md;
  const off = disabled || loading;
  const gel = variant === 'gel' && v3;

  let fill: string;
  let color: string;
  let shadow: string;

  if (gel) {
    const [g, cast, fg] = GEL[tone] ?? GEL.accent;
    fill = g;
    color = fg;
    shadow = ['var(--gel-rim)', cast].join(', ');
  } else if (variant === 'solid' || variant === 'gel') {
    // `tone` is typed wider than TONE_SOLID (it has no `amber`), so fall back.
    const [base, lift, sink, glow] = TONE_SOLID[tone as keyof typeof TONE_SOLID] ?? TONE_SOLID.accent;
    fill = press ? sink : hover ? lift : base;
    color = 'var(--fg-on-accent)';
    shadow = [hover && !press ? glow : 'var(--shadow-2)', 'inset 0 1px 0 oklch(1 0 0 / 0.28)'].join(', ');
  } else if (variant === 'frost') {
    fill = 'var(--glass-frost)';
    color = 'var(--fg-on-light)';
    shadow = [hover && !press ? 'var(--shadow-3)' : 'var(--shadow-2)', 'inset 0 1px 0 oklch(1 0 0 / 0.9)'].join(', ');
  } else if (variant === 'tint') {
    fill = TINT_FILL[tone] ?? TINT_FILL.accent;
    color = TINT_TEXT[tone] ?? TINT_TEXT.accent;
    shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--shadow-3)' : 'var(--glass-cast-1)'].join(', ');
  } else if (variant === 'ghost') {
    fill = hover ? 'var(--glass-fill-1)' : 'transparent';
    color = hover ? 'var(--fg-1)' : 'var(--fg-2)';
    shadow = 'none';
  } else {
    fill = hover ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)';
    color = 'var(--fg-1)';
    shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--glass-cast-2)' : 'var(--glass-cast-1)'].join(', ');
  }

  const glassy = variant === 'glass' || variant === 'tint';

  const composed: CSSProperties = {
    position: 'relative',
    display: block ? 'flex' : 'inline-flex',
    width: block ? '100%' : undefined,
    alignItems: 'center',
    justifyContent: 'center',
    gap: s.gap,
    height: s.h,
    padding: `0 ${s.px}`,
    border: 0,
    borderRadius: 'var(--r-control)',
    font: 'var(--type-body)',
    fontSize: s.fs,
    fontWeight: 'var(--weight-medium)',
    letterSpacing: 'var(--tracking-ui)',
    whiteSpace: 'nowrap',
    color,
    background: fill,
    backdropFilter: glassy ? 'var(--glass-bd-md)' : undefined,
    WebkitBackdropFilter: glassy ? 'var(--glass-bd-md)' : undefined,
    boxShadow: shadow,
    transform: press ? 'scale(0.965)' : 'scale(1)',
    opacity: off ? 0.42 : 1,
    cursor: off ? 'not-allowed' : 'pointer',
    transition:
      'background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform var(--dur-instant) var(--ease-glass), color var(--dur-fast) var(--ease-glass), opacity var(--dur-fast) var(--ease-glass)',
    /* v4's press, inside a scope only. The gel lifts a pixel and brightens
       under the pointer; everything squeezes on press and settles back on
       `--ease-settle`, the one soft landing V3's motion allows. `overflow`
       clips the bloom (and gel's highlight) to the pill. */
    ...(v3
      ? {
          transform: press ? 'scale(0.955)' : hover && gel ? 'translateY(-1px)' : 'scale(1)',
          filter: gel && hover && !press ? 'brightness(1.08) saturate(1.1)' : undefined,
          opacity: disabled ? 0.42 : loading ? 0.92 : press && !gel ? 0.86 : 1,
          overflow: 'hidden',
          transition:
            `background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform ${press ? 'var(--dur-instant) var(--ease-glass)' : 'var(--dur-slow) var(--ease-settle)'}, filter var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass), opacity var(--dur-fast) var(--ease-glass)`,
        }
      : {}),
    ...style,
  };

  return (
    <button
      type="button"
      disabled={off}
      className={['ag-btn', className].filter(Boolean).join(' ')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => { if (v3 && press && !off) setBloom((n) => n + 1); setPress(false); }}
      aria-busy={loading || undefined}
      style={composed}
      {...rest}
    >
      {v3 && <PressBloom k={bloom} />}
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            width: 15,
            height: 15,
            borderRadius: '50%',
            border: '1.5px solid currentColor',
            borderTopColor: 'transparent',
            animation: 'ag-spin 620ms linear infinite',
            opacity: 0.9,
          }}
        />
      ) : v3 && iconLeft ? <span style={LIFT}>{iconLeft}</span> : iconLeft}
      {v3 ? <span style={{ position: 'relative' }}>{children}</span> : children}
      {!loading && (v3 && iconRight ? <span style={LIFT}>{iconRight}</span> : iconRight)}
    </button>
  );
}
