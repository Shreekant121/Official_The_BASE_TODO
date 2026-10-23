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
 * **One exception, his (29-1P4a, idea 6): Undo, with a bar that drains.**
 * Undo is not a decision — nothing is lost when the toast goes, because the
 * same undo is still on Ctrl+Z and the tablet's two-finger tap for his last
 * 20 actions. `action` is that one button and `drainMs` the bar under it;
 * nothing else belongs in `action`.
 *
 * FIXED ON IMPORT — the source builds the icon ring with
 * `'0 0 0 1px ' + hue + '55'`, i.e. `0 0 0 1px var(--accent)55`. You
 * cannot suffix an alpha onto a `var()` reference; the declaration is
 * invalid and the ring never draws. Rebuilt with `color-mix`, which
 * gets the same translucent ring from whichever token `tone` selected.
 *
 * **A toast that can be dismissed can be thrown away (29-1P6b, idea 126):**
 * flick it sideways and it flies off, the same as its ✕ (`core/useFling.ts`).
 */
import { useEffect, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cue, pressedRecently } from '../../lib/sound';
import { useFling } from '../core/useFling';

const TONE = {
  /* 29-1P2c1: `accent` is lime now — a toast only confirms something
     finished, and done is lime's job (emerald is for running now). */
  accent: 'var(--job-lime)',
  /* 29-1P2c2: a warning is quiet, grey beside its icon; a failure coral. */
  review: 'var(--status-warn)',
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
  /** Undo (or Redo) and nothing else — see the header. */
  action?: { label: string; onClick: () => void };
  /** A bar along the bottom that drains over this long: how long `action` stays. */
  drainMs?: number;
}

export function Toast({
  icon,
  title,
  detail,
  tone = 'accent',
  onDismiss,
  action,
  drainMs,
  className = '',
  style,
  ...rest
}: ToastProps) {
  const hue = TONE[tone] ?? TONE.accent;
  const bar = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useFling(shellRef, { onThrow: onDismiss });

  /* Once, as it appears: a one-off Web Animation, never a CSS loop. */
  useEffect(() => {
    if (!drainMs || !bar.current?.animate) return;
    const run = bar.current.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: drainMs, easing: 'linear', fill: 'forwards' });
    return () => run.cancel();
  }, [drainMs]);

  /* 29-1P3: a failure sounds and buzzes once, as it appears — and only when it
     answers something he just pressed (his call, 2026-10-07). Read at mount,
     so a failure that arrives on its own while he reads stays quiet. */
  useEffect(() => {
    if (tone === 'overrun' && pressedRecently()) cue('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it appears
  }, []);

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
    ...(drainMs ? { position: 'relative', overflow: 'hidden' } : null),
    ...style,
  };

  return (
    <div ref={shellRef} role="status" className={className} style={shell} {...rest}>
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
      {/* `overflowWrap: 'anywhere'` (OPT-1): a title that is one long word —
          a pasted link — otherwise sets the toast's width itself, past its
          420px cap, and shoves the close button off the right edge. */}
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1, overflowWrap: 'anywhere' }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{title}</span>
        {detail && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{detail}</span>}
      </span>
      {action && (
        <button
          type="button"
          className="ag-toast__action"
          onClick={action.onClick}
          style={{
            flex: '0 0 auto',
            height: 30,
            padding: '0 var(--sp-4)',
            border: 0,
            borderRadius: 'var(--r-pill)',
            background: 'transparent',
            font: 'var(--type-label)',
            fontWeight: 600,
            color: tone === 'neutral' ? 'var(--fg-1)' : hue,
            cursor: 'pointer',
          }}
        >
          {action.label}
        </button>
      )}
      {drainMs ? (
        <span
          ref={bar}
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
            transformOrigin: 'left', backgroundColor: hue, opacity: 0.7,
          }}
        />
      ) : null}
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
