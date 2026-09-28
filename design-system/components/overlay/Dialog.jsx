import React from 'react';

/* A sheet of heavy glass over a darkened, blurred page. Arrives by
   condensing, not sliding. */
export function Dialog({
  open = false,
  title,
  description,
  onClose,
  actions,
  width = 480,
  className = '',
  style,
  children,
  ...rest
}) {
  React.useEffect(() => {
    if (!open) return;
    const esc = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--sp-7)',
        background: 'oklch(0.04 0 0 / 0.62)',
        backdropFilter: 'blur(10px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
        animation: 'ag-condense var(--dur-fast) var(--ease-glass) both',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: width,
          padding: 'var(--pad-sheet)',
          display: 'grid',
          gap: 'var(--sp-6)',
          borderRadius: 'var(--r-sheet)',
          backgroundImage: 'var(--glass-fill-3)',
          backdropFilter: 'var(--glass-bd-xl)',
          WebkitBackdropFilter: 'var(--glass-bd-xl)',
          boxShadow: 'var(--glass-shadow-thick), var(--shadow-5)',
          animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
          ...style,
        }}
        {...rest}
      >
        {title && (
          <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>{title}</h2>
            {description && <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>{description}</p>}
          </div>
        )}
        {children}
        {actions && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>{actions}</div>}
      </div>
    </div>
  );
}
