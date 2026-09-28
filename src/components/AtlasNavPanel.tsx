/**
 * Item 13F — the Atlas panel.
 * Mockup: `design-system/screens/atlas.html`, `AtlasSub` + `SubRow`.
 *
 * The six destinations the nav dropped on 2026-09-08 fold in behind the Atlas
 * button instead of being deleted, and v3's `atlas.html` added a seventh —
 * **Dock mode**, which DESIGN-1 built. Five of them are built, so this ships
 * with five rows; `navModel`'s `ATLAS_SUB_ENTRIES` is the list, and Inbox
 * triage (item 23) and Contacts (item 21) join it when they have screens.
 *
 * It only ever appears on `/chat` — the mockup's own comment is that the
 * panel *"only happens while you are on this page"*, and everywhere else the
 * Atlas cell simply navigates here. That rule is in `navModel.go`, not in
 * this component: this one just draws what the flag says.
 *
 * TWO PLACEMENTS, DRAWN SEPARATELY
 * --------------------------------
 * The caller positions it, because only the caller knows where its nav is:
 *   - Rail (wide) — absolutely positioned at `left: calc(100% + var(--sp-4))`,
 *     `top: 0` beside the vertical `MiniNav`, **244px** wide, growing from
 *     `transform-origin: left center`.
 *   - Bottom pill (narrow) — `narrow`, sat above the floating bar, taking the
 *     mockup's `min(360px, 100vw - var(--sp-9))` itself and growing from
 *     `bottom center`.
 * Both are the mockup's numbers. Note the app switches rail↔pill at `WIDE`
 * (960) rather than the mockup's inline 900 — `ui/useMedia.ts` is the one
 * breakpoint every migrated screen shares, and this panel follows whichever
 * one its host screen used rather than introducing a second.
 *
 * **The width is on the panel and NOT on the wrapper, and no ancestor of this
 * component may carry a `transform`.** The mockup centres its narrow wrapper
 * with `translateX(-50%)`, and copying that broke the scrim in a way a
 * screenshot caught and no click would have explained: a transformed element
 * becomes the containing block for any `position: fixed` descendant, so the
 * scrim's `inset: 0` resolved to the panel's own 360px box instead of the
 * viewport. The page was not dimmed and there was nothing outside the panel
 * to click to close it. The caller centres with a grid instead — same
 * drawing, no transform. `filter` and `backdrop-filter` do the same thing to
 * a fixed child, which is the other way this could come back.
 *
 * THE PANEL IS DELIBERATELY NOT GLASS, AND THAT IS NOT A BUG TO FIX
 * -----------------------------------------------------------------
 * `backdrop-filter: none` over a solid `oklch(0.178 0.005 260)` with
 * `--glass-shadow-thick` — the one surface in the whole bundle that opts out.
 * It floats over a nav that is *already* a blurred pane, and blur over blur
 * reads as fog. Leave it opaque.
 *
 * THE MOTION
 * ----------
 * Row 5 of item 13G's table, and this is the shared implementation of it —
 * the two chat dial popovers take the same one. `transform` and
 * `border-radius` on `--dur-morph`/`--ease-morph`, `opacity` and `filter` on
 * `--dur-fast`/`--ease-glass`, and `visibility` stepped with `0s linear` so
 * the closed panel is genuinely gone rather than transparent-but-clickable.
 * Row 6 is the scrim: `opacity` on `--dur-fast`, same visibility step. Row 10
 * is the rows' own hover — `box-shadow` on `--dur-base`, `background-image`
 * on `--dur-fast`.
 *
 * It is mounted at all times and hidden, never unmounted: a panel that did
 * not exist a frame ago has nothing to grow from. Same reasoning as item 13's
 * tray.
 */
import { useState } from 'react';
import { Icon, type IconName } from '../ui';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { ATLAS_SUB_ENTRIES } from './navModel';

export interface AtlasNavPanelProps {
  open: boolean;
  onClose: () => void;
  /** Navigate by entry `value` — `navModel`'s `go`. */
  onPick: (value: string) => void;
  /** Bottom-pill placement: grows from the bottom, fills its wrapper. */
  narrow?: boolean;
}

export function AtlasNavPanel({ open, onClose, onPick, narrow = false }: AtlasNavPanelProps) {
  /*
   * Escape closes it. `hideNav: false` because this is a small transient
   * surface hanging off the nav — the standard `hideNav` would fold away the
   * very pill it is attached to.
   */
  useOverlayDismiss(open, onClose, { hideNav: false });

  return (
    <>
      {/* The scrim. Fixed and full-bleed, under the panel but over the page,
          and clicking it closes — the mockup's `oklch(0 0 0 / 0.42)`. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          background: 'oklch(0 0 0 / 0.42)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          transition: `opacity var(--dur-fast) var(--ease-glass), visibility 0s linear ${open ? '0s' : 'var(--dur-fast)'}`,
        }}
      />
      <div
        role="menu"
        aria-label="Atlas"
        aria-hidden={!open}
        style={{
          position: 'relative',
          zIndex: 1,
          width: narrow ? 'min(360px, calc(100vw - var(--sp-9)))' : 244,
          boxSizing: 'border-box',
          display: 'grid',
          gap: 2,
          padding: 'var(--sp-4)',
          borderRadius: open ? 'var(--r-lg)' : 'var(--r-pill)',
          backgroundColor: 'oklch(0.178 0.005 260)',
          backgroundImage: 'var(--glass-fill-1)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          boxShadow: 'var(--glass-shadow-thick)',
          transformOrigin: narrow ? 'bottom center' : 'left center',
          transform: open
            ? 'scale(1) translateX(0)'
            : narrow
              ? 'scale(0.94) translateY(10px)'
              : 'scale(0.92) translateX(-14px)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          filter: open ? 'blur(0)' : 'blur(7px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'transform var(--dur-morph) var(--ease-morph), border-radius var(--dur-morph) var(--ease-morph), '
            + 'opacity var(--dur-fast) var(--ease-glass), filter var(--dur-fast) var(--ease-glass), '
            + `visibility 0s linear ${open ? '0s' : 'var(--dur-fast)'}`,
        }}
      >
        {ATLAS_SUB_ENTRIES.map((entry) => (
          <SubRow
            key={entry.value}
            icon={entry.icon}
            label={entry.label}
            note={entry.note ?? ''}
            /* Nothing inside a closed panel is reachable by keyboard. */
            disabled={!open}
            onPick={() => onPick(entry.value)}
          />
        ))}
      </div>
    </>
  );
}

/**
 * One row: icon, label, and the one-line note that says what the surface is
 * for. A `<button>` rather than the mockup's `<a href>` because this app
 * navigates through the router — same shape, same states.
 */
function SubRow({
  icon,
  label,
  note,
  disabled,
  onPick,
}: {
  icon: IconName;
  label: string;
  note: string;
  disabled: boolean;
  onPick: () => void;
}) {
  /* The mockup's own `useState` hover rather than a class in `screens.css`:
     it keeps the whole panel in this one file, and five rows is not a paint
     budget worth optimising. */
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        minHeight: 42,
        width: '100%',
        padding: '0 var(--sp-4)',
        borderRadius: 'var(--r-sm)',
        border: 0,
        backgroundColor: 'transparent',
        backgroundImage: hover ? 'var(--glass-fill-2)' : 'none',
        boxShadow: hover ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        textAlign: 'left',
        cursor: 'pointer',
        /* Row 10 of 13G's table. */
        transition: 'box-shadow var(--dur-base) var(--ease-glass), background-image var(--dur-fast) var(--ease-glass)',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', color: hover ? 'var(--fg-1)' : 'var(--fg-3)' }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ display: 'grid', gap: 0, minWidth: 0, flex: 1 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
          {note}
        </span>
      </span>
    </button>
  );
}

export default AtlasNavPanel;
