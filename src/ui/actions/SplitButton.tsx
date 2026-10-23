/**
 * SplitButton — one action plus its variants (29-1P1, BIG-15): Start ▾, whose
 * arrow opens Start 25 min, Start with prep. Gmail's Send ▾, GitHub's
 * Merge ▾. For a main action that can be done more than one way; the big
 * half always does the usual way, so a tap never has to open the menu.
 *
 * Two gel halves in the action's colour, squared where they meet. The
 * variants are a `MorphMenu`, so they arm, flash and close like every other
 * menu in BASE. If the action has no variants, use a `GelButton`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { gelVars, type ColourJob } from '../core/colourJobs';
import { Icon } from '../core/Icon';
import { MorphMenu, type MorphMenuItem } from '../overlay/MorphMenu';

const SIZE = {
  md: { h: 46, font: 'var(--text-md)', outer: 'var(--r-sm)' },
  lg: { h: 56, font: 'var(--text-lg)', outer: 'var(--r-md)' },
} as const;

export interface SplitButtonProps {
  /** The usual way — what a tap on the big half does. */
  children: ReactNode;
  onClick: () => void;
  /** The other ways, in the menu under the arrow. */
  variants: MorphMenuItem[];
  /** Names the arrow for a screen reader: "More ways to start". */
  moreLabel: string;
  colour?: ColourJob;
  size?: keyof typeof SIZE;
  disabled?: boolean;
  style?: CSSProperties;
}

export function SplitButton({
  children, onClick, variants, moreLabel, colour = 'orange', size = 'lg', disabled, style,
}: SplitButtonProps) {
  const s = SIZE[size];
  const half: CSSProperties = {
    ...gelVars(colour),
    height: s.h,
    font: `var(--weight-medium) ${s.font} / 1 var(--font-sans)`,
  };
  return (
    <div style={{ display: 'inline-flex', gap: 3, ...style }}>
      <button
        type="button"
        className="ds-gel"
        disabled={disabled}
        onClick={onClick}
        style={{ ...half, padding: '0 var(--sp-6) 0 var(--sp-8)', borderRadius: `${s.outer} 6px 6px ${s.outer}` }}
      >
        {children}
      </button>
      <MorphMenu
        align="end"
        portal
        items={variants}
        trigger={
          <button
            type="button"
            className="ds-gel"
            aria-label={moreLabel}
            title={moreLabel}
            disabled={disabled}
            style={{ ...half, width: Math.round(s.h * 0.86), padding: 0, borderRadius: `6px ${s.outer} ${s.outer} 6px` }}
          >
            <Icon name="chevron-down" size={18} />
          </button>
        }
      />
    </div>
  );
}
