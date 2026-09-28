/**
 * The popover shell every picker in the app opens into — rebuilt on Aurora
 * Glass (UI-18).
 *
 * It positions a panel off its trigger's viewport rect and renders it into
 * `<body>`, which is the whole reason it exists: every one of its call sites
 * sits inside something that CLIPS. A task editor lives in a sheet with
 * `container-type: inline-size`; New Session's two add-forms animate their own
 * height, so their wrapper is `overflow: hidden`; the filter opens from a card
 * that must not grow. A panel drawn inside any of those is cut off by it.
 *
 * WHAT UI-18 CHANGED, AND WHAT IT DID NOT
 * ---------------------------------------
 * Only the paint. The panel was a hand-mixed `rgba(10,10,14,0.97)` with its
 * own blur, its own 18px radius and its own two-part shadow — the last piece
 * of the old design left on New Session and on all six task editors. It is now
 * the same surface `MorphMenu`'s panel is, token for token, including the
 * near-opaque base coat under the gradient: **a popover sits ON TOP of the
 * content it is choosing for**, and at card translucency the two texts overlap
 * and neither is readable. That is a material law, not a preference, and it is
 * why this is not simply `--glass-fill-2`.
 *
 * Every measurement below — the anchor effect, the viewport clamp, the flip,
 * the outside-click, `useOverlayDismiss` — is untouched.
 *
 * THREE THINGS TO NOT RE-LEARN
 * ----------------------------
 * 1. **`Z.dropdown`, from `lib/zLayers.ts`, stays.** This panel is `fixed` in
 *    `<body>`, so it has to clear every overlay the app can put under it; that
 *    is exactly the ladder `CLAUDE.md` reserves for `fixed` surfaces. It is
 *    the difference between this and `MorphMenu`'s local `zIndex: 60`.
 * 2. **The entrance is a tween, not a spring, and it condenses.** Aurora Glass
 *    panes "arrive by condensing" (`ag-condense`: scale 0.94, +6px, 8px blur),
 *    and the spring this used to run overshot that scale — a popover that
 *    bounces reads as a notification. A tween on the house curve also settles
 *    in a fixed number of frames, which is what lets the screenshot harness's
 *    fake clock photograph an open picker at all.
 * 3. **The blur is `--glass-bd-lg` without refraction.** `--glass-bd-lg-refract`
 *    resolves `url(#ag-refract-lg)`, which only exists where `<GlassFilters />`
 *    is mounted — today Home and nowhere else — and an unresolvable filter
 *    reference invalidates the whole `backdrop-filter` chain in Chromium. Same
 *    call, same reason, as `Dialog`'s port note 1.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { useMotion, useV3, v3Attr } from '../ui';


interface PortalDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
  width?: number | string;
  /** Open upward instead of downward */
  upward?: boolean;
  /**
   * Which edge of the panel lines up with the same edge of the trigger.
   * `right` is for icon-sized triggers, where a panel wider than the trigger
   * should hang to the left rather than off to the right.
   */
  align?: 'left' | 'right';
  className?: string;
}

export function PortalDropdown({
  isOpen,
  onClose,
  triggerRef,
  children,
  width,
  upward = false,
  align = 'left',
  className = '',
}: PortalDropdownProps) {
  // Raw trigger rect + viewport size; the panel's own coordinates are derived
  // from these at render time.
  const [anchor, setAnchor] = useState({
    top: 0, bottom: 0, left: 0, right: 0, triggerWidth: 224,
    viewportWidth: 1024, viewportHeight: 768,
  });
  const [flipUp, setFlipUp] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  /* Framer reads numbers, not custom properties, so the curve comes from the
     scope's motion table rather than `--ease-glass` (V3-1). */
  const v3 = useV3();
  const motionTokens = useMotion();

  // Update position (and the trigger's own width, used as the dropdown's
  // default width when the caller doesn't pass an explicit `width`) whenever
  // open state changes or on scroll — measuring the ref here, inside an
  // effect, instead of a caller reading `triggerRef.current` during its own
  // render (which isn't safe/consistent under React's rendering rules).
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const update = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      setAnchor({
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        triggerWidth: rect.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape. `hideNav: false` — a dropdown is transient chrome, so
  // unlike a modal it shouldn't make the floating bottom nav disappear.
  useOverlayDismiss(isOpen, onClose, { hideNav: false });

  // A numeric width lets us pull the panel back inside the viewport when the
  // trigger sits near the right edge; a CSS-string width is left to the browser.
  const panelWidth = width ?? anchor.triggerWidth;
  const alignedLeft = align === 'right' && typeof panelWidth === 'number'
    ? anchor.right - panelWidth
    : anchor.left;
  const left = typeof panelWidth === 'number'
    ? Math.max(8, Math.min(alignedLeft, anchor.viewportWidth - panelWidth - 8))
    : alignedLeft;

  const openUpward = upward || flipUp;

  // Flip a downward panel above its trigger when it wouldn't fit below —
  // the panel is `position: fixed`, so anything past the viewport edge is
  // unreachable rather than merely scrolled out of view. Measured before
  // paint so there's no visible jump. `flipUp` is deliberately not reset on
  // close, which would otherwise snap the panel mid-exit-animation.
  useLayoutEffect(() => {
    if (!isOpen || upward) return;
    const el = dropdownRef.current;
    if (!el) return;
    const panelHeight = el.offsetHeight;
    const spaceBelow = anchor.viewportHeight - anchor.bottom - 16;
    const spaceAbove = anchor.top - 16;
    setFlipUp(panelHeight > spaceBelow && spaceAbove > spaceBelow);
  }, [isOpen, upward, anchor]);

  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    left,
    width: panelWidth,
    maxWidth: 'calc(100vw - 16px)',
    zIndex: Z.dropdown,
    /* Base coat first, gradient on top — see the header. */
    backgroundColor: 'oklch(0.145 0.004 260 / 0.97)',
    backgroundImage: 'var(--glass-fill-1)',
    backdropFilter: 'var(--glass-bd-lg)',
    WebkitBackdropFilter: 'var(--glass-bd-lg)',
    boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
    border: '1px solid oklch(1 0 0 / 0.10)',
    borderRadius: 'var(--r-lg)',
    overflow: 'hidden',
    ...(openUpward
      ? { bottom: anchor.viewportHeight - anchor.top + 8 }
      : { top: anchor.bottom + 8 }),
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={dropdownRef}
          {...v3Attr(v3)}
          /* `ag-condense`'s own numbers — scale 0.94, 6px, 8px of blur — with
             the 6px taken off whichever edge the panel hangs from, so it
             unfurls out of its trigger rather than drifting in. See header
             note 2 for why this is a tween and not a spring. In V3 it is
             `ag3-unfurl`'s: a fade and 4px from the trigger's side, nothing
             else. */
          initial={v3
            ? { opacity: 0, y: openUpward ? 4 : -4 }
            : { opacity: 0, y: openUpward ? 6 : -6, scale: 0.94, filter: 'blur(8px)' }}
          animate={v3 ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
          exit={v3
            ? { opacity: 0, y: openUpward ? 4 : -4 }
            : { opacity: 0, y: openUpward ? 6 : -6, scale: 0.94, filter: 'blur(8px)' }}
          transition={{ duration: motionTokens.dur.base, ease: motionTokens.ease.glass }}
          style={dropdownStyle}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
