/**
 * Covers made for you (idea 149, 29-1P8a). A project with no photo draws a
 * cover of its own, in one of six styles he chooses per project — his call,
 * 2026-10-13: "Can I get all of them? I can customize the look of a project".
 * The six are the options page `docs/design/no-cover-cards.html`, A to F.
 *
 * Pure: no React, no store, no clock. Everything a cover looks like follows
 * from four small fields on the project (`Project.cover`), and a project that
 * never chose has them derived from its id, so every card gets a real cover
 * the day this ships and keeps the same one on both devices.
 *
 * WHERE THE COLOURS COME FROM. Projects have no colour since OPT-4, so a cover
 * cannot take "the project's colour" as the idea page said. It takes them from
 * one of three places he can pick per project: two of the ten job hues rolled
 * by the seed (a cover is a picture, like a photo, so its colours carry no
 * job), his dark tint, or greys. The tint is NOT read here: its hue and chroma
 * are CSS variables keyed off `<html data-dark-tint>` (`projectCover.css`), so
 * a cover in his tint follows a change of tint with no script and no render.
 * That is why every colour below is a CSS string, not a number.
 *
 * A photo always wins: `imageUrl` set means the photo is drawn and this is
 * not consulted.
 */

/** A: patterns. B: the icon. C: the name. D: the lists. E: aurora. F: no cover. */
export const COVER_KINDS = ['pattern', 'icon', 'name', 'glimpse', 'aurora', 'none'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];

export const COVER_PATTERNS = ['mesh', 'waves', 'stripes', 'dots'] as const;
export type CoverPattern = (typeof COVER_PATTERNS)[number];

export const COVER_COLOURS = ['shuffle', 'tint', 'grey'] as const;
export type CoverColours = (typeof COVER_COLOURS)[number];

/** What is stored on a project. Every field is optional so an old or partial record still reads. */
export interface ProjectCoverStyle {
  kind?: CoverKind;
  /** Only for `pattern`. Absent means the seed picks one ("Mixed"). */
  pattern?: CoverPattern;
  colours?: CoverColours;
  /** What Shuffle rolls. */
  seed?: number;
}

/** A stored style with every gap filled. */
export interface ResolvedCover {
  kind: CoverKind;
  /** The pattern drawn — the stored one, or the seed's when none is stored. */
  pattern: CoverPattern;
  /** Whether `pattern` was chosen by him rather than by the seed. */
  patternFixed: boolean;
  colours: CoverColours;
  seed: number;
}

export const COVER_KIND_LABEL: Record<CoverKind, string> = {
  pattern: 'Pattern',
  icon: 'Icon',
  name: 'Name',
  glimpse: 'Lists',
  aurora: 'Aurora',
  none: 'None',
};

export const COVER_COLOURS_LABEL: Record<CoverColours, string> = {
  shuffle: 'Any colour',
  tint: 'My tint',
  grey: 'Greys',
};

/** A small, stable hash of a string — FNV-1a, 32 bits, unsigned. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export function resolveCover(projectId: string, stored: ProjectCoverStyle | undefined): ResolvedCover {
  const seed = typeof stored?.seed === 'number' && Number.isFinite(stored.seed)
    ? Math.abs(Math.floor(stored.seed))
    : hashId(projectId);
  const fixed = isOneOf(COVER_PATTERNS, stored?.pattern) ? stored.pattern : undefined;
  return {
    kind: isOneOf(COVER_KINDS, stored?.kind) ? stored.kind : 'pattern',
    pattern: fixed ?? COVER_PATTERNS[seed % COVER_PATTERNS.length],
    patternFixed: !!fixed,
    colours: isOneOf(COVER_COLOURS, stored?.colours) ? stored.colours : 'shuffle',
    seed,
  };
}

/**
 * A new seed for Shuffle, never the one it replaces. `random` is
 * `Math.random` at the call site; a test passes its own.
 */
export function shuffleSeed(current: number, random: () => number): number {
  for (let i = 0; i < 8; i++) {
    const next = Math.floor(random() * 0x7fffffff);
    if (next !== current) return next;
  }
  return (current + 1) % 0x7fffffff;
}

/** A small seeded generator (mulberry32), so a seed always draws the same cover. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The ten job hues, in `--job-*`'s order (orange, emerald, lime, gold, coral,
 * rose, violet, sky, teal, indigo). Only their hue angle is used, at the
 * cover's own lightness, so a cover never reads as a button of that colour.
 */
export const COVER_HUES = [45, 162, 130, 82, 28, 355, 300, 240, 200, 277] as const;

/** Two hues and a chroma, as CSS — numbers for Shuffle and Greys, variables for his tint. */
export interface CoverInks {
  h1: string;
  h2: string;
  /** The main colour's chroma; the second runs a touch quieter. */
  c: string;
}

export function coverInks(seed: number, colours: CoverColours): CoverInks {
  if (colours === 'grey') return { h1: '260', h2: '260', c: '0.006' };
  if (colours === 'tint') {
    return { h1: 'var(--cover-tint-h)', h2: 'calc(var(--cover-tint-h) + 24)', c: 'var(--cover-tint-c)' };
  }
  const first = seed % COVER_HUES.length;
  /* Three to seven steps round the ten: never the same hue, rarely its neighbour. */
  const second = (first + 3 + ((seed >>> 4) % 5)) % COVER_HUES.length;
  return { h1: String(COVER_HUES[first]), h2: String(COVER_HUES[second]), c: '0.16' };
}

/**
 * One colour of the cover: a lightness, a share of the cover's chroma, which
 * of its two hues, and an alpha. `oklch()` takes `calc()` in every browser
 * BASE runs in, which is what lets the tint's variables through.
 */
export function ink(inks: CoverInks, l: number, share: number, second = false, alpha = 1): string {
  const h = second ? inks.h2 : inks.h1;
  const c = share === 1 ? inks.c : `calc(${inks.c} * ${share})`;
  return `oklch(${l} ${c} ${h}${alpha < 1 ? ` / ${alpha}` : ''})`;
}

/** The cover's main colour — the glow behind the project's icon (idea 150, next session). */
export function coverGlow(inks: CoverInks): string {
  return ink(inks, 0.68, 1);
}

/**
 * The cover's two colours, for the light Focus casts (29-1P11c, ideas 46 and
 * 68): the main one, as the icon's glow, and the second hue a touch quieter,
 * as the cover draws it.
 */
export function coverLight(inks: CoverInks): [string, string] {
  return [coverGlow(inks), ink(inks, 0.68, 0.9, true)];
}

/**
 * Idea 68, Focus lights the room: the light a running Focus stage casts with
 * a cover's two colours, onto the page round it, one to each side, as
 * YouTube's ambient mode spills a video's. A still shadow (a glow is a still
 * shadow: the performance rules), never a blurred copy of the cover; the
 * teal it replaces reaches as far, a little narrower. Mixed in oklab, which
 * keeps the hue (oklch shifts it).
 */
export function castLight([a, b]: readonly [string, string]): string {
  const mix = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;
  return `0 0 30px -2px ${mix(a, 45)}, -40px 6px 100px -16px ${mix(a, 32)}, 40px -6px 100px -16px ${mix(b, 32)}`;
}

/* ── geometry ─────────────────────────────────────────────────
   Drawn on a 300 × 175 box, the cover's 12:7, and scaled by the SVG. */

export const COVER_W = 300;
export const COVER_H = 175;

export interface MeshSpot { x: number; y: number }

/** Where mesh's three soft lights sit, in percent of the cover. */
export function meshSpots(seed: number): MeshSpot[] {
  const r = seeded(seed);
  return [0, 1, 2].map(() => ({ x: Math.round(r() * 100), y: Math.round(r() * 100) }));
}

/** Five stacked wave bands, back to front, each a closed SVG path. */
export function wavePaths(seed: number): string[] {
  const r = seeded(seed);
  const phase = r() * Math.PI * 2;
  const amp = 10 + r() * 16;
  const freq = 1 + r() * 1.6;
  const out: string[] = [];
  for (let band = 0; band < 5; band++) {
    const y0 = 40 + band * 26;
    let d = `M0 ${y0}`;
    for (let x = 0; x <= COVER_W; x += 10) {
      const y = y0 + Math.sin((x / COVER_W) * Math.PI * 2 * freq + phase + band * 0.7) * amp;
      d += ` L${x} ${y.toFixed(1)}`;
    }
    out.push(`${d} L${COVER_W} ${COVER_H} L0 ${COVER_H} Z`);
  }
  return out;
}

export interface StripeSpec { angle: number; width: number }

export function stripeSpec(seed: number): StripeSpec {
  const r = seeded(seed);
  return { angle: [25, 35, 115, 135, 60][Math.floor(r() * 5)], width: 14 + Math.round(r() * 14) };
}

export interface Dot { x: number; y: number; r: number; far: boolean; l: number }

/**
 * A halftone: a grid of dots that shrink away from one point. At most
 * 23 × 14 = 322 of them, drawn once and never animated.
 */
export function dotGrid(seed: number): Dot[] {
  const r = seeded(seed);
  const cx = r() * COVER_W;
  const cy = r() * COVER_H;
  const dots: Dot[] = [];
  for (let y = 7; y < COVER_H; y += 13) {
    for (let x = 7; x < COVER_W; x += 13) {
      const d = Math.hypot(x - cx, y - cy) / 260;
      const rad = 5.4 * (1 - d);
      if (rad > 0.4) dots.push({ x, y, r: Math.round(rad * 100) / 100, far: d >= 0.45, l: Math.round((0.78 - d * 0.3) * 1000) / 1000 });
    }
  }
  return dots;
}

/** Where aurora's light sits: a corner, nudged by the seed. */
export function auroraSpot(seed: number): MeshSpot {
  const r = seeded(seed);
  return { x: Math.round(r() * 30), y: Math.round(r() * 30) };
}

/** C draws one word of the name huge: the last, which is the one that names it ("Studio Launch" → "Launch"). */
export function coverWord(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : '';
}
