import React from 'react';

/* One number, one label, one trend. The reference cards all work
   because the numeral is enormous and everything else gets out of its
   way. Kicker above, numeral, delta below. Nothing else. */
export function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaDirection,
  hint,
  glow = false,
  size = 'md',
  className = '',
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const up = deltaDirection === 'up';
  const good = deltaDirection === 'up' ? 'var(--status-done)' : deltaDirection === 'down' ? 'var(--status-overrun)' : 'var(--fg-3)';

  return (
    <div
      className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'grid',
        gap: 'var(--sp-4)',
        alignContent: 'start',
        padding: size === 'lg' ? 'var(--pad-card-lg)' : 'var(--pad-card)',
        borderRadius: 'var(--r-card)',
        backgroundImage: hover ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: [
          'var(--glass-rim-2)',
          'var(--glass-inner-1)',
          hover ? 'var(--glass-cast-3)' : 'var(--glass-cast-2)',
          glow ? 'var(--glow-accent-sm)' : null,
        ].filter(Boolean).join(', '),
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'var(--t-hover)',
        ...style,
      }}
      {...rest}
    >
      <span className="ag-kicker">{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
        <span
          style={{
            font: size === 'lg' ? 'var(--type-display)' : 'var(--type-metric)',
            color: 'var(--fg-1)',
            letterSpacing: 'var(--tracking-display)',
            fontVariantNumeric: 'tabular-nums',
            textShadow: glow ? 'var(--text-glow-accent)' : undefined,
          }}
        >
          {value}
        </span>
        {unit && <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{unit}</span>}
      </div>
      {(delta || hint) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)' }}>
          {delta && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: good, font: 'var(--type-numeric)', fontSize: 'var(--text-xs)' }}>
              {deltaDirection && (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                  <path d={up ? 'M5 8.5V2M5 2 2 5M5 2l3 3' : 'M5 1.5V8M5 8l3-3M5 8 2 5'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {delta}
            </span>
          )}
          {hint && <span style={{ color: 'var(--fg-4)' }}>{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}
