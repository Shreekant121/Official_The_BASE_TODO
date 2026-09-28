import React from 'react';

/* ⌘K. Filters as you type; the whole panel is one heavy pane so it
   reads as an instrument surfacing above the app. */
export function CommandPalette({
  open = false,
  commands = [],
  placeholder = 'Search tasks and commands',
  onClose,
  onRun,
  className = '',
  style,
  ...rest
}) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  const hits = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return commands;
    return commands.filter((c) => String(c.label).toLowerCase().includes(n) || String(c.group || '').toLowerCase().includes(n));
  }, [q, commands]);

  React.useEffect(() => { setSel(0); }, [q]);
  React.useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const key = (e) => {
      if (e.key === 'Escape') { if (onClose) onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === 'Enter') {
        const hit = hits[sel];
        if (hit) { if (hit.onSelect) hit.onSelect(); if (onRun) onRun(hit); if (onClose) onClose(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, hits, sel, onClose, onRun]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 110,
        display: 'grid', justifyItems: 'center', alignItems: 'start',
        paddingTop: '14vh', paddingLeft: 'var(--sp-7)', paddingRight: 'var(--sp-7)',
        background: 'oklch(0.04 0 0 / 0.55)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className={className}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560,
          borderRadius: 'var(--r-xl)',
          backgroundImage: 'var(--glass-fill-3)',
          backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
          boxShadow: 'var(--glass-shadow-thick), var(--shadow-5)',
          overflow: 'hidden',
          animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
          ...style,
        }}
        {...rest}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', padding: 'var(--sp-6) var(--sp-7)', borderBottom: '1px solid var(--line-soft)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ color: 'var(--fg-4)', flex: '0 0 auto' }}>
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M16.5 16.5 21 21" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-base)' }}
          />
          <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)', padding: '3px 7px', borderRadius: 'var(--r-2xs)', boxShadow: 'inset 0 0 0 1px var(--line-soft)' }}>ESC</span>
        </div>

        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 'var(--sp-3)' }}>
          {hits.length === 0 && (
            <div style={{ padding: 'var(--sp-8)', textAlign: 'center', font: 'var(--type-body)', color: 'var(--fg-4)' }}>No matches.</div>
          )}
          {hits.map((c, i) => (
            <button
              key={c.value || i}
              type="button"
              onMouseEnter={() => setSel(i)}
              onClick={() => { if (c.onSelect) c.onSelect(); if (onRun) onRun(c); if (onClose) onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                width: '100%', minHeight: 46, padding: '0 var(--sp-5)',
                border: 0, textAlign: 'left', cursor: 'pointer',
                borderRadius: 'var(--r-sm)',
                background: i === sel ? 'oklch(1 0 0 / 0.10)' : 'transparent',
                color: i === sel ? 'var(--fg-1)' : 'var(--fg-2)',
                font: 'var(--type-body)',
                transition: 'background var(--dur-instant) var(--ease-glass), color var(--dur-instant) var(--ease-glass)',
              }}
            >
              {c.icon && <span style={{ display: 'flex', flex: '0 0 auto', color: i === sel ? 'var(--accent)' : 'var(--fg-4)' }}>{c.icon}</span>}
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
              {c.group && <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: 'uppercase', color: 'var(--fg-4)' }}>{c.group}</span>}
              {c.shortcut && <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{c.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
