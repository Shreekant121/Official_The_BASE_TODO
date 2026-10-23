/**
 * Aurora Glass — StatusPill
 * Ported from design-system/components/data/StatusPill.{jsx,d.ts}.
 * Guidance: design-system/components/data/StatusPill.prompt.md
 *
 * A status is a hue plus a word plus a dot. The dot wears a halo only when
 * the state is genuinely live — that is the whole signalling system, and it
 * is why `running`, `atlas` and `overrun` carry one and nothing else does.
 *
 * `atlas` (29-1P2c3) is `running` in Atlas's violet: Atlas awake, or a model
 * resident in its memory. His call — on Atlas's own things Atlas's colour
 * beats running's emerald, as Focus's running stage goes teal.
 *
 * The halo is STILL, and that is a performance rule, not a taste (2026-09-28,
 * his call: "steady glow everywhere"). It used to be `ag-ripple`, infinite,
 * and a never-ending animation anywhere on screen makes the compositor redraw
 * the whole frame sixty times a second — measured on a slow-GPU stand-in at
 * tablet size, six running pills held Task Selection at 27fps doing nothing,
 * and 60fps with only the ripple removed. Do not put the loop back; a looping
 * animation belongs only on something that is working right now and stops.
 * `data-live-halo` is how `screens.css` hides it on an unchosen status option.
 *
 * `review` is "needs a look", and since 29-1P2c2 it is grey with a warning
 * glyph where the dot was, ALWAYS, `dot` or not (his call: warnings quiet,
 * grey with their icon; the old yellow is gold's hue, and gold is rewards).
 * With no colour left, the glyph is the whole signal. `overrun` is coral.
 *
 * The eight states are semantic, not decorative. Do not reach for a hue
 * because it looks good next to something; reach for the state.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../core/Icon';

const MAP = {
  running:    { hue: 'var(--status-running)',    fill: 'var(--glass-tint-accent)', live: true },
  atlas:      { hue: 'var(--job-violet)',        fill: 'var(--glass-tint-violet)', live: true },
  queued:     { hue: 'var(--status-queued)',     fill: 'var(--glass-tint-cyan)',   live: false },
  review:     { hue: 'var(--status-warn)',       fill: 'var(--glass-tint-warn)',   live: false },
  done:       { hue: 'var(--status-done)',       fill: 'var(--glass-tint-lime)', live: false },
  overrun:    { hue: 'var(--status-overrun)',    fill: 'var(--glass-tint-coral)',  live: true },
  backburner: { hue: 'var(--status-backburner)', fill: 'var(--glass-tint-violet)', live: false },
  archived:   { hue: 'var(--status-archived)',   fill: 'var(--glass-fill-1)',      live: false },
} as const;

export type StatusName = keyof typeof MAP;

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  /** Maps to the `--status-*` tokens. `running` and `overrun` wear the halo. */
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
      {status === 'review' && (
        <Icon name="triangle-alert" size={size === 'sm' ? 11 : 13} style={{ flex: '0 0 auto' }} />
      )}
      {dot && status !== 'review' && (
        <span style={{ position: 'relative', display: 'inline-flex', width: 6, height: 6, flex: '0 0 auto' }}>
          <span
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: hue, boxShadow: `0 0 8px ${hue}`,
            }}
          />
          {live && (
            <span
              data-live-halo=""
              style={{
                position: 'absolute', inset: -3, borderRadius: '50%',
                boxShadow: `0 0 0 1px ${hue}`, opacity: 0.45,
              }}
            />
          )}
        </span>
      )}
      {children ?? status}
    </span>
  );
}
