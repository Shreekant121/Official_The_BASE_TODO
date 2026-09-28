import React from 'react';

/* Tab bar as a single glass trough with a pill that MORPHS between
   positions — the DAILY / WEEKLY / MONTHLY switch from the references.
   The indicator animates its left+width, so it visibly travels rather
   than cross-fading. */

export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  className = '',
  style,
  ...rest
}) {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const [internal, setInternal] = React.useState(items[0] ? items[0].value : null);
  const current = value !== undefined ? value : internal;
  const idx = Math.max(0, items.findIndex((o) => o.value === current));
  const h = size === 'sm' ? 34 : 44;
  const pad = 4;

  const select = (v) => {
    if (value === undefined) setInternal(v);
    if (onChange) onChange(v);
  };

  return (
    <div
      role="tablist"
      className={className}
      style={{
        position: 'relative',
        display: 'inline-grid',
        gridAutoFlow: 'column',
        gridAutoColumns: '1fr',
        alignItems: 'stretch',
        padding: pad,
        height: h,
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-1)',
        backdropFilter: 'var(--glass-bd-sm)',
        WebkitBackdropFilter: 'var(--glass-bd-sm)',
        boxShadow: 'var(--glass-rim-1), inset 0 2px 8px -4px oklch(0.105 0.014 265 / 0.8)',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: pad,
          bottom: pad,
          left: `calc(${pad}px + ${idx} * ((100% - ${pad * 2}px) / ${items.length || 1}))`,
          width: `calc((100% - ${pad * 2}px) / ${items.length || 1})`,
          borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-fill-solid)',
          boxShadow: 'var(--glass-rim-3), var(--glass-cast-1)',
          transition: 'left var(--dur-morph) var(--ease-morph), width var(--dur-morph) var(--ease-morph)',
        }}
      />
      {items.map((o) => {
        const on = o.value === current;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => select(o.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--sp-2)',
              minWidth: size === 'sm' ? 66 : 84,
              padding: `0 ${size === 'sm' ? 'var(--sp-5)' : 'var(--sp-6)'}`,
              border: 0,
              background: 'transparent',
              borderRadius: 'var(--r-pill)',
              color: on ? 'var(--fg-1)' : 'var(--fg-3)',
              font: 'var(--type-label)',
              fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
              transition: 'color var(--dur-base) var(--ease-glass)',
            }}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
