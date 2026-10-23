/**
 * A layered glass icon (29-1P5b, idea 80, from his Clock, Send and Settings
 * icons): a solid shape of colour behind, a pane of frosted glass in front
 * with the glyph on it, so the colour glows through. Point at its host and the
 * two layers shift apart a little.
 *
 * Used by the nav (every cell, each in its screen's colour, his call) and
 * the Dashboard's widget gallery (each widget in its job's colour). The look is
 * `layeredIcon.css`.
 *
 * THE FROST IS NOT A BACKDROP-FILTER. A blurred copy of the back shape sits
 * inside the glass, lined up with the real one and clipped by the glass's own
 * corners. It reads the same, and it is a still picture the browser draws once:
 * seven live blurs on every screen's rail would be read back every frame the
 * page under them scrolled, which is the cost the tablet cannot pay (CLAUDE.md
 * "Performance", rule 4).
 *
 * `colour` is any CSS colour (`var(--job-sky)`); left out, the back is the
 * quiet grey of an icon that is not the one in use. The host that should
 * shift the layers on hover carries `ag-licon-host`.
 */
import type { CSSProperties, ReactNode } from 'react';

export interface LayeredIconProps {
  icon: ReactNode;
  /** The back shape's colour. Left out: the quiet grey. */
  colour?: string;
  /** The whole icon's box, in px. The glyph inside should be about half of it. */
  size?: number;
  className?: string;
}

export function LayeredIcon({ icon, colour, size = 34, className = '' }: LayeredIconProps) {
  const style = {
    '--licon-box': `${size}px`,
    ...(colour ? { '--licon-c': colour } : {}),
  } as CSSProperties;
  return (
    <span className={`ag-licon ${className}`.trim()} style={style} aria-hidden="true">
      <span className="ag-licon-back" />
      <span className="ag-licon-front">
        <span className="ag-licon-frost" />
        <span className="ag-licon-glyph">{icon}</span>
      </span>
    </span>
  );
}
