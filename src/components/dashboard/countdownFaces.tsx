/**
 * The Countdown widget's faces (29-2b): idea 140's One UI looks — Cover,
 * Shape, Journey — and idea 27's split-flap board, the fifth. Minimal, the
 * look 29-2a built, stays in `CountdownBlock.tsx`; which one a widget draws
 * is its ⚙'s `face` (`countdownFace`).
 *
 * The picture and the shape are the EVENT's (`imageUrl`, `shape`), so they
 * follow it to every widget that shows it; the face is the widget's.
 *
 * Nothing here loops (Performance rule 1). The two motions are one-offs run
 * by `el.animate` through `usePlayOnChange` — never a CSS keyframe, which the
 * kept Dashboard would restart on every return: a shape that pops when it is
 * tapped to the next one, and a tile that flips when its digit changes, at
 * most once a minute. Neither plays on the first draw, so a screenshot never
 * catches one half-way.
 */
import { useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { CoverImage } from '../../ui';
import { useEventStore } from '../../store/useEventStore';
import { cue } from '../../lib/sound';
import {
  DEFAULT_EVENT_COLOUR, describeWhen, flapGroups, isAllDay, journeySpan, nextShape, shortDay,
  type BaseEvent, type CountdownReading, type EventMoment, type EventShape,
} from '../../lib/events/events';
import { BigNumber } from './parts';
import { usePlayOnChange } from './motionOnce';

const colourOf = (event: BaseEvent) => event.colour ?? DEFAULT_EVENT_COLOUR;

/** Words over a photograph are white whatever the theme, under a scrim. */
const ON_PHOTO = 'oklch(1 0 0)';

// ─── Shapes ─────────────────────────────────────────────────────────────────

/**
 * The burst's outline, in the box's own 0..1 units: a twelve-lobed One UI
 * clock face. Worked out once; `clipPathUnits="objectBoundingBox"` scales it
 * to any size.
 */
const BURST_PATH = (() => {
  const points: string[] = [];
  const steps = 96;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const r = 0.455 + 0.045 * Math.cos(a * 12);
    points.push(`${(0.5 + r * Math.cos(a)).toFixed(4)},${(0.5 + r * Math.sin(a)).toFixed(4)}`);
  }
  return `M${points.join('L')}Z`;
})();

/* Circle, squircle and arch are radii, so a change between them glides by a
   plain transition; the burst is a clip. */
const SHAPE_RADIUS: Record<EventShape, string> = {
  circle: '50%',
  squircle: '30%',
  arch: '50% 50% 14% 14% / 42% 42% 14% 14%',
  burst: '0',
};

/**
 * One shape, filled with the event's colour, holding whatever is inside it.
 * The sheet's swatches and the widget's Shape face are both this.
 */
export function EventShapeBox({ shape, colour, size, children, style }: {
  shape: EventShape; colour: string; size: number; children?: ReactNode; style?: CSSProperties;
}) {
  const clipId = `burst-${useId().replace(/:/g, '')}`;
  return (
    <span
      style={{
        position: 'relative', display: 'grid', placeItems: 'center', alignContent: 'center', flex: '0 0 auto',
        width: size, height: size, borderRadius: SHAPE_RADIUS[shape],
        backgroundImage: `var(--job-${colour}-gel)`, color: `var(--job-${colour}-ink)`,
        clipPath: shape === 'burst' ? `url(#${clipId})` : undefined,
        transition: 'border-radius var(--dur-base) var(--ease-glass)',
        ...style,
      }}
    >
      {shape === 'burst' && (
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox"><path d={BURST_PATH} /></clipPath>
        </svg>
      )}
      {children}
    </span>
  );
}

// ─── Cover ──────────────────────────────────────────────────────────────────

/**
 * The event's picture filling the block, the number over it, the name and the
 * date under the number (idea 140's Cover). With no picture, the event's own
 * colour as a deep wash, so the face still reads before he adds one. The
 * layer is absolute against the block's pane, which clips it to the corners.
 */
export function CoverFace({ event, moment, reading, at, tz, w, h, corner }: FaceProps) {
  const colour = colourOf(event);
  const passed = moment.kind === 'passed';
  return (
    <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%', minWidth: 0 }}>
      <div aria-hidden="true" data-countdown-cover style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {event.imageUrl ? (
          <CoverImage src={event.imageUrl} fit="crop" />
        ) : (
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `radial-gradient(80% 90% at 78% 12%, color-mix(in oklab, var(--job-${colour}) 70%, transparent), transparent 70%), linear-gradient(170deg, var(--job-${colour}-deep), color-mix(in oklab, var(--job-${colour}-deep) 60%, black))`,
            }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(180deg, oklch(0 0 0 / 0.28), transparent 34%, transparent 42%, oklch(0 0 0 / 0.66))' }} />
      </div>
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end' }}>{corner}</div>
      <div style={{ position: 'relative', display: 'grid', gap: 'var(--sp-2)', minWidth: 0, color: ON_PHOTO, opacity: passed ? 0.7 : 1 }}>
        <BigNumber
          value={reading.kind === 'word' ? reading.word : reading.value}
          unit={reading.kind === 'count' ? <span style={{ color: ON_PHOTO, opacity: 0.85 }}>{reading.unit}</span> : undefined}
          size={w >= 2 && h >= 2 ? 'xl' : 'lg'}
          tone={ON_PHOTO}
          style={{ fontWeight: 300, textShadow: '0 2px 16px oklch(0 0 0 / 0.35)' }}
        />
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.92 }}>
          {event.title} · {describeWhen(moment, isAllDay(event), at, tz)}
        </span>
      </div>
    </div>
  );
}

// ─── Shape ──────────────────────────────────────────────────────────────────

/**
 * The count inside a One UI shape, the name and the date beside it (idea
 * 140's Shape). A tap on the shape turns the EVENT to the next shape — the
 * one place a tap on this widget does not open the event. A task's or a
 * date's (29-2d2) is made on the spot and has no shape to change: there the
 * shape is plain and a tap opens what the widget opens.
 */
export function ShapeFace({ event, moment, reading, at, tz, w, h, corner, shapeable = true }: FaceProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const shape = event.shape ?? 'circle';
  usePlayOnChange(ref, shape, (el, first) => {
    if (first) return;
    el.animate([{ scale: '0.86' }, { scale: '1.05' }, { scale: '1' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  const size = h >= 2 ? 150 : w >= 2 ? 104 : 92;
  const passed = moment.kind === 'passed';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: 'var(--sp-5)', height: '100%', minWidth: 0 }}>
      <button
        ref={ref}
        type="button"
        aria-label={shapeable ? `Change the shape (${shape} now)` : undefined}
        aria-hidden={shapeable ? undefined : true}
        tabIndex={shapeable ? undefined : -1}
        data-countdown-shape={shape}
        onClick={shapeable ? (e) => {
          e.stopPropagation();
          cue('detent');
          useEventStore.getState().updateEvent(event.id, { shape: nextShape(event.shape) });
        } : undefined}
        style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', borderRadius: '50%', opacity: passed ? 0.55 : 1 }}
      >
        <EventShapeBox shape={shape} colour={colourOf(event)} size={size}>
          <span style={{ fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: reading.kind === 'word' ? size * 0.2 : size * 0.38, lineHeight: 1, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {reading.kind === 'word' ? reading.word : reading.value}
          </span>
          {reading.kind === 'count' && (
            <span style={{ font: 'var(--weight-medium) var(--text-xs) / 1.2 var(--font-sans)', marginTop: 2 }}>
              {reading.unit.split(' ')[0]}
            </span>
          )}
        </EventShapeBox>
      </button>
      <div style={{ display: 'grid', alignContent: 'center', gap: 'var(--sp-2)', minWidth: 0, height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'auto' }}>{corner}</div>
        <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.title}
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {describeWhen(moment, isAllDay(event), at, tz)}
          {reading.kind === 'count' && reading.unit.includes(' ') ? ` · ${reading.value} ${reading.unit}` : ''}
        </span>
        <span style={{ marginTop: 'auto' }} />
      </div>
    </div>
  );
}

// ─── Journey ────────────────────────────────────────────────────────────────

/**
 * A line from the day he set the countdown to the day itself, a light where
 * today is (idea 140's Journey). A repeat travels from its last occurrence.
 * On the day, and after, the line is full.
 */
export function JourneyFace({ event, moment, reading, at, tz, w, title, corner }: FaceProps) {
  const span = journeySpan(event, moment, at, tz);
  const colour = colourOf(event);
  const fraction = span ? span.fraction : 1;
  const pct = `${(fraction * 100).toFixed(2)}%`;
  const passed = moment.kind === 'passed';
  return (
    <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%', minWidth: 0 }}>
      {title(corner)}
      <BigNumber
        value={reading.kind === 'word' ? reading.word : reading.value}
        unit={reading.kind === 'count' ? reading.unit : undefined}
        size={w >= 2 ? 'lg' : 'md'}
        tone={passed ? 'var(--fg-3)' : undefined}
      />
      <div data-countdown-journey={fraction.toFixed(3)} style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <div style={{ position: 'relative', height: 6, borderRadius: 3, backgroundColor: 'oklch(1 0 0 / 0.08)' }}>
          <i
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: pct, borderRadius: 3,
              backgroundImage: `linear-gradient(90deg, var(--job-sky), var(--job-${colour === 'sky' ? 'orange' : colour}))`,
              opacity: passed ? 0.45 : 1,
            }}
          />
          {!passed && (
            <b
              aria-hidden="true"
              style={{
                position: 'absolute', left: pct, top: '50%', width: 12, height: 12, margin: -6, borderRadius: '50%',
                backgroundColor: 'oklch(1 0 0)', boxShadow: `0 0 10px var(--job-${colour === 'sky' ? 'orange' : colour})`,
              }}
            />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)', font: 'var(--type-caption)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)' }}>
          <span>{span ? `${span.repeat ? 'Since' : 'Set'} ${shortDay(span.from, at, tz)}` : ''}</span>
          <span>{shortDay(moment.start, at, tz)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Split-flap ─────────────────────────────────────────────────────────────

const TILE_TOP = 'color-mix(in oklab, var(--void-1), oklch(0.32 0 0) 55%)';
const TILE_BOTTOM = 'color-mix(in oklab, var(--void-1), oklch(0.26 0 0) 55%)';
const half = (top: boolean): CSSProperties => ({
  position: 'absolute', left: 0, right: 0, height: '50%', overflow: 'hidden',
  ...(top ? { top: 0, transformOrigin: '50% 100%', backgroundColor: TILE_TOP, borderRadius: '5px 5px 0 0' }
    : { bottom: 0, transformOrigin: '50% 0%', backgroundColor: TILE_BOTTOM, borderRadius: '0 0 5px 5px' }),
  opacity: 0, backfaceVisibility: 'hidden',
});
/* The glyph inside a half is the whole tile's, so each half shows its half. */
const glyphIn = (top: boolean): CSSProperties => ({
  position: 'absolute', left: 0, right: 0, height: '200%', ...(top ? { top: 0 } : { bottom: 0 }),
  display: 'grid', placeItems: 'center',
});

/**
 * One tile of the board. It draws its character whole; on a change the
 * three flaps — the old top falling, the old bottom waiting under it, the new
 * bottom landing — are filled with their characters and played once. At rest
 * all three are invisible, so the tile is its one character.
 */
function FlapTile({ ch, size }: { ch: string; size: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(ch);
  usePlayOnChange(ref, ch, (el, first) => {
    const old = was.current;
    was.current = ch;
    if (first || old === ch) return;
    const flap = (name: string) => el.querySelector<HTMLElement>(`[data-flap="${name}"]`);
    const fall = flap('fall');
    const under = flap('under');
    const land = flap('land');
    if (!fall || !under || !land) return;
    fall.firstElementChild!.textContent = old;
    under.firstElementChild!.textContent = old;
    land.firstElementChild!.textContent = ch;
    fall.animate([{ opacity: 1, transform: 'rotateX(0deg)' }, { opacity: 1, transform: 'rotateX(-90deg)' }], { duration: 140, easing: 'ease-in' });
    under.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 280 });
    land.animate([{ opacity: 1, transform: 'rotateX(90deg)' }, { opacity: 1, transform: 'rotateX(0deg)' }], { duration: 140, delay: 140, easing: 'ease-out', fill: 'backwards' });
  });
  return (
    <span
      ref={ref}
      style={{
        position: 'relative', display: 'grid', placeItems: 'center', width: Math.round(size * 0.74), height: Math.round(size * 1.16),
        borderRadius: 5, backgroundImage: `linear-gradient(180deg, ${TILE_TOP} 50%, ${TILE_BOTTOM} 50%)`,
        boxShadow: 'inset 0 1px 0 oklch(1 0 0 / 0.08), 0 2px 6px -2px oklch(0 0 0 / 0.6)',
        perspective: size * 6, color: 'var(--fg-1)', fontFamily: 'var(--font-numeric)', fontWeight: 500, fontSize: size,
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {ch}
      <span data-flap="under" aria-hidden="true" style={half(false)}><span style={glyphIn(false)} /></span>
      <span data-flap="fall" aria-hidden="true" style={half(true)}><span style={glyphIn(true)} /></span>
      {/* Filled by the flip itself, never by React: a text node React owns
          must not be rewritten under it. */}
      <span data-flap="land" aria-hidden="true" style={half(false)}><span style={glyphIn(false)} /></span>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, marginTop: -0.5, backgroundColor: 'oklch(0 0 0 / 0.55)' }} />
    </span>
  );
}

/**
 * Idea 27: the count on an airport departure board — a run of tiles per unit,
 * the unit under it, the word on its day ("TODAY"). Only a tile whose
 * character changed flips.
 */
export function FlapFace({ event, moment, reading, at, tz, w, h, title, corner }: FaceProps) {
  const groups = flapGroups(reading, event.countdown);
  const tiles = groups.reduce((n, g) => n + g.text.length, 0);
  /* Sized so the longest board ("PASSED", "142 23") still fits one cell
     wide, and the date still fits under it one row tall. */
  const size = Math.min(w >= 2 && h >= 2 ? 44 : 32, Math.floor((w >= 2 ? 300 : 190) / Math.max(4, tiles)));
  return (
    <div style={{ display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)', height: '100%', minWidth: 0 }}>
      {title(corner)}
      <div
        role="img"
        aria-label={reading.kind === 'word' ? reading.word : `${reading.value} ${reading.unit}`}
        data-countdown-flap={groups.map((g) => g.text).join(' ')}
        style={{ display: 'flex', gap: Math.round(size * 0.45), alignItems: 'flex-start', opacity: moment.kind === 'passed' ? 0.5 : 1 }}
      >
        {groups.map((g, gi) => (
          <span key={gi} style={{ display: 'grid', gap: 'var(--sp-2)', justifyItems: 'start' }}>
            <span style={{ display: 'flex', gap: 3 }}>
              {[...g.text].map((ch, i) => (
                /* Keyed from the right, so 100 → 99 drops the left tile, not the right. */
                <FlapTile key={g.text.length - i} ch={ch} size={size} />
              ))}
            </span>
            {g.label && (
              <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                {g.label}
              </span>
            )}
          </span>
        ))}
      </div>
      <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minHeight: 'min-content' }}>
        {describeWhen(moment, isAllDay(event), at, tz)}
        {event.location && w >= 2 ? ` · ${event.location}` : ''}
      </span>
    </div>
  );
}

export interface FaceProps {
  event: BaseEvent;
  moment: EventMoment;
  reading: CountdownReading;
  at: Date;
  tz: string;
  w: number;
  h: number;
  /** The block's corner: the archive and the + buttons. */
  corner: ReactNode;
  /** The block's title row (the event's dot and name) with `trail` at its end. */
  title: (trail: ReactNode) => ReactNode;
  /** 29-2d2: false for a task's or a date's made-up event, which has no shape to change. */
  shapeable?: boolean;
}
