import * as React from 'react';

/**
 * One number, given room. Kicker, numeral, delta — nothing else.
 *
 * @startingPoint section="Data" subtitle="Big-numeral metric cards with trend deltas" viewport="700x260"
 */
export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Uppercase mono kicker, e.g. `FOCUS TIME TODAY`. */
  label: React.ReactNode;
  /** The numeral. Keep it short — 4 characters is the comfortable maximum. */
  value: React.ReactNode;
  /** Unit set in mono beside the numeral (`min`, `h`, `tasks`). */
  unit?: React.ReactNode;
  /** Change figure, e.g. `12%`. */
  delta?: React.ReactNode;
  /** Colours and arrows the delta. `up` reads as good. */
  deltaDirection?: 'up' | 'down' | 'flat';
  /** Muted trailing context, e.g. `vs last week`. */
  hint?: React.ReactNode;
  /** Emit accent light — for the metric that is currently live. */
  glow?: boolean;
  size?: 'md' | 'lg';
}

export declare function MetricCard(props: MetricCardProps): JSX.Element;
