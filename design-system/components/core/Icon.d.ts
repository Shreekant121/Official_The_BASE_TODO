import * as React from 'react';

/**
 * String-addressed Lucide glyph at the house stroke weight.
 *
 * @startingPoint section="Core" subtitle="Lucide glyphs at the house 1.5 stroke" viewport="700x140"
 */
export interface IconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Lucide icon name in kebab-case, e.g. `clock`, `circle-check`, `list-checks`. */
  name: string;
  /** Box size in px. Stick to 16 / 18 / 20 / 24. */
  size?: number;
  /** Stroke width. The house value is 1.5 — do not go below 1.25 or above 2. */
  stroke?: number;
}

export declare function Icon(props: IconProps): JSX.Element;
