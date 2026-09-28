import React from 'react';

/* The one material primitive. Every pane, card, bar, popover and pill
   in the system is this component with different props. Five physical
   layers ship together — backdrop, fill, rim, inner glow, cast shadow —
   because removing any one of them is what makes glass look like a
   grey rectangle. */

const LEVEL = {
  1: { fill: 'var(--glass-fill-1)', bd: 'var(--glass-bd-sm)', bdR: 'var(--glass-bd-sm-refract)', shadow: 'var(--glass-shadow-thin)' },
  2: { fill: 'var(--glass-fill-2)', bd: 'var(--glass-bd-md)', bdR: 'var(--glass-bd-md-refract)', shadow: 'var(--glass-shadow-pane)' },
  3: { fill: 'var(--glass-fill-3)', bd: 'var(--glass-bd-lg)', bdR: 'var(--glass-bd-lg-refract)', shadow: 'var(--glass-shadow-thick)' },
};

const TINT = {
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-rose)',
  frost:  'var(--glass-frost)',
};

const GLOW = {
  accent: 'var(--glow-accent-md)',
  cyan:   'var(--glow-cyan-md)',
  violet: 'var(--glow-violet-md)',
  amber:  'var(--glow-amber-md)',
  rose:   'var(--glow-rose-md)',
  white:  'var(--glow-white-sm)',
};

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
}) {
  const L = LEVEL[level] || LEVEL[2];
  const Tag = as;
  const bd = refract ? L.bdR : L.bd;
  const box = [L.shadow, glow ? GLOW[glow] : null].filter(Boolean).join(', ');

  return (
    <Tag
      className={['ag-glass-surface', className].filter(Boolean).join(' ')}
      style={{
        position: 'relative',
        backgroundImage: tint ? TINT[tint] : L.fill,
        backdropFilter: bd,
        WebkitBackdropFilter: L.bd,
        boxShadow: box,
        borderRadius: radius,
        color: tint === 'frost' ? 'var(--fg-on-light)' : undefined,
        padding: inset,
        transition: 'var(--t-hover)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
