import * as React from 'react';

export interface ScoreDialProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** The composite priority score, e.g. 7.5. Rendered to one decimal, always mono. */
  value?: number;
  /** Ceiling of the scoring model. 13.5 is the product's real maximum. */
  max?: number;
  /** sm — inside a task row. md — a list or table cell. lg — the detail page header. */
  size?: 'sm' | 'md' | 'lg';
  /** At or above this, the chip and its numeral go amber. Below it they stay neutral. */
  threshold?: number;
  /** Show "/13.5" beside the numeral. Only on `lg`, where there is room to read it. */
  showMax?: boolean;
  /** Uppercase mono suffix inside the chip. Omit inside dense rows. */
  label?: string;
}

/**
 * The priority score as a measured number: a mono numeral in a small
 * rectangle — a carved well while ordinary, an amber pane once it crosses
 * `threshold`. Never a pill (those are controls) and never a ring (that is
 * progress); never glows, because glow means live.
 */
export declare function ScoreDial(props: ScoreDialProps): JSX.Element;
