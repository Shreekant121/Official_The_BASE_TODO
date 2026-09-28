# BASE logo — masters

Supplied by Shreekant on 2026-09-11, when the app was renamed from Mutineer OS to **BASE**.
All four are **1024×1024**. These are *sources*, not served assets — nothing in the app loads
them. `APP-1` derives `../mark-white.png` and `../../Logo.png` from them, and `APP-2` derives
the app icons.

| File | Background | Glyph | Use |
|---|---|---|---|
| `base-mark-white.png` | transparent | solid white | the app's mark — header 26px, login and boot splash 32px, share view 24px |
| `base-mark-black.png` | transparent | solid black | for a light surface. Nothing needs it today |
| `base-tile-dark.png` | opaque black | white | the app icon tile |
| `base-tile-light.png` | opaque white | black | the inverse tile |

## Two things measured, so nobody re-derives them

**The glyph is not centred.** Measured on `base-mark-white.png`: the ink runs `x 0..834`,
`y 146..877` on a 1024 canvas — margins **L0 R189 T146 B146**. It touches the left edge. Trim to
the ink bounding box and re-pad symmetrically before writing `mark-white.png`, or the mark sits
visibly off-centre beside the wordmark. For an Android **maskable** icon this is not cosmetic:
only the centre 80% survives the launcher's crop, so the glyph has to be scaled to roughly 70%
and centred or the T-bar is sliced off.

**The tiles are pure `#000000`, the app's page floor is `#050505`** (`--void-0`,
`src/ui/tokens/colors.css:15`). Match `#050505` on anything that sits beside the app so the icon
and the app read as the same black.

## An earlier export was inverted — check before trusting a new one

The first set Shreekant sent had the alpha the wrong way round: the letterforms were transparent
and the surround was solid, so each file was a stencil rather than a mark. It is not visible in a
thumbnail. If a new export ever arrives, sample actual pixels before shipping it — the glyph
should be opaque and the surround transparent, not the reverse.

`../mark-white.png` is **mirrored from the Claude Design project** and a design re-export will
overwrite it. Re-place it from here after any unpack.
