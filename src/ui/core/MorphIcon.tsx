/**
 * Icons that morph (idea 61, 29-1P5c, BIG-15; Apple Music). An icon that
 * changes state becomes the next shape instead of being swapped for it:
 *
 *   play-pause   play melts into pause (Focus's Pause / Resume, brown noise)
 *   plus-x       the + turns into an ✕ (the floating + while Capture is open)
 *   menu-back    three lines fold into a back arrow (Atlas's chat list)
 *
 * `on` is the second shape: pause, ✕, back.
 *
 * The paths change through the CSS `d` property (`motionPieces.css`), each
 * pair drawn with the same commands so the browser can blend one into the
 * other; the `d` attribute carries the same path for a browser that cannot.
 * The + is the app's own Phosphor glyph, turned 135°. Nothing moves at rest.
 */
import type { CSSProperties } from 'react';
import { Icon } from './Icon';

export type MorphIconKind = 'play-pause' | 'plus-x' | 'menu-back';

export interface MorphIconProps {
  kind: MorphIconKind;
  /** The second shape: pause, ✕, back. */
  on: boolean;
  size?: number;
  style?: CSSProperties;
}

/* The idea page's shapes on a 24 grid. Play is two halves of one triangle,
   so each half has a bar of the pause to become. */
const PLAY_PAUSE = [
  ['M7 4.5 L13 8.2 L13 15.8 L7 19.5 Z', 'M6.5 5 L10.5 5 L10.5 19 L6.5 19 Z'],
  ['M13 8.2 L19.5 12 L19.5 12 L13 15.8 Z', 'M13.5 5 L17.5 5 L17.5 19 L13.5 19 Z'],
] as const;
const MENU_BACK = [
  ['M5 7 L19 7', 'M5 12 L11 6'],
  ['M5 12 L19 12', 'M5 12 L19 12'],
  ['M5 17 L19 17', 'M5 12 L11 18'],
] as const;

export function MorphIcon({ kind, on, size = 20, style }: MorphIconProps) {
  if (kind === 'plus-x') {
    return (
      <span aria-hidden="true" className="ag-morph-turn" style={{ rotate: on ? '135deg' : '0deg', ...style }}>
        <Icon name="plus" size={size} />
      </span>
    );
  }
  const filled = kind === 'play-pause';
  const paths = filled ? PLAY_PAUSE : MENU_BACK;
  return (
    <svg
      aria-hidden="true"
      className="ag-morph"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ display: 'block', overflow: 'visible', ...style }}
    >
      {paths.map(([a, b], i) => {
        const d = on ? b : a;
        return (
          <path
            key={i}
            d={d}
            style={{ d: `path('${d}')` } as CSSProperties}
            {...(filled
              ? { fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' as const }
              : { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const })}
          />
        );
      })}
    </svg>
  );
}
