import React from 'react';

/* Bar chart at glanceable size — reference image 16. Bars are glass
   with an accent cap; the active one emits. Deliberately unlabelled:
   this is a shape, not a table. */
export function SparkBars({
  data = [],
  activeIndex,
  height = 72,
  gap = 6,
  labels,
  tone = 'accent',
  className = '',
  style,
  ...rest
}) {
  const peak = Math.max(...data, 1);
  const hue = tone === 'cyan' ? 'var(--hue-cyan)' : 'var(--accent)';

  return (
    <div className={className} style={{ display: 'grid', gap: 'var(--sp-3)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height }}>
        {data.map((v, i) => {
          const on = i === activeIndex;
          const h = Math.max(4, (v / peak) * height);
          return (
            <div
              key={i}
              title={String(v)}
              style={{
                flex: 1,
                height: h,
                minWidth: 6,
                borderRadius: 'var(--r-pill)',
                backgroundImage: on
                  ? 'linear-gradient(180deg, ' + hue + ', oklch(0.70 0.15 162 / 0.45))'
                  : 'linear-gradient(180deg, oklch(1 0 0 / 0.30), oklch(1 0 0 / 0.12))',
                boxShadow: on
                  ? '0 0 14px -2px ' + hue + ', inset 0 1px 0 oklch(1 0 0 / 0.5)'
                  : 'inset 0 1px 0 oklch(1 0 0 / 0.22)',
                transition: 'height var(--dur-slow) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
              }}
            />
          );
        })}
      </div>
      {labels && (
        <div style={{ display: 'flex', gap, font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: 'uppercase', color: 'var(--fg-4)' }}>
          {labels.map((l, i) => (
            <span key={i} style={{ flex: 1, minWidth: 6, textAlign: 'center', color: i === activeIndex ? 'var(--fg-2)' : undefined }}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
