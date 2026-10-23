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
 * **Superseded by 29-1P2c1 (2026-10-06): a tick is LIME** — the colour jobs
 * give done, ticked and chosen to lime, and keep emerald for running now.
 * **And by 29-1P4b (2026-10-07, his call): the box is the board's outline** —
 * the well, a lime hairline and a lime check, no fill — drawn by the shared
 * `TickBox`, which pops on a tick; the label's line slides through
 * (`.ag-strike`) instead of appearing. A subtask's tick floats no +1: the
 * tally that +1 adds to counts tasks.
 *
 * ADDED, because the prototype has no a11y: the hidden `<input>` is a sibling
 * of the box rather than a child, so `.ag-check__input:focus-visible ~
 * .ag-check__box` can forward the focus ring to the thing the user can see —
 * the same sibling-combinator trick `Slider` uses, and for the same reason.
 * A caller with no visible `label` must pass `aria-label`.
 */
import { useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cue } from '../../lib/sound';
import { TickBox } from './TickBox';
import { popTick } from './popTick';
import { Strike } from './Strike';

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
  const box = useRef<HTMLSpanElement>(null);

  const toggle = () => {
    if (disabled) return;
    /* 29-1P3: every tick box in BASE sounds and buzzes (117, 118, 122). */
    cue(on ? 'untick' : 'tick');
    /* 29-1P4b: and pops, on the press that ticks it. */
    if (!on) popTick(box.current);
    if (checked === undefined) setInternal(!on);
    onChange?.(!on);
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
      <TickBox ref={box} done={on} size={size === 'sm' ? 20 : 24} />
      {label != null && (
        <span
          style={{
            font: 'var(--type-body)',
            color: on ? 'var(--fg-3)' : 'var(--fg-1)',
            transition: 'color var(--dur-base) var(--ease-glass)',
          }}
        >
          <Strike on={on}>{label}</Strike>
        </span>
      )}
    </label>
  );
}
