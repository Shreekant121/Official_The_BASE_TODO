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
 * `badge` renders a DOT, not a count — any non-null value lights it.
 * `badgeNote` is the app's own addition and adds no pixels: it is the count
 * in words, put in the cell's `title` and accessible name because a dot
 * cannot carry one.
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
 *   - The glow blooms `--glow-accent-sm` -> `--glow-accent-md` and back at
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
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { NARROW, useMedia } from '../useMedia';
import { useMotion } from '../core/motion';
import { useV3 } from '../core/v3Context';

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
  /** Any non-null value renders an alert dot. */
  badge?: unknown;
  /**
   * What the dot means, in words — e.g. "3 on red alert".
   *
   * The dot is deliberately not a number (see the header), which leaves a
   * count with nowhere to be said. This says it in the cell's `title` and
   * appends it to the accessible name, so it is reachable by pointer and by
   * screen reader without adding a second visual treatment the design system
   * does not have.
   */
  badgeNote?: string;
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

/**
 * WHERE THE PILL WAS ON THE SCREEN YOU CAME FROM.
 *
 * **This is the whole reason the indicator's slide had never once run.** Both
 * halves of the motion were correctly built — a `top`/`left` transition on
 * `--dur-morph`/`--ease-morph`, and a squash-and-stretch that leans towards
 * where it is going — and both are driven by the index *changing*. It never
 * changes. Every screen renders its own `<MiniNav>`, so tapping a destination
 * unmounts the bar and builds a new one, whose first paint is already at the
 * new cell: `lastIdx` starts equal to `idx`, the effect returns early, and the
 * pill teleports. Shreekant reported exactly that ("the smooth transition on
 * the circle in the nav"), and `IMPROVEMENTS.md` had this listed among the
 * things that *felt right* — it was never checked across a navigation.
 *
 * Module scope is what survives the unmount. The alternative is hoisting one
 * nav above the router so it is never rebuilt, which is the better shape and
 * is seventeen files of restructuring; this is four lines and gets the motion
 * he is asking about.
 *
 * **Keyed by the bar's own items** so two different bars cannot borrow each
 * other's memory — `/settings` renders a tab strip through this component as
 * well as the app nav, and a strip remembering `atlas` would fling its pill at
 * a cell that is not there.
 */
const pillWasAt = new Map<string, string>();

export function MiniNav({
  items = [],
  value,
  onChange,
  orientation = 'horizontal',
  showLabels = false,
  lead,
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
  /* Resting and in-flight glow for the pill. The keyframes below read these
     so a V3 pill does not flash back to the old emerald glass mid-travel. */
  const pillRim = v3 ? 'var(--glass-rim-2)' : 'var(--glass-rim-3)';

  /*
   * The cell this bar paints its pill on for one frame before moving it —
   * see `pillWasAt`. `null` on the first bar of a session and whenever the
   * destination has not changed, which is what keeps a plain page *reload*
   * still (and is why the screenshot harness, which loads every route fresh,
   * cannot see any of this).
   */
  const barKey = items.map((i) => i.value).join('|');
  const [entering, setEntering] = useState<number | null>(() => {
    const previous = pillWasAt.get(barKey);
    if (previous === undefined || previous === current) return null;
    const at = items.findIndex((i) => i.value === previous);
    return at === -1 ? null : at;
  });

  /* Where it is drawn *now*, which is the old cell for exactly one frame. */
  const shownIdx = entering ?? idx;

  useEffect(() => {
    pillWasAt.set(barKey, current);
  }, [barKey, current]);

  /*
   * Let the first paint land at the old cell, then move. A frame is the whole
   * mechanism: a transition needs a painted "from" to come out of, and setting
   * both positions inside one render gives it none.
   *
   * **The timer is not belt-and-braces, it is the correctness half.** A
   * background or unpainted tab throttles `requestAnimationFrame` to nothing,
   * and a frame that never arrives leaves the pill parked on the cell you came
   * *from* — so a screen opened in a background tab would sit there lighting
   * the wrong destination until it was looked at. Whichever of the two fires
   * first wins; the other is cancelled.
   */
  useEffect(() => {
    if (entering === null) return;
    const done = () => setEntering(null);
    const frame = requestAnimationFrame(done);
    const fallback = setTimeout(done, 64);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [entering]);

  const indicatorRef = useRef<HTMLSpanElement>(null);
  /* Where the pill was last time, so a first paint does not animate. */
  const lastIdx = useRef(shownIdx);

  useEffect(() => {
    const from = lastIdx.current;
    lastIdx.current = shownIdx;
    const el = indicatorRef.current;
    if (!el || from === shownIdx) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof el.animate !== 'function') return;

    /*
     * How far it is going, in cells. A jump across the whole bar earns more
     * stretch than a step to the neighbour, capped so a six-item rail does
     * not turn into a rubber band.
     */
    const reach = Math.min(1, Math.abs(shownIdx - from) / 3);
    const along = 1 + 0.10 + 0.10 * reach;
    const across = 1 - 0.05 - 0.04 * reach;

    /* The origin is the trailing edge, so the pill stretches TOWARDS where it
       is going rather than growing symmetrically out of itself. */
    const forward = shownIdx > from;
    el.style.transformOrigin = vertical
      ? `50% ${forward ? '0%' : '100%'}`
      : `${forward ? '0%' : '100%'} 50%`;

    const squash = vertical ? `scale(${across}, ${along})` : `scale(${along}, ${across})`;

    /* `--dur-morph` / `--ease-morph`, from whichever set this scope wears.
       Outside a scope that is 560ms on (0.32, 0.72, 0, 1), as it always was. */
    const anim = el.animate(
      [
        { transform: 'scale(1, 1)', boxShadow: `${pillRim}, var(--glow-accent-sm)` },
        { transform: squash, boxShadow: `${pillRim}, var(--glow-accent-md)`, offset: 0.42 },
        { transform: 'scale(1, 1)', boxShadow: `${pillRim}, var(--glow-accent-sm)` },
      ],
      { duration: Math.round(motion.dur.morph * 1000), easing: `cubic-bezier(${motion.ease.morph.join(', ')})` },
    );
    return () => anim.cancel();
  }, [shownIdx, vertical, pillRim, motion]);

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
  const offset = inset + shownIdx * (step + 2);
  const indicator: CSSProperties = vertical
    ? { left: inset, right: inset, top: offset, height: cellH }
    : { top: PAD, bottom: PAD, left: offset, width: cellW };

  const cellsAndPill = (
    <>
      <span
        ref={indicatorRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          ...indicator,
          borderRadius: 'var(--r-pill)',
          /* V3: the design's plate — white glass at 0.14 with V3's rim, and
             the emerald glow its blurred disc throws. */
          backgroundImage: v3
            ? 'linear-gradient(oklch(1 0 0 / 0.14), oklch(1 0 0 / 0.14))'
            : 'var(--glass-tint-accent)',
          boxShadow: `${pillRim}, var(--glow-accent-sm)`,
          transition: `${vertical ? 'top' : 'left'} var(--dur-morph) var(--ease-morph)`,
        }}
      />
      {items.map((it) => {
        const on = it.value === current;
        return (
          <button
            key={it.value}
            type="button"
            aria-label={it.badgeNote ? `${it.label}, ${it.badgeNote}` : it.label}
            title={it.badgeNote}
            aria-current={on ? 'page' : undefined}
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
            {v3 ? (
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
            {it.badge != null && (
              <span
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
    <nav className={`ag-scroll ${className}`.trim()} style={shell} {...rest}>
      {lead}
      {inner ? (
        <div
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
