/**
 * Aurora Glass — Input
 * Ported from design-system/components/forms/Input.{jsx,d.ts}.
 * Guidance: design-system/components/forms/Input.prompt.md
 *
 * An etched well, not a raised box. The live app already does this
 * (inset shadow on inputs in index.css) and it is correct: on glass,
 * anything you type INTO should look carved in.
 *
 * The inner <input> carries `data-ag-field`, which opts it out of the
 * global `:focus-visible` outline in src/ui/tokens/base.css. That is
 * deliberate: an outline on the inner element would draw a hard
 * rectangle inside the rounded pill. The surrounding well lights up
 * instead. It also carries `.ag-field`, the one rule in screens.css
 * that a `::placeholder` pseudo-element needs a stylesheet for — every
 * placeholder in the system is --fg-4, and an unstyled one next to a
 * Textarea in the same sheet reads a shade off.
 *
 * FIXED ON IMPORT — the source writes its own `onFocus`/`onBlur` and
 * then spreads `{...rest}` AFTER them. Since `rest` still holds the
 * caller's `onFocus`, the spread overwrites the internal handler, so
 * `setFocus` never runs and the well never lights up for any consumer
 * that passes one. Spread moved above the handlers, and the caller's
 * handler is chained rather than replaced.
 */
import { useState } from 'react';
import type { CSSProperties, FocusEvent, InputHTMLAttributes, ReactNode } from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Control height: 38 / 46 / 54px. Not the native `size` attribute. */
  size?: InputSize;
  /** Leading icon node — 16–18px, tints lime (the current one) on focus. */
  iconLeft?: ReactNode;
  /** Trailing unit or hint, set in mono (`min`, `h`, `/ 240`). */
  suffix?: ReactNode;
  invalid?: boolean;
  /** Full width. Defaults to true. */
  block?: boolean;
}

export function Input({
  size = 'md',
  iconLeft,
  suffix,
  invalid = false,
  block = true,
  className = '',
  style,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focus, setFocus] = useState(false);
  const h = size === 'sm' ? 38 : size === 'lg' ? 54 : 46;

  const wellShadow = invalid
    ? 'var(--glass-well-shadow), 0 0 0 1px var(--job-coral-line)'
    : focus
      ? 'var(--glass-well-shadow), var(--job-lime-focus)'
      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)';

  const shell: CSSProperties = {
    display: block ? 'flex' : 'inline-flex',
    width: block ? '100%' : undefined,
    alignItems: 'center',
    gap: 'var(--sp-4)',
    height: h,
    padding: `0 ${size === 'sm' ? 'var(--sp-5)' : 'var(--sp-6)'}`,
    borderRadius: 'var(--r-control)',
    backgroundImage: 'var(--glass-well)',
    boxShadow: wellShadow,
    color: 'var(--fg-1)',
    transition: 'box-shadow var(--dur-base) var(--ease-glass)',
    ...style,
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setFocus(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setFocus(false);
    onBlur?.(e);
  };

  return (
    <div className={className} style={shell}>
      {iconLeft && (
        <span
          style={{
            display: 'flex',
            color: focus ? 'var(--job-lime)' : 'var(--fg-4)',
            transition: 'color var(--dur-base) var(--ease-glass)',
          }}
        >
          {iconLeft}
        </span>
      )}
      <input
        data-ag-field=""
        className="ag-field"
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
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
      {suffix && (
        <span
          style={{
            font: 'var(--type-numeric)',
            fontSize: 'var(--text-xs)',
            color: 'var(--fg-4)',
            whiteSpace: 'nowrap',
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}
