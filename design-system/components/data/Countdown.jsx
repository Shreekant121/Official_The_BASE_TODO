import React from 'react';

/* Focus mode's centrepiece. Light-weight mono at display size, because
   a bold countdown feels like a threat. Goes rose and stops emitting
   when the allocation is blown. */
export function Countdown({
  seconds = 0,
  total,
  running = false,
  size = 'lg',
  label,
  className = '',
  style,
  ...rest
}) {
  const over = seconds < 0;
  const abs = Math.abs(seconds);
  const hh = Math.floor(abs / 3600);
  const mm = Math.floor((abs % 3600) / 60);
  const ss = abs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const text = (hh > 0 ? hh + ':' : '') + pad(mm) + ':' + pad(ss);
  const hue = over ? 'var(--status-overrun)' : 'var(--fg-1)';

  return (
    <div className={className} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)', ...style }} {...rest}>
      {label && <span className="ag-kicker">{label}</span>}
      <span
        style={{
          font: size === 'lg' ? 'var(--type-timer)' : 'var(--type-display)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 'var(--weight-light)',
          color: hue,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          textShadow: over ? '0 0 28px oklch(0.70 0.15 20 / 0.5)' : running ? 'var(--text-glow-white)' : 'none',
          transition: 'color var(--dur-base) var(--ease-glass), text-shadow var(--dur-base) var(--ease-glass)',
        }}
      >
        {over ? '+' : ''}{text}
      </span>
      {total != null && (
        <div style={{ width: '100%', maxWidth: 260, height: 4, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: Math.min(100, over ? 100 : ((total - seconds) / Math.max(total, 1)) * 100) + '%',
              borderRadius: 'var(--r-pill)',
              background: over ? 'var(--status-overrun)' : 'var(--accent)',
              boxShadow: '0 0 12px -1px ' + (over ? 'var(--status-overrun)' : 'var(--accent)'),
              transition: 'width 1s linear, background var(--dur-base) var(--ease-glass)',
            }}
          />
        </div>
      )}
    </div>
  );
}
