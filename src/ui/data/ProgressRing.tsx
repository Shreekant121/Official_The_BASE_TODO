/**
 * Aurora Glass — ProgressRing
 * Ported from design-system/components/data/ProgressRing.{jsx,d.ts}.
 * Guidance: design-system/components/data/ProgressRing.prompt.md
 *
 * The ring from the references: a recessed track, an emitting arc, and
 * the number living inside. Sweeps from 12 o'clock.
 *
 * The track is two stacked circles, not one — a black one for depth and
 * a faint white one over it — which is what makes it read as carved into
 * the surface rather than drawn on top of it.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const TONE = {
  accent: 'var(--accent)',
  cyan: 'var(--hue-cyan)',
  amber: 'var(--hue-amber)',
  rose: 'var(--hue-rose)',
  violet: 'var(--hue-violet)',
} as const;

export type RingTone = keyof typeof TONE;

export interface ProgressRingProps extends HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  /** Outer diameter in px. */
  size?: number;
  /** Stroke width. Keep it 6–10 at 96px. */
  thickness?: number;
  tone?: RingTone;
  /** Small uppercase caption under the number. */
  label?: ReactNode;
  showValue?: boolean;
  /** Replaces the centre content entirely. */
  children?: ReactNode;
}

export function ProgressRing({
  value = 0,
  max = 100,
  size = 96,
  thickness = 8,
  tone = 'accent',
  label,
  showValue = true,
  className = '',
  style,
  children,
  ...rest
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const hue = TONE[tone] ?? TONE.accent;

  const shell: CSSProperties = {
    position: 'relative',
    display: 'inline-grid',
    placeItems: 'center',
    width: size,
    height: size,
    ...style,
  };

  return (
    <div className={className} style={shell} {...rest}>
      {/* overflow: visible — an <svg> root clips to its viewport by
          default, which sliced the arc's glow off in a hard square.
          The glow now spills outside the box; nothing here is clipped
          and nothing reflows, because the box keeps its own size. */}
      <svg
        width={size}
        height={size}
        style={{ transform: 'rotate(-90deg)', display: 'block', overflow: 'visible' }}
        aria-hidden="true"
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(0 0 0 / 0.45)" strokeWidth={thickness} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="oklch(1 0 0 / 0.07)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hue}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{
            filter: `drop-shadow(0 0 6px ${hue})`,
            transition: 'stroke-dashoffset var(--dur-slow) var(--ease-glass)',
          }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'grid', justifyItems: 'center', gap: 2 }}>
        {children ?? (showValue && (
          <span
            style={{
              font: 'var(--type-numeric)',
              fontSize: size > 80 ? 'var(--text-lg)' : 'var(--text-sm)',
              color: 'var(--fg-1)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {Math.round(pct * 100)}%
          </span>
        ))}
        {label && (
          <span
            style={{
              font: 'var(--type-kicker)',
              letterSpacing: 'var(--tracking-kicker)',
              /* Kicker case: uppercase outside V3, as written inside it (V3-5). */
              textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
              color: 'var(--fg-4)',
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
