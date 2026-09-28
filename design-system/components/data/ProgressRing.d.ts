import * as React from 'react';

/**
 * Circular completion — recessed track, emitting arc, number inside.
 *
 * @startingPoint section="Data" subtitle="Emitting arcs over a carved track" viewport="700x180"
 */
export interface ProgressRingProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width. Keep it 6–10 at 96px. */
  thickness?: number;
  tone?: 'accent' | 'cyan' | 'amber' | 'rose' | 'violet';
  /** Small uppercase caption under the number. */
  label?: React.ReactNode;
  showValue?: boolean;
  /** Replaces the centre content entirely. */
  children?: React.ReactNode;
}

export declare function ProgressRing(props: ProgressRingProps): JSX.Element;
