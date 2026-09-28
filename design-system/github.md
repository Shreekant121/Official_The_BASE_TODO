repo: Shreekant121/the_base-to-do
branch: main
path: src/

## Last sync
date: 2026-08-19T14:11:45Z

### Updated in this project
- Read the live app (App.tsx, Home.tsx, Login.tsx, useStore.ts) to ground the design system in the real product.
- Adopted the product's true palette: near-black #050505 / #121212 base with the emerald #10B981 accent, replacing the placeholder blue.
- Confirmed Lucide as the real icon system (lucide-react) and Framer Motion as the animation layer — no icon substitution needed.
- Imported the brand assets: Logo.png, favicon.svg, icons.svg.

## Screen map
| Project file | Built from |
| --- | --- |
| tokens/colors.css | tailwind.config.js, src/index.css, src/App.tsx (emerald boot state) |
| tokens/glass.css | src/index.css (.liquid-glass) |
| tokens/typography.css | tailwind.config.js (fontFamily) |
| tokens/radii.css | src/components/Home.tsx (rounded-[40px], rounded-full) |
| readme.md — Content fundamentals | src/App.tsx, src/components/Home.tsx, src/components/Login.tsx |
| assets/logo.png, assets/favicon.svg, assets/icons.svg | public/ |
| _(UI kit — not yet built)_ | src/components/TaskSelection.tsx, SetDeadlines.tsx, FocusMode.tsx |
