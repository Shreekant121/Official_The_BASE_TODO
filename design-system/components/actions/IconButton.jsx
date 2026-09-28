import React from 'react';

/* The round glass affordance from the references: a circle of glass
   holding one 1.5-stroke line icon and nothing else. */


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

const SIZE = { sm: 34, md: 44, lg: 54, xl: 64 };

const TINT = {
  accent: 'var(--glass-tint-accent)',
  cyan:   'var(--glass-tint-cyan)',
  violet: 'var(--glass-tint-violet)',
  amber:  'var(--glass-tint-amber)',
  rose:   'var(--glass-tint-rose)',
  frost:  'var(--glass-frost)',
  brand:  'var(--glass-tint-brand)',
  magenta:'var(--glass-tint-magenta)',
  lime:   'var(--glass-tint-lime)',
  sky:    'var(--glass-tint-sky)',
};
const GEL = { brand: 'var(--gel-brand)', violet: 'var(--gel-violet)', magenta: 'var(--gel-magenta)', accent: 'var(--gel-emerald)', amber: 'var(--gel-amber)', coral: 'var(--gel-coral)', sky: 'var(--gel-sky)' };
const CAST = { brand: 'var(--cast-brand)', violet: 'var(--cast-violet)', magenta: 'var(--cast-magenta)', accent: 'var(--cast-emerald)', amber: 'var(--cast-amber)', coral: 'var(--cast-magenta)', sky: 'var(--cast-brand)' };

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
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const [bloom, setBloom] = React.useState(0);
  const d = SIZE[size] || SIZE.md;

  let fill = hover ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)';
  let color = 'var(--fg-1)';
  let shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--glass-cast-2)' : 'var(--glass-cast-1)'].join(', ');

  if (variant === 'ghost') {
    fill = hover ? 'var(--glass-fill-1)' : 'transparent';
    color = hover ? 'var(--fg-1)' : 'var(--fg-3)';
    shadow = 'none';
  } else if (variant === 'gel') {
    const t = tone || 'brand';
    fill = GEL[t] || GEL.brand;
    color = t === 'amber' ? 'var(--fg-on-light)' : t === 'accent' ? 'var(--fg-on-accent)' : 'var(--fg-on-brand)';
    shadow = ['var(--gel-rim)', press ? 'var(--shadow-2)' : (CAST[t] || CAST.brand)].join(', ');
  } else if (variant === 'tint' && tone) {
    fill = TINT[tone];
    color = tone === 'frost' ? 'var(--fg-on-light)' : 'var(--fg-1)';
    shadow = ['var(--glass-rim-2)', hover && !press ? 'var(--shadow-3)' : 'var(--glass-cast-1)'].join(', ');
  }
  if (active) {
    shadow = shadow + ', var(--glow-brand-sm)';
    color = 'var(--fg-1)';
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onPointerDown={() => setPress(true)}
      onPointerUp={() => { if (press && !disabled) setBloom((b) => b + 1); setPress(false); }}
      className={['ag-icon-btn', className].filter(Boolean).join(' ')}
      style={{
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
        backdropFilter: variant === 'ghost' || variant === 'gel' ? undefined : 'var(--glass-bd-md)',
        WebkitBackdropFilter: variant === 'ghost' || variant === 'gel' ? undefined : 'var(--glass-bd-md)',
        boxShadow: shadow,
        transform: press ? 'scale(0.94)' : 'scale(1)',
        opacity: disabled ? 0.42 : press && variant !== 'gel' ? 0.8 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform ' + (press ? 'var(--dur-instant) var(--ease-glass)' : 'var(--dur-slow) var(--ease-settle)') + ', color var(--dur-fast) var(--ease-glass), opacity var(--dur-fast) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      <PressBloom k={bloom} />
      {children}
      {badge != null && (
        <span
          style={{
            position: 'absolute', top: -2, right: -2,
            minWidth: 20, height: 20, padding: '0 5px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--r-pill)',
            background: 'oklch(0.63 0.21 25)',
            color: '#fff',
            font: 'var(--type-label)',
            fontSize: 12,
            fontWeight: 700,
            boxShadow: '0 3px 8px oklch(0.4 0.18 25 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
