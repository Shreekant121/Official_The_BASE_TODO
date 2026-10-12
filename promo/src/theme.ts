// Aurora Glass tokens, copied from src/ui/tokens so the video matches the app.
export const C = {
  void0: 'oklch(0.075 0.002 260)',
  void1: 'oklch(0.120 0.003 260)',
  void2: 'oklch(0.180 0.003 260)',
  void3: 'oklch(0.240 0.004 260)',
  fg1: 'oklch(1 0 0)',
  fg2: 'oklch(0.790 0.004 260)',
  fg3: 'oklch(0.610 0.005 260)',
  fg4: 'oklch(0.450 0.005 260)',
  onAccent: 'oklch(0.145 0.02 162)',
  accent: 'oklch(0.700 0.150 162)',
  accentLift: 'oklch(0.785 0.140 165)',
  accentSink: 'oklch(0.600 0.130 161)',
  cyan: 'oklch(0.70 0.15 210)',
  violet: 'oklch(0.70 0.15 296)',
  amber: 'oklch(0.75 0.15 82)',
  rose: 'oklch(0.70 0.15 20)',
  grey: 'oklch(0.70 0.01 260)',
  lineFaint: 'oklch(1 0 0 / 0.06)',
  lineSoft: 'oklch(1 0 0 / 0.08)',
  lineStrong: 'oklch(1 0 0 / 0.18)',
} as const;

export type Hue = 'accent' | 'cyan' | 'violet' | 'amber' | 'rose' | 'grey';

export const HUE: Record<Hue, { h: number; l: number; c: number }> = {
  accent: { h: 162, l: 0.7, c: 0.15 },
  cyan: { h: 210, l: 0.7, c: 0.15 },
  violet: { h: 296, l: 0.7, c: 0.15 },
  amber: { h: 82, l: 0.75, c: 0.15 },
  rose: { h: 20, l: 0.7, c: 0.15 },
  grey: { h: 260, l: 0.7, c: 0.01 },
};

/** A status hue at a given alpha (and optional lightness override). */
export const hue = (name: Hue, a = 1, l?: number) => {
  const v = HUE[name];
  return `oklch(${l ?? v.l} ${v.c} ${v.h} / ${a})`;
};

export const FONT =
  "'Inter Variable', -apple-system, 'SF Pro Display', 'Segoe UI Variable', system-ui, sans-serif";

export const GLASS = {
  floor: 'color-mix(in oklch, oklch(0.120 0.003 260) 92%, transparent)',
  fill2:
    'linear-gradient(155deg, oklch(1 0 0 / 0.062) 0%, oklch(1 0 0 / 0.017) 52%, oklch(1 0 0 / 0.031) 100%)',
  fill3:
    'linear-gradient(155deg, oklch(1 0 0 / 0.11) 0%, oklch(1 0 0 / 0.03) 52%, oklch(1 0 0 / 0.06) 100%)',
  rim2:
    'inset 0 1px 1px 0 oklch(1 0 0 / 0.16), inset 0 -1px 1px 0 oklch(0 0 0 / 0.30), inset 1px 0 0 0 oklch(1 0 0 / 0.05), inset -1px 0 0 0 oklch(1 0 0 / 0.05)',
  rim3:
    'inset 0 1px 1px 0 oklch(1 0 0 / 0.30), inset 0 -1px 1px 0 oklch(0 0 0 / 0.38), inset 1px 0 0 0 oklch(1 0 0 / 0.10), inset -1px 0 0 0 oklch(1 0 0 / 0.08)',
  inner:
    'inset 0 16px 30px -18px oklch(1 0 0 / 0.10), inset 0 -20px 34px -22px oklch(0 0 0 / 0.68)',
  cast: '0 40px 90px -22px oklch(0 0 0 / 0.72), 0 6px 16px -6px oklch(0 0 0 / 0.50)',
  well: 'linear-gradient(180deg, oklch(0 0 0 / 0.30) 0%, oklch(0 0 0 / 0.14) 100%)',
  wellShadow: 'inset 0 2px 6px oklch(0 0 0 / 0.45), inset 0 -1px 0 oklch(1 0 0 / 0.06)',
  gel: 'radial-gradient(120% 100% at 22% 0%, oklch(0.90 0.11 165), oklch(0.72 0.16 162) 55%, oklch(0.50 0.12 165))',
  gelRim:
    'inset 0 1px 1px oklch(1 0 0 / 0.55), inset 0 -8px 20px -6px oklch(0.15 0.06 165 / 0.45), inset 0 0 0 1px oklch(1 0 0 / 0.14)',
  live: 'radial-gradient(90% 70% at 50% 120%, oklch(0.74 0.165 162 / 0.30), transparent 70%), linear-gradient(155deg, oklch(1 0 0 / 0.05), oklch(1 0 0 / 0.015))',
};

export const glow = (name: Hue = 'accent', k = 1) => {
  const v = HUE[name];
  const c = (a: number) => `oklch(${Math.min(0.85, v.l + 0.04)} ${v.c + 0.015} ${v.h} / ${a})`;
  return `0 0 ${60 * k}px ${-6 * k}px ${c(0.6)}, 0 0 ${140 * k}px ${-10 * k}px ${c(0.35)}`;
};
