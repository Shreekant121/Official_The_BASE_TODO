/**
 * GradientNumber — numbers in their colour (idea 65, 29-1P1, BIG-15). A big
 * figure carries a soft two-colour ramp that says what it is, so after a week
 * he reads the colour before the label: cool for time focused, warm for
 * streaks, green for done. Apple Fitness's rings, as numbers.
 *
 * For BIG figures only — a Dashboard total, a recap, Focus's totals, the
 * morning story. Body text and small counts stay plain; a ramp on 13px text
 * is mud. The ramps are `--num-*` in `tokens/v3.css`, each from its colour's
 * job (focus is teal there, whatever the idea page demoed).
 *
 * Thin by default, as his references draw big numerals; pass `style` to set
 * the size. `backgroundImage`, never the `background` shorthand: React
 * clears the image with it on re-render.
 */
import type { CSSProperties, ReactNode } from 'react';

export type NumberTone = 'focus' | 'streak' | 'done';

export interface GradientNumberProps {
  children: ReactNode;
  tone: NumberTone;
  style?: CSSProperties;
  className?: string;
}

export function GradientNumber({ children, tone, style, className }: GradientNumberProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        font: 'var(--weight-light) var(--text-4xl) / var(--leading-tight) var(--font-numeric)',
        fontWeight: 200,
        letterSpacing: '-0.04em',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        backgroundImage: `var(--num-${tone})`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
