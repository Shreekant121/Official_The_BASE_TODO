# SHREEKANT'S RULE, AND IT OUTRANKS EVERYTHING BELOW

**These are REFERENCE designs. They are not a specification and not a work order.**

Read them for material, layout, tone and intent — then **do what Shreekant actually asked
for**, or what the app genuinely needs. That is the job. The bundle informs the work; it does
not commission it.

- **His instruction wins over the mockup, always.** If he says build it differently, build it
  differently and do not argue from the design file. If a screen and his words disagree, he is
  the one who is current — the export is a snapshot of a moment.
- **A screen existing here is not a request to build it.** The bundle carries designs for
  things that are not in the queue, not decided, or already rejected. Do not start one because
  you found it. Ask, or wait for it to be named in `IMPROVEMENTS.md`.
- **"Pixel-perfect" below is the design tool's boilerplate, not his standard.** Match the
  material and the intent. Keep our portals, focus traps, accessibility and real data
  handling even where that means the markup differs from the prototype.
- **Every number, name, date and body of text in these files is invented** to make the
  picture look alive. Never ship a figure, a formula or a label from a mockup without
  checking it against the real source (`../atlas/DESIGN.md`, the store, or him).
- **Product naming is his call and is not settled by this bundle.** The v3 and v4 exports both reverted the
  app's name to "Mutineer OS"; the shipped app is **BASE** (`index.html`, `public/brand/`), so
  the name was put back on the way in. Do not rename anything off the back of a design file.

When in doubt, ask him before building — never after.

## What this mirror is, exactly

It is **v4, installed 2026-09-23 (`V3-1`), with three folders left out** — it is not the zip
verbatim, so do not "restore" any of them from `../design-export/` without asking him. The zip
is `Liquid glass dark mode redesign-handoff v4.zip`; the software design it describes is what
he calls **V3**.

1. **`uploads/` is not mirrored** — 467 files, 50 MB, including a whole nested copy of the v2
   bundle. Claude Design's own attachments; referenced by no design file.
2. **`frames/` is not mirrored** — 5 PNGs, 2.8 MB, referenced by no design file.
3. **`scraps/` is not mirrored** — 12 images, 2.6 MB, new in v4 and referenced by no design
   file: the design tool's own render checks (`*-check.jpg`, `*-speak.jpg`) and frame strips
   pulled from motion reference videos (`morph-`, `timer-`, `loading-`, `icon-`, `ai-`,
   `bottombar-video-frames.png`). The components they informed — `RecordTimer`, `LoadingPill`,
   `AiPresence`, `BottomBar`, `MorphCluster` — are mirrored, and those encode the motion. If a
   screen session wants to see the reference motion itself, the strips are in the zip.

**The separation morph is back in, at his word.** v3's install left `MorphCluster`, `GooSplit`
and the `ag-goo` metaball filters out at his instruction. v4 took the goo out itself — its
readme: "The old metaball/goo effect has been removed" — and what is left is a plain cross-fade
(`MorphCluster` swaps a pill for its controls while the slot's width eases; `MorphMenu` fades in
with a 4px drop). Asked on 2026-09-23 whether to include it this time, he said yes. So
`GlassFilters.jsx`, `MorphMenu.jsx`, `tokens/motion.css` and the Home / Deadlines / New Session
screens are v4's now, not v2's. **One loose end:** v4's `GlassFilters.jsx` still defines the
`ag-goo` / `ag-goo-sm` filters, and nothing in the bundle uses them any more. Do not build them.

Everything else is v4, with "Mutineer OS" put back to "BASE" throughout (titles, the readme,
`SKILL.md`'s name, "BASE asks" and the like). The fixture strings `Mutineer Work`,
`Mutineer launch`, `shreekant@mutineer.os` and `mutineer.app` are left alone on purpose — they
are invented data, not the product name. The readme's naming rule and its brand-mark row were
restored by hand, as they were at v3.

**What v4 changed, in one paragraph, so nobody has to diff it.** Phosphor icons, filled, in
place of Lucide's hairlines. Inter (or SF Pro where it exists) in place of the system face, and
**numbers are never monospace** any more. Motion is faster and nothing overshoots except one
soft landing (`--ease-settle`). Glass is lighter (12px standard blur, was 28), borderless, lit by
two specular highlights, and on Chromium it **bends and colour-fringes** what is behind it
(`_ds_loader.js` injects the `#ag-lens` filter). New materials beside glass: **gel** (one lit
emerald object for the primary action), **live glass** and **soft**. A wider status spectrum.
Kickers are sentence case. New components: `MorphCluster`, `RecordTimer`, `LoadingPill`,
`AiPresence` (the WebGL orb), `BottomBar`. And **phone** is in scope (`Devices.dc.html`).

**How the app takes it.** Not by copying these files. `src/ui/tokens/v3.css` holds v4's tokens
re-declared on `[data-v3]`, and a screen switches by wrapping itself in `<V3Scope>`
(`src/ui/core/V3.tsx`) — one screen at a time, steps 6 to 14 of the queue, which was his call.
That file's header lists where it departs from the bundle and why.

<!-- Mirrored from the ROOT of "Liquid glass dark mode redesign-handoff v4.zip".
     Renamed from README.md to HANDOFF-README.md because Windows cannot hold it
     beside this folder's own readme.md. Content is verbatim below. -->

# CODING AGENTS: READ THIS FIRST

This is a **handoff bundle** from Claude Design (claude.ai/design).

A user mocked up designs in HTML/CSS/JS using an AI design tool, then exported this bundle so a coding agent can implement the designs for real.

## What you should do — IMPORTANT

**Read `liquid-glass-dark-mode-redesign/project/Project.dc.html` in full.** The user had this file open when they triggered the handoff, so it's almost certainly the primary design they want built. Read it top to bottom — don't skim. Then **follow its imports**: open every file it pulls in (shared components, CSS, scripts) so you understand how the pieces fit together before you start implementing.

**If anything is ambiguous, ask the user to confirm before you start implementing.** It's much cheaper to clarify scope up front than to build the wrong thing.

## About the design files

The design medium is **HTML/CSS/JS** — these are prototypes, not production code. Your job is to **recreate them pixel-perfectly** in whatever technology makes sense for the target codebase (React, Vue, native, whatever fits). Match the visual output; don't copy the prototype's internal structure unless it happens to fit.

**Don't render these files in a browser or take screenshots unless the user asks you to.** Everything you need — dimensions, colors, layout rules — is spelled out in the source. Read the HTML and CSS directly; a screenshot won't tell you anything they don't.

## Bundle contents

- `liquid-glass-dark-mode-redesign/README.md` — this file
- `liquid-glass-dark-mode-redesign/project/` — the `Liquid glass dark mode redesign` project files (HTML prototypes, assets, components)
