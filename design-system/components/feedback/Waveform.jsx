import React from 'react';

/* Reference image 5: voice input as a live bar field. Bars are driven
   by CSS keyframes with per-bar delays, so nothing is animated in JS
   and the whole thing costs one paint. Idle collapses to a flat line. */
export function Waveform({ bars = 28, active = true, height = 44, tone = 'accent', className = '', style, ...rest }) {
  const hue = tone === 'white' ? 'var(--fg-1)' : 'var(--accent)';
  const seed = React.useMemo(
    () => Array.from({ length: bars }, (_, i) => {
      const t = i / Math.max(bars - 1, 1);
      const env = Math.sin(t * Math.PI);
      return { dur: 700 + ((i * 137) % 520), delay: (i * 61) % 700, scale: 0.28 + env * 0.72 };
    }),
    [bars]
  );

  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height, ...style }}
      {...rest}
    >
      {seed.map((b, i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: active ? Math.max(6, height * b.scale) : 3,
            borderRadius: 'var(--r-pill)',
            background: hue,
            boxShadow: active ? '0 0 8px -1px ' + hue : 'none',
            opacity: active ? 0.55 + b.scale * 0.45 : 0.3,
            transformOrigin: 'center',
            animation: active ? `ag-bar ${b.dur}ms var(--ease-in-out) ${b.delay}ms infinite` : 'none',
            transition: 'height var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass)',
          }}
        />
      ))}
    </div>
  );
}
