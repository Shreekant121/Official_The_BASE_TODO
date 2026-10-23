/**
 * Aurora Glass — MorphMenu
 * Ported from design-system/components/overlay/MorphMenu.{jsx,d.ts}.
 * Guidance: design-system/components/overlay/MorphMenu.prompt.md
 *
 * RECONCILED at UI-26, and the answer was "nothing to take". Diffed line by
 * line against the mirrored `MorphMenu.jsx`: the panel, the header, the rows,
 * the confirm strip, the stagger, the flip and every transition string are the
 * source's, token for token — this file was ported FROM it rather than
 * reconstructed, so unlike `TaskSheet` it never had guesses in it to correct.
 * The four port notes below are the whole of the divergence, and each one was
 * re-checked against the source rather than taken on trust:
 *   1-3 still describe things the source does not have (or has and its own
 *       `.d.ts` omits, in note 3's case).
 *   4   the source has NOT grown its own answer to clipping — its panel is
 *       still `position: absolute` with a hardcoded `zIndex: 60` — so the
 *       opt-in `portal` stays, and stays OFF by default. Three call sites ask
 *       for it, all of them menus inside a scroller that clips: the project
 *       board's list and task rows, and New Session's task rows.
 *
 * The trigger does not open a menu somewhere else — the trigger BECOMES
 * the menu. The panel is anchored to the trigger's corner and animates
 * from the trigger's exact size and pill radius out to its full size and
 * card radius, so the eye tracks one continuous object. That is the
 * whole trick, and it is why transform-origin and the radius
 * interpolation both matter.
 *
 * Three things this carries beyond a plain popover, because a context
 * menu on a card has to survive covering the card:
 *   header   — the object being acted on, restated inside the menu.
 *   section  — items grouped by intent, mono kicker labels.
 *   confirm  — a destructive item arms IN PLACE: the row collapses and a
 *              confirm strip grows in its slot. No second dialog.
 *
 * That last one is a system rule, not a preference: a modal for "are you
 * sure" breaks the morph law and loses the subject.
 *
 * PORT NOTES
 * ----------
 * 1. The source's single `[isOpen, armed]` effect is split into three —
 *    measure, focus, dismiss — each with honest dependencies. See the
 *    comment above them for why one shared effect could not survive
 *    react-hooks v7 without writing a ref during render.
 * 2. `zIndex: 60` is kept as a local value rather than being taken from
 *    lib/zLayers.ts. Per CLAUDE.md that ladder governs `fixed` overlay
 *    surfaces; this panel is `absolute` inside its own wrapper, which is
 *    explicitly local stacking.
 * 3. `header.right` is rendered by the source but missing from its
 *    .d.ts. It is declared here — the implementation is authoritative.
 * 4. ADDED: an opt-in `portal`. The source's panel is `absolute` inside
 *    its own wrapper, which is right until the menu lives in something
 *    that CLIPS — and New Session's task rows do: each list is its own
 *    scroller inside a pane that must not grow, so a row menu opened on
 *    a tablet had 179 of its 308 pixels cut off (measured, not guessed).
 *    With `portal` the panel renders into `<body>` and takes its offsets
 *    from the trigger's viewport rect instead, clamped to the window.
 *    Everything else is untouched — same morph, same origin, same radius
 *    interpolation — and it is OFF by default, so the three call sites
 *    that predate it behave exactly as before. Two things it drags along:
 *    the outside-pointerdown handler has to spare the panel by name (it
 *    is no longer a DOM descendant of the wrapper), and a `fixed` surface
 *    needs a rung, which arrives as the `zIndex` prop for the same reason
 *    `Dialog` takes one — see its port note 3.
 * 5. ADDED (OPT-10): the panel no longer scrolls itself. A tall menu on a
 *    short screen scrolls an inner box, which draws no scrollbar and fades
 *    the end with rows past it (`.ag-scroll .ag-fade`) — his BASE list,
 *    *"remove the scroll sidebar from all the dropdowns"* and *"no abrupt
 *    cut"*. The fade cannot sit on the panel: a mask on the glass would
 *    fade the panel's own edges away with its rows. And `beside` puts two
 *    short items in one row as a pair of boxes (Share | Hide on a list).
 * 6. ADDED (29-1P5c, idea 59): a row no longer lights up on its own under
 *    the mouse. One pad glides from row to row (`core/useGlide.ts`), coral
 *    under a delete; the row keeps its brighter text and lime icon.
 * 7. ADDED (29-1P6a, idea 75): hold the trigger, slide to a row, let go —
 *    `core/useHoldSlide.ts`, on every menu. A plain tap is unchanged.
 */
import {
  cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react';
import { useV3, v3Attr } from '../core/v3Context';
import { HoldToConfirm } from '../actions/HoldToConfirm';
import { cue } from '../../lib/sound';
import { useGlide } from '../core/useGlide';
import { useHoldSlide } from '../core/useHoldSlide';
import { KeyCaps } from '../core/KeyCaps';

export interface MorphMenuItem {
  value?: string;
  label?: ReactNode;
  icon?: ReactNode;
  /**
   * The row's key, drawn as little raised keys on the laptop (idea 18,
   * 29-1P6a): `'n'`, or `['g', 'h']` for a sequence. Take it from
   * `lib/shortcutBindings.ts`, never a literal, so a moved key shows moved.
   */
  shortcut?: string | string[];
  /** Right-aligned mono value — a current setting. Never both this and `shortcut`. */
  meta?: ReactNode;
  /** `danger` renders the item in coral (29-1P2c2: delete is coral's job). */
  tone?: 'default' | 'danger';
  onSelect?: () => void;
  /**
   * Destructive items arm in place instead of opening a dialog: the row
   * collapses and this strip grows in its slot. Escape disarms before it
   * closes the menu.
   */
  /**
   * A `danger` item's strip is coral with a coral button and "Keep"; any other
   * item's is a neutral well with a solid glass button and "Cancel" — BUILD-11's
   * Archive, which sits above Delete and is never red (`Archive.dc.html`).
   */
  confirm?: {
    /** Name the object. "Delete Studio Launch?" — never "Are you sure?". */
    label: ReactNode;
    /** One line on what is lost. */
    hint?: ReactNode;
    /** Confirm button copy. Defaults to `Delete`. */
    action?: string;
    onConfirm?: () => void;
    /**
     * The confirm is a `HoldToConfirm`: pressed and held until its fill runs
     * across, never a tap (29-1P2). For what costs most to undo — deleting a
     * project and its whole tree, his call — not for every delete.
     */
    hold?: boolean;
  };
  /** Label swapped in for 1.4s on select; the menu stays open. */
  flash?: ReactNode;
  flashIcon?: ReactNode;
  /**
   * Draws this item and the NEXT one side by side, as two boxes in one row
   * (OPT-10, his ask: Share and Hide). For two short labels with no
   * `confirm` — a confirm strip has no room to grow under half a row.
   */
  beside?: boolean;
  /** Renders a separator instead of an item. */
  divider?: boolean;
  /** Renders an uppercase mono group label instead of an item. */
  section?: ReactNode;
}

export interface MorphMenuHeaderObject {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  right?: ReactNode;
}

export interface MorphMenuProps extends HTMLAttributes<HTMLDivElement> {
  /** The clickable element — usually an `IconButton` or `Button`. */
  trigger: ReactNode;
  items: MorphMenuItem[];
  /**
   * The object being acted on, restated inside the panel. Required
   * whenever the menu can cover its own subject (any card menu).
   */
  header?: MorphMenuHeaderObject | ReactNode;
  /** Which trigger edge the panel hangs from. */
  align?: 'start' | 'end';
  width?: number;
  /** Controlled mode. Use it to keep one menu open at a time in a grid. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Render the panel into `<body>` and position it `fixed` off the trigger,
   * instead of `absolute` inside this component's own wrapper. **Only needed
   * when an ancestor clips or contains it** — a scrolling list, or a form
   * animating its own height. See port note 4.
   */
  portal?: boolean;
  /**
   * The rung a portalled panel takes. A prop, not a token, for the reason
   * `Dialog` gives in its port note 3: this app's stacking ladder lives in
   * `src/lib/zLayers.ts` and `src/ui/` imports nothing outside itself.
   * Ignored unless `portal`.
   */
  zIndex?: number;
}

export function MorphMenu({
  trigger,
  items = [],
  align = 'start',
  width = 240,
  header = null,
  open,
  onOpenChange,
  portal = false,
  zIndex = 99999,
  className = '',
  style,
  ...rest
}: MorphMenuProps) {
  const v3 = useV3();
  const [internal, setInternal] = useState(false);
  const isOpen = open !== undefined ? open : internal;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /* The panel's inner box — what actually scrolls (port note 5). */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [armed, setArmed] = useState<number | null>(null);
  const [flashed, setFlashed] = useState<number | null>(null);
  /* Flip up when there is no room below — the panel grows again when a
     confirm arms, so this is re-measured on that too. */
  const [flip, setFlip] = useState(false);
  /* The panel's height cap when it fits neither below nor above the trigger —
     see effect 1. `null` whenever it fits one way or the other. */
  const [cap, setCap] = useState<number | null>(null);
  /* Where the trigger is, in viewport coordinates. Only read when `portal`. */
  const [anchor, setAnchor] = useState({ top: 0, bottom: 0, left: 0, right: 0, viewportW: 0, viewportH: 0 });

  /*
   * THE PANEL IS BUILT ON FIRST OPEN, NOT BEFORE (2026-09-28). It used to be
   * mounted closed for every menu on the page, and a row menu is one per row:
   * New Session with 161 tasks carried 161 hidden menus, 10,844 elements —
   * 70% of the page — which is most of why it took 7.6s to open on a
   * phone-speed CPU. Now a menu that was never opened costs its trigger only.
   *
   * The morph still plays on that first open: the panel mounts in its closed
   * pose, and `primed` flips it open two frames later, once the browser has
   * computed that closed style (one frame is not enough — the flip can land
   * before the first style pass, and a transition needs a "from"). Once
   * primed it stays mounted, so closing and every later open animate exactly
   * as they always did. `shown` is what the panel draws; `isOpen` stays the
   * truth for the trigger, focus and the outside-click listener.
   */
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    if (!isOpen || primed) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPrimed(true));
    });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [isOpen, primed]);
  const shown = isOpen && primed;

  /* Idea 59: the one pad that glides under the mouse. Gone with the panel,
     and while a confirm is armed (its row has folded away). */
  const { pad: glidePad, moveTo: glideTo, hostProps: glideHost } = useGlide();
  useEffect(() => { if (!shown || armed !== null) glideTo(null); }, [shown, armed, glideTo]);

  const setOpen = useCallback(
    (v: boolean) => {
      if (!v) setArmed(null);
      if (open === undefined) setInternal(v);
      onOpenChange?.(v);
    },
    [open, onOpenChange],
  );

  /* Idea 75: press and hold the trigger, slide onto a row, let go. */
  useHoldSlide(triggerRef, {
    isOpen,
    open: () => setOpen(true),
    close: () => setOpen(false),
    panel: () => panelRef.current,
  });

  /* Indices of real rows, in DOM order — what the arrow keys walk. */
  const rowIndices = useMemo(
    () =>
      items.reduce<number[]>((acc, it, i) => {
        if (!it.divider && !it.section) acc.push(i);
        return acc;
      }, []),
    [items],
  );

  const focusRow = useCallback(
    (n: number) => {
      if (rowIndices.length === 0) return;
      const i = rowIndices[(n + rowIndices.length) % rowIndices.length];
      const el = itemRefs.current[i];
      /* preventScroll: opening a menu must never yank the page. */
      el?.focus({ preventScroll: true });
    },
    [rowIndices],
  );

  /*
   * The source does all three of these in one effect keyed on
   * [isOpen, armed]. Split into three, because they genuinely have
   * different triggers and because sharing one effect forced the
   * unstable closures into a ref written during render — which
   * react-hooks v7 rejects outright, and rightly.
   */

  /* 1. Flip up when there is no room below. Re-measured when a confirm
        arms, because arming grows the panel. The measurement runs in a
        frame rather than synchronously: the panel has to be laid out
        before scrollHeight means anything, and setState in an effect
        body is a cascading render. Nothing resets `flip` on close, on
        purpose — the panel should retract the same way it grew. */
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => {
      const inner = scrollRef.current;
      const wrap = wrapRef.current;
      if (!inner || !wrap) return;
      const box = wrap.getBoundingClientRect();
      /* The inner box's whole content, plus the panel's 1px rim each side. */
      const h = inner.scrollHeight + 2;
      const below = window.innerHeight - box.bottom - 16;
      const above = box.top - 16;
      /* Fits neither way (a tall row menu on a short screen, BIG-3): open
         towards the roomier side and scroll inside, rather than run off the
         bottom where the last rows — Delete among them — cannot be reached. */
      const fits = below >= h || above > h;
      setFlip(fits ? below < h : above > below);
      setCap(fits ? null : Math.max(above, below) - 8 - 2);
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen, armed]);

  /* 2. Focus lands after the morph has begun, so the panel is already
        readable when the ring appears on the first row. Reads the refs
        directly rather than calling focusRow, so this depends on
        nothing that changes identity every render — `items` is a fresh
        array on each parent render, and a re-running timer here would
        yank focus back to the first row continuously. Deliberately does
        NOT re-run on `armed`: arming collapses the rows to
        tabIndex={-1}, and focus belongs on the confirm strip. */
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => {
      const first = itemRefs.current.find((el): el is HTMLButtonElement => el != null);
      first?.focus({ preventScroll: true });
    }, 90);
    return () => clearTimeout(t);
  }, [shown]);

  /* 3. Close on a pointer landing outside the wrapper. A portalled panel is
        not inside that wrapper in the DOM, so it has to be spared by name —
        otherwise pressing a menu item closes the menu before the click on it
        lands. */
  useEffect(() => {
    if (!isOpen) return;
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [isOpen, setOpen]);

  /* 4. Where the trigger sits, for a portalled panel. Measured before paint
        so the panel never lands in the wrong place for a frame, and kept in
        step with any ancestor that scrolls under it — a row menu's own list
        is one. Nothing here runs at all unless `portal`. */
  useLayoutEffect(() => {
    if (!portal || !isOpen) return;
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const box = wrap.getBoundingClientRect();
      setAnchor({
        top: box.top, bottom: box.bottom, left: box.left, right: box.right,
        viewportW: window.innerWidth, viewportH: window.innerHeight,
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [portal, isOpen]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) return;
    const here = rowIndices.indexOf(itemRefs.current.indexOf(document.activeElement as HTMLButtonElement));
    if (e.key === 'Escape') {
      e.stopPropagation();
      /* Escape backs out one step at a time: disarm first, then close. */
      if (armed !== null) {
        setArmed(null);
      } else {
        setOpen(false);
        triggerRef.current?.querySelector('button')?.focus();
      }
    } else if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(here + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(here - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(rowIndices.length - 1); }
  };

  const pick = (it: MorphMenuItem, i: number) => {
    if (it.confirm) { setArmed(armed === i ? null : i); return; }
    if (it.flash) {
      setFlashed(i);
      setTimeout(() => setFlashed(null), 1400);
      it.onSelect?.();
      return; /* flash items report in place, menu stays */
    }
    setOpen(false);
    it.onSelect?.();
  };

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        'aria-haspopup': 'menu',
        'aria-expanded': isOpen,
      })
    : trigger;

  /*
   * Anchored to the trigger either way; only the coordinate space changes.
   * Portalled, the panel is `fixed`, so its offsets are the trigger's own
   * viewport rect plus the same 8px gap — and it is clamped to the window,
   * because a fixed box past the edge is unreachable rather than merely
   * scrolled out of view. That clamp is the one thing the absolute version
   * gets for free from its wrapper.
   */
  const GAP = 8;
  const placement: CSSProperties = portal
    ? {
      position: 'fixed',
      top: flip ? 'auto' : anchor.bottom + GAP,
      bottom: flip ? anchor.viewportH - anchor.top + GAP : 'auto',
      left: Math.max(
        GAP,
        Math.min(
          align === 'end' ? anchor.right - width : anchor.left,
          anchor.viewportW - width - GAP,
        ),
      ),
      zIndex,
    }
    : {
      position: 'absolute',
      top: flip ? 'auto' : 'calc(100% + var(--sp-3))',
      bottom: flip ? 'calc(100% + var(--sp-3))' : 'auto',
      left: align === 'start' ? 0 : 'auto',
      right: align === 'end' ? 0 : 'auto',
      zIndex: 60,
    };

  const panel: CSSProperties = {
    ...placement,
    width,
    display: 'grid',
    /* V3 drops the morph (v4 `MorphMenu.jsx`): no pill-to-card radius, no
       scale, no blur — the panel fades in and drops 4px from the trigger's
       side, and its rows arrive together rather than in a stagger. */
    borderRadius: shown || v3 ? 'var(--r-lg)' : 'var(--r-pill)',
    /* Near-opaque on purpose. A menu sits ON TOP of the content it acts
       on — at card translucency the two texts overlap and neither is
       readable. The gradient and rim keep it glass; the base coat makes
       it legible. */
    backgroundColor: 'oklch(0.145 0.004 260 / 0.97)',
    backgroundImage: 'var(--glass-fill-1)',
    border: '1px solid oklch(1 0 0 / 0.10)',
    backdropFilter: 'var(--glass-bd-lg)',
    WebkitBackdropFilter: 'var(--glass-bd-lg)',
    boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
    transformOrigin: `${flip ? 'bottom ' : 'top '}${align === 'end' ? 'right' : 'left'}`,
    transform: shown
      ? 'scale(1) translateY(0)'
      : v3 ? `translateY(${flip ? '4px' : '-4px'})` : `scale(0.86) translateY(${flip ? '10px' : '-10px'})`,
    opacity: shown ? 1 : 0,
    /* Closed panels must leave the a11y tree, not just go transparent: a
       transparent-but-focusable menu puts dead tab stops in the page.
       visibility does that, and its items are also removed from the tab
       order below. */
    visibility: shown ? 'visible' : 'hidden',
    filter: shown || v3 ? 'blur(0)' : 'blur(6px)',
    pointerEvents: shown ? 'auto' : 'none',
    transition: v3
      ? `transform var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass), visibility 0s linear ${shown ? '0s' : 'var(--dur-base)'}`
      : `transform var(--dur-morph) var(--ease-morph), opacity var(--dur-base) var(--ease-glass), filter var(--dur-base) var(--ease-glass), border-radius var(--dur-morph) var(--ease-morph), visibility 0s linear ${shown ? '0s' : 'var(--dur-base)'}`,
  };

  /*
   * Portalled or not, this is the same element — only where React puts it
   * changes. Rendering it through `createPortal` keeps it inside this
   * component's React tree, so `onKeyDown` on the wrapper still hears
   * Escape and the arrow keys from inside the panel; React events travel
   * the component tree, not the DOM one.
   */
  const panelNode = (
    /* Portalled, the panel leaves the scope's DOM subtree; `v3Attr` carries it. */
    <div ref={panelRef} role="menu" aria-hidden={!shown} style={panel} {...(portal ? v3Attr(v3) : {})}>
      <div
        ref={scrollRef}
        className="ag-scroll ag-fade"
        {...glideHost}
        style={{
          position: 'relative',
          display: 'grid',
          gap: 2,
          padding: 'var(--sp-3)',
          ...(cap !== null ? { maxHeight: cap, overflowY: 'auto' as const, overscrollBehavior: 'contain' as const } : {}),
        }}
      >
      <span ref={glidePad} className="ag-glide" aria-hidden="true" />
      {header != null && header !== false && <MenuHeader header={header} open={shown} />}

      {items.map((it, i) => {
        if (it.divider) {
          /* A rule only ever separates two things: none at either end, none
             doubled — callers spread groups that may come back empty. */
          if (i === 0 || i === items.length - 1 || items[i - 1].divider) return null;
          return (
            <span
              key={`d${i}`}
              role="separator"
              style={{ height: 1, margin: 'var(--sp-2) var(--sp-3)', background: 'var(--line-soft)' }}
            />
          );
        }
        if (it.section) {
          return (
            <span
              key={`s${i}`}
              aria-hidden="true"
              style={{
                display: 'block',
                padding: i === 0 ? '0 var(--sp-4) var(--sp-2)' : 'var(--sp-5) var(--sp-4) var(--sp-2)',
                font: 'var(--type-kicker)',
                letterSpacing: 'var(--tracking-kicker)',
                textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                color: it.tone === 'danger' ? 'var(--job-coral-line)' : 'var(--fg-3)',
                opacity: shown ? 1 : 0,
                transition: `opacity var(--dur-base) var(--ease-glass) ${v3 ? 0 : i * 18}ms`,
              }}
            >
              {it.section}
            </span>
          );
        }
        const row = (n: number, half = false) => {
          const one = items[n];
          return (
            <MenuRow
              key={one.value || n}
              item={one}
              index={n}
              half={half}
              open={shown}
              armed={armed === n}
              flashing={flashed === n}
              dimmed={armed !== null && armed !== n}
              innerRef={(el) => { itemRefs.current[n] = el; }}
              onPick={() => pick(one, n)}
              onCancel={() => setArmed(null)}
              onConfirm={() => {
                setArmed(null);
                setOpen(false);
                /* 29-1P3: a tapped coral confirm is a delete (a held one sounds in `HoldToConfirm`). */
                if (one.tone === 'danger' && !one.confirm?.hold) cue('delete');
                one.confirm?.onConfirm?.();
              }}
            />
          );
        };
        /* The second of a pair was drawn by the first. */
        if (items[i - 1]?.beside && isPairable(items[i - 1]) && isPairable(it)) return null;
        const next = items[i + 1];
        if (it.beside && next && isPairable(it) && isPairable(next)) {
          return (
            <div key={`p${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--sp-2)' }}>
              {row(i, true)}
              {row(i + 1, true)}
            </div>
          );
        }
        return row(i);
      })}
      </div>
    </div>
  );

  return (
    <div
      ref={wrapRef}
      className={className}
      onKeyDown={onKeyDown}
      style={{ position: 'relative', display: 'inline-flex', ...style }}
      {...rest}
    >
      {/* The trigger recedes as the panel takes over — one object, not two.
          In V3 it only dims, a little, and does not shrink. */}
      <span
        ref={triggerRef}
        onClick={() => setOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          transform: isOpen && !v3 ? 'scale(0.92)' : 'scale(1)',
          opacity: isOpen ? (v3 ? 0.7 : 0.5) : 1,
          transition: v3
            ? 'opacity var(--dur-fast) var(--ease-glass)'
            : 'transform var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass)',
        }}
      >
        {triggerNode}
      </span>

      {(isOpen || primed) && (portal ? createPortal(panelNode, document.body) : panelNode)}
    </div>
  );
}

/** An item that can sit in half a row: a plain row with no confirm strip. */
function isPairable(it: MorphMenuItem): boolean {
  return !it.divider && !it.section && !it.confirm;
}

function isHeaderObject(h: MorphMenuHeaderObject | ReactNode): h is MorphMenuHeaderObject {
  return !isValidElement(h) && typeof h === 'object' && h !== null && 'title' in h;
}

/* The object being acted on, restated. A card menu covers the card it
   belongs to — without this the user is choosing "Delete" against no
   subject at all. */
function MenuHeader({ header, open }: { header: MorphMenuHeaderObject | ReactNode; open: boolean }) {
  const h = isHeaderObject(header) ? header : null;
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--sp-1)',
        padding: 'var(--sp-4) var(--sp-4) var(--sp-5)',
        margin: '0 0 var(--sp-2)',
        borderBottom: '1px solid var(--line-soft)',
        opacity: open ? 1 : 0,
        transition: 'opacity var(--dur-base) var(--ease-glass)',
      }}
    >
      {h ? (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            {h.badge}
            <span
              style={{
                flex: 1,
                minWidth: 0,
                font: 'var(--type-body)',
                fontWeight: 'var(--weight-medium)',
                color: 'var(--fg-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {h.title}
            </span>
            {h.right}
          </span>
          {h.meta && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
              {h.meta}
            </span>
          )}
        </>
      ) : (
        (header as ReactNode)
      )}
    </div>
  );
}

interface MenuRowProps {
  item: MorphMenuItem;
  index: number;
  /** One of a `beside` pair: a box, centred, with a resting fill. */
  half?: boolean;
  open: boolean;
  armed: boolean;
  flashing: boolean;
  dimmed: boolean;
  innerRef: (el: HTMLButtonElement | null) => void;
  onPick: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function MenuRow({ item, index, half = false, open, armed, flashing, dimmed, innerRef, onPick, onCancel, onConfirm }: MenuRowProps) {
  const v3 = useV3();
  const [hover, setHover] = useState(false);
  const danger = item.tone === 'danger';
  const label = flashing && item.flash ? item.flash : item.label;

  return (
    <div style={{ display: 'grid' }}>
      {/* The row itself collapses to nothing when armed, so the confirm
          strip below occupies exactly its slot. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: armed ? '0fr' : '1fr',
          transition: 'grid-template-rows var(--dur-base) var(--ease-glass)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <button
            ref={innerRef}
            type="button"
            role="menuitem"
            data-glide={danger ? 'danger' : ''}
            tabIndex={open && !armed ? 0 : -1}
            onClick={onPick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: half ? 'center' : undefined,
              gap: half ? 'var(--sp-3)' : 'var(--sp-5)',
              width: '100%',
              minHeight: 48,
              padding: half ? '0 var(--sp-3)' : '0 var(--sp-4)',
              border: 0,
              textAlign: 'left',
              borderRadius: 'var(--r-sm)',
              /* The hover is the gliding pad's (idea 59); a half keeps its resting fill. */
              background: half ? 'oklch(1 0 0 / 0.04)' : 'transparent',
              color: danger ? 'var(--status-overrun)' : hover || flashing ? 'var(--fg-1)' : 'var(--fg-2)',
              font: 'var(--type-body)',
              cursor: 'pointer',
              opacity: open ? (dimmed ? 0.34 : 1) : 0,
              transform: open || v3 ? 'translateY(0)' : 'translateY(-6px)',
              transition: v3
                ? 'opacity var(--dur-base) var(--ease-glass), background var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)'
                : `opacity var(--dur-base) var(--ease-glass) ${index * 18}ms, transform var(--dur-base) var(--ease-glass) ${index * 18}ms, background var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)`,
            }}
          >
            {item.icon && (
              <span
                style={{
                  display: 'flex',
                  flex: '0 0 auto',
                  color: danger ? 'inherit' : flashing || hover ? 'var(--job-lime)' : 'var(--fg-3)',
                  transition: 'color var(--dur-fast) var(--ease-glass)',
                }}
              >
                {flashing && item.flashIcon ? item.flashIcon : item.icon}
              </span>
            )}
            <span style={{ flex: half ? '0 1 auto' : 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {label}
            </span>
            {item.meta && !flashing && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  font: 'var(--type-caption)',
                  color: 'var(--fg-3)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {item.meta}
              </span>
            )}
            {item.shortcut && !flashing && (
              <KeyCaps keys={(Array.isArray(item.shortcut) ? item.shortcut : [item.shortcut]).map((k) => k.toUpperCase())} />
            )}
          </button>
        </div>
      </div>

      {item.confirm && (
        <div
          style={{
            display: 'grid',
            gridTemplateRows: armed ? '1fr' : '0fr',
            transition: 'grid-template-rows var(--dur-base) var(--ease-glass)',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div
              style={{
                display: 'grid',
                gap: 'var(--sp-4)',
                padding: 'var(--sp-4)',
                borderRadius: 'var(--r-sm)',
                backgroundImage: danger ? 'var(--glass-tint-coral)' : 'var(--glass-well)',
                boxShadow: danger ? 'var(--glass-rim-1)' : 'var(--glass-well-shadow)',
                opacity: armed ? 1 : 0,
                transition: 'opacity var(--dur-fast) var(--ease-glass)',
              }}
            >
              <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{item.confirm.label}</span>
              {item.confirm.hint && (
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)' }}>{item.confirm.hint}</span>
              )}
              <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <button
                  type="button"
                  tabIndex={armed ? 0 : -1}
                  onClick={onCancel}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    border: 0,
                    borderRadius: 'var(--r-pill)',
                    backgroundImage: 'var(--glass-fill-2)',
                    boxShadow: 'var(--glass-rim-1)',
                    color: 'var(--fg-1)',
                    font: 'var(--type-label)',
                    cursor: 'pointer',
                  }}
                >
                  {danger ? 'Keep' : 'Cancel'}
                </button>
                {item.confirm.hold ? (
                  <HoldToConfirm
                    tabIndex={armed ? 0 : -1}
                    tone={danger ? 'danger' : 'neutral'}
                    onConfirm={onConfirm}
                    doneLabel={item.confirm.action || 'Delete'}
                    style={{ flex: 1, height: 'auto', minHeight: 38, padding: '0 var(--sp-3)', borderRadius: 'var(--r-pill)' }}
                  >
                    Hold to {(item.confirm.action || 'Delete').toLowerCase()}
                  </HoldToConfirm>
                ) : <button
                  type="button"
                  tabIndex={armed ? 0 : -1}
                  onClick={onConfirm}
                  style={{
                    flex: 1,
                    minHeight: 38,
                    border: 0,
                    borderRadius: 'var(--r-pill)',
                    ...(danger
                      ? { background: 'var(--status-overrun)', color: 'var(--fg-on-light)' }
                      : {
                        backgroundImage: 'var(--glass-fill-solid)',
                        boxShadow: 'var(--glass-rim-3), var(--glass-cast-1)',
                        color: 'var(--fg-1)',
                      }),
                    font: 'var(--type-label)',
                    cursor: 'pointer',
                  }}
                >
                  {item.confirm.action || 'Delete'}
                </button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
