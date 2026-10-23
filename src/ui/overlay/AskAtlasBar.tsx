/**
 * The Ask Atlas bar (29-1P15c, idea 74, "A bar that opens into a panel").
 *
 *   <AskAtlasBar open={asking} onOpen={…} label="Ask Atlas about this project" />
 *
 * A slim glass bar, "Ask Atlas…", that grows into Atlas's side panel when it
 * is tapped and that the panel shrinks back into when it closes: no jump to
 * another screen. **His call (2026-10-15, 2026-10-20): it replaces the ✦
 * button beside a project's name and the Score screen's "Ask AI"**, and the
 * small ✦ on each task and list stay, as shortcuts into the same panel — a
 * panel opened from one of those grows out of this bar too, because the bar
 * is where the panel lives.
 *
 * THE HOST KEEPS THE PANEL; THIS ONLY MOVES
 * -----------------------------------------
 * Opening and closing are still the host's state (`open`), exactly as when
 * the ✦ was a toggle; the panel still docks in `AIPanelDock` and never
 * covers its subject. What this file adds is the motion between the two, and
 * it finds the panel by itself: the nearest `[data-ai-panel]` on the same
 * screen (`.ag-page`), so neither screen threads a ref through.
 *   - **Grow:** when `open` turns true the bar hides, a stand-in box of the
 *     panel's glass travels from the bar's rectangle to the panel's, and the
 *     panel, invisible until then, fades in under it as it lands.
 *   - **Shrink:** the panel's rectangle is remembered while it is open (it is
 *     gone from the page by the time `open` turns false), and the stand-in
 *     travels back into the bar, which appears as it lands.
 * Why a stand-in rather than the panel: `lib/askBarMorph.ts`. One box, laid
 * out for under half a second after a tap; nothing loops, nothing runs at
 * rest. Under reduced motion it simply swaps. A panel that opens while the
 * bar is not drawn (a board in select mode) just appears, as it always did.
 *
 * The bar is the screen's floating furniture, MiniNav's glass without the
 * blur (below). Placed by the
 * host (`style`); given `reserve`, it tells the focus pill to float above it,
 * as Set Deadlines' bar does (`useFooterReserve`'s rule, written by hand here
 * because a hidden bar must not clear what the docked panel just published).
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useMotion } from '../core/motion';
import { Z } from '../../lib/zLayers';
import { useUIStore } from '../../store/useUIStore';
import {
  morphFrames, pillCorners, readCorners, usableBox, type Box, type Corners,
} from '../../lib/askBarMorph';

export interface AskAtlasBarProps {
  /** The panel it grows into is open. The bar is hidden meanwhile: it has become the panel. */
  open: boolean;
  onOpen: () => void;
  /** What a reader hears: what the panel will be about. */
  label: string;
  /** Out of the way for now (the board's select mode), without unmounting. */
  hidden?: boolean;
  /** Publish this bar as the screen's bottom furniture, so the focus pill floats above it. */
  reserve?: boolean;
  /**
   * Leave the row while the panel is open, rather than holding an empty
   * slot. For a bar inside a row of controls (Scoring's session bar); the
   * grow then starts from where the bar was pressed.
   */
  collapse?: boolean;
  style?: CSSProperties;
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function boxOf(el: Element): Box | null {
  const r = el.getBoundingClientRect();
  return usableBox({ left: r.left, top: r.top, width: r.width, height: r.height });
}

function cornersOf(el: Element): Corners {
  const s = getComputedStyle(el);
  return readCorners([s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius]);
}

/** The nearest panel: up from the bar until a box holds one, and never past its screen. */
function panelNear(bar: HTMLElement): HTMLElement | null {
  for (let el = bar.parentElement; el; el = el.parentElement) {
    const panel = el.querySelector<HTMLElement>('[data-ai-panel]');
    if (panel) return panel;
    if (el.classList.contains('ag-page')) return null;
  }
  return null;
}

/** The stand-in: the panel's own glass, with the bar's face inside it. */
function makeStandIn(bar: HTMLElement): { box: HTMLDivElement; face: HTMLElement | null } {
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.setAttribute('data-v3', '');
  box.setAttribute('data-ask-bar-morph', '');
  Object.assign(box.style, {
    position: 'fixed', zIndex: String(Z.nav), pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden',
    /* `AIPanel`'s surface, less the blur: 92% of it is the opaque floor
       anyway, and a blur re-sampled every frame of a move is the one cost
       here worth not paying. */
    backgroundColor: 'oklch(0.145 0.004 260 / 0.82)',
    backgroundImage: 'var(--glass-fill-2)',
    boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)',
  } satisfies Partial<CSSStyleDeclaration>);
  const source = bar.querySelector('[data-ask-bar-face]');
  let face: HTMLElement | null = null;
  if (source) {
    face = source.cloneNode(true) as HTMLElement;
    const r = bar.getBoundingClientRect();
    Object.assign(face.style, { position: 'absolute', left: '0px', top: '0px', width: `${r.width}px`, height: `${r.height}px` });
    box.append(face);
  }
  document.body.append(box);
  return { box, face };
}

export function AskAtlasBar({ open, onOpen, label, hidden = false, reserve = false, collapse = false, style }: AskAtlasBarProps) {
  const m = useMotion();
  const barRef = useRef<HTMLButtonElement>(null);
  /* The panel's last shape, for the shrink: by the time `open` is false it is gone. */
  const panelShape = useRef<{ box: Box; corners: Corners } | null>(null);
  const wasOpen = useRef(open);
  /* What a move left running, so the next tap or an unmount can stop it cleanly. */
  const running = useRef<{ stop: () => void } | null>(null);
  /* The bar was pressed (so the caret follows it into the panel's box), and
     where it was then: a collapsing bar has left the row by the time the
     panel is there to grow into. */
  const pressed = useRef<Box | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const opened = open && !wasOpen.current;
    const closed = !open && wasOpen.current;
    wasOpen.current = open;
    if (!bar) return;

    let watcher: ResizeObserver | null = null;
    if (open) {
      /* Remember where the panel is for as long as it is open — the dock
         changes shape with the window, and that is all that moves it. Read
         in the observer's callback, when layout is already done, never here:
         this runs again each time a kept screen is shown (Performance, 6). */
      const panel = panelNear(bar);
      if (panel && typeof ResizeObserver !== 'undefined') {
        watcher = new ResizeObserver(() => {
          const box = boxOf(panel);
          if (box) panelShape.current = { box, corners: cornersOf(panel) };
        });
        watcher.observe(panel);
      }
    }

    /* The bar goes inert as the panel opens, which would drop the caret on
       the page. Pressed with a mouse or a key, the caret goes on into the
       panel's box; with a finger it does not, or the tablet's keyboard would
       come up over half the screen unasked. Closing gives it back to the bar
       when it was in the panel, which is gone. */
    if (opened && pressed.current !== null) {
      const field = panelNear(bar)?.querySelector<HTMLElement>('textarea, input');
      if (field && window.matchMedia?.('(pointer: fine)').matches) field.focus({ preventScroll: true });
    }
    const pressedAt = pressed.current;
    pressed.current = null;
    if (closed && (document.activeElement === null || document.activeElement === document.body)) {
      bar.focus({ preventScroll: true });
    }

    if (opened || closed) {
      running.current?.stop();
      running.current = null;
      /* A hidden bar (the board selecting) is not where anything grows from. */
      const barBox = hidden ? null : (opened && usableBox(pressedAt)) || boxOf(bar);
      const panel = opened ? panelNear(bar) : null;
      const target = opened ? (panel && boxOf(panel)) : panelShape.current?.box;
      if (barBox && target && !reducedMotion()) {
        const { box, face } = makeStandIn(bar);
        const anims: Animation[] = [];
        const finish = () => {
          for (const a of anims) a.cancel();
          box.remove();
        };
        if (opened && panel) {
          const dur = 440;
          const [from, to] = morphFrames(barBox, pillCorners(barBox), target, cornersOf(panel));
          const move = box.animate([from, to], { duration: dur, easing: `cubic-bezier(${m.ease.spring.join(', ')})`, fill: 'forwards' });
          anims.push(move);
          if (face) anims.push(face.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' }));
          /* The panel is there all along, held invisible until the box
             covers it, then fading in under the box as the box fades away. */
          anims.push(panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: dur - 80, fill: 'backwards' }));
          void move.finished.then(() => {
            const fade = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
            anims.push(fade);
            return fade.finished;
          }).then(finish, () => {});
        } else {
          const dur = 360;
          const [from, to] = morphFrames(target, panelShape.current?.corners ?? [0, 0, 0, 0], barBox, pillCorners(barBox));
          const move = box.animate([from, to], { duration: dur, easing: `cubic-bezier(${m.ease.glide.join(', ')})`, fill: 'forwards' });
          anims.push(move);
          if (face) anims.push(face.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: dur, fill: 'forwards' }));
          /* The bar is back in the page already; it shows when the box lands on it. */
          anims.push(bar.animate([{ opacity: 0 }, { opacity: 0 }], { duration: dur + 20 }));
          void move.finished.then(finish, () => {});
        }
        running.current = { stop: finish };
      }
      if (opened && panel) {
        const box = boxOf(panel);
        if (box) panelShape.current = { box, corners: cornersOf(panel) };
      }
      if (closed) panelShape.current = null;
    }

    return () => watcher?.disconnect();
  }, [open, hidden, m]);

  /* Gone with its screen: nothing left floating over the next one. */
  useLayoutEffect(() => () => {
    running.current?.stop();
    running.current = null;
  }, []);

  /* The focus pill floats above the bar while it is drawn, and only then. A
     hidden bar writes nothing: the docked panel publishes its own composer in
     the same commit, and every cleanup runs before every new effect, so this
     clearing never lands on top of that. */
  const shown = !open && !hidden;
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!reserve || !shown || !bar || typeof ResizeObserver === 'undefined') return;
    /* Measured at once, as `useFooterReserve` does: first measured inside the
       observer's callback, the pill moved in the same frame and the browser
       reported a ResizeObserver loop (9 times in one shots run). The boards
       that publish this are not kept screens, so this is not a measure on
       every return to one (Performance, rule 6). A window resized taller
       moves the bar without resizing it, hence the resize listener too. */
    const measure = () => {
      const r = bar.getBoundingClientRect();
      useUIStore.getState().setFooterReserve(Math.max(0, window.innerHeight - r.top));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(bar);
    window.addEventListener('resize', measure);
    return () => {
      watcher.disconnect();
      window.removeEventListener('resize', measure);
      useUIStore.getState().setFooterReserve(0);
    };
  }, [reserve, shown]);

  return (
    <button
      ref={barRef}
      type="button"
      aria-label={label}
      title={label}
      aria-hidden={shown ? undefined : true}
      inert={!shown}
      data-ask-bar=""
      className="ag-ask-bar"
      onClick={(e) => {
        pressed.current = boxOf(e.currentTarget) ?? { left: 0, top: 0, width: 0, height: 0 };
        onOpen();
      }}
      style={{
        boxSizing: 'border-box', display: 'flex', alignItems: 'stretch', minWidth: 0,
        height: 48, padding: 0, border: 0, cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--r-pill)',
        /* The nav's glass less its blur: the fill is 92% solid, so the blur
           showed next to nothing, and a blur over a board that scrolls under
           it is the cost the tablet pays every frame (Performance, rule 4). */
        backgroundImage: 'var(--glass-fill-2)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
        visibility: shown ? 'visible' : 'hidden',
        transition: 'var(--t-hover)',
        ...style,
        ...(collapse && open ? { display: 'none' } : null),
      }}
    >
      <span
        data-ask-bar-face=""
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flex: 1, minWidth: 0,
          padding: '0 var(--sp-6) 0 var(--sp-5)', boxSizing: 'border-box',
        }}
      >
        {/* Atlas's mark at rest: a still violet bead (one colour, one job). */}
        <span
          aria-hidden="true"
          style={{
            width: 16, height: 16, flex: '0 0 auto', borderRadius: '50%',
            backgroundImage: 'var(--job-violet-gel)', boxShadow: 'var(--job-violet-glow-sm)',
          }}
        />
        <span
          style={{
            flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          Ask Atlas…
        </span>
      </span>
    </button>
  );
}
