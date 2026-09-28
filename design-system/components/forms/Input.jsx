import React from 'react';

/* An etched well, not a raised box. The live app already does this
   (inset shadow on inputs in index.css) and it is correct: on glass,
   anything you type INTO should look carved in. */
export function Input({
  size = 'md',
  iconLeft,
  suffix,
  invalid = false,
  block = true,
  className = '',
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const h = size === 'sm' ? 38 : size === 'lg' ? 54 : 46;

  return (
    <div
      className={className}
      style={{
        display: block ? 'flex' : 'inline-flex',
        width: block ? '100%' : undefined,
        alignItems: 'center',
        gap: 'var(--sp-4)',
        height: h,
        padding: `0 ${size === 'sm' ? 'var(--sp-5)' : 'var(--sp-6)'}`,
        borderRadius: 'var(--r-control)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: invalid
          ? 'var(--glass-well-shadow), 0 0 0 1px oklch(0.70 0.15 20 / 0.7)'
          : focus
            ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
            : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        color: 'var(--fg-1)',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
        ...style,
      }}
    >
      {iconLeft && <span style={{ display: 'flex', color: focus ? 'var(--accent)' : 'var(--fg-4)', transition: 'color var(--dur-base) var(--ease-glass)' }}>{iconLeft}</span>}
      <input
        data-ag-field=""
        onFocus={(e) => { setFocus(true); if (rest.onFocus) rest.onFocus(e); }}
        onBlur={(e) => { setFocus(false); if (rest.onBlur) rest.onBlur(e); }}
        {...rest}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 'none',
          boxShadow: 'none',
          background: 'transparent',
          color: 'inherit',
          font: 'var(--type-body)',
          fontSize: size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)',
          letterSpacing: 'var(--tracking-ui)',
        }}
      />
      {suffix && <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>{suffix}</span>}
    </div>
  );
}
