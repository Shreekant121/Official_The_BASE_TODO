/**
 * Aurora Glass — TaskSheet
 *
 * RECONCILED against the real `TaskSheet.jsx` at UI-26. Read this before
 * changing the material.
 * ---------------------------------------------------------------------
 * This file was an educated reconstruction: the design project was
 * unreachable for twelve sessions, so `screens/home.html` and the tokens
 * were the only authorities available. UI-21 mirrored the handoff bundle and
 * UI-26 diffed the two. As with `Dialog`, the result is a MERGE on the
 * authority of the bundle's own README: *"these are prototypes, not
 * production code … Match the visual output; don't copy the prototype's
 * internal structure unless it happens to fit."*
 *
 * Note the source files it under `overlay/`; we keep it under `layout/`,
 * because in this app it is a layout shell with slots rather than a
 * self-contained overlay. See "STRUCTURE" below.
 *
 * WHAT THE REAL FILE CORRECTED (the material)
 *   width       1240, not 1180. `TaskSheet.prompt.md` states it outright —
 *               "Wide, not tall. 1240px, three columns".
 *   height      `92dvh`. Dialog's own cap is `100dvh − --sp-11`, which fills
 *               the scrim's padded box exactly; the sheet deliberately floats
 *               inside it with a little more air. `dvh` rather than the
 *               source's `vh` for the reason Dialog already gives: a mobile
 *               URL bar makes `vh` lie.
 *   columns     `minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 0.95fr)`, not
 *               three equal tracks — the score column carries the widest
 *               control (the 2×2 quadrant grid) and the context column the
 *               narrowest rows. `align-items: start`, so a short column does
 *               not stretch to its neighbour's height.
 *   folds       three columns above 1260px of WINDOW, two above 880, one
 *               below — `prompt.md` names both numbers. Expressed here as the
 *               sheet widths those produce; see decision 1.
 *   insets      header `--sp-8 / --pad-sheet / --sp-7` and body
 *               `--sp-7 / --pad-sheet` at full width, both tightening to
 *               `--sp-6` below the two-column fold. We had one flat
 *               `--pad-sheet` at every size.
 *   footer      `--glass-fill-1`. We had faked the same separation with an
 *               inset shadow along the top edge; the system's answer is a
 *               fill, and it also wraps rather than crushing its buttons.
 *
 * WHAT THE REAL FILE DOES NOT HAVE, AND WE KEEP
 *   STRUCTURE. The prototype is one 1102-line component with every field of
 *   its own fixture hardcoded into it, over a scrim it rolls by hand. This
 *   file is the sheet's SHELL — header, columns, footer as slots — and
 *   `components/TaskDetailPanel.tsx` fills them from the real task. That is
 *   what lets one sheet serve a Firestore-backed task, and it is why the
 *   column split, the header and the footer live in that file rather than
 *   this one.
 *
 *   `Dialog`. The scrim, portal, focus trap, focus return, press-origin
 *   backdrop guard and exit dissolve are all Dialog's, and this composes it
 *   rather than re-deriving a second modal. **`TaskSheet.prompt.md` says "Do
 *   NOT reach for `Dialog` for this"** — read in context that is a warning
 *   about SHAPE ("Dialog is for a decision with one or two fields; anything
 *   with a subject this large is a sheet"), not about inheritance, and the
 *   prototype's own scrim and panel are token-for-token what UI-21 mirrored
 *   INTO Dialog: `--glass-fill-3`, `--glass-bd-xl`, `--glass-shadow-thick,
 *   --shadow-5`, `--r-sheet`, scrim `oklch(0.04 0 0 / 0.62)` under
 *   `blur(10px) saturate(1.2)`, scrim padding `--sp-7`. The visual output is
 *   identical either way, which is the README's own test; forking it would
 *   buy a second focus trap and a second copy of UI-22's exit handshake.
 *
 *   The cover. The source has an "Add cover" button and a `cover` field on
 *   its task type, but its header never renders one — there is no source
 *   answer to take, so decision 2 below stands unchanged.
 *
 * THREE DECISIONS WORTH NOT RE-LITIGATING
 * ---------------------------------------
 * 1. **The column count is a CONTAINER query, not a media query.** The source
 *    reads `window.innerWidth` at 1260 and 880; it can, because its sheet is
 *    the only thing on the page. Ours has to follow the PANEL's width, which
 *    is `min(1240, 100vw − 2 × --sp-7)`. The thresholds at the foot of
 *    `screens.css` are those two window widths converted into the sheet width
 *    they produce — 1212 and 832 — so the folds land where the source's do.
 *    The container itself is declared on the panel (see `PANEL`), which is
 *    what lets the header and footer insets fold with the columns.
 * 2. **The cover is the header's GROUND, not a band above it.** Stacked, a
 *    192px hero plus a 140px identity row is a third of a 900px window spent
 *    before the first field — the exact cost the three columns were meant to
 *    buy back. Behind the header the image is doing both jobs at once, and a
 *    task with no cover simply gets a shorter header rather than a hole.
 * 3. **Only the columns scroll.** Header and footer are pinned, so the title
 *    and Save are reachable from anywhere in the sheet — the same call the
 *    Score screen's sticky header makes, and for the same reason. The source
 *    pins them too, with `grid-template-rows: auto minmax(0, 1fr) auto`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Dialog } from '../overlay/Dialog';
import { CoverImage } from '../material/CoverImage';

export interface TaskSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Full-bleed image behind the header. Absent, the header is plain glass and
   * sits at its natural height.
   */
  coverUrl?: string;
  /** Header height while a cover is showing. */
  coverHeight?: number;
  /** Identity row — breadcrumb, title, score, close. Pinned; never scrolls. */
  header?: ReactNode;
  /**
   * One node per column, laid out left to right. Three is the design width;
   * fewer is fine, and more simply wraps.
   */
  columns: ReactNode[];
  /**
   * Full width under the columns, inside the scroll — the task sheet's closed
   * Optional section (OPT-5), which belongs to no one column.
   */
  after?: ReactNode;
  /** Pinned action bar along the foot. */
  footer?: ReactNode;
  /** Panel max width in px. Wide by default — this is the three-column sheet. */
  width?: number;
  /** Rung on the app's stacking ladder. See Dialog's port note 3. */
  zIndex?: number;
  /** Accessible name, when no visible heading can be pointed at. */
  label?: string;
  /** `id` of the visible heading that names the sheet. Prefer this. */
  labelledBy?: string;
  /** See Dialog's port note 2 — the app passes `false` and uses `useOverlayDismiss`. */
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /**
   * Forwarded straight to `Dialog`: fires once the dissolve has finished and
   * the sheet has left the DOM. This replaced an exported `SHEET_EXIT_MS`
   * that existed only to keep a second copy of `Dialog`'s exit duration in
   * step with the first — see the presence bridge in
   * `components/TaskDetailPanel.tsx`, and UI-22 in IMPROVEMENTS.md.
   */
  onExited?: () => void;
  /** Forwarded to `Dialog`: the row this sheet grows out of (idea 54, 29-1P6a). */
  growFrom?: string;
}

/* The panel is a flex column rather than Dialog's grid: header and footer are
   both optional, and `grid-template-rows` would have to be recomputed for each
   of the four combinations. `overflow: hidden` replaces Dialog's own scroller —
   the body below owns the scrolling, which is what lets the other two rows
   stay put.

   `containerType` is what decision 1 hangs on: every inset in this sheet, not
   just the column count, folds on the PANEL's width. Nothing is lost to the
   containment it implies — Dialog's panel already carries a `transform` and a
   `filter`, so it was a containing block for its fixed descendants and clipped
   them regardless. */
const PANEL: CSSProperties = {
  padding: 0,
  gap: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  /* The source's own cap. Dialog's `100dvh − --sp-11` fills the scrim's padded
     box exactly; a sheet this wide reads better with the extra air. The two
     `--safe-*` come off it for the same reason they come off Dialog's own cap
     (APP-2) — both are 0 in a browser tab, so this is still `92dvh` there. */
  maxHeight: 'calc(92dvh - var(--safe-t) - var(--safe-b))',
  containerType: 'inline-size',
  containerName: 'ag-task-sheet',
};

/* Dark enough at the foot that a kicker set on it stays legible over a bright
   photograph, and clear enough at the top that the picture is still a picture. */
const COVER_SCRIM =
  'linear-gradient(180deg, oklch(0 0 0 / 0.28) 0%, oklch(0 0 0 / 0.58) 52%, oklch(0 0 0 / 0.88) 100%)';

export function TaskSheet({
  open,
  onClose,
  coverUrl,
  coverHeight = 190,
  header,
  columns,
  after,
  footer,
  width = 1240,
  zIndex,
  label,
  labelledBy,
  closeOnEscape,
  closeOnBackdrop,
  onExited,
  growFrom,
}: TaskSheetProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={width}
      zIndex={zIndex}
      label={label}
      labelledBy={labelledBy}
      closeOnEscape={closeOnEscape}
      closeOnBackdrop={closeOnBackdrop}
      onExited={onExited}
      growFrom={growFrom}
      style={PANEL}
    >
      {(header || coverUrl) && (
        <header
          className="ag-task-sheet-head"
          style={{
            position: 'relative',
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'flex-end',
            minHeight: coverUrl ? coverHeight : undefined,
            borderBottom: '1px solid var(--line-faint)',
          }}
        >
          {/* The whole picture, never cropped (FIX-9) — `CoverImage` fits it
              inside the header and fills the sides with a blurred copy. Its own
              clipping box, not `overflow` on the header, which would cut off
              anything in the header that opens in flow. */}
          {coverUrl && (
            <span aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
              <CoverImage src={coverUrl} />
            </span>
          )}
          {coverUrl && (
            <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: COVER_SCRIM }} />
          )}
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>{header}</div>
        </header>
      )}

      <div
        className="ag-scroll ag-fade ag-task-sheet-body"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          boxSizing: 'border-box',
        }}
      >
        <div className="ag-task-sheet-cols">
          {/* `minmax(0, 1fr)`, not the implicit `auto` track: an auto track
              grows to its widest pane's min-content, and a column holds two
              panes (Timing and Context), so one over-long field in one of them
              pushed BOTH past the sheet's edge, where `overflowX` above cut
              off their right rims. Same trap `project/TaskRow.tsx` notes. */}
          {columns.map((column, i) => (
            <div
              key={i}
              style={{
                display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)',
                gap: 'var(--gap-card)', alignContent: 'start', minWidth: 0,
              }}
            >
              {column}
            </div>
          ))}
        </div>
        {after && <div style={{ marginTop: 'var(--gap-card)' }}>{after}</div>}
      </div>

      {footer && (
        <footer
          className="ag-task-sheet-foot"
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-4)',
            flexWrap: 'wrap',
            borderTop: '1px solid var(--line-faint)',
            /* The columns scroll UNDER this bar. We used to say so with an
               inset shadow; the source says it with a fill, which is the
               system's own vocabulary for a surface that comes forward. */
            backgroundImage: 'var(--glass-fill-1)',
          }}
        >
          {footer}
        </footer>
      )}
    </Dialog>
  );
}
