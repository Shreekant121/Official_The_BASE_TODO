import React from 'react';

/* The product is a linear flow — home → selection → deadlines → focus —
   so it needs a real progress spine. Reference image 19: completed
   steps are filled and emitting, the current one is ringed, future ones
   are wells. The connector fills as you advance. */
export function Stepper({ steps = [], current = 0, orientation = 'horizontal', className = '', style, ...rest }) {
  const items = steps.map((s) => (typeof s === 'string' ? { label: s } : s));
  const vertical = orientation === 'vertical';

  return (
    <ol
      className={className}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: vertical ? 'stretch' : 'flex-start',
        gap: 0,
        margin: 0,
        padding: 0,
        listStyle: 'none',
        ...style,
      }}
      {...rest}
    >
      {items.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const last = i === items.length - 1;

        return (
          <li
            key={i}
            style={{
              display: 'flex',
              flexDirection: vertical ? 'row' : 'column',
              alignItems: vertical ? 'flex-start' : 'center',
              gap: vertical ? 'var(--sp-5)' : 'var(--sp-4)',
              flex: last ? '0 0 auto' : 1,
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 0, width: vertical ? 'auto' : '100%', height: vertical ? '100%' : 'auto' }}>
              <span
                style={{
                  flex: '0 0 auto',
                  width: 30, height: 30,
                  display: 'grid', placeItems: 'center',
                  borderRadius: '50%',
                  backgroundImage: done || now ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
                  boxShadow: done
                    ? 'var(--glass-rim-2), var(--glow-accent-sm)'
                    : now
                      ? 'var(--glass-rim-2), 0 0 0 3px oklch(0.70 0.15 162 / 0.22), var(--glow-accent-sm)'
                      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
                  color: done || now ? 'var(--fg-1)' : 'var(--fg-4)',
                  font: 'var(--type-numeric)',
                  fontSize: 'var(--text-xs)',
                  transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : i + 1}
              </span>
              {!last && (
                <span
                  style={{
                    flex: 1,
                    [vertical ? 'width' : 'height']: 2,
                    [vertical ? 'minHeight' : 'minWidth']: vertical ? 34 : 20,
                    margin: vertical ? 'var(--sp-2) 0' : '0 var(--sp-3)',
                    borderRadius: 'var(--r-pill)',
                    background: done ? 'var(--accent)' : 'oklch(1 0 0 / 0.09)',
                    boxShadow: done ? '0 0 10px -2px var(--accent)' : 'none',
                    transition: 'background var(--dur-slow) var(--ease-glass), box-shadow var(--dur-slow) var(--ease-glass)',
                  }}
                />
              )}
            </div>
            <div style={{ display: 'grid', gap: 2, textAlign: vertical ? 'left' : 'center', paddingBottom: vertical ? 'var(--sp-6)' : 0 }}>
              <span style={{ font: 'var(--type-label)', color: done || now ? 'var(--fg-1)' : 'var(--fg-4)', transition: 'color var(--dur-base) var(--ease-glass)' }}>{s.label}</span>
              {s.hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{s.hint}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
