/**
 * The soft family (29-1P1, BIG-15) — dark neumorphism, from his
 * "Neumorphism Design" folder: raised off the page at rest, pressed into it
 * while held. Four of the design system's thirteen buttons, one file because
 * they are one material. States are in `buttons.css`.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ColourJob } from '../core/colourJobs';
import { RollingNumber } from '../data/RollingNumber';

type Native = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * `md` is 44px, the touch target. `sm` is 36px, for a row of small controls
 * that sit on one line with what they change (Focus's +5m, a sheet's
 * steppers) — the same rule `Button size="sm"` follows (29-1P2).
 */
type SoftSize = 'sm' | 'md';
const sizeClass = (size: SoftSize) => (size === 'sm' ? 'ds-soft--sm' : '');

/**
 * SoftButton — everyday second actions: Edit, + Add widget, Not now, Select.
 * Presses in while held. Not for a screen's main action (that is a
 * `GelButton`) and not for a confirm (`WhiteButton`).
 */
export function SoftButton({
  className = '', icon, size = 'md', children, ...rest
}: Native & { icon?: ReactNode; size?: SoftSize }) {
  return (
    <button type="button" className={['ds-soft', sizeClass(size), className].filter(Boolean).join(' ')} {...rest}>
      {icon}
      {children}
    </button>
  );
}

/**
 * SoftToggle — an on/off that stays pressed in while it is on: Focus's
 * pure-focus toggles, a Settings switch that deserves a button. For a plain
 * setting row use `Switch`; this is for an on/off that sits among buttons.
 */
export function SoftToggle({
  pressed, onPressedChange, className = '', icon, size = 'md', round = false, children, onClick, ...rest
}: Omit<Native, 'onChange'> & {
  pressed: boolean;
  onPressedChange?: (next: boolean) => void;
  icon?: ReactNode;
  size?: SoftSize;
  /** Icon only, round, like `SoftIconButton` — then `aria-label` is required. */
  round?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={['ds-soft', sizeClass(size), round && 'ds-soft--round', className].filter(Boolean).join(' ')}
      onClick={(e) => { onClick?.(e); onPressedChange?.(!pressed); }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * SoftIconButton — a round soft button holding one icon: the ↗ in a block's
 * corner, a header's icon buttons. `label` is its only name, so it is
 * required.
 */
export function SoftIconButton({
  label, className = '', size = 'md', children, ...rest
}: Native & { label: string; size?: SoftSize }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={['ds-soft ds-soft--round', sizeClass(size), className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * CountChip — a filter that says how many are behind it: "Overdue 6", the
 * nav's counts (Gmail's inbox counts). The badge takes the colour of what it
 * counts — coral for overdue, sky for dates — or stays neutral. `pressed`
 * holds it in while its filter is on. A count of zero still draws, as 0:
 * hide the chip instead if nothing should show.
 */
export function CountChip({
  count, colour = 'neutral', pressed, className = '', children, ...rest
}: Native & { count: number; colour?: ColourJob | 'neutral'; pressed?: boolean }) {
  const neutral = colour === 'neutral';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={['ds-soft', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
      <span
        style={{
          display: 'inline-grid', placeItems: 'center', minWidth: 22, height: 22, padding: '0 6px',
          borderRadius: 'var(--r-2xs)',
          font: 'var(--weight-semi) var(--text-xs) / 1 var(--font-numeric)',
          fontVariantNumeric: 'tabular-nums',
          color: neutral ? 'var(--fg-1)' : `var(--job-${colour}-deep)`,
          backgroundColor: neutral ? 'oklch(1 0 0 / 0.14)' : `var(--job-${colour})`,
        }}
      >
        {/* 29-1P4c, idea 49: rolls to a new count, and the badge bounces when it grows. */}
        <RollingNumber value={count} bump />
      </span>
    </button>
  );
}
