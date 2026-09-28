import * as React from 'react';

/**
 * The system button. Always a pill, never a rounded rectangle.
 *
 * @startingPoint section="Actions" subtitle="Glass, solid, frost, tint and ghost pills at three sizes" viewport="700x180"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** `glass` default · `solid` one primary per view · `frost` white pane with dark label · `tint` accent glass · `ghost` low stakes. */
  variant?: 'glass' | 'solid' | 'frost' | 'tint' | 'ghost';
  /** Hue for `solid` and `tint`. Ignored by the others. */
  tone?: 'accent' | 'cyan' | 'violet' | 'amber' | 'rose';
  /** `sm` 34px is toolbar-only — anything a finger touches uses `md` (44px) or larger. */
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon node. 16–18px line icons at 1.5 stroke. */
  iconLeft?: React.ReactNode;
  /** Trailing icon node. Use for direction, not decoration. */
  iconRight?: React.ReactNode;
  /** Swaps the leading icon for a spinner and blocks interaction. */
  loading?: boolean;
  /** Stretch to the container width. */
  block?: boolean;
}

export declare function Button(props: ButtonProps): JSX.Element;
