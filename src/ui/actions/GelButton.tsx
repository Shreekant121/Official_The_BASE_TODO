/**
 * GelButton — the lit button (29-1P1, BIG-15). Two of the design system's
 * thirteen buttons:
 *
 *   WITH A TILE (`tile`, the default) — THE one main action on a screen: his
 *   orange Start. The label, then a white tile holding the dotted arrow.
 *   One per screen; two main actions means none.
 *
 *   PLAIN (`tile={false}`) — a main action without the tile, for a screen's
 *   other strong action: Smart Start, New task, Mark done.
 *
 * WHEN NOT TO USE IT: an everyday second action is `SoftButton`, a calm
 * confirm is `WhiteButton`. Its colour is its job (`core/colourJobs.ts`):
 * orange to start something, emerald for what is live, violet for Atlas —
 * never a colour picked for looks. Whatever the colour, it casts its own
 * light, not a black shadow (idea 64).
 *
 * A rounded rectangle, not a pill: his call on the reference, and his
 * standing call on top bars. States are in `buttons.css`.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { gelVars, type ColourJob } from '../core/colourJobs';
import { DotArrow } from '../core/DotArrow';

const SIZE = {
  md: { h: 46, font: 'var(--text-md)', radius: 'var(--r-sm)', tileRadius: 'var(--r-xs)' },
  lg: { h: 56, font: 'var(--text-lg)', radius: 'var(--r-md)', tileRadius: 'var(--r-sm)' },
} as const;

export interface GelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The job it does, which picks its colour. Orange (go) by default. */
  colour?: ColourJob;
  /** The white tile with the dotted arrow. On for THE main action; off for a plain gel. */
  tile?: boolean;
  /** `lg` 56px for a screen's hero action, `md` 46px inside a card or a bar. */
  size?: keyof typeof SIZE;
  /** A leading icon, for a plain gel. */
  icon?: ReactNode;
  /** Stretch to the container's width. */
  block?: boolean;
}

export function GelButton({
  colour = 'orange',
  tile = true,
  size = 'lg',
  icon,
  block = false,
  className = '',
  style,
  children,
  ...rest
}: GelButtonProps) {
  const s = SIZE[size];
  return (
    <button
      type="button"
      className={['ds-gel', className].filter(Boolean).join(' ')}
      style={{
        ...gelVars(colour),
        display: block ? 'flex' : undefined,
        width: block ? '100%' : undefined,
        gap: tile ? 'var(--sp-5)' : 'var(--sp-3)',
        height: s.h,
        padding: tile ? `0 ${Math.round(s.h * 0.14)}px 0 var(--sp-7)` : '0 var(--sp-8)',
        borderRadius: s.radius,
        font: `var(--weight-medium) ${s.font} / 1 var(--font-sans)`,
        justifyContent: tile && block ? 'space-between' : undefined,
        ...style,
      }}
      {...rest}
    >
      {icon}
      {children}
      {tile && (
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            width: s.h - 16, height: s.h - 16, borderRadius: s.tileRadius,
            backgroundColor: `var(--job-${colour}-tile)`,
            boxShadow: `var(--job-${colour}-tile-cast)`,
          }}
        >
          <DotArrow color={`var(--job-${colour}-dot)`} />
        </span>
      )}
    </button>
  );
}
