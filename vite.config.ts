import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * No `build.cssMinify` override any more, and that is a measured decision
 * rather than a tidy-up.
 *
 * It used to be pinned to `'esbuild'`. Vite's default minifier is Lightning
 * CSS, which once treated `backdrop-filter` and `-webkit-backdrop-filter` as
 * one property and kept only the last declaration — and since Chromium does
 * not support the `-webkit-` form, a prod build could ship every glass surface
 * with no blur at all (an invisible header and footer) while `vite dev`, which
 * never minifies, looked perfect. `scripts/check-glass-css.mjs` existed to
 * fail the build if that ever happened.
 *
 * UI-20 retired the `.liquid-glass*` classes that bug was found on, and asked
 * whether anything left still needed the override. Two things in CSS files
 * still declare the pair — the touch blur cap in `src/index.css` and
 * `.ag-glass*` in `src/ui/tokens/glass.css` — so it was tested rather than
 * assumed: built both ways and diffed `dist/assets/*.css`. Lightning CSS keeps
 * both declarations on all six surfaces, identically to esbuild, because it
 * prefixes against Vite's browser targets instead of collapsing blind. It also
 * comes out smaller — 29.93 kB vs 31.73 kB, 7.61 kB vs 7.77 kB gzipped.
 *
 * So the default is now strictly better and the override is gone. **Keep
 * writing `-webkit-backdrop-filter` before the unprefixed property anyway** —
 * that ordering is the thing that makes any minifier's collapse harmless, it
 * costs nothing, and the invariant at the top of `src/index.css` explains it.
 * If a glass surface ever renders unblurred in prod and fine in dev, this is
 * the first place to look: re-pin `cssMinify: 'esbuild'` and grep the built
 * CSS for `backdrop-filter`.
 */
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
