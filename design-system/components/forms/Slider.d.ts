import * as React from 'react';

/**
 * Continuous value along a recessed track with an accent-lit fill.
 *
 * @startingPoint section="Forms" subtitle="Well track, emitting fill, frost bead handle" viewport="700x160"
 */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'defaultValue'> {
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  /** Formatter for the three readouts, e.g. `m => m + ' min'`. */
  format?: (value: number) => React.ReactNode;
  /** Show min / current / max beneath the track. Defaults to true. */
  showValue?: boolean;
  disabled?: boolean;
}

export declare function Slider(props: SliderProps): JSX.Element;
