import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Icon, useMotion } from '../../ui';
import type { IconName } from '../../ui';

/**
 * The login backdrop.
 * Screen: design-system/screens/login.html — RECONCILED (UI-28).
 *
 * THE MOCKUP HAS NO SCENE. The real login screen is one sheet on a bare
 * `.ag-page--focal`, and `tokens/backdrop.css` opens by saying why: "No
 * aurora, no colour wash by default — this is a focus tool and the field
 * stays quiet." So there is no material here to take; there is only the
 * question of whether this layer should exist at all, and **Shreekant kept
 * it**. It is the app's own, and the only divergence on this screen that is
 * a choice rather than a reading of the source.
 *
 * What UI-28 did change: the page underneath. LoginPage moved from
 * `--field` to `--focal`, the variant the mockup uses and the one whose
 * definition — "one pool of light behind a single object" — is what a lone
 * sign-in sheet is. The note below about the blobs being replaced by the
 * drifting `--field` gradient is kept because it is the history, but the
 * token it names is no longer the one behind these rings: they refract one
 * pool of emerald low on the page, not a two-hue wash. That is the quieter
 * reading, and with the sheet above them now at level 3 and refracting, the
 * rings no longer have to carry the screen on their own.
 *
 * SUPERSEDED, and by a later call than UI-28: the page is `--calm` now and
 * paints no pool at all, so these rings refract the grid and nothing else.
 * Shreekant cut the pool because the sheet above them — level 3, and the
 * only refracting surface on the screen — was magnifying it into a green
 * wash across the middle of the card. The rings never carried colour of
 * their own, so nothing in this file changed with it.
 *
 * Rebuilt on Aurora Glass. The gesture is unchanged: concentric glass
 * rectangles burst outward from the login card — fast at first, then
 * decelerating into a near-standstill — the outer ones extending past the
 * viewport, and once settled each one "breathes" on a very slow infinite
 * loop. Glass circles ride the actual perimeter of each rectangle (CSS
 * motion paths, so they follow the rounded corners precisely instead of
 * cutting across), four of them carrying the secure / phone / laptop /
 * tablet glyphs.
 *
 * Three things changed with the material:
 *
 *   - The three hand-rolled indigo/violet/cyan aurora blobs are gone.
 *     Aurora Glass ships exactly one sanctioned colour field —
 *     `.ag-page--field` in tokens/backdrop.css, "onboarding, empty states
 *     and marketing only" — and LoginPage now wears it. That token is also
 *     what the glass here refracts, so the blobs are not merely replaced;
 *     they are the same job, done by the system.
 *   - Every surface is tokens now: `--glass-fill-1` + `--glass-bd-sm` +
 *     `--glass-shadow-thin` for a ring, one level up for a badge. The old
 *     `.liquid-glass-ambient` carried a white outer glow; that is dropped
 *     deliberately, because in this system a glow means a surface is
 *     EMITTING and a resting backdrop never is.
 *   - The orbiting badges carry 1.5-stroke line glyphs instead of the
 *     glossy PNGs in `public/icons/login/`. Those PNGs are the old design's
 *     language and nothing references them any more.
 *
 * THE MOCKUP COULD NOT BE PULLED. `DesignSync list_projects` returns an
 * empty array from this machine, as it did for UI-1, UI-2 and UI-4, so
 * `design-system/screens/login.html` is still absent and this was built
 * from the mirrored tokens rather than diffed against the real screen.
 * Reconciling it is part of UI-21.
 *
 * The whole layer is `fixed inset-0 overflow-hidden` — so it can never
 * affect page scroll or width — and `pointer-events-none`.
 */

function useViewport() {
  const [size, setSize] = useState(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setSize({ vw: window.innerWidth, vh: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

const clampPx = (min: number, v: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Rounded-rectangle SVG path (clockwise), starting at the middle of a chosen
 * side so each orbiter can begin its journey from a different edge.
 * start: 0 = top, 1 = right, 2 = bottom, 3 = left.
 */
function roundedRectPath(w: number, h: number, r: number, start: number): string {
  const a = (x: number, y: number) => `A ${r} ${r} 0 0 1 ${x} ${y}`;
  switch (((start % 4) + 4) % 4) {
    case 0:
      return `M ${w / 2} 0 H ${w - r} ${a(w, r)} V ${h - r} ${a(w - r, h)} H ${r} ${a(0, h - r)} V ${r} ${a(r, 0)} H ${w / 2}`;
    case 1:
      return `M ${w} ${h / 2} V ${h - r} ${a(w - r, h)} H ${r} ${a(0, h - r)} V ${r} ${a(r, 0)} H ${w - r} ${a(w, r)} V ${h / 2}`;
    case 2:
      return `M ${w / 2} ${h} H ${r} ${a(0, h - r)} V ${r} ${a(r, 0)} H ${w - r} ${a(w, r)} V ${h - r} ${a(w - r, h)} H ${w / 2}`;
    default:
      return `M 0 ${h / 2} V ${r} ${a(r, 0)} H ${w - r} ${a(w, r)} V ${h - r} ${a(w - r, h)} H ${r} ${a(0, h - r)} V ${h / 2}`;
  }
}

type OrbiterProps = {
  path: string;
  seconds: number;
  appearDelay: number;
  size: number;
  icon?: IconName;
  reverse?: boolean;
  maxOpacity?: number;
};

/** A glass circle that travels along a rectangle's perimeter. */
function Orbiter({ path, seconds, appearDelay, size, icon, reverse, maxOpacity = 1 }: OrbiterProps) {
  const reduced = useReducedMotion();
  const from = reverse ? '100%' : '0%';
  const to = reverse ? '0%' : '100%';

  return (
    <motion.div
      className="absolute top-0 left-0 flex items-center justify-center"
      style={
        {
          width: size,
          height: size,
          borderRadius: 'var(--r-circle)',
          /* A badge is the brightest thing out here — level 3 — because it
             rides ON a ring and the ring is already level 2. Written
             inline rather than as <GlassSurface> because Framer Motion
             owns this element's animated properties. */
          backgroundImage: 'var(--glass-fill-3)',
          backdropFilter: 'var(--glass-bd-sm)',
          WebkitBackdropFilter: 'var(--glass-bd-sm)',
          boxShadow: 'var(--glass-rim-3), var(--glass-cast-1)',
          color: 'var(--fg-2)',
          offsetPath: `path("${path}")`,
          offsetRotate: '0deg',
        } as React.CSSProperties
      }
      initial={{ opacity: 0, offsetDistance: from }}
      animate={{ opacity: maxOpacity, offsetDistance: reduced ? from : to }}
      transition={{
        opacity: { duration: 1.4, delay: appearDelay, ease: 'easeOut' },
        offsetDistance: reduced
          ? { duration: 0 }
          : { duration: seconds, ease: 'linear', repeat: Infinity },
      }}
    >
      {icon && <Icon name={icon} size={24} />}
    </motion.div>
  );
}

type RingSpec = {
  w: number;
  h: number;
  /**
   * Corner radius as a NUMBER. The values are the radii scale from
   * tokens/radii.css (--r-3xl 56, --r-2xl 40, --r-xl 34, --r-lg 26); they
   * cannot be written as custom properties here because roundedRectPath
   * does arithmetic with them to draw the orbit.
   */
  r: number;
  icon: IconName;
  iconStart: number;
};

function LiquidRing({ spec, index }: { spec: RingSpec; index: number }) {
  const reduced = useReducedMotion();
  /* `--ease-glass` in numbers, from whichever set the scope wears — a
     hand-copied bezier here stayed the old curve on V3 (V3-9). */
  const motionTokens = useMotion();
  const [settled, setSettled] = useState(false);

  /* Ambient timings, in seconds. Deliberately far longer than any --dur-*
     token: those are UI transitions and this is the room the UI sits in.
     Its nearest relative is --dur-ambient (24s), the backdrop's drift. */
  const entranceDuration = 1.5 + index * 0.4;
  const entranceDelay = 0.08 + index * 0.14;

  // Swap from the entrance burst to the infinite breathing loop exactly when
  // the entrance tween lands on scale 1 (onAnimationComplete fires per-value
  // in Framer Motion, so it would trigger too early via the opacity tween).
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), (entranceDelay + entranceDuration) * 1000);
    return () => clearTimeout(t);
  }, [entranceDelay, entranceDuration]);

  const breatheScale = 1.012 + index * 0.004;
  const breatheDuration = 10 + index * 2.5;
  const orbitSeconds = 48 + index * 16;
  const badgeSize = 56 - index * 2;

  const iconPath = roundedRectPath(spec.w, spec.h, spec.r, spec.iconStart);
  const dotPath = roundedRectPath(spec.w, spec.h, spec.r, spec.iconStart + 2);

  const breathing = settled && !reduced;

  return (
    <div
      className="absolute top-1/2 left-1/2"
      style={{ width: spec.w, height: spec.h, marginLeft: -spec.w / 2, marginTop: -spec.h / 2 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{
          borderRadius: spec.r,
          transformOrigin: 'center',
          /* A level-2 pane with a level-1 backdrop. The fill and the rim
             have to be level 2 or the edge disappears: these rectangles
             are up to 1600px across and a level-1 rim (5% white down the
             sides) simply is not visible at that length — the burst stops
             reading as concentric rings at all. The BLUR stays one step
             down, because four full-viewport `--glass-bd-md` layers
             stacked and animating is what makes this screen stutter. */
          backgroundImage: 'var(--glass-fill-2)',
          backdropFilter: 'var(--glass-bd-sm)',
          WebkitBackdropFilter: 'var(--glass-bd-sm)',
          boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
        }}
        initial={reduced ? { scale: 1, opacity: 1 } : { scale: 0.05, opacity: 0 }}
        animate={breathing ? { scale: [1, breatheScale, 1] } : { scale: 1, opacity: 1 }}
        transition={
          breathing
            ? { duration: breatheDuration, repeat: Infinity, ease: 'easeInOut' }
            : {
                scale: { duration: entranceDuration, delay: entranceDelay, ease: motionTokens.ease.glass },
                opacity: { duration: 0.45, delay: entranceDelay, ease: 'easeOut' },
              }
        }
      >
        <Orbiter
          path={iconPath}
          seconds={orbitSeconds}
          appearDelay={0.9 + index * 0.22}
          size={badgeSize}
          icon={spec.icon}
        />
        <Orbiter
          path={dotPath}
          seconds={orbitSeconds * 0.72}
          appearDelay={1.2 + index * 0.22}
          size={13}
          reverse
          maxOpacity={0.85}
        />
      </motion.div>
    </div>
  );
}

export default function LoginAuraScene() {
  const { vw, vh } = useViewport();

  const rings: RingSpec[] = [
    {
      w: clampPx(560, vw * 0.46, 920),
      h: clampPx(560, vh * 0.74, 900),
      r: 56,
      icon: 'lock',
      iconStart: 0,
    },
    {
      w: clampPx(680, vw * 0.63, 1280),
      h: vh * 1.02,
      r: 40,
      icon: 'smartphone',
      iconStart: 1,
    },
    {
      w: clampPx(760, vw * 0.79, 1620),
      h: vh * 1.32,
      r: 34,
      icon: 'laptop',
      iconStart: 3,
    },
    {
      w: vw * 0.94,
      h: vh * 1.62,
      r: 26,
      icon: 'tablet',
      iconStart: 1,
    },
  ];

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {/* Largest ring first: each ring's backdrop-filter blurs everything
          painted beneath it, so inner rings must paint on top to keep their
          edges crisp instead of being smeared by the outer surfaces. */}
      {rings
        .map((spec, i) => ({ spec, i }))
        .reverse()
        .map(({ spec, i }) => (
          <LiquidRing key={i} spec={spec} index={i} />
        ))}
    </div>
  );
}
