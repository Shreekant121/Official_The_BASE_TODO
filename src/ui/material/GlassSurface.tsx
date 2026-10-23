/**
 * Aurora Glass — GlassSurface
 * Ported from design-system/components/material/GlassSurface.{jsx,d.ts}.
 * Guidance: design-system/components/material/GlassSurface.prompt.md
 *
 * The one material primitive. Every pane, card, bar, popover and pill
 * in the system is this component with different props. Five physical
 * layers ship together — backdrop, fill, rim, inner glow, cast shadow —
 * because removing any one of them is what makes glass look like a
 * grey rectangle.
 */
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';

const LEVEL = {
  1: { fill: 'var(--glass-fill-1)', bd: 'var(--glass-bd-sm)', bdR: 'var(--glass-bd-sm-refract)', shadow: 'var(--glass-shadow-thin)' },
  2: { fill: 'var(--glass-fill-2)', bd: 'var(--glass-bd-md)', bdR: 'var(--glass-bd-md-refract)', shadow: 'var(--glass-shadow-pane)' },
  3: { fill: 'var(--glass-fill-3)', bd: 'var(--glass-bd-lg)', bdR: 'var(--glass-bd-lg-refract)', shadow: 'var(--glass-shadow-thick)' },
} as const;

const TINT = {
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-coral)', /* an error's tone: coral since 29-1P2c2 */
  frost:  'var(--glass-frost)',
} as const;

const GLOW = {
  accent: 'var(--glow-accent-md)',
  cyan:   'var(--glow-cyan-md)',
  violet: 'var(--glow-violet-md)',
  amber:  'var(--glow-amber-md)',
  rose:   'var(--job-coral-shine-md)',
  white:  'var(--glow-white-sm)',
} as const;

export type GlassLevel = keyof typeof LEVEL;
export type GlassTint = keyof typeof TINT;
export type GlassGlow = keyof typeof GLOW;

export interface GlassSurfaceProps extends HTMLAttributes<HTMLElement> {
  /** Thickness of the pane. 1 = a hairline chip, 2 = the default card, 3 = a heavy sheet or dialog. */
  level?: GlassLevel;
  /** Pull a hue through the glass instead of the neutral fill. `frost` is near-opaque white with dark text. */
  tint?: GlassTint;
  /** Emit colour outward. Reserve for active, live or focal objects — never a resting neutral surface. */
  glow?: GlassGlow;
  /** Any radius token or CSS length. Defaults to `var(--r-card)`. */
  radius?: string;
  /** Bend the backdrop with a displacement map instead of blurring it. Needs <GlassFilters /> mounted. */
  refract?: boolean;
  /** Shorthand for padding, so a pane can be used directly as a container. */
  inset?: string;
  /** Element or component to render as. Defaults to `div`. */
  as?: ElementType;
  children?: ReactNode;
}

export function GlassSurface({
  level = 2,
  tint,
  glow,
  radius = 'var(--r-card)',
  refract = false,
  inset,
  as = 'div',
  className = '',
  style,
  children,
  ...rest
}: GlassSurfaceProps) {
  const L = LEVEL[level] ?? LEVEL[2];
  const Tag = as as ElementType;
  const bd = refract ? L.bdR : L.bd;
  const box = [L.shadow, glow ? GLOW[glow] : null].filter(Boolean).join(', ');

  const composed: CSSProperties = {
    position: 'relative',
    backgroundImage: tint ? TINT[tint] : L.fill,
    /*
     * `WebkitBackdropFilter` deliberately takes the plain blur even when
     * `refract` is on. That is not an oversight: the refract value leads with
     * `url(#ag-refract-*)`, an SVG filter reference that only Chromium honours
     * inside backdrop-filter. WebKit would drop the whole declaration and the
     * pane would lose its blur entirely, so Safari is handed the blur-only
     * form on purpose. Both properties are written as React inline styles,
     * which never pass through the CSS minifier — so the Lightning CSS hazard
     * documented at the top of src/index.css does not apply here.
     */
    backdropFilter: bd,
    WebkitBackdropFilter: L.bd,
    boxShadow: box,
    borderRadius: radius,
    color: tint === 'frost' ? 'var(--fg-on-light)' : undefined,
    padding: inset,
    transition: 'var(--t-hover)',
    ...style,
  };

  return (
    <Tag
      className={['ag-glass-surface', className].filter(Boolean).join(' ')}
      style={composed}
      {...rest}
    >
      {children}
    </Tag>
  );
}
