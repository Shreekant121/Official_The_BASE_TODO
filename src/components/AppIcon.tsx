import type { CSSProperties } from 'react';
import { resolveIconSrc } from '../lib/customIcons';
import { FALLBACK_PROJECT_ICON, phosphorName } from '../lib/projectIcon';
import { useGlyph } from '../lib/projectIcons/glyphs';

interface AppIconProps {
  /** A Phosphor icon (`ph:rocket-launch`), an emoji character, or a `CUSTOM_ICONS` registry key. */
  icon?: string;
  /** The box, in px. Both kinds of icon are drawn inside a square this size. */
  size: number;
  className?: string;
  fallback?: string;
  style?: CSSProperties;
}

/**
 * Renders a project icon: a white Phosphor glyph (`ph:<name>`, the default
 * since 29-1P8a2, idea 150), a literal emoji he chose before that (kept until
 * he changes it, his call), or a custom image registered in
 * `src/lib/customIcons.ts`. A Phosphor glyph is `currentColor`, so it takes
 * the colour of whatever it sits in — white on a `ProjectIcon` tile, the
 * row's text colour in a list. The tile with its glow is `ProjectIcon`.
 * Every icon render site in the app should go through this so dropping a
 * new custom icon in later "just works" wherever it's selected.
 *
 * TWO THINGS UI-18 FIXED, NEITHER OF THEM PAINT
 * ---------------------------------------------
 * This component has no surface of its own and needs none — it is a glyph,
 * and the glass tile around it belongs to whoever renders it (`ProjectCard`,
 * the project header, the icon picker, all three already token-built). What
 * it did have were two claims that were not true.
 *
 * 1. **`size` now means the same thing for both kinds of icon.** It used to
 *    be spent as `font-size` for an emoji and as `width`/`height` for an
 *    image, with a comment claiming that kept the two "visually consistent".
 *    It did not: a line box at `font-size: 23px` is taller than 23px in every
 *    system emoji font, so the same project switching from an emoji to a
 *    custom image moved the things around it. Both branches are one
 *    `size` × `size` box with the glyph centred in it now, which is what the
 *    comment always promised.
 *
 * 2. **It is `aria-hidden`, always.** A project glyph is an identity mark
 *    sitting beside the project's name, never the name itself — so a screen
 *    reader announcing "clipboard" ahead of "Empire Operations" is reading
 *    out decoration. Three of the six call sites had already wrapped it in
 *    `aria-hidden` by hand and three had forgotten; putting it here is the
 *    only way the next call site cannot forget. Nothing loses a name to it:
 *    the one place the glyph *is* the choice — `CreateProjectModal`'s icon
 *    picker — labels its own buttons `Glyph ${em}`.
 */
export default function AppIcon({ icon, size, className = '', fallback = FALLBACK_PROJECT_ICON, style }: AppIconProps) {
  const src = resolveIconSrc(icon);
  const ph = phosphorName(icon || fallback);

  /*
    A POSITIONING FRAME, not a centring container — see the glyph below for
    why the obvious ways do not work.
  */
  const box: CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    width: size,
    height: size,
    flex: '0 0 auto',
    verticalAlign: 'middle',
    userSelect: 'none',
    ...style,
  };

  if (ph) {
    return (
      <span aria-hidden="true" className={className} style={box}>
        <PhosphorGlyph name={ph} />
      </span>
    );
  }

  if (src) {
    return (
      <span aria-hidden="true" className={className} style={box}>
        <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={className} style={box}>
      {/*
        AN EMOJI IS WIDER THAN ITS OWN FONT SIZE, and CSS will not centre the
        overflow. Every system emoji font gives the glyph an advance of about
        1.35em — measured at **31.5px for a 23px box** — so the glyph is always
        wider than the square it is asked to sit in. Both of the obvious
        answers were tried and MEASURED, and both fail the same way:

          - `place-items: center` on a grid — the item overflows its area, and
            CSS resolves an overflowing `center` by falling back to `start`
            rather than letting content escape both edges. The glyph pinned
            left and hung 8.5px off the right.
          - `width: 100%` + `text-align: center` — same clamp, one level down.
            The line box centred correctly (measured: dead on the tile's
            centre) but the inline content inside it still started at the left
            edge and overflowed 8.5px right, putting the glyph 4.25px off.

        Absolute centring is not subject to that clamp. The glyph is sized to
        its own content, then pulled back by half of itself, so its advance box
        is centred on the frame whatever its width — measured at 0.00px off on
        both axes. It is out of flow, so it cannot push the frame around
        either, which is what `size` has always promised its callers.

        `line-height: 1` keeps the line box exactly `size` tall. A residual
        under a pixel low is the emoji font's own ascent/descent against that
        line box, not a layout bug; correcting it needs a nudge tuned to one
        platform's emoji font, which would be wrong on the other.
      */}
      <span
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: size,
          lineHeight: 1,
          whiteSpace: 'pre',
        }}
      >
        {icon ?? fallback}
      </span>
    </span>
  );
}

/**
 * Phosphor's 256-unit glyph filling the box. Empty (the box still holds its
 * place) while the catalogue is on its way, which only happens the first
 * time this device draws an icon (`lib/projectIcons/glyphs.ts`).
 */
function PhosphorGlyph({ name }: { name: string }) {
  const paths = useGlyph(name);
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 256 256"
      fill="currentColor"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
