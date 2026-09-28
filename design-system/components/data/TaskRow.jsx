import React from 'react';

/* A row in the list the user lives in. Whole row is the hit target;
   the checkbox is a child of it. Hovering lifts the glass and reveals
   the row actions — they do not occupy space when idle. */
export function TaskRow({
  title,
  meta,
  allocated,
  status,
  done = false,
  selected = false,
  onToggle,
  actions,
  className = '',
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);

  return (
    <div
      className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-5)',
        minHeight: 64,
        padding: 'var(--sp-4) var(--sp-6)',
        borderRadius: 'var(--r-md)',
        backgroundImage: selected ? 'var(--glass-tint-accent)' : hover ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        backdropFilter: 'var(--glass-bd-sm)',
        WebkitBackdropFilter: 'var(--glass-bd-sm)',
        boxShadow: selected
          ? 'var(--glass-rim-2), var(--glow-accent-sm)'
          : hover ? 'var(--glass-rim-2), var(--glass-cast-2)' : 'var(--glass-rim-1)',
        opacity: done ? 0.55 : 1,
        transform: hover ? 'translateX(2px)' : 'translateX(0)',
        transition: 'var(--t-hover)',
        ...style,
      }}
      {...rest}
    >
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? 'Mark not done' : 'Mark done'}
          aria-pressed={done}
          style={{
            flex: '0 0 auto', width: 24, height: 24, padding: 0, border: 0,
            display: 'grid', placeItems: 'center',
            borderRadius: 'var(--r-xs)',
            backgroundImage: done ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
            boxShadow: done ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
            cursor: 'pointer',
            transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 8.5 L6.5 11.5 L12.5 4.5" fill="none" stroke="var(--fg-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ strokeDasharray: 16, strokeDashoffset: done ? 0 : 16, transition: 'stroke-dashoffset var(--dur-base) var(--ease-glass)' }} />
          </svg>
        </button>
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            font: 'var(--type-body)',
            color: done ? 'var(--fg-3)' : 'var(--fg-1)',
            textDecoration: done ? 'line-through' : 'none',
            textDecorationColor: 'var(--fg-4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {title}
        </span>
        {meta && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{meta}</span>}
      </div>

      {allocated != null && (
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
          {allocated}
        </span>
      )}
      {status}
      {actions && (
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flex: '0 0 auto', opacity: hover ? 1 : 0, transform: hover ? 'translateX(0)' : 'translateX(6px)', transition: 'opacity var(--dur-fast) var(--ease-glass), transform var(--dur-base) var(--ease-glass)' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
