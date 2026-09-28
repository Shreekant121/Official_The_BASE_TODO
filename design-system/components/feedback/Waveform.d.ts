import * as React from 'react';

/**
 * Live voice-input bar field.
 *
 * @startingPoint section="Feedback" subtitle="CSS-driven voice bars with an idle collapse" viewport="700x160"
 */
export interface WaveformProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Bar count. 20–36 reads best. */
  bars?: number;
  /** False collapses to a flat idle line. */
  active?: boolean;
  height?: number;
  tone?: 'accent' | 'white';
}

export declare function Waveform(props: WaveformProps): JSX.Element;
