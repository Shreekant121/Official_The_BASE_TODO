/**
 * The docked panel — RECONCILED against `design-system/screens/focus.html`
 * (UI-32). This file replaces the shell that used to live in
 * `SubtaskSidePanel.tsx`; that file is `SubtaskRows.tsx` now and keeps only
 * the two row variants.
 *
 * **The mockup opens by naming the drawer as the old screen's first mistake.**
 * Its comment block lists four things the previous focus screen got wrong and
 * this is number one, verbatim:
 *
 *   > Details and Subtasks opened sheets that blurred and covered the task
 *   > they described — you lost the thing you were working on to read about
 *   > it. They now DOCK beside the stage: the card slides left, the panel
 *   > grows out of the pill you pressed, and both stay legible. Nothing is
 *   > ever hidden behind its own annotation.
 *
 * So the scrim is gone, the `blur(6px)` over the page is gone, and the
 * `x: '100%'` spring off the right edge is gone with them. What is here is
 * the mockup's `Panel`: an outer box that morphs its own WIDTH 0 → 404 over
 * `--dur-morph`/`--ease-morph` with a 380px pane inside it at `--sp-6` of
 * margin, the pane riding in from `translateX(-16px)` so it reads as growing
 * out of the stage rather than arriving from off-screen. Material is
 * `--glass-fill-2` + `--glass-bd-md` + `--glass-shadow-pane` at
 * `--r-md` (it was `--r-card-lg` until 2026-09-30, when he asked for the
 * panes to be rounded rectangles like the top bar) — a level-2 pane, one rung
 * BELOW the sheet it replaces, because a panel that no longer covers anything
 * does not need to shout over it.
 *
 * This also settles the note the old file carried about sliding. It said
 * *"`motion.css` says nothing slides in from off-screen unless it is a sheet.
 * This is a sheet, so the x-transform entrance stays"* — true of a sheet, and
 * the premise is what changed: this is not a sheet any more.
 *
 * NARROW WINDOWS STACK. The mockup's own answer, under a comment saying why:
 * *"Narrow screens have no room to dock, so the panel stacks under the stage
 * rather than covering it."* Same rule, one breakpoint (`WIDE`), and the
 * stacked form arrives by `ag-condense` like every other pane in the system.
 *
 * KEPT FROM THE DRAWER, because the prototype has none of it:
 *   - **Escape closes it**, through `useOverlayDismiss` — but with
 *     `hideNav: false`. The floating `MiniNav` tucked away for the old sheet
 *     because the sheet covered the page; a docked panel covers nothing, and
 *     on a narrow window it stacks ABOVE that nav rather than over it.
 *   - **A closed panel leaves the tab order.** Both panels stay mounted so
 *     the width can morph, so `visibility` is switched to `hidden` on a delay
 *     equal to the morph — the one property that both animates and takes a
 *     control out of the accessibility tree. Without it, tabbing off the
 *     stage walks into a 0px-wide panel nobody can see.
 *   - `aria-labelledby` pointing at the panel's own heading, and the close
 *     button's accessible name.
 */
import { useId, type ReactNode } from 'react';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Icon, IconButton } from '../ui';

/** The mockup's `Panel`: a 380px pane inside a 404px slot. */
const PANE_WIDTH = 380;
const SLOT_WIDTH = 404;

export interface FocusDockPanelProps {
  open: boolean;
  /**
   * True on a wide window, where the panel docks beside the stage. False
   * below it, where it stacks underneath instead — see the header.
   */
  docked: boolean;
  title: string;
  /** The task the panel is about. It is never the subject of the screen. */
  subtitle?: string;
  onClose: () => void;
  /** A row under the body — where the mockup puts its one link out. */
  footer?: ReactNode;
  children: ReactNode;
}

export function FocusDockPanel({ open, docked, title, subtitle, onClose, footer, children }: FocusDockPanelProps) {
  useOverlayDismiss(open, onClose, { hideNav: false });
  const headingId = useId();

  const head = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
        <h2
          id={headingId}
          style={{
            font: 'var(--type-title)',
            fontSize: 'var(--text-lg)',
            letterSpacing: 'var(--tracking-title)',
            color: 'var(--fg-1)',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{subtitle}</span>
        )}
      </div>
      <IconButton label="Close panel" size="sm" variant="ghost" onClick={onClose}>
        <Icon name="x" size={16} />
      </IconButton>
    </div>
  );

  const pane = (
    <div
      role="region"
      aria-labelledby={headingId}
      style={{
        display: 'grid',
        gap: 'var(--sp-6)',
        alignContent: 'start',
        padding: 'var(--pad-card)',
        /* A rounded rectangle like the bar above it, not --r-card-lg's big
           curve — his call, 2026-09-30. */
        borderRadius: 'var(--r-md)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-shadow-pane)',
        ...(docked
          ? {
              width: PANE_WIDTH,
              marginLeft: 'var(--sp-6)',
              transform: open ? 'translateX(0)' : 'translateX(-16px)',
              transition: 'transform var(--dur-morph) var(--ease-morph)',
            }
          : { width: '100%', animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both' }),
      }}
    >
      {head}
      {children}
      {footer}
    </div>
  );

  /* Stacked: nothing to morph, so it simply is not there when it is closed. */
  if (!docked) return open ? pane : null;

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: open ? SLOT_WIDTH : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        /* Hidden the instant it opens, delayed by the morph on the way out,
           so the panel is out of the tab order exactly while it is invisible. */
        visibility: open ? 'visible' : 'hidden',
        transition: [
          'width var(--dur-morph) var(--ease-morph)',
          'opacity var(--dur-base) var(--ease-glass)',
          open ? 'visibility 0s' : 'visibility 0s linear var(--dur-morph)',
        ].join(', '),
      }}
    >
      {pane}
    </div>
  );
}
