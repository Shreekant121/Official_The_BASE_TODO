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
 *
 * A SWITCH THAT STRETCHES (idea 73, 29-1P1). Inside a V3 scope — the whole
 * app — holding a switch stretches its knob toward where it is going; let
 * go and it springs across, and an on track lights LIME, not emerald: his
 * call (2026-09-30), since "on" is lime's job (today, done, the current
 * one) and emerald's is something running. Every switch in BASE is this
 * component, so they all changed at once. Nothing moves at rest.
 */
import { useState } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useV3 } from '../core/v3Context';

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
  const v3 = useV3();
  const [internal, setInternal] = useState(defaultChecked);
  const [held, setHeld] = useState(false);
  const on = checked !== undefined ? checked : internal;
  const w = size === 'sm' ? 40 : 52;
  const h = size === 'sm' ? 24 : 30;
  const k = h - 8;
  /* How far a held knob reaches toward the other side. */
  const reach = v3 && held && !disabled ? (size === 'sm' ? 5 : 6) : 0;

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
    backgroundImage: on ? (v3 ? 'none' : 'var(--glass-tint-accent)') : 'var(--glass-well)',
    backgroundColor: on && v3 ? 'var(--job-lime)' : undefined,
    boxShadow: on
      ? v3
        ? 'inset 0 1px 1px oklch(1 0 0 / 0.35), 0 0 16px -2px color-mix(in oklch, var(--job-lime) 60%, transparent)'
        : 'var(--glass-rim-2), var(--glow-accent-sm)'
      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.42 : 1,
    transition: 'background var(--dur-base) var(--ease-glass), background-color var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
    ...style,
  };

  const control = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={toggle}
      onPointerDown={v3 ? () => setHeld(true) : undefined}
      onPointerUp={v3 ? () => setHeld(false) : undefined}
      onPointerLeave={v3 ? () => setHeld(false) : undefined}
      onPointerCancel={v3 ? () => setHeld(false) : undefined}
      className={className}
      style={trough}
      {...rest}
    >
      <span
        style={{
          position: 'absolute',
          top: 4,
          left: on ? w - k - 4 - reach : 4,
          width: k + reach,
          height: k,
          borderRadius: k / 2,
          background: on ? 'var(--fg-1)' : 'oklch(1 0 0 / 0.55)',
          boxShadow: '0 2px 6px oklch(0 0 0 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.6)',
          transition: v3
            ? 'left var(--dur-slow) var(--ease-springy), width var(--dur-fast) var(--ease-glide), background var(--dur-base) var(--ease-glass)'
            : 'left var(--dur-base) var(--ease-spring), background var(--dur-base) var(--ease-glass)',
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
