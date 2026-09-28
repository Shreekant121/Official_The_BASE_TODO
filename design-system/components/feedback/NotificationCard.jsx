import React from 'react';

/* Reference image 2: a collapsed notification that EXPANDS in place on
   click rather than opening a new surface. Collapsed shows icon, title,
   time. Expanded grows to reveal body and actions. The height animates,
   so it reads as one object changing shape. */
export function NotificationCard({
  icon,
  title,
  time,
  body,
  actions,
  tone = 'neutral',
  unread = false,
  defaultOpen = false,
  open,
  onToggle,
  className = '',
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(defaultOpen);
  const [hover, setHover] = React.useState(false);
  const isOpen = open !== undefined ? open : internal;
  const bodyRef = React.useRef(null);

  const toggle = () => {
    if (open === undefined) setInternal(!isOpen);
    if (onToggle) onToggle(!isOpen);
  };

  const hue = {
    neutral: 'var(--fg-3)',
    accent: 'var(--accent)',
    review: 'var(--status-review)',
    overrun: 'var(--status-overrun)',
  }[tone] || 'var(--fg-3)';

  return (
    <div
      className={className}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        borderRadius: 'var(--r-card)',
        backgroundImage: hover || isOpen ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: isOpen
          ? 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-3)'
          : hover ? 'var(--glass-rim-2), var(--glass-cast-2)' : 'var(--glass-rim-2), var(--glass-cast-1)',
        overflow: 'hidden',
        transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
          width: '100%', minHeight: 68,
          padding: 'var(--sp-5) var(--sp-6)',
          border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer',
        }}
      >
        {icon && (
          <span
            style={{
              flex: '0 0 auto', width: 38, height: 38, display: 'grid', placeItems: 'center',
              borderRadius: 'var(--r-circle)',
              backgroundImage: 'var(--glass-fill-2)',
              boxShadow: 'var(--glass-rim-2)',
              color: hue,
            }}
          >
            {icon}
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            {unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)', flex: '0 0 auto' }} />}
            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
          </span>
          {!isOpen && body && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{body}</span>
          )}
        </span>
        {time && <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)', flex: '0 0 auto' }}>{time}</span>}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ flex: '0 0 auto', color: 'var(--fg-4)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--dur-base) var(--ease-morph)' }}>
          <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div
        ref={bodyRef}
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 var(--sp-6) var(--sp-6)', paddingLeft: icon ? 'calc(var(--sp-6) + 38px + var(--sp-5))' : 'var(--sp-6)', display: 'grid', gap: 'var(--sp-5)' }}>
            {body && <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{body}</p>}
            {actions && <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>{actions}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
