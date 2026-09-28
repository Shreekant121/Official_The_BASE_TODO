/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /*
       * These four keys now point at Aurora Glass tokens rather than at
       * hardcoded hex. Every existing `bg-background` / `bg-surface` /
       * `border-glass-border` call site in the app — and there are a lot of
       * them — therefore moves with the design system instead of having to be
       * found and rewritten. The literal values they used to hold are the
       * same colours the tokens resolve to, so nothing shifts on day one.
       *
       * Tailwind is kept for LAYOUT only: flex, grid, sizing, spacing. Colour,
       * glass, radius, shadow, type and motion all come from the tokens in
       * src/ui/tokens/. Do not add new colour keys here — add a token.
       */
      colors: {
        background: 'var(--void-0)',
        surface: 'var(--void-2)',
        glass: 'var(--line-faint)',
        'glass-border': 'var(--line-soft)',
      },
      fontFamily: {
        /*
         * Inter is gone, deliberately — one of the four departures the design
         * system's readme asks to be signed off, and it was. The product now
         * uses the real system face: SF Pro on macOS/iPadOS, Segoe UI Variable
         * on Windows. Nothing was ever downloading Inter (index.html has no
         * webfont link), so this had been quietly falling through to
         * system-ui anyway; the token stack just makes it deliberate and adds
         * the proper per-platform names.
         */
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
  plugins: [],
}