import React from 'react';

/* Text-led tabs with an underline that slides. For in-page section
   switching where SegmentedControl would be too heavy. */
export function Tabs({ tabs = [], value, onChange, className = '', style, ...rest }) {
  const items = tabs.map((t) => (typeof t === 'string' ? { value: t, label: t } : t));
  const [internal, setInternal] = React.useState(items[0] ? items[0].value : null);
  const current = value !== undefined ? value : internal;
  const refs = React.useRef({});
  const [bar, setBar] = React.useState({ left: 0, width: 0 });

  React.useEffect(() => {
    const el = refs.current[current];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [current, items.length]);

  const pick = (v) => {
    if (value === undefined) setInternal(v);
    if (onChange) onChange(v);
  };

  return (
    <div
      role="tablist"
      className={className}
      style={{ position: 'relative', display: 'flex', gap: 'var(--sp-7)', borderBottom: '1px solid var(--line-soft)', ...style }}
      {...rest}
    >
      {items.map((t) => {
        const on = t.value === current;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            ref={(el) => { refs.current[t.value] = el; }}
            onClick={() => pick(t.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-4) 0',
              border: 0,
              background: 'transparent',
              color: on ? 'var(--fg-1)' : 'var(--fg-3)',
              font: 'var(--type-label)',
              fontSize: 'var(--text-md)',
              cursor: 'pointer',
              transition: 'color var(--dur-base) var(--ease-glass)',
            }}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: on ? 'var(--accent)' : 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>{t.count}</span>
            )}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -1,
          left: bar.left,
          width: bar.width,
          height: 2,
          borderRadius: 'var(--r-pill)',
          background: 'var(--accent)',
          boxShadow: '0 0 12px -1px var(--accent)',
          transition: 'left var(--dur-base) var(--ease-morph), width var(--dur-base) var(--ease-morph)',
        }}
      />
    </div>
  );
}
