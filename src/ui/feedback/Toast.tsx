/**
 * Aurora Glass — Toast
 * Ported from design-system/components/feedback/Toast.{jsx,d.ts}.
 * Guidance: design-system/components/feedback/Toast.prompt.md
 *
 * Transient confirmation. Condenses into view, holds, dissolves out.
 * Level-3 glass so it reads over anything.
 *
 * The design system draws a hard line between the two feedback
 * surfaces: a Toast DISAPPEARS, so it can only ever confirm. Anything
 * that requires a decision goes in a NotificationCard, which persists
 * and expands in place. Never put a choice in here.
 *
 * FIXED ON IMPORT — the source builds the icon ring with
 * `'0 0 0 1px ' + hue + '55'`, i.e. `0 0 0 1px var(--accent)55`. You
 * cannot suffix an alpha onto a `var()` reference; the declaration is
 * invalid and the ring never draws. Rebuilt with `color-mix`, which
 * gets the same translucent ring from whichever token `tone` selected.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const TONE = {
  accent: 'var(--accent)',
  review: 'var(--status-review)',
  overrun: 'var(--status-overrun)',
  neutral: 'var(--fg-2)',
} as const;

export type ToastTone = keyof typeof TONE;

/*
 * `title` is Omitted from the DOM attributes on purpose: the native
 * `title` is `string | undefined` (the browser tooltip), and the toast's
 * own `title` is the headline node. Extending without the Omit is a
 * type error, and letting the native one win would silently make the
 * headline a tooltip.
 */
export interface ToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  /** Optional muted second line. */
  detail?: ReactNode;
  tone?: ToastTone;
  /** Renders the dismiss button. */
  onDismiss?: () => void;
}

export function Toast({
  icon,
  title,
  detail,
  tone = 'accent',
  onDismiss,
  className = '',
  style,
  ...rest
}: ToastProps) {
  const hue = TONE[tone] ?? TONE.accent;

  const shell: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-5)',
    padding: 'var(--sp-5) var(--sp-6)',
    minWidth: 280,
    maxWidth: 420,
    borderRadius: 'var(--r-pill)',
    backgroundImage: 'var(--glass-fill-3)',
    backdropFilter: 'var(--glass-bd-lg)',
    WebkitBackdropFilter: 'var(--glass-bd-lg)',
    boxShadow: 'var(--glass-shadow-thick)',
    animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
    ...style,
  };

  return (
    <div role="status" className={className} style={shell} {...rest}>
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          color: hue,
          flex: '0 0 auto',
          boxShadow: `0 0 0 1px color-mix(in oklab, ${hue} 33%, transparent)`,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{title}</span>
        {detail && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{detail}</span>}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            flex: '0 0 auto',
            width: 26,
            height: 26,
            display: 'grid',
            placeItems: 'center',
            border: 0,
            background: 'transparent',
            borderRadius: '50%',
            color: 'var(--fg-4)',
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
