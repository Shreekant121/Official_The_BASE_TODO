import * as React from 'react';

/**
 * Progress spine for the product's linear flow.
 *
 * @startingPoint section="Navigation" subtitle="Filling connectors and ringed current step" viewport="700x200"
 */
export interface Step {
  label: React.ReactNode;
  /** Muted second line. */
  hint?: React.ReactNode;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: Array<string | Step>;
  /** Zero-based index of the active step. */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
}

export declare function Stepper(props: StepperProps): JSX.Element;
