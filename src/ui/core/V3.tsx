/**
 * V3 — the switch a screen throws to wear the v4 design (V3-1).
 *
 * Shreekant chose (2026-09-23) to move the app onto V3 ONE SCREEN AT A TIME,
 * steps 6 to 14 of the queue, rather than all at once. So V3's material does
 * not replace the old one; it sits beside it, and this is the line between the
 * two. Wrap a screen in `<V3Scope>` and everything inside it takes V3:
 *
 *   - every token — glass, colour, type, glow, motion — because
 *     `ui/tokens/v3.css` re-declares them all on `[data-v3]`, and custom
 *     properties inherit;
 *   - every keyframe, because animations name theirs through `--kf-*`
 *     (`v3.css` says why);
 *   - every `<Icon>`, which reads `useV3()` and draws Phosphor instead of
 *     Lucide;
 *   - every JS easing that goes through `useMotion()` (`core/motion.ts`);
 *   - every portalled overlay opened from inside it — Dialog, MorphMenu,
 *     PortalDropdown and the rest spread `v3Attr(useV3())` onto their portal
 *     root, because a portal leaves the DOM subtree (and so the CSS scope)
 *     but not the React tree (and so this context).
 *
 * Outside a scope nothing changes, which is the point: an unconverted screen
 * renders exactly as it did before V3-1, and `npm run shots` holds it to that.
 *
 * `display: contents` by default, so wrapping a screen adds a scope and no box:
 * the screen's own root keeps its layout, its scroller and its `.ag-page`.
 * Custom properties and `font` still inherit through a `contents` element —
 * it is in the DOM tree, just not in the box tree.
 */
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';
import { V3Context } from './v3Context';

export interface V3ScopeProps extends HTMLAttributes<HTMLElement> {
  /** Element to render as. Defaults to `div`. */
  as?: ElementType;
  children?: ReactNode;
}

export function V3Scope({ as = 'div', style, children, ...rest }: V3ScopeProps) {
  const Tag = as as ElementType;
  const box: CSSProperties = { display: 'contents', ...style };
  return (
    <V3Context.Provider value={true}>
      <Tag data-v3="" style={box} {...rest}>
        {children}
      </Tag>
    </V3Context.Provider>
  );
}
