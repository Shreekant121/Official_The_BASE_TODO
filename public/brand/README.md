# Brand assets

Served at `/brand/<filename>`. These are the app's own identity — the mark, not the
per-project icons in `../icons/`.

## ⚠ Every served file here is **generated**. Do not hand-edit them.

```bash
node scripts/brand.mjs
```

writes `mark-white.png`, `../Logo.png` and the three app icons from the masters in
`source/`. Re-run it after anything overwrites any of them — see "A design re-export
overwrites this" below.

## `mark-white.png` — 512×512, transparent

The BASE mark knocked out to white, for use on a dark surface. Home's header draws it at
26px, the boot splash and Login at 32px, ProjectView's header at 26px and the share view at
24px — every call site sets explicit `width`/`height`, so the intrinsic size is not
load-bearing.

**Derived, not copied.** `source/base-mark-white.png` is 1024×1024 with the glyph ink at
`x 0..834`, `y 146..877` — margins **L0 R189 T146 B146**. It touches the left edge, so
dropping it in as-is puts the mark visibly off-centre beside the wordmark. `scripts/brand.mjs`
translates the ink to the middle of the canvas (**the scale is untouched** — the glyph is
moved, never resized) and downscales to 512. The result measures L47 R47 T73 B73: symmetric
on both axes, which is all "centred" can mean for a mark that is wider than it is tall.

## `../Logo.png` — 512×512, opaque

The favicon, and the tile APP-2's app icons come from. The same centred glyph on `#050505`
rather than the master tile's pure `#000000`, because `#050505` is `--void-0` in
`src/ui/tokens/colors.css` — the app's page floor. Matching it is what makes the icon and the
app read as one black instead of two.

## `icon-192.png`, `icon-512.png`, `icon-maskable.png` — the installed app's icons

Listed in `../manifest.webmanifest` and nowhere else. Android takes them when BASE is
installed to the home screen; nothing in `src/` loads them.

The first two are the same centred glyph on `#050505` as `../Logo.png`, at 192 and 512.

**The maskable one is a different composition, not a resize, and its scale is measured.**
Android hands the icon to the launcher, which crops it to a circle, a squircle or a teardrop
depending on which launcher it is — only the centre **80%**, a circle of that diameter, is
guaranteed to survive. `scripts/brand.mjs` finds the furthest opaque pixel from the ink's
centre (**554px** of the master's 1024) and scales from it, which comes out at **73.9%**; the
ink then spans **60%** of the tile. APP-2 estimated "roughly 70%" — close, and the script
prints the real number on every run rather than baking it in, so a new master re-derives it.

The tile is filled edge to edge with `#050505` rather than left transparent: whatever the
launcher crops has to be the brand's black, or the icon arrives with clipped corners on some
phones and a white ground on others.

## A design re-export overwrites this

`mark-white.png` is **mirrored from the Claude Design project** (it is
`design-system/assets/mark-white.png` there), so unpacking a new handoff bundle over
`design-system/` puts the **old Mutineer OS mark back**. It will not error, it will not look
broken in a thumbnail, and the header will simply be wearing the wrong logo.

**After any unpack, run `node scripts/brand.mjs` again.** The masters in `source/` are the
authority, not the design bundle.

## History

The app was called **Mutineer OS** until `APP-1` (2026-09-11) and the mark changed with the
name. What was here before: the Mutineer OS mark at 500×500, taller than wide, ink 256×405.
UI-1 → UI-20 shipped a derived stand-in of it; UI-21 replaced that with the design project's
original. Both are gone — nothing in the app draws the old mark any more.

The other four files from the design project live in `design-system/assets/` and are
reference-only: `logo.png`, `mark-black.png`, `favicon.svg` and `icons.svg`. **Three of those
are the old identity** and are kept only as a record of it. Nothing in `src/` imports them.
