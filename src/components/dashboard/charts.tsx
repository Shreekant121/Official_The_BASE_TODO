/**
 * The Dashboard's two time charts (BIG-6, 29-1b; redrawn in 29-1P12). His
 * calls:
 *
 * - **Hours today = a glass that fills** (idea 28, 2026-09-30), replacing
 *   29-1b's half gauge — he removed the gauge as idea 9 — "but with better
 *   animation and design" than the ideas page: `GlassFill`. **Teal**, the
 *   focus colour, his pick; **gold once he works past his hours**, his pick
 *   (the reward colour; the gauge's amber is not one of the ten).
 * - **Focus week = dot-matrix bars** (idea 7): a column of lit dots a day,
 *   today teal and the rest grey, a dashed line at hours available, hand-logged
 *   time as hollow dots (`WeekBars`).
 * - His pick when 29-1b asked: time on something that **doesn't count as
 *   worked is shown greyed**, outside the totals, on both.
 * - **Charts grow in once** — on open and when a number changes — and then
 *   sit still (Performance rule 1). The one loop is the glass's surface, which
 *   moves only while the focus timer runs: it is working right now.
 *
 * Every fill is `backgroundImage` / `backgroundColor`, never the `background`
 * shorthand: React clears the image with it on re-render.
 */
import { useId, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { useMotion } from '../../ui';
import { cubic, usePlayOnChange } from './motionOnce';

/** `parts.tsx`'s "not yet" stripes, the same hatch. */
const HATCH = 'repeating-linear-gradient(135deg, oklch(1 0 0 / 0.11) 0 2px, transparent 2px 7px)';
const TEAL = 'var(--job-teal)';
const GOLD = 'var(--job-gold)';
/** Teal a touch fainter and hatched: time he logged by hand. */
const HAND_FILL = 'color-mix(in oklch, var(--job-teal) 45%, transparent)';
/** Time on something that doesn't count as worked. */
const NOT_COUNTED_FILL = 'oklch(1 0 0 / 0.10)';
/** The same, as a dot: a dot is small, so it needs twice the light. */
const NOT_COUNTED_DOT = 'color-mix(in oklch, var(--fg-1) 20%, transparent)';

export interface GaugeSlices {
  /** Seconds, each. */
  timer: number;
  hand: number;
  notCounted: number;
  available: number;
}

// ─── The glass that fills ───────────────────────────────────────────────────

/* The glass, in a 100 × 125 box: a tumbler, a little narrower at the foot. */
const VESSEL = 'M 4 4 L 12.6 108 Q 13.7 121 26.5 121 L 73.5 121 Q 86.3 121 87.4 108 L 96 4 Z';
/* Full stops just under the lip: at 10 a full glass read as a dark band. */
const TOP = 7;
const BOTTOM = 121;
/** Where the surface sits for a fraction full. */
const levelY = (f: number) => BOTTOM - (BOTTOM - TOP) * f;
/** The right-hand wall's x at height y, for the measuring marks. */
const wallX = (y: number) => 96 - (8.6 * (y - 4)) / 104;

/* A liquid is a shape from its surface (y = 0) down past the foot, moved to
   its level as a whole. Two surfaces: still, and a wave of two periods of 50
   so sliding it by one period loops without a seam. */
const FLAT = 'M -100 0 H 200 V 132 H -100 Z';
const WAVE = (() => {
  const pts: string[] = [];
  for (let x = -100; x <= 200; x += 5) pts.push(`${x} ${(-2.2 * Math.sin((2 * Math.PI * x) / 50)).toFixed(2)}`);
  return `M ${pts.join(' L ')} L 200 132 L -100 132 Z`;
})();

/**
 * The glass: pressed into the block, lit on its left wall, marked at each
 * quarter. The timer's time is solid teal at the bottom, hand-logged time
 * hatched above it, and what doesn't count a faint grey on top; full is the
 * hours available. Past them the glass is full and gold.
 *
 * How it moves, all of it once:
 * - **It pours on open**: each layer rises from the foot on the springy
 *   curve, a hair after the one below, and overshoots a little as a poured
 *   drink does. The surface **sloshes once and calms**.
 * - **A new value rises or falls to it** the same way, and sloshes again.
 * - **While the focus timer runs the surface moves** — the only loop, and it
 *   stops when the timer does.
 * - **The number inside is dark where the liquid is and light above it**: two
 *   copies of `render`'s output, each clipped at the surface and moving with
 *   it, so the figure stays readable wherever the level is.
 */
export function GlassFill({
  slices, height, running = false, render,
}: { slices: GaugeSlices; height: number; running?: boolean; render?: (ink: string) => ReactNode }) {
  const uid = useId().replace(/:/g, '');
  const cap = Math.max(slices.available, 1);
  const frac = (s: number) => Math.max(0, Math.min(1, s / cap));
  const a = frac(slices.timer);
  const b = Math.min(1, a + frac(slices.hand));
  const c = Math.min(1, b + frac(slices.notCounted));
  const over = slices.timer + slices.hand > slices.available;
  const tone = over ? GOLD : TEAL;
  const job = over ? 'gold' : 'teal';

  const m = useMotion();
  const ids = { vessel: `glass-v-${uid}`, liquid: `glass-l-${uid}`, hand: `glass-h-${uid}`, shine: `glass-s-${uid}` };

  /* The surface the dark copy of the number is clipped at: the top of what counts. */
  const surface = `${((levelY(b) / 125) * 100).toFixed(2)}%`;
  const inkClip = b > 0.0005 ? `inset(${surface} 0 0 0)` : 'inset(100% 0 0 0)';
  const lightClip = b > 0.0005 ? `inset(0 0 calc(100% - ${surface}) 0)` : 'inset(0)';
  const inkRef = useRef<HTMLDivElement>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const pour = { duration: m.dur.sheet * 4200, easing: cubic(m.ease.springy), delay: 80, fill: 'backwards' as const };
  usePlayOnChange(inkRef, 'poured', (el) => el.animate([{ clipPath: 'inset(100% 0 0 0)' }], pour));
  usePlayOnChange(lightRef, 'poured', (el) => el.animate([{ clipPath: 'inset(0)' }], pour));
  const number = (ink: string, clip: string, ref: RefObject<HTMLDivElement | null>) =>
    render && (
      <div ref={ref} aria-hidden={ink !== 'var(--fg-1)' || undefined} className="dash-glass-number" style={{ clipPath: clip }}>
        {render(ink)}
      </div>
    );

  return (
    <div style={{ position: 'relative', width: Math.round(height * 0.8), height, flex: '0 0 auto' }} data-running={running || undefined}>
      <svg viewBox="0 0 100 125" width="100%" height="100%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={ids.vessel}><path d={VESSEL} /></clipPath>
          <linearGradient id={ids.liquid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: `color-mix(in oklch, ${tone}, white 16%)` }} />
            <stop offset="0.7" style={{ stopColor: `color-mix(in oklch, ${tone}, black 22%)` }} />
          </linearGradient>
          <pattern id={ids.hand} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" style={{ fill: `color-mix(in oklch, ${tone} 42%, transparent)` }} />
            <rect width="2" height="6" style={{ fill: `color-mix(in oklch, ${tone} 85%, transparent)` }} />
          </pattern>
          <linearGradient id={ids.shine} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="white" stopOpacity="0.2" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${ids.vessel})`}>
          {/* The inside, pressed into the block. */}
          <path d={VESSEL} fill="oklch(0 0 0 / 0.34)" />
          <path d={VESSEL} fill="none" stroke="oklch(0 0 0 / 0.45)" strokeWidth={7} />
          {/* Drawn top-most level first, so each lower layer covers the one above's foot. */}
          {c - b > 0.0005 && <GlassLayer level={c} fill={NOT_COUNTED_FILL} delay={160} running={running} />}
          {b - a > 0.0005 && <GlassLayer level={b} fill={`url(#${ids.hand})`} delay={80} running={running} />}
          {a > 0.0005 && <GlassLayer level={a} fill={`url(#${ids.liquid})`} delay={0} running={running} />}
          {/* A measuring mark at each quarter, on the right wall. */}
          {[0.25, 0.5, 0.75].map((t) => {
            const y = levelY(t);
            const x = wallX(y);
            return <line key={t} x1={x - 9} y1={y} x2={x - 2} y2={y} stroke="oklch(1 0 0 / 0.26)" strokeWidth={1.2} strokeLinecap="round" />;
          })}
          {/* The light on the left wall, over the liquid: it is behind glass. */}
          <path d="M 10.5 14 L 16 96" stroke={`url(#${ids.shine})`} strokeWidth={3.4} strokeLinecap="round" />
          <path d="M 17 14 L 18.6 34" stroke={`url(#${ids.shine})`} strokeWidth={1.4} strokeLinecap="round" />
        </g>
        <path
          d={VESSEL}
          fill="none"
          strokeWidth={1.3}
          strokeLinejoin="round"
          style={{ stroke: over ? `color-mix(in oklch, var(--job-gold) 70%, transparent)` : 'oklch(1 0 0 / 0.16)' }}
        />
        <line x1={4.6} y1={4} x2={95.4} y2={4} stroke="oklch(1 0 0 / 0.3)" strokeWidth={1.3} strokeLinecap="round" />
      </svg>
      {number('var(--fg-1)', lightClip, lightRef)}
      {number(`var(--job-${job}-deep)`, inkClip, inkRef)}
    </div>
  );
}

/**
 * One liquid in the glass, from its surface down past the foot, moved to its
 * level. It pours up from the foot the first time, a hair after the layer
 * below; every new level after that is the CSS transition, and every level
 * (the first included) sloshes the surface once, then it lies still.
 */
function GlassLayer({ level, fill, delay, running }: { level: number; fill: string; delay: number; running: boolean }) {
  const m = useMotion();
  const layerRef = useRef<SVGGElement>(null);
  const sloshRef = useRef<SVGPathElement>(null);
  usePlayOnChange(layerRef, 'poured', (el) =>
    el.animate([{ transform: 'translateY(125px)' }], {
      duration: m.dur.sheet * 4200, easing: cubic(m.ease.springy), delay, fill: 'backwards',
    }),
  );
  usePlayOnChange(sloshRef, level, (el, first) =>
    el.animate(
      [
        { transform: 'translateX(0) scaleY(1.7)', opacity: 1 },
        { transform: 'translateX(-50px) scaleY(0.1)', opacity: 0 },
      ],
      { duration: m.dur.sheet * 5500, easing: cubic(m.ease.glide), delay: first ? delay + m.dur.sheet * 1400 : delay },
    ),
  );
  return (
    <g ref={layerRef} className="dash-glass-layer" style={{ transform: `translateY(${levelY(level)}px)`, transitionDelay: `${delay}ms` }}>
      {running ? (
        <path className="dash-glass-wave" d={WAVE} fill={fill} />
      ) : (
        <>
          <path d={FLAT} fill={fill} />
          {/* Still, it is invisible; `el.animate` shows it rippling and calming. */}
          <path ref={sloshRef} d={WAVE} fill={fill} style={{ opacity: 0, transformOrigin: '0 0' }} />
          <rect x={-100} y={-0.3} width={300} height={1.1} fill="oklch(1 0 0 / 0.28)" />
        </>
      )}
    </g>
  );
}

// ─── Focus this week: dot-matrix bars ───────────────────────────────────────

export interface WeekBar {
  /** One letter, "M". */
  label: string;
  /** Seconds, each. */
  timer: number;
  hand: number;
  notCounted: number;
  available: number;
  today: boolean;
  /** A day not reached yet: only its unlit dots and its line. */
  future: boolean;
  /** "Thu 12 Mar: 4h 10m of 12h". */
  title: string;
}

/** A field of dots, one per `pitch` square, anchored at the bottom. */
function dots(colour: string, dot: number, pitch: number, ring = false): CSSProperties {
  const r = dot / 2;
  const image = ring
    ? `radial-gradient(circle, transparent ${r - 1.9}px, ${colour} ${r - 1.5}px, ${colour} ${r - 0.5}px, transparent ${r}px)`
    : `radial-gradient(circle, ${colour} ${r - 0.6}px, transparent ${r}px)`;
  return {
    backgroundImage: image,
    backgroundSize: `${pitch}px ${pitch}px`,
    /* Whole dots across, spaced to the width, so every column lines up with
       the unlit field behind it whatever the block's width. */
    backgroundRepeat: 'space repeat',
    backgroundPosition: 'left bottom',
  };
}

/**
 * A column of dots a day (idea 7). The lit dots come on from the bottom a row
 * at a time, one day just after another, once on open and again when that
 * day's value moves (`key`); hovering a day names it (`title`).
 */
export function WeekBars({ days, height }: { days: WeekBar[]; height: number }) {
  const pitch = height >= 100 ? 9 : 8;
  const dot = pitch - 3;
  const rows = Math.max(4, Math.floor(height / pitch));
  const barH = rows * pitch;
  const top = Math.max(3600, ...days.map((d) => Math.max(d.available, d.timer + d.hand + d.notCounted)));
  /* Rows lit for so many seconds; anything at all lights at least one. */
  const rowsFor = (s: number) => (s <= 0 ? 0 : Math.max(1, Math.round((s / top) * rows)));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gap: 'var(--sp-3)', alignItems: 'end' }}>
      {days.map((d, i) => {
        /* The greys are the block's own text colour, thinned, so they read on
           a full-colour block (where that colour is the ink) as on glass. */
        const lit = d.today ? TEAL : 'color-mix(in oklch, var(--fg-1) 38%, transparent)';
        const ring = d.today ? 'color-mix(in oklch, var(--job-teal) 80%, transparent)' : 'color-mix(in oklch, var(--fg-1) 32%, transparent)';
        const t = rowsFor(d.timer);
        const th = Math.max(t, rowsFor(d.timer + d.hand));
        const all = Math.max(th, rowsFor(d.timer + d.hand + d.notCounted));
        const band = (from: number, to: number, style: CSSProperties) =>
          to > from && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: from * pitch, height: (to - from) * pitch, ...style }} />
          );
        return (
          <div key={i} title={d.title} className="dash-dotcol" style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0 }}>
            <div style={{ position: 'relative', height: barH, marginInline: '8%' }}>
              {/* Every dot, unlit. */}
              <div
                style={{
                  position: 'absolute', inset: 0,
                  ...dots(`color-mix(in oklch, var(--fg-1) ${d.future ? 5 : 9}%, transparent)`, dot, pitch),
                }}
              />
              {!d.future && all > 0 && (
                <LitDots value={`${t}-${th}-${all}`} rows={all} pitch={pitch} delay={i * 50}>
                  {band(0, t, dots(lit, dot, pitch))}
                  {band(t, th, dots(ring, dot, pitch, true))}
                  {band(th, all, dots(NOT_COUNTED_DOT, dot, pitch))}
                </LitDots>
              )}
              {d.available > 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: '-8%', right: '-8%', bottom: `${Math.min(100, (d.available / top) * 100)}%`,
                    borderTop: `1.5px dashed ${d.today ? 'color-mix(in oklch, var(--job-teal) 70%, transparent)' : 'oklch(1 0 0 / 0.2)'}`,
                  }}
                />
              )}
            </div>
            <span
              style={{
                textAlign: 'center', font: 'var(--type-caption)',
                fontWeight: d.today ? 'var(--weight-medium)' : undefined,
                color: d.today ? TEAL : 'var(--fg-4)',
              }}
            >
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A day's lit dots. They come on from the bottom a row at a time — `steps()`,
 * one step per lit row — once when the chart appears and again when the
 * day's value moves, never on the way back to the screen.
 */
function LitDots({ value, rows, pitch, delay, children }: { value: string; rows: number; pitch: number; delay: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  usePlayOnChange(ref, value, (el) =>
    el.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0)' }], {
      duration: Math.min(900, 120 + rows * 45), easing: `steps(${rows}, end)`, delay, fill: 'backwards',
    }),
  );
  /* Exactly the lit rows tall, so each step uncovers one row of dots. */
  return <div ref={ref} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: rows * pitch }}>{children}</div>;
}

/**
 * The key under a chart: a swatch and a word. `dots` draws them as the week's
 * dots are drawn (hand-logged time a hollow dot), not as the glass's layers.
 */
export function Swatch({ kind, dots: round = false, children }: { kind: 'timer' | 'hand' | 'grey'; dots?: boolean; children: ReactNode }) {
  const style: CSSProperties =
    kind === 'timer' ? { backgroundColor: TEAL }
      : kind === 'hand'
        ? round
          ? { boxShadow: 'inset 0 0 0 2px color-mix(in oklch, var(--job-teal) 80%, transparent)' }
          : { backgroundColor: HAND_FILL, backgroundImage: HATCH }
        : { backgroundColor: NOT_COUNTED_FILL, boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.14)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
      <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: round ? '50%' : 3, flex: '0 0 auto', ...style }} />
      {children}
    </span>
  );
}
