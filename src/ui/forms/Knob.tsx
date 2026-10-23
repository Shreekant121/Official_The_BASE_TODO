/**
 * Knob — a value you turn (29-1P3, idea 132 of round 8, after the OP-1).
 *
 * For a thing he nudges while working: brown noise's volume, in Settings and
 * on Focus's stage (his call, 2026-10-07, with a switch in Focus's drawer to
 * hide it). Turn it with a finger in a circle, or the mouse, or the arrow
 * keys; every step clicks and buzzes (`lib/sound.ts`'s detent) and lights the
 * dots around it. It is a `slider` to a screen reader, like `Slider`.
 *
 * THE VALUE IS ALWAYS ON A STEP. The page's demo turned freely and settled on
 * release; here each move hands the caller the nearest step, so the body turns
 * in clicks — which is what a detent feels like — and nothing has to be put
 * right afterwards. A jump of more than a third of the range in one move is
 * ignored: that is the pointer crossing the dead zone at the bottom, where
 * "just past empty" and "just past full" are a hair apart.
 *
 * Its colour is its job's (`--job-*`), teal by default — brown noise is calm
 * focus. Nothing on it animates at rest; the body's turn is a short transition
 * on `transform` only.
 */
import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { ColourJob } from '../core/colourJobs';
import { cue } from '../../lib/sound';

export interface KnobProps {
  value: number;
  min?: number;
  max?: number;
  /** One click. The value handed back is always a whole number of these. */
  step?: number;
  onValueChange: (value: number) => void;
  /** Required accessible name — a knob has no visible label of its own. */
  label: string;
  /** What the value IS, in words ("40 percent"). Defaults to `format`. */
  valueText?: string;
  /** The readout under the knob; nothing is drawn without it. */
  format?: (value: number) => ReactNode;
  /** Outer diameter in px, dots included. */
  size?: number;
  colour?: ColourJob;
  /** How many lit dots ring it. */
  dots?: number;
  disabled?: boolean;
  style?: CSSProperties;
}

/** The sweep: 135° either side of straight up, the bottom quarter dead. */
const A0 = -135;
const A1 = 135;

export function Knob({
  value, min = 0, max = 100, step = 5, onValueChange, label, valueText, format,
  size = 120, colour = 'teal', dots = 10, disabled = false, style,
}: KnobProps) {
  const ring = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const span = Math.max(step, max - min);
  const frac = Math.max(0, Math.min(1, (value - min) / span));
  const snap = (v: number) => Math.max(min, Math.min(max, min + Math.round((v - min) / step) * step));

  const set = (next: number) => {
    const v = snap(next);
    if (v === value) return;
    cue('detent');
    onValueChange(v);
  };

  const valueAt = (clientX: number, clientY: number): number | null => {
    const r = ring.current?.getBoundingClientRect();
    if (!r) return null;
    const deg = (Math.atan2(clientX - (r.left + r.width / 2), -(clientY - (r.top + r.height / 2))) * 180) / Math.PI;
    const f = Math.max(0, Math.min(1, (deg - A0) / (A1 - A0)));
    return min + f * span;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const v = valueAt(e.clientX, e.clientY);
    if (v === null || Math.abs(v - value) > span / 3) return;
    set(v);
  };
  const onUp = () => { dragging.current = false; };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const by: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: step * 2, PageDown: -step * 2 };
    if (e.key in by) { e.preventDefault(); set(value + by[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); set(min); }
    if (e.key === 'End') { e.preventDefault(); set(max); }
  };

  const hue = `var(--job-${colour})`;
  const inset = Math.round(size * 0.15);
  /* A small knob (Focus's corner) gets smaller dots, or they touch the body. */
  const dot = size < 80 ? 4 : 6;
  const radius = size / 2 - Math.max(dot / 2 + 1, size * 0.04);
  const lit = Math.round(frac * dots);

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)', opacity: disabled ? 0.4 : 1, ...style }}>
      <div ref={ring} style={{ position: 'relative', width: size, height: size, touchAction: 'none', userSelect: 'none' }}>
        {Array.from({ length: dots + 1 }, (_, i) => {
          const a = ((A0 + ((A1 - A0) * i) / dots) * Math.PI) / 180;
          const on = i <= lit && frac > 0;
          return (
            <span
              key={i}
              aria-hidden="true"
              style={{
                position: 'absolute', left: '50%', top: '50%', width: dot, height: dot, margin: -dot / 2,
                borderRadius: '50%',
                transform: `translate(${(Math.sin(a) * radius).toFixed(1)}px, ${(-Math.cos(a) * radius).toFixed(1)}px)`,
                backgroundColor: on ? hue : 'oklch(1 0 0 / 0.12)',
                boxShadow: on ? `0 0 8px ${hue}` : 'none',
                transition: 'background-color var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass)',
              }}
            />
          );
        })}
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText ?? (format ? String(format(value)) : undefined)}
          aria-disabled={disabled || undefined}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
          style={{
            position: 'absolute', inset, borderRadius: '50%',
            cursor: disabled ? 'not-allowed' : 'grab',
            backgroundImage: 'var(--glass-fill-3)',
            boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
            transform: `rotate(${A0 + (A1 - A0) * frac}deg)`,
            transition: 'transform var(--dur-fast) var(--ease-springy)',
            outline: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: '50%', top: Math.round(size * 0.06),
              width: 4, height: Math.round(size * 0.13), marginLeft: -2, borderRadius: 2,
              backgroundColor: hue, boxShadow: `0 0 8px ${hue}`,
            }}
          />
        </div>
      </div>
      {format && (
        <span aria-hidden="true" style={{ font: 'var(--type-numeric)', color: 'var(--fg-1)' }}>{format(value)}</span>
      )}
    </div>
  );
}
