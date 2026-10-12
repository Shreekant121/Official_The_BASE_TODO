import React, { useMemo } from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, FONT, GLASS, glow, hue, type Hue } from '../theme';
import { clamp, ease, kf, rnd, tw, useT } from '../lib';

/* ------------------------------------------------------------------ */
/* Lens: the app's own liquid-glass refraction map (design-system/     */
/* _ds_loader.js), plus a goo filter for metaball morphs.              */
/* ------------------------------------------------------------------ */
let lensUrl: string | null = null;
const getLens = () => {
  if (lensUrl) return lensUrl;
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const nx = (x / (N - 1)) * 2 - 1;
      const ny = (y / (N - 1)) * 2 - 1;
      const i = (y * N + x) * 4;
      const ex = Math.sign(nx) * (ss(0.45, 1, Math.abs(nx)) * 0.85 + Math.abs(nx) * 0.15);
      const ey = Math.sign(ny) * (ss(0.45, 1, Math.abs(ny)) * 0.85 + Math.abs(ny) * 0.15);
      img.data[i] = 128 - ex * 127;
      img.data[i + 1] = 128 - ey * 127;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  lensUrl = cv.toDataURL();
  return lensUrl;
};

const lensFilter = (id: string, k: number) => (
  <filter
    id={id}
    x="0"
    y="0"
    width="1"
    height="1"
    primitiveUnits="objectBoundingBox"
    colorInterpolationFilters="sRGB"
  >
    <feImage href={getLens()} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m" />
    <feDisplacementMap in="SourceGraphic" in2="m" scale={0.075 * k} xChannelSelector="R" yChannelSelector="G" result="dr" />
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r" />
    <feDisplacementMap in="SourceGraphic" in2="m" scale={0.065 * k} xChannelSelector="R" yChannelSelector="G" result="dg" />
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g" />
    <feDisplacementMap in="SourceGraphic" in2="m" scale={0.055 * k} xChannelSelector="R" yChannelSelector="G" result="db" />
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b" />
    <feBlend in="r" in2="g" mode="screen" result="rg" />
    <feBlend in="rg" in2="b" mode="screen" />
  </filter>
);

export const GlassDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
    <defs>
      {lensFilter('lens', 1)}
      {lensFilter('lens-strong', 2.4)}
      <filter id="goo" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="b" />
        <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 40 -18" result="g" />
        <feComposite in="SourceGraphic" in2="g" operator="atop" />
      </filter>
    </defs>
  </svg>
);

/* ------------------------------------------------------------------ */
/* Backdrop: near-black, the 88px measured grid, emerald light pools.  */
/* ------------------------------------------------------------------ */
export type Pool = { x: number; y: number; r: number; a: number; h?: Hue };

export const Backdrop: React.FC<{
  pools?: Pool[];
  gridOpacity?: number;
  gridShiftX?: number;
  gridShiftY?: number;
  gridScale?: number;
  vignette?: number;
}> = ({ pools = [{ x: 50, y: 110, r: 70, a: 0.35 }], gridOpacity = 1, gridShiftX = 0, gridShiftY = 0, gridScale = 1, vignette = 0.75 }) => {
  const t = useT();
  const cell = 88 * gridScale;
  return (
    <AbsoluteFill style={{ background: C.void0, overflow: 'hidden' }}>
      {pools.map((p, i) => {
        const dx = Math.sin(t * 0.35 + i * 2.1) * 3;
        const dy = Math.cos(t * 0.28 + i * 1.3) * 2.5;
        return (
          <AbsoluteFill
            key={i}
            style={{
              background: `radial-gradient(${p.r}% ${p.r * 0.85}% at ${p.x + dx}% ${p.y + dy}%, ${hue(p.h ?? 'accent', p.a, 0.62)}, transparent 70%)`,
            }}
          />
        );
      })}
      <AbsoluteFill
        style={{
          opacity: gridOpacity,
          backgroundImage: `linear-gradient(oklch(1 0 0 / 0.075) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.04) 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
          backgroundPosition: `${gridShiftX}px ${gridShiftY}px`,
          maskImage: 'radial-gradient(120% 100% at 50% 50%, black 30%, transparent 95%)',
        }}
      />
      <AbsoluteFill
        style={{ background: `radial-gradient(120% 90% at 50% 50%, transparent 45%, oklch(0 0 0 / ${vignette}) 100%)` }}
      />
    </AbsoluteFill>
  );
};

/** Film grain from a static noise tile, jittered each frame (an SVG turbulence filter is far too slow). */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const t = useT();
  const f = Math.floor(t * 24);
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        mixBlendMode: 'overlay',
        backgroundImage: `url(${staticFile('grain.png')})`,
        backgroundSize: '256px 256px',
        backgroundPosition: `${Math.floor(rnd(f) * 256)}px ${Math.floor(rnd(f + 99) * 256)}px`,
      }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Glass                                                               */
/* ------------------------------------------------------------------ */
export const Glass: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
  radius?: number;
  tint?: Hue;
  tintA?: number;
  /** 0..1 — how see-through the pane is. The app is ~0.08 (opaque floor). */
  clear?: number;
  blur?: number;
  refract?: 'lens' | 'lens-strong' | false;
  glowHue?: Hue;
  glowK?: number;
  thick?: boolean;
  live?: boolean;
}> = ({ children, style, radius = 26, tint, tintA = 0.22, clear = 0.08, blur = 0, refract = false, glowHue, glowK = 0, thick, live }) => {
  const floorA = clamp(1 - clear, 0, 0.95);
  const layers = [
    thick ? GLASS.fill3 : GLASS.fill2,
    live ? GLASS.live : null,
    tint
      ? `linear-gradient(155deg, ${hue(tint, tintA)} 0%, ${hue(tint, tintA * 0.3)} 55%, ${hue(tint, tintA * 0.6)} 100%)`
      : null,
    `linear-gradient(oklch(0.12 0.003 260 / ${floorA}), oklch(0.12 0.003 260 / ${floorA}))`,
  ].filter(Boolean);
  const bd = `${refract ? `url(#${refract}) ` : ''}blur(${blur}px) saturate(2.1) brightness(1.05)`;
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: radius,
        backgroundImage: layers.join(', '),
        backdropFilter: blur > 0 || refract ? bd : undefined,
        boxShadow: [thick ? GLASS.rim3 : GLASS.rim2, GLASS.inner, GLASS.cast, glowK > 0 ? glow(glowHue ?? 'accent', glowK) : null]
          .filter(Boolean)
          .join(', '),
        color: C.fg1,
        ...style,
      }}
    >
      {/* Splay: light fanning in from the top-left corner. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          background: 'radial-gradient(80% 60% at 0% 0%, oklch(1 0 0 / 0.07), transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
};

export const Well: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; radius?: number }> = ({ children, style, radius = 999 }) => (
  <div style={{ borderRadius: radius, background: GLASS.well, boxShadow: GLASS.wellShadow, ...style }}>{children}</div>
);

export const Gel: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties; glowK?: number; press?: number }> = ({ children, style, glowK = 0.6, press = 0 }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      borderRadius: 999,
      padding: '0 34px',
      height: 64,
      background: GLASS.gel,
      boxShadow: `${GLASS.gelRim}, ${glow('accent', glowK)}`,
      color: C.onAccent,
      fontWeight: 600,
      fontSize: 24,
      transform: `scale(${1 - press * 0.045})`,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Pill: React.FC<{ h: Hue; children: React.ReactNode; size?: number; dot?: boolean; style?: React.CSSProperties; solid?: boolean }> = ({ h, children, size = 16, dot = true, style, solid }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: size * 0.45,
      padding: `${size * 0.3}px ${size * 0.75}px`,
      borderRadius: 999,
      fontSize: size,
      fontWeight: 600,
      color: hue(h, 1, 0.82),
      background: solid ? hue(h, 0.3) : hue(h, 0.14),
      boxShadow: `inset 0 0 0 1px ${hue(h, 0.28)}`,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {dot && <span style={{ width: size * 0.4, height: size * 0.4, borderRadius: 99, background: hue(h, 1, 0.78), boxShadow: `0 0 8px ${hue(h, 0.9)}` }} />}
    {children}
  </div>
);

export const Score: React.FC<{ value: string; h?: Hue; size?: number }> = ({ value, h = 'amber', size = 16 }) => (
  <span
    style={{
      padding: `${size * 0.2}px ${size * 0.55}px`,
      borderRadius: 999,
      fontSize: size,
      fontWeight: 700,
      color: hue(h, 1, 0.85),
      background: hue(h, 0.16),
      boxShadow: `inset 0 0 0 1px ${hue(h, 0.3)}`,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    {value}
  </span>
);

export const Mark: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img src={staticFile('mark-white.png')} style={{ width: size, height: size, ...style }} />
);

/* ------------------------------------------------------------------ */
/* Kinetic type                                                        */
/* ------------------------------------------------------------------ */
/** Words rise out of a blur one after another. Wrap a word in *stars* to light it emerald. */
export const Words: React.FC<{
  text: string;
  at: number;
  stagger?: number;
  size?: number;
  weight?: number;
  style?: React.CSSProperties;
  out?: number;
  color?: string;
  accent?: Hue;
}> = ({ text, at, stagger = 0.07, size = 96, weight = 700, style, out, color = C.fg1, accent = 'accent' }) => {
  const t = useT();
  const words = text.split(' ');
  let inLit = false;
  const o = out !== undefined ? tw(t, out, out + 0.45, 1, 0, ease.in) : 1;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: `0 ${size * 0.26}px`,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: '-0.035em',
        lineHeight: 1.05,
        color,
        opacity: o,
        filter: o < 1 ? `blur(${(1 - o) * 14}px)` : undefined,
        ...style,
      }}
    >
      {words.map((w, i) => {
        // *one* or *several words* light up; the stars can wrap a span of words.
        if (w.startsWith('*')) inLit = true;
        const lit = inLit;
        if (w.replace(/[.,!?]$/, '').endsWith('*')) inLit = false;
        const clean = w.replace(/\*/g, '');
        const p = tw(t, at + i * stagger, at + i * stagger + 0.75);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * size * 0.45}px) rotateX(${(1 - p) * 50}deg)`,
              filter: p < 1 ? `blur(${(1 - p) * 14}px)` : undefined,
              ...(lit
                ? {
                    backgroundImage: `linear-gradient(100deg, ${hue(accent, 1, 0.92)}, ${hue(accent, 1, 0.74)} 60%, ${hue(accent, 1, 0.6)})`,
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    textShadow: `0 0 40px ${hue(accent, 0.35)}`,
                  }
                : null),
            }}
          >
            {clean}
          </span>
        );
      })}
    </div>
  );
};

/** Small uppercase system-voice kicker. */
export const Kicker: React.FC<{ children: React.ReactNode; at: number; style?: React.CSSProperties; h?: Hue }> = ({ children, at, style, h = 'accent' }) => {
  const t = useT();
  const p = tw(t, at, at + 0.6);
  return (
    <div
      style={{
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: `${0.2 + (1 - p) * 0.4}em`,
        textTransform: 'uppercase',
        color: hue(h, 1, 0.8),
        opacity: p,
        textShadow: `0 0 20px ${hue(h, 0.5)}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Caption block used by every feature scene. */
export const Caption: React.FC<{
  kicker: string;
  title: string;
  sub?: string;
  at: number;
  out?: number;
  align?: 'left' | 'center';
  size?: number;
  style?: React.CSSProperties;
  h?: Hue;
}> = ({ kicker, title, sub, at, out, align = 'left', size = 76, style, h = 'accent' }) => {
  const t = useT();
  const o = out !== undefined ? tw(t, out, out + 0.4, 1, 0, ease.in) : 1;
  const subP = sub ? tw(t, at + 0.5, at + 1.2) : 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'center',
        gap: 18,
        opacity: o,
        filter: o < 1 ? `blur(${(1 - o) * 14}px)` : undefined,
        ...style,
      }}
    >
      <Kicker at={at} h={h}>
        {kicker}
      </Kicker>
      <Words text={title} at={at + 0.1} size={size} style={{ justifyContent: align === 'left' ? 'flex-start' : 'center', textAlign: align }} accent={h} />
      {sub && (
        <div style={{ fontSize: 28, color: C.fg3, fontWeight: 500, opacity: subP, transform: `translateY(${(1 - subP) * 16}px)`, textAlign: align, maxWidth: 760 }}>
          {sub}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Cursor                                                              */
/* ------------------------------------------------------------------ */
export type CursorKey = { t: number; x: number; y: number; click?: boolean };

export const Cursor: React.FC<{ keys: CursorKey[]; show?: [number, number] }> = ({ keys, show }) => {
  const t = useT();
  const times = keys.map((k) => k.t);
  const x = kf(t, times, keys.map((k) => k.x));
  const y = kf(t, times, keys.map((k) => k.y));
  let press = 0;
  let ring = -1;
  for (const k of keys) {
    if (!k.click) continue;
    const d = t - k.t;
    if (d > -0.08 && d < 0.18) press = Math.max(press, 1 - Math.abs(d - 0.04) / 0.14);
    if (d >= 0 && d < 0.6) ring = d / 0.6;
  }
  const vis = show ? tw(t, show[0], show[0] + 0.3) * tw(t, show[1] - 0.3, show[1], 1, 0) : 1;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${x}px, ${y}px)`, opacity: vis, zIndex: 100, pointerEvents: 'none' }}>
      {ring >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: -40 - ring * 30,
            top: -40 - ring * 30,
            width: 80 + ring * 60,
            height: 80 + ring * 60,
            borderRadius: 999,
            border: `2px solid ${hue('accent', (1 - ring) * 0.8, 0.85)}`,
            boxShadow: `0 0 30px ${hue('accent', (1 - ring) * 0.6)}`,
          }}
        />
      )}
      <svg width="38" height="38" viewBox="0 0 24 24" style={{ transform: `scale(${1 - press * 0.18})`, transformOrigin: '6px 4px', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.55))' }}>
        <path d="M5 3l14 8.2-6.3 1.3 3.7 6.7-2.6 1.4-3.7-6.8L5.5 18.6z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Effects                                                             */
/* ------------------------------------------------------------------ */
/** A deterministic particle burst from (x,y), starting at `at`. */
export const Burst: React.FC<{ x: number; y: number; at: number; n?: number; seed?: number; power?: number; h?: Hue; dur?: number; gravity?: number }> = ({
  x,
  y,
  at,
  n = 60,
  seed = 1,
  power = 900,
  h = 'accent',
  dur = 1.6,
  gravity = 600,
}) => {
  const t = useT();
  const d = t - at;
  const parts = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        a: rnd(seed * 100 + i) * Math.PI * 2,
        v: (0.35 + rnd(seed * 200 + i) * 0.65) * power,
        s: 3 + rnd(seed * 300 + i) * 9,
        l: 0.7 + rnd(seed * 400 + i) * 0.25,
        life: 0.6 + rnd(seed * 500 + i) * 0.4,
        streak: rnd(seed * 600 + i) > 0.6,
      })),
    [n, seed, power],
  );
  if (d < 0 || d > dur) return null;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {parts.map((p, i) => {
        const life = d / (dur * p.life);
        if (life > 1) return null;
        const k = 1 - Math.exp(-d * 3.2);
        const px = x + Math.cos(p.a) * p.v * k * 0.32;
        const py = y + Math.sin(p.a) * p.v * k * 0.32 + gravity * d * d * 0.5;
        const o = 1 - life;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: px,
              top: py,
              width: p.streak ? p.s * 3.5 : p.s,
              height: p.s * (p.streak ? 0.45 : 1),
              borderRadius: 99,
              background: hue(h, 1, p.l + 0.1),
              boxShadow: `0 0 ${p.s * 2}px ${hue(h, 0.9)}`,
              opacity: o,
              transform: `translate(-50%,-50%) rotate(${(p.a * 180) / Math.PI}deg) scale(${1 - life * 0.5})`,
            }}
          />
        );
      })}
    </div>
  );
};

/** One expanding ring of light. */
export const Shockwave: React.FC<{ x: number; y: number; at: number; dur?: number; max?: number; h?: Hue; width?: number }> = ({ x, y, at, dur = 1, max = 1400, h = 'accent', width = 3 }) => {
  const t = useT();
  const p = tw(t, at, at + dur, 0, 1, ease.out);
  if (t < at || p >= 1) return null;
  const r = p * max;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: `${width * (1 - p) + 1}px solid ${hue(h, (1 - p) * 0.9, 0.85)}`,
        boxShadow: `0 0 ${60 * (1 - p)}px ${hue(h, (1 - p) * 0.7)}, inset 0 0 ${60 * (1 - p)}px ${hue(h, (1 - p) * 0.4)}`,
        pointerEvents: 'none',
      }}
    />
  );
};

/** A full-frame white/emerald flash. */
export const Flash: React.FC<{ at: number; dur?: number; peak?: number; color?: string }> = ({ at, dur = 0.5, peak = 0.9, color = 'oklch(0.95 0.06 165)' }) => {
  const t = useT();
  const o = kf(t, [at - 0.05, at, at + dur], [0, peak, 0], ease.out);
  if (o <= 0) return null;
  return <AbsoluteFill style={{ background: color, opacity: o, mixBlendMode: 'screen', pointerEvents: 'none' }} />;
};

/** A diagonal sheen that sweeps once across its parent. */
export const Sweep: React.FC<{ at: number; dur?: number; radius?: number; strength?: number }> = ({ at, dur = 0.9, radius = 0, strength = 0.22 }) => {
  const t = useT();
  const p = tw(t, at, at + dur, -0.4, 1.4, ease.inOut);
  if (t < at || t > at + dur) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: '-50%',
          bottom: '-50%',
          width: '35%',
          left: `${p * 100}%`,
          transform: 'rotate(18deg)',
          background: `linear-gradient(90deg, transparent, oklch(1 0 0 / ${strength}), transparent)`,
        }}
      />
    </div>
  );
};

export const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: FONT, ...style }}>{children}</AbsoluteFill>
);
