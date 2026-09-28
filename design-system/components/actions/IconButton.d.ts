import * as React from 'react';

/**
 * A circle of glass holding exactly one line icon.
 *
 * @startingPoint section="Actions" subtitle="Round glass icon affordances with badge and active states" viewport="700x150"
 */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** 34 / 44 / 54 / 64px. `sm` is desktop-toolbar only. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `glass` default · `ghost` for dense toolbars · `tint` for a hued or frost pane. */
  variant?: 'glass' | 'ghost' | 'tint';
  /** Hue when `variant="tint"`. */
  tone?: 'accent' | 'cyan' | 'violet' | 'amber' | 'rose' | 'frost';
  /** Rounded square instead of a circle — for icon tiles in a grid. */
  square?: boolean;
  /** Selected / toggled on. Adds the blue emission ring. */
  active?: boolean;
  /** Count or dot rendered top-right. */
  badge?: React.ReactNode;
  /** Required accessible name — the button has no visible text. */
  label: string;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;
