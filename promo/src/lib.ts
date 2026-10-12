import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const ease = {
  glass: Easing.bezier(0.22, 0.61, 0.36, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1), // expo-ish out
  inOut: Easing.bezier(0.65, 0, 0.35, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
  snap: Easing.bezier(0.87, 0, 0.13, 1),
};

/** Seconds since the start of the enclosing <Sequence>. */
export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

/** Clamped tween over seconds. */
export const tw = (
  t: number,
  start: number,
  end: number,
  from = 0,
  to = 1,
  easing: (x: number) => number = ease.out,
) =>
  interpolate(t, [start, end], [from, to], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Multi-stop clamped interpolation over seconds. */
export const kf = (t: number, times: number[], values: number[], easing = ease.inOut) =>
  interpolate(t, times, values, { easing, extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** A spring that starts `delay` seconds into the sequence. */
export const useSpring = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (delay: number, cfg: { damping?: number; stiffness?: number; mass?: number } = {}) =>
    spring({
      frame: frame - delay * fps,
      fps,
      config: { damping: 14, stiffness: 120, mass: 0.9, ...cfg },
    });
};

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
export const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Standard entrance: fade + rise + unblur. */
export const enter = (t: number, at: number, dur = 0.7, dist = 40) => {
  const p = tw(t, at, at + dur);
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * dist}px)`,
    filter: p < 1 ? `blur(${(1 - p) * 12}px)` : undefined,
  } as const;
};

/** Standard exit: fade + blur + slight scale. */
export const exitStyle = (t: number, at: number, dur = 0.5) => {
  const p = tw(t, at, at + dur, 0, 1, ease.in);
  return { opacity: 1 - p, filter: p > 0 ? `blur(${p * 16}px)` : undefined, scale: 1 + p * 0.06 };
};

export const fmtClock = (secs: number) => {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};
