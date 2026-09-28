import React from 'react';

/* Allocating minutes to a task. Track is a well, fill is accent light,
   and the handle is a frost bead that scales on grab. */
export function Slider({
  value,
  defaultValue = 50,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  format,
  showValue = true,
  disabled = false,
  className = '',
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(defaultValue);
  const [grab, setGrab] = React.useState(false);
  const v = value !== undefined ? value : internal;
  const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;

  const handle = (e) => {
    const n = Number(e.target.value);
    if (value === undefined) setInternal(n);
    if (onChange) onChange(n);
  };

  return (
    <div className={className} style={{ display: 'grid', gap: 'var(--sp-3)', ...style }}>
      <div style={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', inset: '0 0', top: 11, height: 6, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)' }} />
        <div
          style={{
            position: 'absolute', left: 0, top: 11, height: 6, width: pct + '%',
            borderRadius: 'var(--r-pill)',
            background: 'linear-gradient(90deg, oklch(0.70 0.15 162 / 0.5), var(--accent))',
            boxShadow: '0 0 14px -2px oklch(0.70 0.15 162 / 0.6)',
            transition: grab ? 'none' : 'width var(--dur-base) var(--ease-glass)',
          }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 'calc(' + pct + '% - ' + (grab ? 11 : 9) + 'px)',
            top: grab ? 3 : 5,
            width: grab ? 22 : 18,
            height: grab ? 22 : 18,
            borderRadius: '50%',
            background: 'var(--fg-1)',
            boxShadow: '0 3px 10px oklch(0 0 0 / 0.55), var(--glow-accent-sm)',
            transition: 'width var(--dur-fast) var(--ease-spring), height var(--dur-fast) var(--ease-spring), top var(--dur-fast) var(--ease-spring), left ' + (grab ? '0ms' : 'var(--dur-base) var(--ease-glass)'),
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={v}
          disabled={disabled}
          onChange={handle}
          onPointerDown={() => setGrab(true)}
          onPointerUp={() => setGrab(false)}
          onBlur={() => setGrab(false)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'grab' }}
          {...rest}
        />
      </div>
      {showValue && (
        <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)' }}>
          <span>{format ? format(min) : min}</span>
          <span style={{ color: 'var(--accent)' }}>{format ? format(v) : v}</span>
          <span>{format ? format(max) : max}</span>
        </div>
      )}
    </div>
  );
}
