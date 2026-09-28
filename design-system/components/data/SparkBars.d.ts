import * as React from 'react';

/**
 * Glanceable bar shape — a trend, not a table.
 *
 * @startingPoint section="Data" subtitle="Glass bars with one emitting active column" viewport="700x200"
 */
export interface SparkBarsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Raw values. Scaled against their own peak. */
  data: number[];
  /** Index to highlight — usually today. */
  activeIndex?: number;
  height?: number;
  gap?: number;
  /** Optional axis labels, same length as `data`. */
  labels?: React.ReactNode[];
  tone?: 'accent' | 'cyan';
}

export declare function SparkBars(props: SparkBarsProps): JSX.Element;
