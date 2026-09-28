/**
 * Aurora Glass — Switch
 * Ported from design-system/components/forms/Switch.{jsx,d.ts}.
 * Guidance: design-system/components/forms/Switch.prompt.md
 *
 * The knob travels and the trough fills with accent light. Uses the
 * spring curve — toggles, ticks, handles and confirmations are the only
 * places the design system allows overshoot.
 *
 * The off-state trough is a `--glass-well`: a switch is something you
 * put a value INTO, so it reads as carved in until it is live.
 */
import { useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Optional trailing label. Wraps the control in a <label>. */
  label?: ReactNode;
}

export function Switch({
  checked,
  defaultChecked = false,
  onChange,
  size = 'md',
  disabled = false,
  label,
  className = '',
  style,
  ...rest
}: SwitchProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const w = size === 'sm' ? 40 : 52;
  const h = size === 'sm' ? 24 : 30;
  const k = h - 8;

  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    onChange?.(!on);
  };

  const trough: CSSProperties = {
    position: 'relative',
    flex: '0 0 auto',
    width: w,
    height: h,
    padding: 0,
    border: 0,
    borderRadius: 'var(--r-pill)',
    backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
    boxShadow: on
      ? 'var(--glass-rim-2), var(--glow-accent-sm)'
      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.42 : 1,
    transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
    ...style,
  };

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      className={className}
      style={trough}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: on ? w - k - 4 : 4,
          width: k,
          height: k,
          borderRadius: '50%',
          background: on ? 'var(--fg-1)' : 'oklch(1 0 0 / 0.55)',
          boxShadow: '0 2px 6px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.6)',
          transition: 'left var(--dur-base) var(--ease-spring), background var(--dur-base) var(--ease-glass)',
        }}
      />
    </button>
  );

  if (!label) return control;

  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {control}
      <span
        style={{
          font: 'var(--type-label)',
          color: on ? 'var(--fg-1)' : 'var(--fg-3)',
          transition: 'color var(--dur-base) var(--ease-glass)',
        }}
      >
        {label}
      </span>
    </label>
  );
}
