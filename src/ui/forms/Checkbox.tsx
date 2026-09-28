/**
 * Aurora Glass — Checkbox
 * Ported from design-system/components/forms/Checkbox.{jsx,d.ts} at UI-32.
 * Guidance: design-system/components/forms/Checkbox.prompt.md
 *
 * The last unported member of `forms/`. `screens/focus.html` builds its
 * subtask checklist out of it, which is what finally asked for it —
 * `prompt.md` opens with *"This is the most-pressed control in a task
 * product"*, and Focus Mode had been hand-rolling a `circle` /
 * `circle-check` glyph in its place.
 *
 * Taken from the real file, in full: the 24 / 20px box (`--r-xs` / `--r-2xs`),
 * `--glass-well` while empty and `--glass-tint-accent` under `--glow-accent-sm`
 * when ticked, the 0.96 → 1 spring — one of the four things `motion.css`
 * rations overshoot to — and the tick STROKING on via `stroke-dashoffset`
 * rather than appearing. The label goes `--fg-1` → `--fg-3` and strikes
 * through, which `prompt.md` calls part of the design, *"not decoration — it
 * is how a scanned list separates done from pending without colour."*
 *
 * ON THE EMERALD. Focus Mode's own file argued the opposite for two sessions:
 * that ticking a subtask "is not the session going live, and emerald is
 * rationed to that", so it spent `--status-done` instead. `readme.md` settles
 * it the other way — the accent means *"a running timer, a committed block, a
 * completed task"* — and this component is the design system saying the same
 * thing in code. A completed task is one of the three things emerald is FOR.
 *
 * ADDED, because the prototype has no a11y: the hidden `<input>` is a sibling
 * of the box rather than a child, so `.ag-check__input:focus-visible ~
 * .ag-check__box` can forward the focus ring to the thing the user can see —
 * the same sibling-combinator trick `Slider` uses, and for the same reason.
 * A caller with no visible `label` must pass `aria-label`.
 */
import { useState } from 'react';
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** 24px. `sm` (20px) is for dense tables only — see `prompt.md`. */
  size?: 'sm' | 'md';
  disabled?: boolean;
  label?: ReactNode;
}

export function Checkbox({
  checked,
  defaultChecked = false,
  onChange,
  size = 'md',
  disabled = false,
  label,
  className = '',
  style,
  ...rest
}: CheckboxProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const on = checked !== undefined ? checked : internal;
  const d = size === 'sm' ? 20 : 24;

  const toggle = () => {
    if (disabled) return;
    if (checked === undefined) setInternal(!on);
    onChange?.(!on);
  };

  const box: CSSProperties = {
    position: 'relative',
    flex: '0 0 auto',
    width: d,
    height: d,
    borderRadius: size === 'sm' ? 'var(--r-2xs)' : 'var(--r-xs)',
    display: 'grid',
    placeItems: 'center',
    backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
    boxShadow: on
      ? 'var(--glass-rim-2), var(--glow-accent-sm)'
      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
    /* The spring is on the transform alone: `ease-spring` overshoots, and a
       colour that overshoots lands outside the palette. */
    transform: on ? 'scale(1)' : 'scale(0.96)',
    transition:
      'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-spring)',
  };

  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.42 : 1,
        ...style,
      }}
    >
      <input
        type="checkbox"
        className="ag-check__input"
        checked={on}
        onChange={toggle}
        disabled={disabled}
        {...rest}
      />
      <span className="ag-check__box" style={box}>
        <svg width={d - 8} height={d - 8} viewBox="0 0 16 16" aria-hidden="true" style={{ display: 'block' }}>
          {/* Strokes on rather than appearing — the dash is the whole length
              of the path, so offsetting it by that much hides it exactly. */}
          <path
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none"
            stroke="var(--fg-1)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 16,
              strokeDashoffset: on ? 0 : 16,
              transition: 'stroke-dashoffset var(--dur-base) var(--ease-glass)',
            }}
          />
        </svg>
      </span>
      {label != null && (
        <span
          style={{
            font: 'var(--type-body)',
            color: on ? 'var(--fg-3)' : 'var(--fg-1)',
            textDecorationLine: on ? 'line-through' : 'none',
            textDecorationColor: 'var(--fg-4)',
            transition: 'color var(--dur-base) var(--ease-glass)',
          }}
        >
          {label}
        </span>
      )}
    </label>
  );
}
