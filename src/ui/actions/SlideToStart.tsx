/**
 * SlideToStart — committing to something big (29-1P1, BIG-15): starting a
 * Focus block of 90 minutes or more. iPhone's slide to power off, Uber's
 * slide to start a trip. Drag the knob to the end; let go short of it and it
 * glides back and nothing happens.
 *
 * Only where a start is a real commitment. An ordinary start is a
 * `GelButton` — a slide on every Start would just be slow.
 *
 * The knob follows the finger only while it is held; at rest nothing moves
 * (Performance rule 1). From a keyboard, the arrow keys move it a quarter at
 * a time and End takes it all the way. Orange by default: go.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { gelVars, type ColourJob } from '../core/colourJobs';
import { Icon } from '../core/Icon';
import { cue } from '../../lib/sound';

const KNOB = 44;
const PAD = 6;
/* Written back by hand after a drag: clearing an inline style React set
   would leave it cleared, since React only writes a value that changed. */
const KNOB_TRANSITION = 'left var(--dur-slow) var(--ease-glide), transform var(--dur-slow) var(--ease-glide), filter var(--dur-fast) var(--ease-glass)';
const LABEL_TRANSITION = 'opacity var(--dur-base) var(--ease-glass)';

export interface SlideToStartProps {
  /** What sliding does: "Slide to start deep work". */
  children: ReactNode;
  onConfirm: () => void;
  doneLabel?: ReactNode;
  colour?: ColourJob;
  disabled?: boolean;
  style?: CSSProperties;
}

export function SlideToStart({
  children, onConfirm, doneLabel = 'Started', colour = 'orange', disabled, style,
}: SlideToStartProps) {
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLButtonElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  /** Where the knob started (`base`) and how far it can go, measured on the press. */
  const drag = useRef<{ x0: number; base: number; max: number } | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 0 to 1, for the keyboard and for where the knob rests. */
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);

  const maxX = () => Math.max(0, (track.current?.clientWidth ?? 0) - KNOB - PAD * 2);

  /* React places the knob with `left`, as a share of the track, so nothing
     is measured while drawing. While a finger is on it the knob is nudged by
     hand with a transform, with no transition; on release the transform is
     cleared and glides away, and `at` says where it rests. */
  const paint = (x: number, d: { base: number; max: number }) => {
    if (knob.current) knob.current.style.transform = `translateX(${x - d.base}px)`;
    if (label.current) label.current.style.opacity = String(1 - Math.min(1, x / Math.max(1, d.max)) * 0.9);
  };
  const xOf = (clientX: number, d: { x0: number; base: number; max: number }) =>
    Math.max(0, Math.min(d.max, d.base + clientX - d.x0));

  const finish = () => {
    setAt(1);
    setDone(true);
    /* 29-1P3: every slide is a start, so the start sound lives here. */
    cue('start');
    onConfirm();
    reset.current = setTimeout(() => { reset.current = null; setDone(false); setAt(0); }, 1400);
  };

  const onDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || done) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const max = maxX();
    drag.current = { x0: e.clientX, base: at * max, max };
    if (knob.current) knob.current.style.transition = 'none';
    if (label.current) label.current.style.transition = 'none';
  };
  const onMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    paint(xOf(e.clientX, d), d);
  };
  const onUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const x = xOf(e.clientX, d);
    /* Hand the knob back, with its glide. */
    if (knob.current) { knob.current.style.transition = KNOB_TRANSITION; knob.current.style.transform = 'none'; }
    if (label.current) { label.current.style.transition = LABEL_TRANSITION; label.current.style.opacity = '1'; }
    if (d.max > 0 && x >= d.max - 4) finish();
    else setAt(0);
  };

  const step = (next: number) => {
    if (disabled || done) return;
    const v = Math.max(0, Math.min(1, next));
    if (v >= 1) finish();
    else setAt(v);
  };

  return (
    <div
      ref={track}
      className="ds-slide"
      style={{
        position: 'relative', width: '100%', maxWidth: 320, height: KNOB + PAD * 2,
        display: 'grid', placeItems: 'center',
        borderRadius: 'var(--r-md)',
        backgroundImage: 'var(--soft-fill)', boxShadow: 'var(--soft-pressed)',
        color: 'var(--fg-3)', font: 'var(--type-label)',
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <span
        ref={label}
        style={{
          paddingLeft: KNOB, opacity: done ? 1 : 1 - at * 0.9,
          color: done ? 'var(--fg-1)' : undefined,
          transition: LABEL_TRANSITION,
        }}
      >
        {done ? doneLabel : children}
      </span>
      <button
        ref={knob}
        type="button"
        role="slider"
        aria-label={typeof children === 'string' ? children : 'Slide to start'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(at * 100)}
        disabled={disabled}
        className="ds-gel"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          const k = e.key;
          if (k === 'ArrowRight' || k === 'ArrowUp') step(at + 0.25);
          else if (k === 'ArrowLeft' || k === 'ArrowDown') step(at - 0.25);
          else if (k === 'End') step(1);
          else if (k === 'Home') step(0);
          else return;
          e.preventDefault();
        }}
        style={{
          ...gelVars(colour),
          position: 'absolute', top: PAD, width: KNOB, height: KNOB, padding: 0,
          borderRadius: 'var(--r-sm)', cursor: disabled ? 'default' : 'grab', touchAction: 'none',
          left: `calc(${PAD}px + ${at} * (100% - ${KNOB + PAD * 2}px))`,
          transform: 'none',
          transition: KNOB_TRANSITION,
        }}
      >
        <Icon name="arrow-right" size={20} />
      </button>
    </div>
  );
}
