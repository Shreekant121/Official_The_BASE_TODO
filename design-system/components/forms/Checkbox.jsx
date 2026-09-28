import React from 'react';

/* Task completion is the single most-pressed control in this product,
   so it gets real feedback: the box fills, the tick draws, and the
   whole control springs. */
export function Checkbox({ checked, defaultChecked = false, onChange, size = 'md', disabled = false, label, className = '', style, ...rest }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const d = size === 'sm' ? 20 : 24;

  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    if (onChange) onChange(!on);
  };

  const box = (
    <span
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: d,
        height: d,
        borderRadius: size === 'sm' ? 'var(--r-2xs)' : 'var(--r-xs)',
        display: 'grid',
        placeItems: 'center',
        backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
        boxShadow: on
          ? 'var(--glass-rim-2), var(--glow-accent-sm)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
        transform: on ? 'scale(1)' : 'scale(0.96)',
        transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-spring)',
      }}
    >
      <svg width={d - 8} height={d - 8} viewBox="0 0 16 16" aria-hidden="true" style={{ display: 'block' }}>
        <path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="var(--fg-1)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 16,
            strokeDashoffset: on ? 0 : 16,
            transition: 'stroke-dashoffset var(--dur-base) var(--ease-glass)',
          }}
        />
      </svg>
    </span>
  );

  return (
    <label
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.42 : 1, ...style }}
    >
      <input type="checkbox" checked={on} onChange={toggle} disabled={disabled} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} {...rest} />
      {box}
      {label && (
        <span style={{ font: 'var(--type-body)', color: on ? 'var(--fg-3)' : 'var(--fg-1)', textDecoration: on ? 'line-through' : 'none', textDecorationColor: 'var(--fg-4)', transition: 'color var(--dur-base) var(--ease-glass)' }}>
          {label}
        </span>
      )}
    </label>
  );
}
