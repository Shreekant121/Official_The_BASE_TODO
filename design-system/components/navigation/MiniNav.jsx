import React from 'react';

/* Reference image 7: a floating pill bar, not a full-width chrome bar.
   The active indicator MORPHS between items — same mechanism as
   SegmentedControl, but icon-first and meant to float over content. */
export function MiniNav({
  items = [],
  value,
  onChange,
  orientation = 'horizontal',
  showLabels = false,
  className = '',
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(items[0] ? items[0].value : null);
  const current = value !== undefined ? value : internal;
  const idx = Math.max(0, items.findIndex((i) => i.value === current));
  const vertical = orientation === 'vertical';
  const pad = 6;
  const cell = 48;

  const pick = (v) => {
    if (value === undefined) setInternal(v);
    if (onChange) onChange(v);
  };

  return (
    <nav
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: 'center',
        gap: 2,
        padding: pad,
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          [vertical ? 'left' : 'top']: pad,
          [vertical ? 'right' : 'bottom']: pad,
          [vertical ? 'top' : 'left']: pad + idx * (cell + 2),
          [vertical ? 'height' : 'width']: cell,
          borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-tint-accent)',
          boxShadow: 'var(--glass-rim-3), var(--glow-accent-sm)',
          transition: (vertical ? 'top' : 'left') + ' var(--dur-morph) var(--ease-morph)',
        }}
      />
      {items.map((it) => {
        const on = it.value === current;
        return (
          <button
            key={it.value}
            type="button"
            aria-label={it.label}
            aria-current={on ? 'page' : undefined}
            onClick={() => pick(it.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              placeItems: 'center',
              gap: 2,
              width: cell,
              height: cell,
              border: 0,
              padding: 0,
              background: 'transparent',
              borderRadius: 'var(--r-pill)',
              color: on ? 'var(--fg-1)' : 'var(--fg-3)',
              cursor: 'pointer',
              transition: 'color var(--dur-base) var(--ease-glass), transform var(--dur-fast) var(--ease-spring)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {it.icon}
            {showLabels && (
              <span style={{ font: 'var(--type-kicker)', letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '0.625rem' }}>{it.label}</span>
            )}
            {it.badge != null && (
              <span style={{ position: 'absolute', top: 6, right: 8, minWidth: 8, height: 8, borderRadius: 'var(--r-pill)', background: 'var(--status-overrun)', boxShadow: '0 0 8px var(--status-overrun)' }} />
            )}
          </button>
        );
      })}
    </nav>
  );
}
