import React from 'react';

/* Real refraction, plus the goo. Mount once per document (near the
   root).

   ag-refract-*  any surface using --glass-bd-*-refract will bend what
                 sits behind it instead of only blurring it. Chrome/Edge
                 honour SVG filters in backdrop-filter; other engines
                 silently fall back to the blur.

   ag-goo, ag-goo-sm  metaball threshold: blur the alpha channel, then
                 slam it back to hard edges. Two shapes closer than the
                 blur radius fuse into one mass with a liquid neck; past
                 it they snap apart. This is what makes a pill SEPARATE
                 into its controls instead of cross-fading into them.
                 Used by MorphCluster / GooSplit, never applied to text
                 (the threshold would eat it). ag-goo for full-size
                 controls, ag-goo-sm for menu-row-scale pairs. */
export function GlassFilters() {
  const filters = [
    { id: 'ag-refract-sm', freq: '0.018 0.028', blur: 2, scale: 8 },
    { id: 'ag-refract-md', freq: '0.012 0.020', blur: 3, scale: 16 },
    { id: 'ag-refract-lg', freq: '0.008 0.014', blur: 4, scale: 28 },
  ];
  /* stdDeviation sets how far apart two shapes can be and still be one
     object; the alpha slope sets how abruptly the neck gives way. */
  const goo = [
    { id: 'ag-goo', blur: 9, slope: 22, shift: -10 },
    { id: 'ag-goo-sm', blur: 5, slope: 20, shift: -9 },
  ];
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        {filters.map((ft) => (
          <filter key={ft.id} id={ft.id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={ft.freq} numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation={ft.blur} result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale={ft.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        ))}

        {goo.map((g) => (
          <filter key={g.id} id={g.id} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={g.blur} result="soft" />
            <feColorMatrix
              in="soft"
              type="matrix"
              values={'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ' + g.slope + ' ' + g.shift}
              result="mass"
            />
            <feComposite in="mass" in2="mass" operator="atop" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}
