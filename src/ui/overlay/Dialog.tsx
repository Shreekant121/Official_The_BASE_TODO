/**
 * Aurora Glass — Dialog
 *
 * RECONCILED against the real `Dialog.jsx` at UI-21. Read this before
 * changing the material.
 * ---------------------------------------------------------------------
 * This file was reconstructed from its call sites for UI-2, because the
 * design project could not be reached for eleven sessions running. UI-21
 * finally mirrored it — `design-system/components/overlay/Dialog.{jsx,d.ts,
 * prompt.md}` — and the two were diffed. The result is deliberately a
 * MERGE, not a replacement, on the authority of the handoff bundle's own
 * README: *"these are prototypes, not production code … Match the visual
 * output; don't copy the prototype's internal structure unless it happens
 * to fit."*
 *
 * WHAT THE REAL FILE CORRECTED (the material — we had guessed low)
 *   fill        `--glass-fill-3`, not `--glass-fill-2`. A dialog is a
 *               SHEET, not a card. `readme.md` — "level={3} heavy sheet or
 *               dialog".
 *   backdrop    `--glass-bd-xl` (72px), not `--glass-bd-lg` (44px). Note
 *               this is a full step BEYOND `.ag-glass--thick`, which is
 *               fill-3 + bd-lg — a dialog is the heaviest glass in the
 *               system. Port note 1 does not apply: there is no
 *               `--glass-bd-xl-refract`, so this chain carries no `url()`
 *               and cannot be invalidated by a missing filter.
 *   cast        `var(--glass-shadow-thick), var(--shadow-5)` — the thick
 *               stack PLUS the deepest cast, which we had omitted.
 *   scrim       `oklch(0.04 0 0 / 0.62)` and `blur(10px) saturate(1.2)`.
 *               The 10px is spelled out in `Dialog.prompt.md` — "that's
 *               what makes the dialog feel like glass over glass rather
 *               than a card on a scrim" — so it is intent, not an
 *               un-tokenised accident. We had 8px and no saturate.
 *   spacing     scrim padding `--sp-7`; panel gap `--sp-6`. We had
 *               `--sp-5` and `--gap-stack` (also `--sp-5`).
 *   width       defaults to 480. Every call site in this app passes an
 *               explicit width, so this is mirror fidelity only.
 *
 * **The near-opaque base coat is GONE.** It existed because a level-2
 * dialog let the page's text show through its own; the design system's
 * answer to that is heavier glass, not opacity, and fill-3 + bd-xl is
 * that answer. Re-adding a `backgroundColor` under the gradient puts this
 * file back off-system.
 *
 * WHAT THE REAL FILE DOES NOT HAVE, AND WE KEEP (structure, not looks)
 *   The prototype renders in place, has no focus handling, and drops a
 *   closed dialog with `if (!open) return null`. Production needs all of:
 *   the portal, the focus trap, focus return, the `autoFocus` guard, the
 *   press-origin backdrop guard, `maxHeight` + scroller, `zIndex`, and the
 *   exit dissolve below. The prototype's backdrop click is
 *   `onClick={onClose}` on the scrim, which closes on any release over it —
 *   including the end of a drag that began inside the panel. That is the
 *   exact bug `pressedScrimRef` exists to prevent; it stays.
 *
 * PORT NOTES
 * ----------
 * 1. NO REFRACTION. `--glass-bd-lg-refract` resolves `url(#ag-refract-lg)`,
 *    which only exists where `<GlassFilters />` is mounted — today that is
 *    Home and nowhere else. A dialog is global; an unresolvable filter
 *    reference invalidates the whole `backdrop-filter` chain in Chromium,
 *    so the sheet would open with NO blur at all on every other screen.
 *    Plain `--glass-bd-lg` always works. Revisit if GlassFilters ever
 *    moves to the app root.
 * 2. `closeOnEscape` defaults to true so the component is correct on its
 *    own, but **this app passes `false`**: Escape here is owned by
 *    `src/lib/useOverlayDismiss.ts`, which answers only for the topmost
 *    overlay in a shared stack. Two handlers would collapse a nested
 *    stack in one keypress. Callers inside the app use `useOverlayDismiss`;
 *    the prop exists for the design system's own sake.
 * 3. `zIndex` is a prop rather than a token because this app's stacking
 *    ladder lives in `src/lib/zLayers.ts`, and `src/ui/` deliberately
 *    imports nothing outside itself (see MorphMenu's port note 2).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useV3, v3Attr } from '../core/v3Context';

/**
 * BACKSTOP ONLY — the dissolve is now waited on, not guessed (UI-22).
 *
 * This used to be a fixed `setTimeout(260)` racing the CSS transition, and
 * the two do not start together: the timer starts when React commits
 * `open=false`, but Chromium leaves the transition PENDING — `currentTime`
 * stuck at 0 — until it next gets to do style and paint. Measured through
 * `document.getAnimations()`, closing the task sheet from the project board
 * in a dev build left the transition at `0/260` for 200-380ms and dropped it
 * anywhere between `0/260` and `233/260`. A production build usually wins
 * the race, which is why nobody saw it, but the coupling was luck.
 *
 * `transitionend` on the panel is the real signal. This constant survives
 * only for the cases where NO transition ever runs and that event therefore
 * never fires: a sheet closed while its tab is hidden gets no frames at all.
 * It is deliberately several times `--dur-base` rather than equal to it — a
 * backstop that can pre-empt the thing it is backing up is the original bug.
 * Overshooting is free: the scrim goes `pointer-events: none` the moment the
 * dissolve starts, so a sheet that lingers is inert and invisible.
 *
 * (`prefers-reduced-motion` rewrites `--dur-base` to 1ms, which still fires
 * `transitionend` — just immediately. That path needs no backstop.)
 */
const EXIT_BACKSTOP_MS = 1200;

/** The one transition property the exit is timed off. Three of them run
 *  (transform, opacity, filter) and each fires its own `transitionend`;
 *  opacity is the one that decides when the sheet is actually gone. */
const EXIT_PROPERTY = 'opacity';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
  /** Panel max width in px. It is always 100% of the space below that. */
  width?: number;
  /** Accessible name, for when no visible heading can be pointed at. */
  label?: string;
  /** `id` of the visible heading that names the sheet. Prefer this. */
  labelledBy?: string;
  /** See port note 2 — the app passes `false` and uses `useOverlayDismiss`. */
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** Rung on the app's stacking ladder. See port note 3. */
  zIndex?: number;
  /**
   * Where the panel sits. `'top'` hangs it 14vh down rather than centring it,
   * which is `CommandPalette.prompt.md`'s rule: a palette that jumps to the
   * middle as its results grow and shrink fights the page beneath it.
   */
  placement?: 'center' | 'top';
  className?: string;
  /** Lands on the PANEL, not the scrim — that is what the mockups do. */
  style?: CSSProperties;
  /**
   * Fired once the dissolve has actually finished and the sheet has left
   * the DOM — not after a guessed interval. A caller that has to hold its
   * own node in the tree for the length of the exit (see the presence
   * bridge in `components/TaskDetailPanel.tsx`) hangs off this rather than
   * off a second copy of the duration. Never fires on open.
   */
  onExited?: () => void;
}

export function Dialog({
  open,
  onClose,
  children,
  width = 480,
  label,
  labelledBy,
  closeOnEscape = true,
  closeOnBackdrop = true,
  zIndex = 50,
  placement = 'center',
  className = '',
  style,
  onExited,
}: DialogProps) {
  /* Two flags, not one. `mounted` keeps the sheet in the DOM long enough
     to dissolve; `shown` is what the styles read, flipped a frame after
     mount so there is a state to transition FROM. */
  const v3 = useV3();
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  /* Both react to `open` CHANGING, which is a render-phase adjustment,
     not an effect — the same pattern SmartStartModal uses to reset its
     fields. Doing it in an effect would be a cascading render, and
     react-hooks v7 rejects it outright. */
  const [prevOpen, setPrevOpen] = useState(open);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /* Whether the press that started this click landed on the scrim. A drag
     that begins inside the panel and releases outside it reports the
     scrim as the click target, and must not close the sheet. */
  const pressedScrimRef = useRef(false);
  /* The exit effect must not restart when this identity changes — a caller
     passing an inline arrow would otherwise tear down and rebuild the
     `transitionend` listener part-way through the dissolve it is waiting on,
     and the backstop would start again from zero. */
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMounted(true);
    else setShown(false);
  }

  /* Held open through the dissolve, then dropped — when the dissolve says
     so, not when a timer guesses it has. See EXIT_BACKSTOP_MS above. */
  useEffect(() => {
    if (open || !mounted) return;
    const panel = panelRef.current;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setMounted(false);
      onExitedRef.current?.();
    };
    /* Only the panel's own opacity run counts. `transitionend` bubbles, so
       an unrelated transition finishing on a child inside the sheet would
       otherwise drop the whole thing mid-dissolve. */
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== panel || e.propertyName !== EXIT_PROPERTY) return;
      finish();
    };
    panel?.addEventListener('transitionend', onTransitionEnd);
    const t = setTimeout(finish, EXIT_BACKSTOP_MS);
    return () => {
      clearTimeout(t);
      panel?.removeEventListener('transitionend', onTransitionEnd);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted || !open) return;
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [mounted, open]);

  /* Focus moves into the sheet on open and back to whatever opened it on
     close — otherwise dismissing one returns a keyboard user to the top
     of the page every time.

     The panel only takes the focus if nothing inside it already has. A
     sheet whose first field carries `autoFocus` gets that focus during
     the commit that mounts it, which is BEFORE this timer fires, so
     without the guard the panel silently took it straight back off the
     field and every `autoFocus` under a Dialog was dead markup. */
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      panel.focus({ preventScroll: true });
    }, 0);
    return () => {
      clearTimeout(t);
      returnFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!mounted) return null;

  /* Escape and the tab trap ride the React tree rather than `window`.
     Focus is inside the panel from the moment it opens, so every relevant
     keystroke passes through here — and a window listener would answer
     for a sheet that has something else stacked on top of it. */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && closeOnEscape) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      /* Nothing to land on — keep the ring inside rather than tabbing out
         into the page the sheet is covering. */
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && here === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const scrim: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex,
    display: 'grid',
    placeItems: placement === 'top' ? 'start center' : 'center',
    /* The scrim is `inset: 0` and portalled to `<body>`, so it is the one
       surface in the app that is deliberately full-bleed — it has to dim
       what is under the system bars too. Its PADDING is what keeps the
       sheet itself clear of them (APP-2); `--safe-*` is 0 in a browser
       tab, so this is `--sp-7` on all four sides exactly as before. */
    padding:
      `calc(${placement === 'top' ? '14vh' : 'var(--sp-7)'} + var(--safe-t)) calc(var(--sp-7) + var(--safe-r))` +
      ' calc(var(--sp-7) + var(--safe-b)) calc(var(--sp-7) + var(--safe-l))',
    /* Darker than the page floor, so the sheet reads as lit from in front
       of the page rather than as one more pane on the same plane. */
    backgroundColor: 'oklch(0.04 0 0 / 0.62)',
    /* Literal 10px, not `--glass-blur-xs` (8px): `Dialog.prompt.md` names
       this number outright as what makes the dialog read as glass over
       glass. The saturate goes with it — every other backdrop in the
       system carries one, and the scrim was the only place we had dropped
       it, which is what made the page behind go grey rather than dim. */
    WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
    backdropFilter: 'blur(10px) saturate(1.2)',
    opacity: shown ? 1 : 0,
    /* Inert the instant the dissolve starts. This is what makes an
       overshooting EXIT_BACKSTOP_MS free: a sheet still in the DOM cannot
       swallow a click meant for the page underneath it. */
    pointerEvents: shown ? 'auto' : 'none',
    transition: 'opacity var(--dur-base) var(--ease-glass)',
  };

  const panel: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: width,
    /* `--sp-11` is the scrim's two `--sp-7` pads; the two `--safe-*` are what
       the system bars take on top of them (APP-2). Both are 0 in a browser
       tab, so this is still `100dvh − --sp-11` there. A `maxHeight` that
       ignored them would let a tall sheet overflow the scrim's padded box —
       `placeItems: center` overflows both edges equally — and put its first
       and last rows under the status bar and the gesture bar. */
    maxHeight:
      placement === 'top'
        ? 'calc(100dvh - 14vh - var(--sp-7) - var(--safe-t) - var(--safe-b))'
        : 'calc(100dvh - var(--sp-11) - var(--safe-t) - var(--safe-b))',
    /* The sheets pass `padding: 0` and inset their own scroller, so the
       panel has to clip that content back to its own corners. */
    overflowX: 'hidden',
    overflowY: 'auto',
    display: 'grid',
    gap: 'var(--sp-6)',
    padding: 'var(--pad-sheet)',
    borderRadius: 'var(--r-sheet)',
    /* Level 3, and a step beyond `.ag-glass--thick` on the backdrop. No
       base coat: the readability this file used to buy with opacity is
       what fill-3 and a 72px blur are for. See the header. */
    backgroundImage: 'var(--glass-fill-3)',
    WebkitBackdropFilter: 'var(--glass-bd-xl)',
    backdropFilter: 'var(--glass-bd-xl)',
    boxShadow: 'var(--glass-shadow-thick), var(--shadow-5)',
    /* The panel takes focus on open; it is a container, not a control, so
       it must not draw the system ring around the whole sheet. */
    outline: 'none',
    /* The condense law, with `ag-condense`'s own numbers — or, in V3, with
       `ag3-condense`'s: a fade and a 4px rise, no scale and no blur. */
    opacity: shown ? 1 : 0,
    transform: shown ? 'scale(1) translateY(0)' : v3 ? 'translateY(4px)' : 'scale(0.94) translateY(6px)',
    filter: shown || v3 ? 'blur(0)' : 'blur(8px)',
    transition:
      'transform var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass), filter var(--dur-base) var(--ease-glass)',
    ...style,
  };

  return createPortal(
    <div
      /* A portal leaves the scope's DOM subtree; this carries it across. */
      {...v3Attr(v3)}
      style={scrim}
      onKeyDown={onKeyDown}
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        pressedScrimRef.current = e.target === e.currentTarget;
      }}
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        if (!closeOnBackdrop) return;
        if (!pressedScrimRef.current || e.target !== e.currentTarget) return;
        onClose();
      }}
    >
      <div
        ref={panelRef}
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        style={panel}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
