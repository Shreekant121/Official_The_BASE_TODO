import * as React from 'react';

/**
 * The material primitive. Everything glass in the system is this
 * component — cards, bars, popovers, pills, tiles.
 *
 * @startingPoint section="Material" subtitle="The five-layer glass pane every surface is built from" viewport="700x300"
 */
export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLElement> {
  /** Thickness of the pane. 1 = a hairline chip, 2 = the default card, 3 = a heavy sheet or dialog. */
  level?: 1 | 2 | 3;
  /** Pull a hue through the glass instead of the neutral fill. `frost` is near-opaque white with dark text. */
  tint?: 'accent' | 'cyan' | 'violet' | 'amber' | 'rose' | 'frost';
  /** Emit colour outward. Reserve for active, live or focal objects — never a resting neutral surface. */
  glow?: 'accent' | 'cyan' | 'violet' | 'amber' | 'rose' | 'white';
  /** Any radius token or CSS length. Defaults to `var(--r-card)`. */
  radius?: string;
  /** Bend the backdrop with a displacement map instead of blurring it. Needs <GlassFilters /> mounted. */
  refract?: boolean;
  /** Shorthand for padding, so a pane can be used directly as a container. */
  inset?: string;
  /** Element or component to render as. Defaults to `div`. */
  as?: React.ElementType;
}

export declare function GlassSurface(props: GlassSurfaceProps): JSX.Element;
