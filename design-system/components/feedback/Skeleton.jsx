import React from 'react';

/* Loading placeholder. A shimmer travelling across a well — same
   material logic as everything else, so loading looks like the product
   rather than a grey stand-in. */
export function Skeleton({ width = '100%', height = 14, radius = 'var(--r-pill)', className = '', style, ...rest }) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: 'block',
        width,
        height,
        borderRadius: radius,
        backgroundColor: 'oklch(1 0 0 / 0.04)',
        backgroundImage: 'linear-gradient(100deg, transparent 20%, oklch(1 0 0 / 0.10) 45%, oklch(1 0 0 / 0.16) 50%, oklch(1 0 0 / 0.10) 55%, transparent 80%)',
        backgroundSize: '220% 100%',
        backgroundRepeat: 'no-repeat',
        boxShadow: 'inset 0 1px 2px oklch(0 0 0 / 0.3)',
        animation: 'ag-shimmer 1.6s var(--ease-in-out) infinite',
        ...style,
      }}
      {...rest}
    />
  );
}
