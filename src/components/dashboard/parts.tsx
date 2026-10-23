/**
 * The Dashboard's own pieces (BIG-6, 29-1a) — drawn from his thirteen
 * reference images and his calls on them, 2026-09-30:
 *
 * - **Huge thin numerals, on the Dashboard only** — `BigNumber`.
 * - **Blocks are the app's near-solid glass; the controls inside them are
 *   neumorphic**, raised or pressed in (`Neumorphism Design/4.jpg`, the dark
 *   gauge and the "Cloud" button) — the design system's soft family since
 *   29-1P1, which was drawn from these blocks (`BlockIconButton` here).
 * - **Start is his orange "Get Started"** — the design system's `GelButton`
 *   with its tile since 29-1P2, or its slide for 90 minutes or more
 *   (`BlockStart`).
 * - **Lime for highlights, emerald for actions** — `LimeTag`.
 * - **Hatched stripes for "not yet"**, solid for done — `HatchedBar`.
 * - **Charts grow in once, then sit still** (Performance rule 1): every piece
 *   here that moves does it on mount or on a new value, and never loops.
 *
 * Every fill is `backgroundImage` / `backgroundColor`, never the `background`
 * shorthand: React clears the image with it on re-render.
 */
import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { GelButton, Icon, type IconName, SlideToStart, SoftIconButton, useMotion } from '../../ui';
import { startsBySlide } from '../../lib/focusCommitment';
import { cue } from '../../lib/sound';
import { numberTone, useBlockLook } from './blockContext';

// ─── Numbers ────────────────────────────────────────────────────────────────

const BIG_SIZES = {
  md: 'var(--text-4xl)',
  lg: 'var(--text-5xl)',
  xl: 'var(--text-6xl)',
} as const;

/**
 * Idea 3, numbers that roll (29-1P12): each digit is a strip of 0-9 behind a
 * one-line window, and a new value slides the strip, so a digit rolls to its
 * new place instead of jumping. Only on a change: the first draw lands where
 * it belongs (a transition has nothing to start from), and nothing loops — a
 * countdown rolls once a second only because it is working (rule 1).
 *
 * The window is clipped with `clip-path`, not `overflow: hidden`, which would
 * move the column's baseline to its bottom edge and drop the digits below the
 * unit beside them. The real digit stays in the page as invisible text — it
 * sizes the window, sets the baseline, and is what a search, a copy, a screen
 * reader or a test's `text=` reads — and the strip over it is CSS `content`,
 * which is none of those. Columns are keyed from the right, so "9:59" becoming
 * "10:00" rolls the digits that stayed in place.
 */
function RollingText({ text }: { text: string }) {
  const chars = [...text];
  /* Plain inline, never flex: a flex item counts as a block to the page's
     text, which would read "20" as "2 0". */
  return (
    <span style={{ lineHeight: 1, whiteSpace: 'pre' }}>
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (ch < '0' || ch > '9') return ch;
        return (
          <span key={`d${fromRight}`} className="dash-roll" style={{ ['--d' as string]: ch }}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/**
 * A headline figure: huge and thin, with a small unit beside it. Its digits
 * roll (idea 3). With no `tone` it takes the block's: coloured on a tinted
 * block (idea 147), the ink of a full-colour one.
 */
export function BigNumber({
  value, unit, size = 'lg', tone, style,
}: { value: ReactNode; unit?: ReactNode; size?: keyof typeof BIG_SIZES; tone?: string; style?: CSSProperties }) {
  const { look, colour } = useBlockLook();
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 'var(--sp-2)',
        /* Longhands, not `font`: the shorthand resets font-variant-numeric,
           and React warns when the two meet on a re-render (a resize). */
        fontFamily: 'var(--font-numeric)', fontWeight: 200, fontSize: BIG_SIZES[size], lineHeight: 0.95,
        letterSpacing: '-0.045em', color: tone ?? numberTone(look, colour), fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {typeof value === 'string' || typeof value === 'number' ? <RollingText text={String(value)} /> : value}
      {unit !== undefined && (
        <span style={{ font: 'var(--weight-normal) var(--text-md) / 1 var(--font-sans)', letterSpacing: 0, color: 'var(--fg-3)' }}>
          {unit}
        </span>
      )}
    </span>
  );
}

/**
 * The small label that names a block, with an optional icon. `glyph` takes
 * the icon's place with a mark of its own: the project block wears its
 * project's icon (29-1P8a2, idea 150).
 */
export function BlockTitle({ icon, glyph, children, trail }: { icon?: IconName; glyph?: ReactNode; children: ReactNode; trail?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
      {glyph}
      {icon && !glyph && (
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30, flex: '0 0 auto',
            borderRadius: 'var(--r-xs)', backgroundImage: 'var(--soft-fill)', boxShadow: 'var(--soft-raised)',
            color: 'var(--fg-2)',
          }}
        >
          <Icon name={icon} size={15} />
        </span>
      )}
      <span
        style={{
          font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-2)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }}
      >
        {children}
      </span>
      {trail !== undefined && <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}>{trail}</span>}
    </div>
  );
}

// ─── Controls ───────────────────────────────────────────────────────────────

/**
 * The round soft button in a block's corner — the "↗" in nearly every block
 * of his references. The design system's `SoftIconButton` since 29-1P2; this
 * only stops the press reaching the block, which is itself tappable.
 */
export function BlockIconButton({
  label, icon, onClick, size = 'sm', className,
}: { label: string; icon: IconName; onClick: () => void; size?: 'sm' | 'md'; className?: string }) {
  return (
    <SoftIconButton label={label} size={size} className={className} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <Icon name={icon} size={size === 'sm' ? 16 : 19} />
    </SoftIconButton>
  );
}

/**
 * The block's Start, as the design system draws it (29-1P2): his orange gel
 * with its tile, or — for a session of 90 minutes or more, his call — the
 * slide, because committing to that long is worth a deliberate gesture.
 * Neither press reaches the block under it, nor its long-press to edit.
 */
export function BlockStart({
  minutes, onStart, size = 'lg',
}: { minutes: number; onStart: () => void; size?: 'md' | 'lg' }) {
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  if (startsBySlide(minutes)) {
    return (
      <div onClick={stop} onPointerDown={stop} style={{ flex: '1 1 220px', maxWidth: 320 }}>
        <SlideToStart onConfirm={onStart}>Slide to start</SlideToStart>
      </div>
    );
  }
  return (
    <GelButton colour="orange" size={size} onClick={(e) => { e.stopPropagation(); cue('start'); onStart(); }}>
      Start
    </GelButton>
  );
}

/** A lime chip for what is highlighted — his call: lime for highlights. */
export function LimeTag({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 var(--sp-3)',
        borderRadius: 'var(--r-2xs)', backgroundColor: 'oklch(0.86 0.17 128 / 0.16)',
        color: 'var(--hue-lime)', font: 'var(--type-caption)', fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

// ─── Charts ─────────────────────────────────────────────────────────────────

/** The "not yet" stripes — his references' hatch, on the dark. */
const HATCH =
  'repeating-linear-gradient(135deg, oklch(1 0 0 / 0.11) 0 2px, transparent 2px 7px)';

/**
 * Done solid, the rest hatched. Grows in once from the left when it mounts,
 * and again only when the value changes (`key`), never on a loop.
 */
export function HatchedBar({ fraction, tone = 'var(--hue-lime)', height = 14 }: { fraction: number; tone?: string; height?: number }) {
  const reduced = useReducedMotion();
  const m = useMotion();
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div
      role="presentation"
      style={{
        position: 'relative', height, borderRadius: 'var(--r-2xs)', overflow: 'hidden',
        backgroundImage: HATCH, backgroundColor: 'oklch(1 0 0 / 0.03)',
        boxShadow: 'var(--soft-pressed)',
      }}
    >
      <motion.div
        key={f}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: m.dur.sheet * 1.6, ease: m.ease.glass }}
        style={{
          position: 'absolute', inset: 0, width: `${f * 100}%`, transformOrigin: '0 50%',
          borderRadius: 'var(--r-2xs)', backgroundColor: tone,
        }}
      />
    </div>
  );
}

/** One dot per task, lit for the done ones — for a project small enough to count. */
export function StepDots({ done, total }: { done: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          style={{
            width: 14, height: 14, borderRadius: '50%',
            backgroundColor: i < done ? 'var(--hue-lime)' : 'oklch(1 0 0 / 0.10)',
            boxShadow: i < done ? '0 0 10px -2px oklch(0.86 0.19 128 / 0.6)' : 'var(--soft-pressed)',
          }}
        />
      ))}
    </div>
  );
}
