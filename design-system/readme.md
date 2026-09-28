# BASE — Aurora Glass Design System

A dark-only, liquid-glass system for **BASE**: a strict-focus time
management tool that sits on top of Google Tasks and answers one question
continuously — *what do I have to do, right now, and how long have I got?*

Everything here is grounded in the real product, not invented.

## Sources

| Source | What was taken from it |
| --- | --- |
| `github.com/Shreekant121/the_base-to-do` (branch `main`) | The whole foundation. Palette, glass recipe, radii, icon library, copy voice. See `github.md`. |
| `src/index.css` → `.liquid-glass` | The five-layer glass material, formalised into three thicknesses. |
| `tailwind.config.js` | Base `#050505`, surface `#121212`, glass `rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.08)`. |
| `src/App.tsx`, `Home.tsx`, `Login.tsx` | Emerald accent (`#10B981` / `#34D399`), the OS copy voice, the 40px card radius. |
| `src/store/useStore.ts` | The real domain model — tasks, subtasks, `allocatedTime`, the four views. |
| 21 reference images supplied by the user | Motion ambition, spacing generosity, refraction, status-pill treatment, mini-nav, dot charts. |
| `Mutineer-clear background.png` (user upload) | The brand mark. |
| `base-mark-white.png` + 3 siblings (user upload, 2026-09-11) | **The brand mark now.** The app was renamed Mutineer OS → BASE at `APP-1` and the mark was redrawn with it; the row above is what the design project was originally built from. Masters live in the app repo at `public/brand/source/`, not here. |

**Product surfaces in scope:** laptop/desktop web app, tablet, and phone (see `Devices.dc.html`). No marketing site.

**The four existing views** (from `useStore.ts`): `home` → `selection` → `deadlines` → `focus`.

---

## Content fundamentals

The product speaks like an **operating system that respects you** — terse,
mechanical, faintly ceremonial. It is not chatty and never cute. This voice
already exists in the code; the system keeps it.

**The three registers.** Use exactly one per element; never mix them in a sentence.

1. **System voice** — uppercase, wide-tracked, bold. Reserved for machine states
   and thresholds. From the live app: `INITIALIZING CORE...`, `BOOTING SYSTEM...`,
   `ENTER BASE`. Use `--type-system` with `--tracking-system`.
   Rare — no more than one per screen.
2. **Interface voice** — sentence case, imperative, no articles where they can go.
   `Select Previous List`, `Create New Set`, `Start session`, `Mark done`.
   Title Case is used for card headings in the live app; keep that.
3. **Explanatory voice** — one short sentence, full stop, muted colour.
   `Access your saved task configurations.` `Initialize a fresh focus session.`
   `Strict focus. One task at a time.`

**Rules pulled from the existing copy**

- **Second person, implied.** The product addresses the user as *you* but usually
  drops the pronoun: "Access your saved task configurations", not "You can access…".
  Never first person. There is no assistant persona here.
- **Verbs of machinery, not of encouragement.** *Initialize, boot, connect,
  disconnect, allocate, triage, commit.* Never *let's*, *oops*, *great job*,
  *you've got this*.
- **Fragments are fine.** "Strict focus. One task at a time." Two fragments, and
  it is the best line in the product.
- **Ellipses mark in-progress machine states only** — `BOOTING SYSTEM...`.
  Never in human-facing prose.
- **Numbers are always concrete and always mono.** `45 min`, `2 / 7 tasks`,
  `03:12`. Never "a few minutes", never "almost done".
- **Destructive words stay plain.** "Disconnect", not "Log out of your account?".
- **Emoji: yes, but only as list glyphs.** The app's own triage lists are
  `⚡ Action Steps`, `🧊 Backburner`, `📚 Reference Materials`. That is the *only*
  sanctioned emoji use — a single leading glyph on a user-visible list name.
  Never in buttons, headings, body copy, empty states or notifications.
- **Sentence length.** Explanatory copy caps at ~12 words. If it needs more, the
  design is wrong.

**Naming things.** The product is "BASE", everywhere — one word, always caps,
no short form. Views are named as nouns the user would say — Home, Selection, Deadlines,
Focus — not "screen" or "page".

---

## Visual foundations

### The core idea

Near-black, a faint measured grid, and glass that **bends the grid behind it**.
Minimal and dark: a screen reads as black, white and a little green.

### Colour

- **Base ladder** — `--void-0`…`--void-4`, near-neutral (chroma ≤ 0.006).
- **Foreground ladder** — `--fg-1`…`--fg-4`.
- **Emerald** (`--accent`, aliased as `--brand-*`) — brand, primary action, live.
- **Status hues** (`--hue-*`) — cyan queued · amber review · violet Atlas ·
  coral due · rose overrun. Pills, dots and single icons only; never surfaces.
- **One gel per screen**, emerald. Everything else is glass.

### Materials

- **Glass** — as below, with saturate raised to 2.1 and a faint indigo tint in the fill.
- **Gel** (`--gel-emerald`, `variant="gel"`) — a lit emerald object for the single primary action.
- **Live glass** (`--glass-live`) — a dark pane lit green from below, for the running-task hero.
- **Soft** (`--soft-*`, `.ag-soft`) — dark neumorphism: extruded from the ground.
  For dials, toggles and keypads only.
- **Well** — carved-in, for inputs, troughs, tracks.

### Type

**SF Pro** (via `-apple-system`), **Inter** as the cross-platform match. Titles
semibold, display bold. **Numbers are never monospace**: timers, clocks and metrics
are semibold SF Pro / Inter with tabular figures (`--type-timer`, `--type-metric`).
Kickers are small semibold sentence-case labels.

### Space

4px base, and the semantic aliases sit deliberately high because the references
are all air: cards inset at 24–28px (`--pad-card`), sheets at 32px, sections
separated by 48px (`--gap-section`). Page gutters 40px on desktop, 20px on
tablet. When unsure, go one step larger. Hit targets never below **44px**.

### Radii

Generous and concentric. `--r-control` is always `--r-pill` — every button,
chip and input in this system is a pill, matching the live app's `rounded-full`.
Cards are 26px, hero cards 40px (`--r-card-lg`, matching `rounded-[40px]` in
`Home.tsx`), sheets 40px. Nested elements step down by roughly their padding.

### Glass — liquid, not frosted

Five properties, always together: **Refraction** (lens bend at the edges), **Dispersion** (R/G/B bend by different amounts — colour fringes), **Frost** (light blur after the bend), **Depth** (`--glass-depth`: top-edge light pool + floor shade), **Splay** (`--glass-splay`: light fanning from the top-left corner).

Mostly clear. Glass **bends** the backdrop (a lens map displaces it most at the
edges — `_ds_loader.js` injects the filter and enables it on Chromium), blurs it
lightly (8–18px), and lifts saturation. **No border**: the edge is two specular
highlights, bright top-left, soft bounce bottom-right (`--glass-rim-*`). Content
on glass is solid white with a soft drop shadow so it pops off the pane.
Fills are 2–14% white on a 135° gradient. Wells (inputs, tracks) are recessed
with a soft inner shadow and a faint bottom highlight.

### Elevation and glow — two systems

- **Shadow** says *above*. Five steps, `--shadow-1` to `--shadow-5`.
- **Glow** says *emitting*. Glows are pure diffused light — no ring, no edge — so they melt into the shape. Emerald by default. Only for objects that are live,
  selected, running or overrun. A resting neutral surface never glows. The live
  app's boot spinner already does this correctly.

### Motion

Motion is fast and physical: one surface moves as one object. Presses sink
instantly; releases land with a single soft settle (`--ease-settle`, ~4%
overshoot) — the satisfying part. Colour and light move slowly (`--ease-silk`).
Things arrive from the side of the trigger they belong to.

- `--ease-glass` `cubic-bezier(.22,.61,.36,1)` — the house curve, used for
  almost everything. `--ease-morph` and `--ease-spring` are kept as names but
  no longer overshoot.

Durations: 80ms instant, 140ms hover, 200ms base, 280ms slow, 240ms morph,
320ms sheet. Lists stagger at 24ms per item.

Named behaviours (`tokens/motion.css`): `ag-condense` (fade + 4px rise),
`ag-dissolve` (fade), `ag-unfurl` (fade + 4px drop, for menus), `ag-pulse`
(opacity only), `ag-ripple` (one soft ring), `ag-shimmer`, `ag-bar`,
`ag-travel`, `ag-drift` (barely perceptible), `ag-spin`.

`MorphCluster` swaps a trigger pill for its controls with a plain cross-fade
while the slot's width eases; `GooSplit` fades a pair into the slot it
replaces; `MorphMenu` fades in with a 4px drop. The old metaball/goo effect
has been removed.

- **Hover** — fill brightens one step and the cast shadow lifts. Icon buttons
  scale to 1.04. There is deliberately **no travelling specular streak**: a light
  sweeping across every card on hover reads as a gimmick and fights the content.
- **Press** — scale down (0.955 buttons, 0.94 icon buttons) in 80ms; release
  returns on `--ease-settle` over 280ms. Never a colour-only press state.
- **Focus** — a 2px emerald `outline` at 2px offset, so it follows the control's
  own border-radius. Never a `box-shadow` ring: on an inner `<input>` that draws a
  hard rectangle inside the rounded pill. Composed fields opt their inner element
  out with `[data-ag-field]` and light up the surrounding well instead. No browser
  blue anywhere.
- `prefers-reduced-motion` collapses every duration to 1ms. Honoured globally.

### Backdrop

`.ag-page` gives near-black plus the 88px grid (horizontals at 7.5% white,
verticals at 4% so it never reads as graph paper) and one soft emerald pool low
on the page, finished with a fine grain that stops the dark field banding.

Variants: `--calm` grid only, for dense data screens · `--focal` one pool of
light behind a single object · `--field` an opt-in drifting colour field, for
onboarding and empty states only, **never** behind a task list.

### Imagery

The product has none, and does not need any — this is an instrument, not a
brochure. Where a screen needs visual weight, the answer is a large mono numeral,
a dot chart, or a ring, not a photograph. If imagery is ever introduced, it goes
behind glass at `level={3}`, desaturated, with the grid still visible at the edges.

---

## Iconography

**Phosphor, filled.** Solid white glyphs read cleanly on clear glass; hairline
strokes disappeared into it. `<Icon name="…" />` keeps the old Lucide names and
maps them to Phosphor (fill by default, bold for small marks: x, check, chevrons,
plus, arrows). Unmapped names fall back to Lucide. Feature tiles use the layered
treatment from the references: a tinted tile tilted behind a frosted glass tile
with a white glyph. See `Devices.dc.html`.

## Brand assets

| File | Use |
| --- | --- |
| `assets/logo.png` | The app tile — white mark on a dark rounded square. Favicons, app icons, the Home hero. |
| `assets/mark-white.png` | Mark knocked out to white, for dark surfaces. Recoloured from the user's upload; geometry untouched. |
| `assets/mark-black.png` | The user's original black mark, for light surfaces and print. |
| `assets/favicon.svg` | Imported from `public/`. |
| `assets/icons.svg` | The repo's icon sprite. |

There is **no wordmark file**. "BASE" is set in the system face at
`--type-display`, weight 500 — which is what `Home.tsx` already does.

---

## Index

**Foundations** — `styles.css` is the single entry point; link it and nothing else.

- `tokens/fonts.css` · `tokens/colors.css` · `tokens/typography.css`
- `tokens/spacing.css` · `tokens/radii.css`
- `tokens/glass.css` — the material
- `tokens/elevation.css` — shadow and glow
- `tokens/motion.css` — curves, durations, keyframes
- `tokens/backdrop.css` — `.ag-page` and its variants
- `tokens/reset.css`

**Components**

| Group | Components |
| --- | --- |
| `components/material/` | `GlassSurface` · `GlassFilters` |
| `components/core/` | `Icon` |
| `components/actions/` | `Button` · `IconButton` · `SegmentedControl` · `MorphCluster` · `GooSplit` |
| `components/forms/` | `Input` · `Switch` · `Checkbox` · `Slider` |
| `components/data/` | `TaskRow` · `MetricCard` · `StatusPill` · `ProgressRing` · `SparkBars` · `Countdown` |
| `components/feedback/` | `NotificationCard` · `Toast` · `Skeleton` · `Waveform` |
| `components/overlay/` | `MorphMenu` · `Dialog` · `CommandPalette` · `TaskSheet` · `AIPanel` |
| `components/navigation/` | `MiniNav` · `Tabs` · `Stepper` |

Every component ships three files: `.jsx` (the implementation), `.d.ts` (typed
props with per-prop guidance) and `.prompt.md` (when to reach for it, and the
rules that keep it on-system). Read the `.prompt.md` before using a component.

**Specimen cards** — `foundations/*.card.html` and `components/**/*.card.html`.
Each is a standalone page; open any of them directly.

**Not yet built** — the UI kit recreating the four real views (Home, Selection,
Deadlines, Focus). That comes next, one page at a time, from the user's own
screenshots.

**Screens built so far** — `screens/login.html` · `screens/home.html` ·
`screens/project.html` · `screens/task-detail.html` (the task sheet, opened
from the project view) · `screens/scoring.html` · `screens/session.html` (the New Session queue) ·
`screens/deadlines.html` (allocation — the step after the queue) ·
`screens/focus.html` (the running session — one task, docked details and subtasks) ·
`screens/atlas.html` (the Atlas chat — the assistant screen rewired to the Atlas host;
`screens/assistant.html` is kept as the pre-Atlas version) ·
`screens/log.html` (the action log — every turn Atlas took, and the revert for it) ·
`screens/atlas-host.html` (the host — Tailscale reach, model residency, escalation, spend) ·
`screens/catalog.html` (the catalog — memory as plain text files, and the 40-memory budget) ·
`screens/contacts.html` (contacts — three import sources, the merge review, and the per-person code) ·
`screens/inbox.html` (inbox triage — the daily digest and the suspicious-mail quarantine) ·
`screens/skills.html` (skills — the installed folders, what each one reaches, add/remove) ·
`screens/trash.html` (trash — 30-day soft delete, what each deletion took, and restore) ·
`screens/voice.html` (Voice — Dock mode: the tablet on a stand, listening for "Atlas"; four states,
the searchable voice picker with its missing-voice row, and the microphone-permission fix) ·
`screens/booking.html` (booking — your links, their performance, the rules, and the fill order that steers clients into chosen hours) ·
`screens/booking-public.html` (the client's public booking page — phone-first, every state including slot taken, no times, and link off) ·
`screens/ai-panel.html` (the AI panel specimen — all four openers and all five states,
at 820×1180 and 1440×900, on the project board and the Score screen).

### Component selection rules

A few decisions the component list encodes, so they don't get re-litigated:

- **Two exclusive-choice controls, different jobs.** `SegmentedControl` is for
  *modes* (Daily / Weekly / Monthly) and lives in a recessed trough.
  `Tabs` is for *content sections* and uses a sliding underline. `MiniNav` is
  top-level navigation and floats.
- **Two feedback surfaces, different contracts.** `Toast` disappears, so it can
  only ever confirm. `NotificationCard` persists and expands in place, so it
  carries anything requiring a decision.
- **Destructive actions confirm inside the object that offered them.** A card
  menu's Delete row collapses and a confirm strip grows in its exact slot
  (`MorphMenu` `confirm`) — a modal for "are you sure" breaks the morph law and
  loses the subject. `Dialog` is for decisions with more than one field, and
  `TaskSheet` for a subject with a whole field set: pressing a task card opens
  it, and the sheet lays every field of that task across three columns rather
  than stacking them in a scrolling strip.
- **Any menu that can cover its own subject carries a `header`.** A project menu
  overlays the project card, so it restates the name, counts and budget.
- **The AI has two surfaces, and they are not the same size.** `AIPanel` is a
  short exchange about ONE named object, docked to the screen that object is
  on — it shrinks the host rather than covering it, and it is deliberately
  smaller and quieter than the Atlas chat screen, which is for open-ended work
  with no single subject.
- **No Tooltip.** On a touch-and-desktop product where every icon button already
  carries a `label`, tooltips duplicate the accessible name and never fire on
  tablet. If an icon needs explaining, it needs a text label.
- **No Radio.** The product has no multi-option forms; `SegmentedControl` covers
  every exclusive choice in it. Add radios only when a real form appears.
- **No Sidebar.** `MiniNav orientation="vertical"` is the desktop rail. A full
  sidebar would fight the floating-glass language.

### Intentional additions

Nothing upstream defines a component library, so the set above is authored from
scratch against the product's needs. Two entries are worth calling out:

- **`Icon`** — a string-addressed wrapper over Lucide, so specimen cards and
  prototypes can name a glyph. Application code should use `lucide-react`.
- **`GlassFilters`** — hidden SVG defs. Not a UI component; it exists purely to
  make refraction available.

`_ds_loader.js` is card plumbing: specimen cards prefer the compiled bundle and
fall back to transforming the component sources, so every card renders whether or
not the bundle has been built. Card scripts use `type="text/ag-jsx"` rather than
`text/babel` — Babel standalone's default JSX runtime injects a bare module
import that a classic script cannot execute.

## Using it

```html
<link rel="stylesheet" href="styles.css">
<body class="ag-page">
  <!-- mount <GlassFilters /> once for refraction -->
```

`styles.css` is the only stylesheet to link. Put `.ag-page` on the scrolling
container so glass has the grid to refract, and reach for `GlassSurface` before
writing any translucent panel of your own.

## Deliberate departures from the current code

Flag any of these you disagree with.

1. **Inter is gone.** `tailwind.config.js` specifies Inter; this system uses the
   native system face instead, per the "Apple-flavoured, systems-native" brief.
2. **Glass got two missing layers** — a saturation lift and a floor shade — plus
   optional real refraction. The existing `.liquid-glass` is the ancestor of
   `level={2}`.
3. **The grid backdrop is new.** The current app is flat `#050505`; glass needs
   something to refract.
4. **Emerald is now rationed.** Upstream it appears on the boot spinner and power
   icon; here it exclusively means *live*.
