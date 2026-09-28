/**
 * Aurora Glass — GlassFilters
 * Ported from design-system/components/material/GlassFilters.{jsx,d.ts}.
 * Guidance: design-system/components/material/GlassFilters.prompt.md
 *
 * Real refraction. Mount once per document (near the root) and any
 * surface using --glass-bd-*-refract will bend what sits behind it
 * instead of only blurring it. Chrome/Edge honour SVG filters in
 * backdrop-filter; other engines silently fall back to the blur.
 *
 * Not a UI component — it renders a zero-size hidden <svg> holding
 * three <filter> defs and nothing else.
 */

const FILTERS = [
  { id: 'ag-refract-sm', freq: '0.018 0.028', blur: 2, scale: 8 },
  { id: 'ag-refract-md', freq: '0.012 0.020', blur: 3, scale: 16 },
  { id: 'ag-refract-lg', freq: '0.008 0.014', blur: 4, scale: 28 },
] as const;

export function GlassFilters() {
  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {FILTERS.map((ft) => (
          <filter
            key={ft.id}
            id={ft.id}
            x="-25%"
            y="-25%"
            width="150%"
            height="150%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence type="fractalNoise" baseFrequency={ft.freq} numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation={ft.blur} result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale={ft.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
