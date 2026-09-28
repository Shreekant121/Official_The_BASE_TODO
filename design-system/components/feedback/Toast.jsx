import React from 'react';

/* Transient confirmation. Condenses into view, holds, dissolves out.
   Frost-free: toasts are level-3 glass so they read over anything. */
export function Toast({ icon, title, detail, tone = 'accent', onDismiss, className = '', style, ...rest }) {
  const hue = {
    accent: 'var(--accent)',
    review: 'var(--status-review)',
    overrun: 'var(--status-overrun)',
    neutral: 'var(--fg-2)',
  }[tone] || 'var(--accent)';

  return (
    <div
      role="status"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-5)',
        padding: 'var(--sp-5) var(--sp-6)',
        minWidth: 280,
        maxWidth: 420,
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-3)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-thick)',
        animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%', color: hue, flex: '0 0 auto', boxShadow: '0 0 0 1px ' + hue + '55' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{title}</span>
        {detail && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{detail}</span>}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ flex: '0 0 auto', width: 26, height: 26, display: 'grid', placeItems: 'center', border: 0, background: 'transparent', borderRadius: '50%', color: 'var(--fg-4)', cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}
