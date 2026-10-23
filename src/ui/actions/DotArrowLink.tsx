/**
 * DotArrowLink — "See all" (29-1P1, BIG-15): quiet text with the dotted arrow
 * from his Start tile, which nudges forward on hover. For every "See all",
 * "Open the list", "Every overdue task" that leads somewhere else. Not for
 * an action that changes anything — that is a button.
 * States are in `buttons.css`.
 */
import type { ButtonHTMLAttributes } from 'react';
import { DotArrow } from '../core/DotArrow';

export function DotArrowLink({ className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={['ds-dotlink', className].filter(Boolean).join(' ')} {...rest}>
      {children}
      <DotArrow size={16} />
    </button>
  );
}
