/**
 * V3's lens — the glass that bends and colour-fringes what is behind it (V3-1).
 * Ported from the lens half of design-system/_ds_loader.js (v4).
 *
 * One SVG filter, `#ag-lens`: a displacement map that pushes the backdrop
 * outward, hardest at the edges (REFRACTION), applied three times at slightly
 * different strengths to the red, green and blue channels and screened back
 * together, so every edge fringes with colour (DISPERSION). `ui/tokens/v3.css`
 * then leads every `--glass-bd-*` inside a `<V3Scope>` with `url(#ag-lens)`.
 *
 * WHERE IT RUNS. Only Chromium honours an SVG filter inside `backdrop-filter`;
 * WebKit drops the whole declaration, blur included. So this marks
 * `<html data-ag-lens>` on Chromium alone and `v3.css` keys the lens off that
 * attribute — everywhere else V3 glass keeps its frost, depth and splay and
 * simply does not bend. Both of Shreekant's devices are Chromium (Brave).
 * **He chose, 2026-09-23, to run it on the tablet too**, which has no GPU;
 * the first screen session to switch a screen to V3 should watch it scroll
 * there, and `v3.css`'s touch rule is where it would be turned down.
 *
 * WHAT IT COSTS AN UNCONVERTED SCREEN: nothing drawn. The filter is a
 * zero-size `<svg>` and the attribute matches no rule outside `[data-v3]`.
 * The map is built once, on first mount, and only on Chromium — jsdom and
 * WebKit never touch a canvas.
 */
import { useEffect, useState } from 'react';

/** The design's own check. Brave and Edge are Chromium and pass it. */
function isChromium(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { chrome?: unknown };
  return !!w.chrome && /Chrom/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
}

let mapUrl: string | null = null;

/**
 * The displacement map, as `_ds_loader.js` draws it: 256 x 256, red carries
 * the horizontal push and green the vertical, 128 is "no push". Flat through
 * the middle, rising on a smoothstep over the outer 55% of each axis, plus a
 * faint linear term so the centre is not perfectly dead.
 */
function lensMap(): string | null {
  if (mapUrl) return mapUrl;
  const N = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(N, N);
  const ss = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < N; y++) {
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
  }
  ctx.putImageData(img, 0, 0);
  mapUrl = canvas.toDataURL();
  return mapUrl;
}

/* One channel: displace by `scale`, then keep only that channel. */
const CHANNELS = [
  { scale: 0.075, matrix: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0', out: 'r' },
  { scale: 0.065, matrix: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0', out: 'g' },
  { scale: 0.055, matrix: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0', out: 'b' },
] as const;

/** Mount once, near the root. */
export function GlassLens() {
  /* Built once, in the initialiser: this app renders only in a browser, and
     the map is a pure function of nothing. */
  const [href] = useState<string | null>(() => (isChromium() ? lensMap() : null));

  useEffect(() => {
    if (!href) return;
    const root = document.documentElement;
    root.setAttribute('data-ag-lens', '');
    return () => root.removeAttribute('data-ag-lens');
  }, [href]);

  if (!href) return null;

  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <filter
        id="ag-lens"
        x="0"
        y="0"
        width="1"
        height="1"
        primitiveUnits="objectBoundingBox"
        colorInterpolationFilters="sRGB"
      >
        <feImage href={href} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m" />
        {CHANNELS.map((c) => [
          <feDisplacementMap key={`d${c.out}`} in="SourceGraphic" in2="m" scale={c.scale} xChannelSelector="R" yChannelSelector="G" result={`d${c.out}`} />,
          <feColorMatrix key={c.out} in={`d${c.out}`} type="matrix" values={c.matrix} result={c.out} />,
        ])}
        <feBlend in="r" in2="g" mode="screen" result="rg" />
        <feBlend in="rg" in2="b" mode="screen" />
      </filter>
    </svg>
  );
}
