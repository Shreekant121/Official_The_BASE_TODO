import React from 'react';

/* A status is a hue plus a word plus a dot. The dot pulses only when
   the state is genuinely live — that is the whole signalling system. */

const MAP = {
  running:    ['var(--status-running)',    'var(--glass-tint-accent)', true],
  queued:     ['var(--status-queued)',     'var(--glass-tint-cyan)',   false],
  review:     ['var(--status-review)',     'var(--glass-tint-amber)',  false],
  done:       ['var(--status-done)',       'var(--glass-tint-accent)', false],
  overrun:    ['var(--status-overrun)',    'var(--glass-tint-rose)',   true],
  backburner: ['var(--status-backburner)', 'var(--glass-tint-violet)', false],
  archived:   ['var(--status-archived)',   'var(--glass-fill-1)',      false],
};

export function StatusPill({ status = 'queued', children, size = 'md', dot = true, className = '', style, ...rest }) {
  const [hue, fill, live] = MAP[status] || MAP.queued;
  const h = size === 'sm' ? 24 : 30;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        height: h,
        padding: `0 ${size === 'sm' ? 'var(--sp-4)' : 'var(--sp-5)'}`,
        borderRadius: 'var(--r-pill)',
        backgroundImage: fill,
        boxShadow: 'var(--glass-rim-1)',
        backdropFilter: 'var(--glass-bd-sm)',
        WebkitBackdropFilter: 'var(--glass-bd-sm)',
        font: 'var(--type-kicker)',
        fontSize: size === 'sm' ? 'var(--text-2xs)' : 'var(--text-xs)',
        letterSpacing: 'var(--tracking-kicker)',
        textTransform: 'uppercase',
        color: hue,
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6, flex: '0 0 auto' }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: hue, boxShadow: '0 0 8px ' + hue }} />
          {live && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: hue, animation: 'ag-ripple 1.8s var(--ease-in-out) infinite' }} />}
        </span>
      )}
      {children || status}
    </span>
  );
}
