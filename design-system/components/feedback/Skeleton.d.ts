import * as React from 'react';

/**
 * Shimmering loading placeholder.
 *
 * @startingPoint section="Feedback" subtitle="Travelling shimmer over a carved well" viewport="700x160"
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  width?: number | string;
  height?: number | string;
  /** Defaults to pill. Use `var(--r-card)` for block placeholders. */
  radius?: string;
}

export declare function Skeleton(props: SkeletonProps): JSX.Element;
