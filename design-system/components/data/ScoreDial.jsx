import React from 'react';

/* PRIORITY SCORE — a measured number, so it is mono, and it sits in a
   small rectangle: a carved well while the score is ordinary, an amber
   pane once it crosses the urgent threshold. The rectangle carries the
   colour, so the number stays readable at 11px.

   Deliberately not a pill and not a ring: pills are controls in this
   system, and a ring reads as progress. This is a value in a slot. */

const DIMS = {
  sm: [22, 'var(--text-2xs)', 'var(--sp-3)'],
  md: [28, 'var(--text-sm)',  'var(--sp-4)'],
  lg: [40, 'var(--text-xl)',  'var(--sp-5)'],
};

export function ScoreDial({
  value = 0,
  max = 13.5,
  size = 'sm',
  threshold = 10,
  showMax = false,
  label,
  className = '',
  style,
  ...rest
}) {
  const [h, fontSize, pad] = DIMS[size] || DIMS.sm;
  const urgent = value >= threshold;

  return (
    <span
      className={className}
      title={value.toFixed(1) + ' of ' + max}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
        height: h, padding: '0 ' + pad, borderRadius: 'var(--r-xs)',
        backgroundImage: urgent ? 'var(--glass-tint-amber)' : 'var(--glass-well)',
        boxShadow: urgent ? 'var(--glass-rim-1)' : 'var(--glass-well-shadow)',
        font: 'var(--type-numeric)', fontSize,
        fontVariantNumeric: 'tabular-nums',
        color: urgent ? 'var(--hue-amber)' : 'var(--fg-1)',
        whiteSpace: 'nowrap',
        transition: 'background var(--dur-base) var(--ease-glass), color var(--dur-base) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      {value.toFixed(1)}
      {showMax && (
        <span style={{ font: 'var(--type-kicker)', color: urgent ? 'var(--hue-amber)' : 'var(--fg-4)', opacity: urgent ? 0.72 : 1 }}>
          /{max}
        </span>
      )}
      {label && (
        <span style={{ font: 'var(--type-kicker)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-3)', marginLeft: 2 }}>
          {label}
        </span>
      )}
    </span>
  );
}
