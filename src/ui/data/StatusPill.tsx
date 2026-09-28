/**
 * Aurora Glass — StatusPill
 * Ported from design-system/components/data/StatusPill.{jsx,d.ts}.
 * Guidance: design-system/components/data/StatusPill.prompt.md
 *
 * A status is a hue plus a word plus a dot. The dot pulses only when the
 * state is genuinely live — that is the whole signalling system, and it
 * is why `running` and `overrun` ripple and nothing else does.
 *
 * The seven states are semantic, not decorative. Do not reach for a hue
 * because it looks good next to something; reach for the state.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const MAP = {
  running:    { hue: 'var(--status-running)',    fill: 'var(--glass-tint-accent)', live: true },
  queued:     { hue: 'var(--status-queued)',     fill: 'var(--glass-tint-cyan)',   live: false },
  review:     { hue: 'var(--status-review)',     fill: 'var(--glass-tint-amber)',  live: false },
  done:       { hue: 'var(--status-done)',       fill: 'var(--glass-tint-accent)', live: false },
  overrun:    { hue: 'var(--status-overrun)',    fill: 'var(--glass-tint-rose)',   live: true },
  backburner: { hue: 'var(--status-backburner)', fill: 'var(--glass-tint-violet)', live: false },
  archived:   { hue: 'var(--status-archived)',   fill: 'var(--glass-fill-1)',      live: false },
} as const;

export type StatusName = keyof typeof MAP;

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Maps to the `--status-*` tokens. `running` and `overrun` ripple. */
  status?: StatusName;
  size?: 'sm' | 'md';
  /** Show the leading dot. Defaults to true. */
  dot?: boolean;
  /** Override the label. Defaults to the status name. */
  children?: ReactNode;
}

export function StatusPill({
  status = 'queued',
  children,
  size = 'md',
  dot = true,
  className = '',
  style,
  ...rest
}: StatusPillProps) {
  const { hue, fill, live } = MAP[status] ?? MAP.queued;
  const h = size === 'sm' ? 24 : 30;

  const shell: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--sp-3)',
    height: h,
    padding: `0 ${size === 'sm' ? 'var(--sp-4)' : 'var(--sp-5)'}`,
    borderRadius: 'var(--r-pill)',
    backgroundImage: fill,
    boxShadow: 'var(--glass-rim-1)',
    backdropFilter: 'var(--glass-bd-sm)',
    WebkitBackdropFilter: 'var(--glass-bd-sm)',
    font: 'var(--type-kicker)',
    fontSize: size === 'sm' ? 'var(--text-2xs)' : 'var(--text-xs)',
    letterSpacing: 'var(--tracking-kicker)',
    /* A kicker-style label: uppercase in the old system, sentence case in V3
       (V3-2, the design's "Live" / "Queued" pills). */
    textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
    color: hue,
    whiteSpace: 'nowrap',
    ...style,
  };

  return (
    <span className={className} style={shell} {...rest}>
      {dot && (
        <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6, flex: '0 0 auto' }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: hue, boxShadow: `0 0 8px ${hue}`,
            }}
          />
          {live && (
            <span
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%', background: hue,
                animation: 'var(--kf-ripple) 1.8s var(--ease-in-out) infinite',
              }}
            />
          )}
        </span>
      )}
      {children ?? status}
    </span>
  );
}
