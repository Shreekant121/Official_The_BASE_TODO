/**
 * MinuteRuler — pick a length by sliding a ruler of minutes under a marker
 * (29-1P10a, idea 97, "Drag the minutes": the camera's zoom dial, the Watch's
 * timer). It clicks to every `step` and says what the choice means as you go.
 *
 * Use it where he chooses how long something lasts: Focus's "+ time", and a
 * task's time on Set Deadlines (opened from its `TimeWell`). One finger, no
 * typing — the boxes beside it stay for typing.
 *
 * HOW IT IS BUILT
 * ---------------
 * **A real horizontal scroller with scroll snap**, not a drag handler moving a
 * transform. A finger flicks it with the browser's own momentum and lands on a
 * snap point, and nothing runs while it rests: the ticks are one background
 * image, and the only script is a `scroll` listener that turns `scrollLeft`
 * into minutes. A mouse has no momentum, so a mouse press drags `scrollLeft`
 * itself and snaps on release.
 *
 * **The value lives in the scroll position.** Minute `m` sits at
 * `(m - min) * PX` from the start, and the track is padded by half the
 * scroller on each side (`padding: 0 50%`, which resolves against the
 * scroller, never a measured width), so the marker
 * in the middle reads the value with no layout read at all.
 *
 * Colour: teal, Focus's job (the idea page drew an orange marker; a minute of
 * focus is teal's — "one colour, one job").
 */
import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cue } from '../../lib/sound';

/** Pixels per minute, the idea page's. Five minutes is 60px — a fingertip and a half. */
const PX = 12;
const SNAP = 'x mandatory';
const FADE = 'linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)';

export interface MinuteRulerProps {
  /** Minutes. Kept to the nearest `step` inside `min`…`max` on the way in. */
  value: number;
  /** Every time the marker crosses onto a new step, as he slides. */
  onChange: (minutes: number) => void;
  /** Once the ruler has come to rest — the moment to write anything expensive. */
  onCommit?: (minutes: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** What the readout calls the number, for a screen reader too: "Add", "Length". */
  label: string;
  /** Before the number: "+" for an amount added. */
  sign?: string;
  /** The line under the number — "ends at 10:40". */
  hint?: ReactNode;
  style?: CSSProperties;
}

/** "25", or "1h 25" past the hour; the unit beside it says which. */
function rulerReading(minutes: number): { n: string; unit: string } {
  if (minutes < 60) return { n: String(minutes), unit: 'min' };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? { n: String(h), unit: h === 1 ? 'hour' : 'hours' } : { n: `${h}h ${m}`, unit: 'min' };
}

/** A label under a long tick: "45", "1h", "1:15". */
function tickLabel(minutes: number): string {
  if (minutes < 60) return String(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}:${m < 10 ? '0' : ''}${m}`;
}

export function MinuteRuler({
  value, onChange, onCommit, min = 0, max = 90, step = 5, label, sign = '', hint, style,
}: MinuteRulerProps) {
  const tape = useRef<HTMLDivElement>(null);
  /** The last value this ruler reported, so a scroll it caused is not echoed back into it. */
  const shown = useRef<number | null>(null);
  /** The last value handed to `onCommit` (or brought in from outside), so a rest on it again writes nothing. */
  const committed = useRef<number | null>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  const range = max - min;
  const clamp = (m: number) => Math.min(max, Math.max(min, Math.round(m / step) * step));
  const at = clamp(value);

  /* Land on the value without animating: on open, and whenever it was changed
     from outside (typed into the boxes beside it). A write, never a read. */
  useLayoutEffect(() => {
    const el = tape.current;
    if (!el || shown.current === at) return;
    shown.current = at;
    committed.current = at;
    el.scrollLeft = (at - min) * PX;
  }, [at, min]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const read = () => {
    const el = tape.current;
    if (!el) return;
    const next = clamp(min + el.scrollLeft / PX);
    if (next !== shown.current) {
      shown.current = next;
      cue('detent');
      onChange(next);
    }
    settle();
  };

  /* `scrollend` is not everywhere yet; a quiet 180ms is the same moment. Also
     called on a mouse's release, which scrolls nothing when it lets go right
     on a step — and a ruler that only wrote on a scroll would keep that one. */
  const settle = () => {
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      const now = shown.current;
      if (drag.current || now === null || now === committed.current) return;
      committed.current = now;
      onCommit?.(now);
    }, 180);
  };

  const go = (minutes: number) => {
    tape.current?.scrollTo({ left: (clamp(minutes) - min) * PX, behavior: 'smooth' });
  };

  /* A label every quarter hour, however long the ruler: the stretch under the
     marker is never more than about twenty-five minutes wide. */
  const every = 15;
  const marks: ReactNode[] = [];
  for (let m = Math.ceil(min / step) * step; m <= max; m += step) {
    marks.push(
      <span
        key={`s${m}`}
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, left: (m - min) * PX, width: 1, height: 1, scrollSnapAlign: 'center' }}
      />,
    );
    if (m % every === 0) {
      marks.push(
        <span
          key={`l${m}`}
          aria-hidden="true"
          style={{
            position: 'absolute', bottom: 2, left: (m - min) * PX,
            width: 40, marginLeft: -20, textAlign: 'center',
            font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {tickLabel(m)}
        </span>,
      );
    }
  }

  const reading = rulerReading(at);

  return (
    /* `minmax(0, 1fr)` and `justifySelf: stretch`: the ruler takes the width
       it is given and never asks for the tape's — which is hours long. */
    <div
      style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', justifyItems: 'center', justifySelf: 'stretch',
        gap: 'var(--sp-2)', width: '100%', ...style,
      }}
    >
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
        <b
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-bold)',
            color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 1,
          }}
        >
          {sign}{reading.n}
        </b>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-3)' }}>{reading.unit}</span>
      </div>
      {hint !== undefined && (
        <div style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', minHeight: '1.4em', textAlign: 'center' }}>{hint}</div>
      )}

      <div style={{ position: 'relative', width: '100%' }}>
        <div
          ref={tape}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={at}
          aria-valuetext={`${sign}${reading.n} ${reading.unit}`}
          className="ag-scroll"
          onScroll={read}
          onKeyDown={(e) => {
            const by = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
              : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step
                : e.key === 'PageUp' ? 15 : e.key === 'PageDown' ? -15 : 0;
            if (by !== 0) { e.preventDefault(); go(at + by); return; }
            if (e.key === 'Home') { e.preventDefault(); go(min); }
            if (e.key === 'End') { e.preventDefault(); go(max); }
          }}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse' || !tape.current) return;
            drag.current = { x: e.clientX, left: tape.current.scrollLeft };
            tape.current.style.scrollSnapType = 'none';
            tape.current.style.cursor = 'grabbing';
            tape.current.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current || !tape.current) return;
            tape.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
          }}
          onPointerUp={() => {
            if (!drag.current || !tape.current) return;
            drag.current = null;
            tape.current.style.scrollSnapType = SNAP;
            tape.current.style.cursor = '';
            go(shown.current ?? at);
            settle();
          }}
          onPointerCancel={() => {
            drag.current = null;
            if (tape.current) tape.current.style.scrollSnapType = SNAP;
          }}
          style={{
            position: 'relative', height: 66, width: '100%', contain: 'inline-size',
            overflowX: 'auto', overflowY: 'hidden', overscrollBehaviorX: 'contain',
            scrollSnapType: SNAP, touchAction: 'pan-x', userSelect: 'none', cursor: 'grab',
            /* The ends fade, so the ruler reads as running on past the edges. */
            WebkitMaskImage: FADE, maskImage: FADE,
          }}
        >
          {/* Half the scroller of padding each side, so minute `min` sits under
              the marker at scrollLeft 0; the track inside is the minutes. */}
          <div style={{ width: 'max-content', height: '100%', padding: '0 50%' }}>
          <div style={{ position: 'relative', height: '100%', width: range * PX }}>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute', left: 0, bottom: 22, height: 26, width: range * PX + 1,
                backgroundImage:
                  `repeating-linear-gradient(90deg, var(--fg-3) 0 1.5px, transparent 1.5px ${PX * 5}px),`
                  + ` repeating-linear-gradient(90deg, var(--fg-4) 0 1px, transparent 1px ${PX}px)`,
                backgroundSize: '100% 100%, 100% 50%',
                backgroundPosition: '0 0, 0 100%',
                backgroundRepeat: 'no-repeat',
                opacity: 0.8,
              }}
            />
            {marks}
          </div>
          </div>
        </div>
        {/* The marker. Still: a glow, not a pulse. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', left: '50%', top: 8, bottom: 16, width: 2, marginLeft: -1,
            borderRadius: 1, background: 'var(--job-teal)', boxShadow: 'var(--job-teal-shine)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
