import * as React from 'react';

/**
 * Text field rendered as an etched well in the glass.
 *
 * @startingPoint section="Forms" subtitle="Etched-well text fields with icon, suffix and invalid states" viewport="700x200"
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon node — 16–18px, tints to the accent on focus. */
  iconLeft?: React.ReactNode;
  /** Trailing unit or hint, set in mono (`min`, `h`, `/ 240`). */
  suffix?: React.ReactNode;
  invalid?: boolean;
  /** Full width. Defaults to true. */
  block?: boolean;
}

export declare function Input(props: InputProps): JSX.Element;
