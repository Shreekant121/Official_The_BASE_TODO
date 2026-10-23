/**
 * Aurora Glass — MiniNav
 * Ported from design-system/components/navigation/MiniNav.{jsx,d.ts}.
 * Guidance: design-system/components/navigation/MiniNav.prompt.md
 *
 * A floating pill bar, not a full-width chrome bar. The active
 * indicator MORPHS between items — same mechanism as SegmentedControl,
 * but icon-first and meant to float over content.
 *
 * `orientation="vertical"` is the desktop rail. The design system ships
 * no Sidebar on purpose: a full sidebar would fight the floating-glass
 * language.
 *
 * `badge` renders a COUNT when it is a number — a small chip in the corner
 * of the cell, coral or neutral by `badgeColour` — and a dot for any other
 * non-null value (29-1P2, his call: "numbers on the nav", over the design
 * system's dot). `badgeNote` is the count in words, in the cell's `title` and
 * accessible name, so a screen reader hears what the chip says.
 * The indicator is positioned arithmetically off the item index, so
 * every item must be the same 48px cell; do not pass variable-width
 * items.
 *
 * PORT NOTE 1 — the source composes the indicator's position with
 * computed keys (`[vertical ? 'left' : 'top']`). That is written out
 * explicitly below: same geometry, but TypeScript can actually check it.
 *
 * PORT NOTE 2 — THE TRAVEL IS A LIQUID ONE, and this is the app's own,
 * added at Shreekant's request. The source (and this file until now)
 * animated `left`/`top` alone, which slides a rigid pill: correct, and
 * inert. The pill now also STRETCHES along the axis it is travelling and
 * settles back to square, which is what makes a glass object read as
 * liquid rather than as a rectangle being moved. Two rules govern it and
 * both are `readme.md`'s:
 *
 *   - The stretch is shape-to-shape, so it runs on `--ease-morph` over
 *     `--dur-morph`, in step with the position transition it rides on.
 *     `--ease-spring` is rationed to "toggles, ticks, handles and
 *     confirmations only" and an indicator is none of those.
 *   - The glow blooms `--job-lime-shine` -> `-shine-md` and back at
 *     the midpoint. Glow says *emitting*, and the one moment this object
 *     is genuinely doing something is while it is in flight.
 *
 * It is driven through the Web Animations API rather than a CSS class,
 * for two reasons: an animation has to RE-TRIGGER on every switch, which
 * a class toggle can only fake by remounting the element (that would
 * kill the position transition it is riding on); and `.animate()` leaves
 * no resting style behind, so the pill at rest is byte-identical to what
 * it always was — which is what keeps the screenshot baselines valid.
 *
 * `prefers-reduced-motion` is honoured explicitly here. The global rule
 * in `tokens/motion.css` collapses CSS durations to 1ms, but a WAAPI
 * duration is a number in JS and no stylesheet can reach it.
 *
 * The buttons also gained the documented PRESS state (`readme.md`:
 * "scale down ... 0.93 icon buttons"), which this file never had — it
 * had a hover scale and nothing under the finger.
 *
 * V3 (V3-2, from the rail in `Devices.dc.html`). Inside a `<V3Scope>` the
 * pill is the design's lit plate rather than emerald glass: clear white
 * glass with V3's rim, an emerald glow behind it, and the glyphs white at
 * 55% until they are the live one. The pill still slides and stretches —
 * the design draws each plate fading in on its own cell, but the travel is
 * this app's, asked for by Shreekant, and V3 changes no motion he chose. Its
 * timing comes from `useMotion()`, so in V3 it is v4's faster morph. The
 * shell's glass is tokens and needs nothing here.
 *
 * `lead` is the design's brand mark at the head of the rail, vertical only.
 * With one, the indicator is positioned inside an inner column rather than
 * off the nav's padding, so the mark cannot throw its arithmetic out; with
 * none, the DOM is exactly what it always was.
 *
 * 29-1P5b — `screenLit`, THE APP'S NAV (ideas 71, 23, 80; his calls,
 * 2026-10-07). Every app nav passes it; `/design`'s specimens may not. With it
 * there is no plate. Every icon is a layered glass icon (`LayeredIcon`) in the
 * colour of the screen it opens (his call: "all icons have color"); the lit
 * one glows the SCREEN's light (not lime) with a key-light under it and a
 * bright glyph; and the marker is a small dot that, on a move,
 * stretches like a drop to the new cell and snaps there. The colour is
 * `tokens/screenLight.css`'s, the same rules that colour the page, so it
 * fades with the page; the pieces are `navLight.css`.
 *
 * 29-1P5c — on the rail, a soft tile glides behind the icon under the mouse
 * (idea 59, `core/useGlide.ts`). Hover only; nothing is drawn at rest.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { NARROW, useMedia } from '../useMedia';
import { useMotion } from '../core/motion';
import { useV3 } from '../core/v3Context';
import { RollingNumber } from '../data/RollingNumber';
import { usePopOnLateMount } from '../data/rollCount';
import { LayeredIcon } from '../core/LayeredIcon';
import { useGlide } from '../core/useGlide';

export interface MiniNavItem {
  value: string;
  /** Also used as the accessible name. */
  label: string;
  /**
   * Shown instead of `label` when `showLabels` is on. `label` stays the
   * accessible name. Use it when the real name does not fit a cell —
   * "Notifications" does not, "Alerts" does.
   */
  shortLabel?: string;
  icon: ReactNode;
  /** A number renders a count chip; any other non-null value an alert dot. */
  badge?: unknown;
  /**
   * The count chip's colour: `coral` for what is urgent (its colour job),
   * `neutral` for a plain count. The dot is always the alert red.
   */
  badgeColour?: 'coral' | 'neutral';
  /**
   * What the badge means, in words — e.g. "3 on red alert". Said in the
   * cell's `title` and appended to the accessible name.
   */
  badgeNote?: string;
  /**
   * `screenLit` only: the light of the screen this cell opens (`navCellLight`
   * in `lib/screenLight.ts`), which colours its icon. Left out: grey.
   */
  light?: string;
}

export interface MiniNavProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  items: MiniNavItem[];
  value?: string;
  onChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  /** Adds tiny uppercase labels under each icon. */
  showLabels?: boolean;
  /** Drawn at the head of a vertical rail, above the first cell — the brand mark. */
  lead?: ReactNode;
  /**
   * The app's nav (29-1P5b): layered glass icons, the lit one in the screen's
   * light, and a dot that stretches between cells instead of the plate.
   * Inside a V3 scope only; outside one it is ignored.
   */
  screenLit?: boolean;
}

const PAD = 6;

/*
 * FIXED ON IMPORT — the source hardcodes a single 48px `cell` and uses it for
 * the button box AND for the active indicator's position arithmetic. That is
 * fine for the icon-only bar every mockup uses, but it makes `showLabels`
 * unusable: a 10px uppercase label is wider than 48px, so the labels of
 * adjacent items overlap each other into an unreadable smear. (Seen for real
 * on the app's global bottom nav, which does want labels.)
 *
 * The cell is now two numbers, and the indicator reads whichever axis it
 * travels along, so `showLabels` lays out correctly in both orientations.
 * Anything longer than about eleven characters still needs `shortLabel`.
 */
const CELL_ICON = 48;
const CELL_LABELLED_W = 76;
const CELL_LABELLED_H = 54;

/** The lit dot's size, and how long its stretch-and-snap takes (idea 23's card). */
const DOT = 5;
const DOT_MS = 460;

/**
 * WHERE THE DOT WAS ON THE SCREEN YOU CAME FROM (29-1P5b).
 *
 * Every screen renders its own `<MiniNav>`, so tapping a destination never
 * changes any one bar's cell: the bar you tapped is hidden and another is
 * shown (or built), already on its own cell. The old plate's slide never ran
 * across a navigation for exactly that reason, and the plate's fix — paint one
 * frame at the old cell, from a `useState` initialiser — stopped working when
 * the nav screens became kept ones (2026-09-28): a kept screen's bar is shown
 * again, not built, so no initialiser runs.
 *
 * What does run on a kept screen being shown is its layout effects, so that is
 * where the dot looks here for where it was, before the first paint, and
 * stretches from there. Module scope is what survives the screen change.
 *
 * **Keyed by orientation and the bar's own items**, so a rail and a floating
 * bar never borrow each other's memory, and nor do two different bars.
 */
const dotWasAt = new Map<string, string>();

export function MiniNav({
  items = [],
  value,
  onChange,
  orientation = 'horizontal',
  showLabels = false,
  lead,
  screenLit,
  className = '',
  style,
  ...rest
}: MiniNavProps) {
  const [internal, setInternal] = useState<string>(items[0]?.value ?? '');
  const current = value !== undefined ? value : internal;
  const idx = Math.max(0, items.findIndex((i) => i.value === current));
  const vertical = orientation === 'vertical';
  const v3 = useV3();
  const motion = useMotion();
  const popIn = usePopOnLateMount<HTMLSpanElement>();
  /* Resting and in-flight glow for the pill. The keyframes below read these
     so a V3 pill does not flash back to the old emerald glass mid-travel. */
  const pillRim = v3 ? 'var(--glass-rim-2)' : 'var(--glass-rim-3)';

  /* The app's nav draws the lit dot instead of the plate (29-1P5b). */
  const lit = !!screenLit && v3;

  const indicatorRef = useRef<HTMLSpanElement>(null);
  /* Where the pill was last time, so a first paint does not animate. */
  const lastIdx = useRef(idx);

  useEffect(() => {
    const from = lastIdx.current;
    lastIdx.current = idx;
    const el = indicatorRef.current;
    if (!el || from === idx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof el.animate !== 'function') return;

    /*
     * How far it is going, in cells. A jump across the whole bar earns more
     * stretch than a step to the neighbour, capped so a six-item rail does
     * not turn into a rubber band.
     */
    const reach = Math.min(1, Math.abs(idx - from) / 3);
    const along = 1 + 0.10 + 0.10 * reach;
    const across = 1 - 0.05 - 0.04 * reach;

    /* The origin is the trailing edge, so the pill stretches TOWARDS where it
       is going rather than growing symmetrically out of itself. */
    const forward = idx > from;
    el.style.transformOrigin = vertical
      ? `50% ${forward ? '0%' : '100%'}`
      : `${forward ? '0%' : '100%'} 50%`;

    const squash = vertical ? `scale(${across}, ${along})` : `scale(${along}, ${across})`;

    /* `--dur-morph` / `--ease-morph`, from whichever set this scope wears.
       Outside a scope that is 560ms on (0.32, 0.72, 0, 1), as it always was. */
    const anim = el.animate(
      [
        { transform: 'scale(1, 1)', boxShadow: `${pillRim}, var(--job-lime-shine)` },
        { transform: squash, boxShadow: `${pillRim}, var(--job-lime-shine-md)`, offset: 0.42 },
        { transform: 'scale(1, 1)', boxShadow: `${pillRim}, var(--job-lime-shine)` },
      ],
      { duration: Math.round(motion.dur.morph * 1000), easing: `cubic-bezier(${motion.ease.morph.join(', ')})` },
    );
    return () => anim.cancel();
  }, [idx, vertical, pillRim, motion]);

  const pick = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  /*
   * ITEM 10 — THE BAR SCROLLS ON A PHONE, AND ONLY ON A PHONE.
   *
   * `navModel.tsx` measured this arriving: 48px a cell plus 12px of padding,
   * so eight cells are 410px and nine are 458px, in a bar centred inside a
   * full-width fixed wrapper — it overhangs both edges of a 375px phone and
   * cuts Home and Settings off. Item 10 added the ninth cell, and Shreekant's
   * call was that the bar scrolls sideways rather than shrinking its cells
   * (40px would still not fit and is under the 44px touch minimum) or hiding
   * destinations that then have no way in.
   *
   * **Below 768 only**, which is what keeps this free. `overflow-x: auto`
   * forces `overflow-y` to `auto` as well — CSS does not allow one visible
   * axis beside one scrolling axis — and that would clip the active pill's
   * glow. The screenshot matrix is 1440 and 820, both above the threshold, so
   * neither photographed size renders any differently than it did.
   */
  const narrow = useMedia(NARROW);
  const scrolls = !vertical && narrow;

  const shell: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    flexDirection: vertical ? 'column' : 'row',
    alignItems: 'center',
    gap: 2,
    padding: PAD,
    borderRadius: 'var(--r-pill)',
    backgroundImage: 'var(--glass-fill-2)',
    backdropFilter: 'var(--glass-bd-lg)',
    WebkitBackdropFilter: 'var(--glass-bd-lg)',
    boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
    ...(scrolls
      ? {
          // `--gutter-page-sm` each side, so the bar sits inside the same
          // margin every narrow screen already uses for its content.
          maxWidth: 'calc(100vw - 2 * var(--gutter-page-sm))',
          overflowX: 'auto' as const,
          // The wrapper is centred and `justify-content` has no effect on an
          // overflowing flex row, so without this the first cell would be the
          // one clipped rather than the last.
          justifyContent: 'flex-start',
          scrollbarWidth: 'none',
          // Keep a swipe on the bar from turning into a page scroll.
          overscrollBehaviorX: 'contain',
        }
      : {}),
    ...style,
  };

  const cellW = showLabels ? CELL_LABELLED_W : CELL_ICON;
  const cellH = showLabels ? CELL_LABELLED_H : CELL_ICON;

  /* The indicator steps along whichever axis the bar runs on. With a `lead`
     it lives in the inner column (below), whose origin is the first cell. */
  const inner = vertical && lead != null;
  const inset = inner ? 0 : PAD;
  const step = vertical ? cellH : cellW;
  const offset = inset + idx * (step + 2);
  const indicator: CSSProperties = vertical
    ? { left: inset, right: inset, top: offset, height: cellH }
    : { top: PAD, bottom: PAD, left: offset, width: cellW };

  /*
   * The lit dot (29-1P5b). On a bar it sits under the icon, at the cell's
   * foot; on the rail it sits on the rail's outer edge, beside the cell, where
   * a dock keeps its dot. `dotAt` is its leading edge along the bar's axis.
   */
  const dotAt = (i: number) => inset + i * (step + 2) + (step - DOT) / 2;
  /* On a screen that is none of the cells (`/design`, a placeholder), nothing
     is lit, so there is no dot either: `idx` falls back to the first cell. */
  const dot: CSSProperties = {
    ...(vertical
      ? { left: (inner ? -PAD : 0) + 1, top: dotAt(idx), width: DOT, height: DOT }
      : { top: PAD + cellH - DOT, left: dotAt(idx), width: DOT, height: DOT }),
    ...(items.some((i) => i.value === current) ? {} : { display: 'none' }),
  };

  const dotRef = useRef<HTMLSpanElement>(null);
  const dotKey = `${orientation}:${items.map((i) => i.value).join('|')}`;

  /*
   * IDEA 23 — THE DOT STRETCHES TO THE NEW CELL, THEN SNAPS THERE. Its front
   * edge runs ahead to the new cell while its back edge holds, then the back
   * catches up, like a drop of liquid: two halves of one Web Animation on
   * `left`/`width` (`top`/`height` on the rail), so the rounded ends stay
   * round, which a `scale` would squash. Nothing is left behind at rest.
   *
   * A layout effect, so a kept screen being shown starts its dot at the old
   * cell before its first paint (see `dotWasAt`). Never cancelled in a
   * cleanup: StrictMode's second run would cancel the only run that had a
   * "from", and a dot left playing on a hidden bar costs nothing.
   */
  useLayoutEffect(() => {
    if (!lit) return;
    const previous = dotWasAt.get(dotKey);
    dotWasAt.set(dotKey, current);
    const el = dotRef.current;
    if (!el || previous === undefined || previous === current) return;
    const from = items.findIndex((i) => i.value === previous);
    if (from === -1 || from === idx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof el.animate !== 'function') return;

    const along = vertical ? 'top' : 'left';
    const length = vertical ? 'height' : 'width';
    const at = (start: number, size: number) => ({ [along]: `${start}px`, [length]: `${size}px` });
    const a = inset + from * (step + 2) + (step - DOT) / 2;
    const b = inset + idx * (step + 2) + (step - DOT) / 2;
    const glide = `cubic-bezier(${motion.ease.glide.join(', ')})`;
    el.animate(
      [
        { ...at(a, DOT), easing: glide },
        { ...at(Math.min(a, b), Math.abs(b - a) + DOT), offset: 0.45, easing: 'cubic-bezier(0.55, 0, 0.25, 1)' },
        at(b, DOT),
      ],
      { duration: DOT_MS },
    );
  }, [lit, dotKey, current, items, idx, vertical, inset, step, motion]);

  /* Idea 59 (29-1P5c): on the rail, one soft tile glides behind whichever
     icon the mouse is over. The rail only — the laptop's nav. */
  const { pad: glidePad, hostProps: glideHost } = useGlide();
  const railGlide = lit && vertical;

  const cellsAndPill = (
    <>
      {railGlide && <span ref={glidePad} className="ag-glide ag-glide--rail" aria-hidden="true" />}
      {lit ? (
        <span ref={dotRef} aria-hidden="true" className="ag-nav-dot" style={dot} />
      ) : (
      <span
        ref={indicatorRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          ...indicator,
          borderRadius: 'var(--r-pill)',
          /* V3: the design's plate — white glass at 0.14 with V3's rim, and
             a lime glow (29-1P2c1: the current page is lime's). */
          backgroundImage: v3
            ? 'linear-gradient(oklch(1 0 0 / 0.14), oklch(1 0 0 / 0.14))'
            : 'var(--glass-tint-lime)',
          boxShadow: `${pillRim}, var(--job-lime-shine)`,
          transition: `${vertical ? 'top' : 'left'} var(--dur-morph) var(--ease-morph)`,
        }}
      />
      )}
      {items.map((it) => {
        const on = it.value === current;
        return (
          <button
            key={it.value}
            type="button"
            aria-label={it.badgeNote ? `${it.label}, ${it.badgeNote}` : it.label}
            title={it.badgeNote}
            aria-current={on ? 'page' : undefined}
            className={lit ? 'ag-nav-cell ag-licon-host' : undefined}
            data-light={lit ? it.light : undefined}
            data-glide={railGlide ? '' : undefined}
            onClick={() => pick(it.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              placeItems: 'center',
              gap: 2,
              width: cellW,
              height: cellH,
              /* A flex item shrinks by default, so an overflowing bar would
                 squash its cells to fit instead of scrolling — and the
                 indicator's arithmetic, which assumes an exact 48px cell,
                 would then point at the wrong one. Inert wherever the row
                 fits, which is every window the shots photograph. */
              flex: '0 0 auto',
              border: 0,
              padding: 0,
              background: 'transparent',
              borderRadius: 'var(--r-pill)',
              color: on || v3 ? 'var(--fg-1)' : 'var(--fg-3)',
              cursor: 'pointer',
              transition: 'color var(--dur-base) var(--ease-glass), transform var(--dur-fast) var(--ease-spring)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            /* `readme.md`'s press step for an icon button. `pointerCancel` and
               `blur` both release it, or a press that slides off the cell —
               or a touch the browser turns into a scroll — leaves it stuck
               small. */
            onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.93)'; }}
            onPointerUp={(e) => { e.currentTarget.style.transform = 'scale(1.08)'; }}
            onPointerCancel={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            onBlur={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {lit ? (
              /* 29-1P5b: a layered glass icon in its screen's colour; the lit
                 one glows, with the key-light under it (`navLight.css`). On a bar the
                 icon rises a little to make room for the dot beneath it. */
              <>
                <span className="ag-nav-key" aria-hidden="true" />
                <span style={{ display: 'grid', transform: vertical ? undefined : 'translateY(-3px)' }}>
                  <LayeredIcon icon={it.icon} />
                </span>
              </>
            ) : v3 ? (
              /* V3 dims the glyph rather than greying it: white at 55%, with
                 a shadow so it holds over a bright patch of backdrop. On the
                 glyph, not the cell, so the alert dot stays at full red. */
              <span
                style={{
                  display: 'grid',
                  opacity: on ? 1 : 0.55,
                  filter: 'drop-shadow(0 2px 5px oklch(0 0 0 / 0.45))',
                  transition: 'opacity var(--dur-base) var(--ease-glass)',
                }}
              >
                {it.icon}
              </span>
            ) : it.icon}
            {showLabels && (
              <span
                style={{
                  font: 'var(--type-kicker)',
                  letterSpacing: '0.06em',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                  fontSize: '0.625rem',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {it.shortLabel ?? it.label}
              </span>
            )}
            {/* 29-1P4c, idea 49: the count rolls to its new number and the chip
                bounces when it grows; a chip or dot that appears pops in. */}
            {typeof it.badge === 'number' ? (
              <span
                ref={popIn}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: 17,
                  height: 17,
                  padding: '0 4px',
                  boxSizing: 'border-box',
                  borderRadius: 'var(--r-2xs)',
                  font: 'var(--weight-semi) 0.625rem / 1 var(--font-numeric)',
                  fontVariantNumeric: 'tabular-nums',
                  ...(it.badgeColour === 'coral'
                    ? { color: 'var(--job-coral-deep)', backgroundColor: 'var(--job-coral)' }
                    : { color: 'var(--fg-1)', backgroundColor: 'oklch(0.36 0.005 260)' }),
                }}
              >
                <RollingNumber value={it.badge} text={it.badge > 99 ? '99+' : undefined} bump />
              </span>
            ) : it.badge != null && (
              <span
                ref={popIn}
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 8,
                  minWidth: 8,
                  height: 8,
                  borderRadius: 'var(--r-pill)',
                  background: 'var(--status-overrun)',
                  boxShadow: '0 0 8px var(--status-overrun)',
                }}
              />
            )}
          </button>
        );
      })}
    </>
  );

  return (
    /* `ag-scroll` hides the scrollbar the way every other glass surface in the
       app does — `screens.css` calls a browser scrollbar in a pane of glass
       "a browser part, not a surface". It is inert when nothing overflows, so
       it is applied unconditionally rather than switched with `scrolls`. */
    <nav
      className={`ag-scroll ${lit ? 'ag-nav-lit ' : ''}${className}`.trim()}
      style={shell}
      {...rest}
      {...(railGlide && !inner ? glideHost : {})}
    >
      {lead}
      {inner ? (
        <div
          {...(railGlide ? glideHost : {})}
          style={{
            position: 'relative', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 2,
          }}
        >
          {cellsAndPill}
        </div>
      ) : cellsAndPill}
    </nav>
  );
}
