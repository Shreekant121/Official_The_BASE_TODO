/**
 * WhiteButton — solid white (29-1P1, BIG-15): a strong but calm confirm.
 * "Save changes", the confirm at the end of a sheet or a dialog. The black
 * "Send Money" pill in his wallet reference, flipped for the dark.
 *
 * Not a screen's main action — that is a `GelButton` — and never beside
 * one: two strong buttons in one place means neither reads as the one.
 * States are in `buttons.css`.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** `sm` (36px) is for a small inline form's confirm — Add task under a list — beside its Cancel. */
export function WhiteButton({
  className = '', icon, block = false, size = 'md', style, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; block?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={['ds-white', size === 'sm' && 'ds-white--sm', className].filter(Boolean).join(' ')}
      style={{ display: block ? 'flex' : undefined, width: block ? '100%' : undefined, ...style }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
