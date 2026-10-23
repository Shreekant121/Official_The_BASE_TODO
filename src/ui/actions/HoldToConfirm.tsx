/**
 * HoldToConfirm — for what must not happen by accident (29-1P1, BIG-15):
 * emptying the Trash, deleting a project, resetting the bad-habit count.
 * Apple Watch's hold-to-end. Press and hold; a fill runs across the button
 * and the action happens only when it reaches the end. Let go early and
 * nothing happens.
 *
 * Only for what cannot be taken back, or is costly to. Anything the Trash or
 * an undo can bring back stays an ordinary button or a menu's arm-in-place
 * confirm — a hold on every delete would just be slow.
 *
 * The fill is a CSS transition started by the press and reversed by the
 * release, so nothing runs while nobody touches it (Performance rule 1).
 * Space or Enter held down does the same from a keyboard. `danger` fills in
 * the app's delete colour, the one `MorphMenu`'s Delete wears.
 */
import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { cue } from '../../lib/sound';

export interface HoldToConfirmProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Says what holding does: "Hold to empty Trash". */
  children: ReactNode;
  onConfirm: () => void;
  /** Shown for a moment once it has happened. */
  doneLabel?: ReactNode;
  /** How long the hold takes. */
  holdMs?: number;
  tone?: 'danger' | 'neutral';
}

export function HoldToConfirm({
  children, onConfirm, doneLabel = 'Done', holdMs = 1200, tone = 'danger', disabled, className = '', ...rest
}: HoldToConfirmProps) {
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmRef = useRef(onConfirm);
  useEffect(() => { confirmRef.current = onConfirm; }, [onConfirm]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = () => {
    if (disabled || done || held) return;
    setHeld(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHeld(false);
      setDone(true);
      /* 29-1P3: a held delete lands with the delete sound; anything else held, done. */
      cue(tone === 'danger' ? 'delete' : 'done');
      confirmRef.current();
      timer.current = setTimeout(() => { timer.current = null; setDone(false); }, 1200);
    }, holdMs);
  };
  const stop = () => {
    if (!held) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHeld(false);
  };
  const isKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';

  return (
    <button
      type="button"
      disabled={disabled}
      data-held={held || undefined}
      className={['ds-soft ds-hold', className].filter(Boolean).join(' ')}
      onPointerDown={(e) => { if (e.button === 0) start(); }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (isKey(e)) { e.preventDefault(); if (!e.repeat) start(); } }}
      onKeyUp={(e) => { if (isKey(e)) stop(); }}
      onBlur={stop}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          transformOrigin: 'left',
          transform: held || done ? 'scaleX(1)' : 'scaleX(0)',
          backgroundColor: tone === 'danger'
            ? 'color-mix(in oklch, var(--status-overrun) 35%, transparent)'
            : 'oklch(1 0 0 / 0.12)',
          transition: held
            ? `transform ${holdMs}ms linear`
            : 'transform var(--dur-base) var(--ease-glass)',
        }}
      />
      <span style={{ position: 'relative' }}>{done ? doneLabel : children}</span>
    </button>
  );
}
