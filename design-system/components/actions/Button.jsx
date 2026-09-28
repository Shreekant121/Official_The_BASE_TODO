import React from 'react';

/* Pill-only by house rule. Five variants cover every job in the
   references: glass (default), gel (lit colour object — THE primary
   action; brand/violet/magenta/accent/amber/sky/dusk), solid, frost
   (white pane, dark label — the "Get in touch" treatment), tint
   (accent glass, for affirmative actions), ghost (low stakes). */


/* Release bloom: a soft highlight lifts off the top rim and fades. */
function PressBloom({ k }) {
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    if (!k) return undefined;
    setOn(true);
    const id = setTimeout(() => setOn(false), 130);
    return () => clearTimeout(id);
  }, [k]);
  return <span aria-hidden="true" style={{
    position: 'absolute', inset: 0, borderRadius: 'inherit', pointerEvents: 'none', overflow: 'hidden',
    background: 'radial-gradient(120% 80% at 50% 0%, oklch(1 0 0 / 0.26), oklch(1 0 0 / 0) 65%)',
    opacity: on ? 1 : 0, transition: 'opacity ' + (on ? '110ms' : '520ms') + ' var(--ease-glass)',
  }} />;
}

/* Loading: the system hues drift slowly under the label, the way the
   loading pill does — no spinner. */
const LOAD_KF = 'ag-btn-load-kf';
function ensureLoadKf() {
  if (typeof document === 'undefined' || document.getElementById(LOAD_KF)) return;
  const st = document.createElement('style');
  st.id = LOAD_KF;
  st.textContent = '@keyframes ag-btn-drift { 0%,100% { transform: translateX(-30%) } 50% { transform: translateX(30%) } }'
    + '@media (prefers-reduced-motion: reduce) { .ag-btn-drift { animation: none !important; } }';
  document.head.appendChild(st);
}
function LoadField() {
  React.useEffect(ensureLoadKf, []);
  return <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', overflow: 'hidden', pointerEvents: 'none' }}>
    <span className="ag-btn-drift" style={{
      position: 'absolute', inset: '-40% -30%',
      background: 'radial-gradient(30% 60% at 25% 50%, oklch(0.62 0.13 210 / 0.45), transparent 70%), radial-gradient(30% 60% at 55% 50%, oklch(0.60 0.14 296 / 0.40), transparent 70%), radial-gradient(30% 60% at 82% 50%, oklch(0.66 0.14 162 / 0.40), transparent 70%)',
      filter: 'blur(8px)', animation: 'ag-btn-drift 3.8s ease-in-out infinite',
    }} />
  </span>;
}

const SIZE = {
  sm: { h: 34, px: 'var(--sp-5)', fs: 'var(--text-sm)', gap: 'var(--sp-2)' },
  md: { h: 44, px: 'var(--sp-7)', fs: 'var(--text-md)', gap: 'var(--sp-3)' },
  lg: { h: 54, px: 'var(--sp-9)', fs: 'var(--text-base)', gap: 'var(--sp-4)' },
};

const GEL = {
  brand:   ['var(--gel-brand)', 'var(--cast-brand)', 'var(--fg-on-brand)'],
  violet:  ['var(--gel-violet)', 'var(--cast-violet)', 'var(--fg-on-brand)'],
  magenta: ['var(--gel-magenta)', 'var(--cast-magenta)', 'var(--fg-on-brand)'],
  accent:  ['var(--gel-emerald)', 'var(--cast-emerald)', 'var(--fg-on-accent)'],
  amber:   ['var(--gel-amber)', 'var(--cast-amber)', 'var(--fg-on-light)'],
  sky:     ['var(--gel-sky)', 'var(--cast-brand)', 'var(--fg-on-brand)'],
  dusk:    ['var(--gel-dusk)', 'var(--cast-violet)', 'var(--fg-on-brand)'],
};

const TONE_SOLID = {
  brand:  ['var(--brand-base)', 'var(--brand-lift)', 'var(--brand-sink)', 'var(--glow-brand-md)'],
  magenta:['var(--hue-magenta)', 'oklch(0.78 0.17 348)', 'oklch(0.62 0.20 348)', 'var(--glow-magenta-md)'],
  accent: ['var(--accent)', 'var(--accent-lift)', 'var(--accent-sink)', 'var(--glow-accent-md)'],
  cyan:   ['var(--hue-cyan)', 'oklch(0.78 0.14 210)', 'oklch(0.60 0.13 210)', 'var(--glow-cyan-md)'],
  violet: ['var(--hue-violet)', 'oklch(0.78 0.14 296)', 'oklch(0.60 0.13 296)', 'var(--glow-violet-md)'],
  rose:   ['var(--hue-rose)', 'oklch(0.78 0.14 20)', 'oklch(0.60 0.13 20)', 'var(--glow-rose-md)'],
};

const TINT_FILL = {
  brand:  'var(--glass-tint-brand)',
  magenta:'var(--glass-tint-magenta)',
  lime:   'var(--glass-tint-lime)',
  sky:    'var(--glass-tint-sky)',
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-rose)',
};

const TINT_TEXT = {
  brand:  'oklch(0.92 0.07 277)',
  magenta:'oklch(0.93 0.07 348)',
  lime:   'oklch(0.95 0.09 128)',
  sky:    'oklch(0.93 0.06 240)',
  accent: 'oklch(0.93 0.07 162)',
  cyan:   'oklch(0.93 0.07 210)',
  violet: 'oklch(0.93 0.07 296)',
  amber:  'oklch(0.95 0.07 82)',
  rose:   'oklch(0.93 0.07 20)',
};

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
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const [bloom, setBloom] = React.useState(0);
  const s = SIZE[size] || SIZE.md;
  const off = disabled || loading;

  let fill, color, shadow;
  if (variant === 'gel') {
    const [g, cast, fg] = GEL[tone] || GEL.brand;
    fill = g;
    color = fg;
    shadow = ['var(--gel-rim)', press ? 'var(--shadow-2)' : cast].join(', ');
  } else if (variant === 'solid') {
    const [base, lift, sink, glow] = TONE_SOLID[tone] || TONE_SOLID.accent;
    fill = press ? sink : hover ? lift : base;
    color = tone === 'brand' || tone === 'magenta' || tone === 'violet' || tone === 'rose' ? 'var(--fg-on-brand)' : 'var(--fg-on-accent)';
    shadow = [hover && !press ? glow : 'var(--shadow-2)', 'inset 0 1px 0 oklch(1 0 0 / 0.28)'].join(', ');
  } else if (variant === 'frost') {
    fill = 'var(--glass-frost)';
    color = 'var(--fg-on-light)';
    shadow = [hover && !press ? 'var(--shadow-3)' : 'var(--shadow-2)', 'inset 0 1px 0 oklch(1 0 0 / 0.9)'].join(', ');
  } else if (variant === 'tint') {
    fill = TINT_FILL[tone] || TINT_FILL.accent;
    color = TINT_TEXT[tone] || TINT_TEXT.accent;
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

  return (
    <button
      type="button"
      disabled={off}
      className={['ag-btn', className].filter(Boolean).join(' ')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => { if (press && !off) setBloom((n) => n + 1); setPress(false); }}
      aria-busy={loading || undefined}
      style={{
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
        transform: press ? 'scale(0.955)' : hover && variant === 'gel' ? 'translateY(-1px)' : 'scale(1)',
        filter: variant === 'gel' && hover && !press ? 'brightness(1.08) saturate(1.1)' : undefined,
        opacity: disabled ? 0.42 : loading ? 0.92 : press && variant !== 'gel' ? 0.86 : 1,
        overflow: 'hidden',
        cursor: off ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform ' + (press ? 'var(--dur-instant) var(--ease-glass)' : 'var(--dur-slow) var(--ease-settle)') + ', filter var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass), opacity var(--dur-fast) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      {loading && <LoadField />}
      <PressBloom k={bloom} />
      {iconLeft && <span style={{ position: 'relative', display: 'inline-flex' }}>{iconLeft}</span>}
      <span style={{ position: 'relative' }}>{children}</span>
      {iconRight && <span style={{ position: 'relative', display: 'inline-flex' }}>{iconRight}</span>}
    </button>
  );
}
