import React from 'react';

/* The knob travels and the trough fills with accent light. Uses the
   spring curve — this is one of the few places overshoot is welcome. */
export function Switch({ checked, defaultChecked = false, onChange, size = 'md', disabled = false, label, className = '', style, ...rest }) {
  const [internal, setInternal] = React.useState(defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const w = size === 'sm' ? 40 : 52;
  const h = size === 'sm' ? 24 : 30;
  const k = h - 8;

  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    if (onChange) onChange(!on);
  };

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={className}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: w,
        height: h,
        padding: 0,
        border: 0,
        borderRadius: 'var(--r-pill)',
        backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
        boxShadow: on
          ? 'var(--glass-rim-2), var(--glow-accent-sm)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.42 : 1,
        transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: on ? w - k - 4 : 4,
          width: k,
          height: k,
          borderRadius: '50%',
          background: on ? 'var(--fg-1)' : 'oklch(1 0 0 / 0.55)',
          boxShadow: '0 2px 6px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.6)',
          transition: 'left var(--dur-base) var(--ease-spring), background var(--dur-base) var(--ease-glass)',
        }}
      />
    </button>
  );

  if (!label) return control;
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      {control}
      <span style={{ font: 'var(--type-label)', color: on ? 'var(--fg-1)' : 'var(--fg-3)', transition: 'color var(--dur-base) var(--ease-glass)' }}>{label}</span>
    </label>
  );
}
