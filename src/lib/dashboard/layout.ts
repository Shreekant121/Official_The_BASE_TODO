/**
 * The Dashboard's grid (BIG-6, step 29-1a) — pure, no React, no store.
 *
 * HIS CALLS, 2026-09-30
 * ---------------------
 * - **Android home-screen widgets**: blocks snap to a grid, a corner drag
 *   resizes, the others move aside, and a block can be added more than once.
 * - **One layout, synced**; a narrower screen keeps the order and the shapes
 *   and wraps into fewer columns.
 * - **The app never rearranges anything he placed.**
 *
 * WHY A LAYOUT IS AN ORDER AND SIZES, NOT POSITIONS
 * -------------------------------------------------
 * A block stores its size in cells and its place in the list; where it lands
 * is `packBlocks`, first-fit, in that order. That is what makes the three
 * calls one rule rather than three: the same order packs into four columns on
 * the laptop and two on an upright tablet without a second layout to keep in
 * step, "the others move aside" is re-packing with the held block at a new
 * index, and nothing can rearrange his order because nothing but his own drag
 * writes it. Stored (x, y) positions would have needed a second answer for
 * every narrower screen, and a rule for when the two disagree.
 *
 * The canonical grid is `GRID_COLUMNS` wide. On a narrower screen a block is
 * drawn `min(w, columns)` wide and keeps its height — "keeps the shapes" as far
 * as a screen that is physically narrower allows.
 */

import type { TimelineRange } from './timeline';
import type { CountdownFace } from '../events/events';

export type BlockKind =
  | 'one-thing' | 'today' | 'next-deadline' | 'overdue' | 'project-progress'
  /* 29-1b */
  | 'hours-today' | 'focus-week' | 'focus-timer'
  /* 29-1P13 */
  | 'stack' | 'waiting-on' | 'runway'
  /* 29-1c1 */
  | 'quick-add'
  /* 29-1c2 */
  | 'timeline'
  /* 29-2a: the real countdown, which took `sample-countdown`'s place (`RENAMED_KINDS`). */
  | 'countdown'
  /* 29-1c4: later steps' blocks, early, on sample data (`SAMPLE_KINDS`). */
  | 'sample-streak' | 'sample-routine' | 'sample-morning';

/**
 * Blocks from steps not built yet, shown early on pretend data wearing a
 * "Sample" tag (his call, 2026-09-30: never data that looks real; which four,
 * 2026-10-21). Each is replaced by the real block in its own step — 29-2 the
 * countdown (built, 29-2a), 29-3 the streak and the routine, 29-5 Atlas's
 * morning note — which turns these kinds into that block rather than leaving
 * a second one (`RENAMED_KINDS`).
 */
export const SAMPLE_KINDS: ReadonlySet<BlockKind> = new Set<BlockKind>([
  'sample-streak', 'sample-routine', 'sample-morning',
]);

/**
 * A sample whose real block has been built, and the kind it became (29-2a:
 * the countdown). A Dashboard that holds the old kind — in this device's
 * storage or the cloud's document — gets the real block in the same place,
 * never beside it (`upgradeBlocks`), Stack pages included.
 */
export const RENAMED_KINDS: Readonly<Record<string, BlockKind>> = {
  'sample-countdown': 'countdown',
};

/** A stored kind as this build knows it: a renamed one becomes what it was renamed to. */
export function upgradeKind(kind: string): string {
  return RENAMED_KINDS[kind] ?? kind;
}

/** Every block's kind upgraded, and every Stack page's. Nothing else is touched. */
export function upgradeBlocks(blocks: readonly DashboardBlock[]): DashboardBlock[] {
  return blocks.map((block) => {
    const kind = upgradeKind(block.kind) as BlockKind;
    const pages = block.settings?.pages;
    const upPages = Array.isArray(pages) && pages.some((p) => p && p.kind in RENAMED_KINDS)
      ? pages.map((p) => ({ ...p, kind: upgradeKind(p.kind) as BlockKind }))
      : pages;
    if (kind === block.kind && upPages === pages) return block;
    return { ...block, kind, ...(upPages !== pages ? { settings: { ...block.settings, pages: upPages } } : {}) };
  });
}

/** What a project-progress block measures. His call: tasks by default, hours on a second line. */
export type ProgressMetric = 'tasks' | 'hours' | 'money';

/**
 * How a block's pane is drawn (29-1P12, ideas 81 and 147), from its ⚙:
 * the app's glass, a lamp glowing down from the top, glass with a wash of
 * colour, or the whole block in colour — for the one block he wants to shout.
 */
export type BlockLook = 'glass' | 'lamp' | 'tint' | 'full';
export const BLOCK_LOOKS: readonly BlockLook[] = ['glass', 'lamp', 'tint', 'full'];

/** BASE's ten colours (`ui/core/colourJobs.ts`), repeated here so this file stays free of React. */
export const LOOK_COLOURS = ['orange', 'emerald', 'lime', 'gold', 'coral', 'rose', 'violet', 'sky', 'teal', 'indigo'] as const;
export type LookColour = (typeof LOOK_COLOURS)[number];

export interface BlockSettings {
  /** project-progress: which project. Absent = the busiest open one, chosen at draw time. */
  projectId?: string;
  metric?: ProgressMetric;
  /** Absent = glass. */
  look?: BlockLook;
  /** Absent = the block's own colour, by its job (`BLOCK_COLOUR`). */
  colour?: LookColour;
  /** stack: its pages and when each comes up. Absent = `DEFAULT_STACK`. */
  pages?: StackPage[];
  /** quick-add: the list its lines become tasks in. Absent = Action Steps (`lib/dashboard/quickAdd.ts`). */
  listId?: string;
  /** quick-add: what he has jotted and not yet turned into tasks. Synced, so the tablet sees the laptop's note. */
  note?: string;
  /** timeline: today, three days or the week. Absent = today (`lib/dashboard/timeline.ts`). */
  range?: TimelineRange;
  /** countdown: the event it counts to. Absent = the soonest coming one (`lib/events/events.ts`). */
  eventId?: string;
  /** countdown (29-2b): how it draws the event. Absent = minimal (`countdownFace`). */
  face?: CountdownFace;
  /* 29-2d2: a countdown may count to a task or a date instead (`lib/dashboard/countdownTarget.ts`);
     a pick in the ⚙ clears the other two, and a taskId wins, then a date, then the event. */
  /** countdown: the task it counts to, to its deadline. */
  taskId?: string;
  /** countdown: a date he picked, `YYYY-MM-DD`, with the name he typed (absent = the date itself). */
  date?: string;
  dateName?: string;
  /** countdown: when he picked the date (ms) — where the Journey line starts. */
  dateSince?: number;
  /** countdown: show what is due before it, in place of the next events. Absent = off. */
  dueBefore?: boolean;
}

/**
 * One page of a Stack (idea 133, 29-1P13): a block kind, and the hour of the
 * day from which the stack turns to it on its own. A page is a kind and
 * nothing else — a project-progress page follows the busiest project.
 */
export interface StackPage {
  kind: BlockKind;
  /** 0-23, local time. */
  from: number;
}

export interface DashboardBlock {
  id: string;
  kind: BlockKind;
  /** Width in cells of the canonical grid, 1..GRID_COLUMNS. */
  w: number;
  /** Height in rows, 1..MAX_ROWS. */
  h: number;
  settings?: BlockSettings;
}

export interface BlockSpec {
  kind: BlockKind;
  title: string;
  /** One line for the widget gallery. */
  blurb: string;
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
}

/** The canonical width: four cells on the laptop and a landscape tablet. */
export const GRID_COLUMNS = 4;
/** Tallest a block can be dragged. Three rows is most of a tablet screen. */
export const MAX_ROWS = 3;

export const BLOCK_SPECS: Record<BlockKind, BlockSpec> = {
  'one-thing': {
    kind: 'one-thing',
    title: 'Do this one thing',
    blurb: 'The task to do next, with two after it.',
    minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  today: {
    kind: 'today',
    title: 'Today',
    blurb: 'What is due today, done against remaining.',
    minW: 1, minH: 1, defaultW: 2, defaultH: 1,
  },
  'next-deadline': {
    kind: 'next-deadline',
    title: 'Next deadline',
    blurb: 'A live countdown to the nearest one.',
    minW: 1, minH: 1, defaultW: 1, defaultH: 1,
  },
  overdue: {
    kind: 'overdue',
    title: 'Overdue',
    blurb: 'The pile, and the oldest in it.',
    minW: 1, minH: 1, defaultW: 1, defaultH: 1,
  },
  'project-progress': {
    kind: 'project-progress',
    title: 'Project progress',
    blurb: 'One project: done against the rest.',
    minW: 1, minH: 1, defaultW: 2, defaultH: 1,
  },
  'hours-today': {
    kind: 'hours-today',
    title: 'Hours today',
    blurb: 'Hours worked against hours you have. Log time by hand here.',
    minW: 1, minH: 1, defaultW: 2, defaultH: 1,
  },
  'focus-week': {
    kind: 'focus-week',
    title: 'Focus this week',
    blurb: 'A bar a day against the hours you had.',
    minW: 2, minH: 1, defaultW: 2, defaultH: 1,
  },
  'focus-timer': {
    kind: 'focus-timer',
    title: 'Focus timer',
    blurb: 'The session running now, with pause.',
    minW: 1, minH: 1, defaultW: 1, defaultH: 1,
  },
  /* Two by two at least: the one-thing card, its first page, needs that. */
  stack: {
    kind: 'stack',
    title: 'Stack',
    blurb: 'Several widgets in one spot, turning to the right one for the time of day.',
    minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  'waiting-on': {
    kind: 'waiting-on',
    title: 'Waiting on',
    blurb: 'Tasks someone else is doing, and how long you have waited.',
    minW: 2, minH: 1, defaultW: 2, defaultH: 2,
  },
  runway: {
    kind: 'runway',
    title: 'Deadlines runway',
    blurb: 'Every deadline in the next two weeks, sliding towards today.',
    minW: 2, minH: 1, defaultW: 4, defaultH: 1,
  },
  /* Two tall at least: a note of one line is a text box, not a block. */
  'quick-add': {
    kind: 'quick-add',
    title: 'Jot it down',
    blurb: 'A note: one thing per line, then one tap makes each line a task.',
    minW: 1, minH: 2, defaultW: 2, defaultH: 2,
  },
  /* Two by two at least: a column of hours needs the height, the arrows the width. */
  timeline: {
    kind: 'timeline',
    title: 'Timeline',
    blurb: 'Your day in hours, with a line for now. Swipe for the next day.',
    minW: 2, minH: 2, defaultW: 2, defaultH: 2,
  },
  countdown: {
    kind: 'countdown',
    title: 'Countdown',
    blurb: 'Days and hours to an event, a task or a date, and what is due before it. Passed events wait in its archive.',
    minW: 1, minH: 1, defaultW: 2, defaultH: 1,
  },
  /* Two wide at least: a row of thirty days needs the width. */
  'sample-streak': {
    kind: 'sample-streak',
    title: 'Streak',
    blurb: 'Sample: a habit\'s days in a row and its last 30 days. The real one comes with habits.',
    minW: 2, minH: 1, defaultW: 2, defaultH: 1,
  },
  /* Two tall at least: a routine is a list. */
  'sample-routine': {
    kind: 'sample-routine',
    title: "Today's routine",
    blurb: 'Sample: your routine in time order, done, missed or still to come. The real one comes with habits.',
    minW: 1, minH: 2, defaultW: 2, defaultH: 2,
  },
  'sample-morning': {
    kind: 'sample-morning',
    title: 'Morning note',
    blurb: "Sample: Atlas's note on your day, written the first time you open BASE each morning.",
    minW: 2, minH: 1, defaultW: 2, defaultH: 1,
  },
};

/**
 * Each block's own colour, by what it is about (one colour, one job): what a
 * lamp or a tint starts in, and the colour of a block's giant glyph (idea 86).
 */
export const BLOCK_COLOUR: Record<BlockKind, LookColour> = {
  'one-thing': 'orange',
  today: 'lime',
  'next-deadline': 'sky',
  overdue: 'coral',
  'project-progress': 'emerald',
  'hours-today': 'teal',
  'focus-week': 'teal',
  'focus-timer': 'teal',
  /* What is current: the page for now. */
  stack: 'lime',
  /* Someone is working on it right now — live. */
  'waiting-on': 'emerald',
  runway: 'sky',
  /* Adding is the floating +'s colour: lime. */
  'quick-add': 'lime',
  /* Dates and the calendar are sky's. */
  timeline: 'sky',
  /* A countdown is a date: sky. A habit is routine: rose. Atlas is violet. */
  countdown: 'sky',
  'sample-streak': 'rose',
  'sample-routine': 'rose',
  'sample-morning': 'violet',
};

/**
 * The look and colour a block is drawn in. A value the cloud document carries
 * that this build does not know (a newer device, a hand edit) draws as the
 * default rather than as nothing. The one-thing block is all hero picture, so
 * it is always glass.
 */
export function blockLook(block: Pick<DashboardBlock, 'kind' | 'settings'>): { look: BlockLook; colour: LookColour } {
  const s = block.settings;
  const look = block.kind !== 'one-thing' && s?.look && BLOCK_LOOKS.includes(s.look) ? s.look : 'glass';
  const colour = s?.colour && (LOOK_COLOURS as readonly string[]).includes(s.colour) ? s.colour : BLOCK_COLOUR[block.kind];
  return { look, colour };
}

/** The gallery's order. */
export const BLOCK_KINDS: BlockKind[] = [
  'one-thing', 'stack', 'today', 'timeline', 'quick-add', 'hours-today', 'focus-week', 'focus-timer', 'next-deadline', 'countdown',
  'runway', 'overdue', 'waiting-on', 'project-progress',
  /* Last, under their own heading: what is coming (29-1c4). */
  'sample-morning', 'sample-streak', 'sample-routine',
];

// ─── The Stack (idea 133) ───────────────────────────────────────────────────

/**
 * A new Stack, his call (2026-10-06): the one thing in the morning, the hours
 * in the afternoon, today's tasks in the evening. The routine joins when
 * habits land (29-3).
 */
export const DEFAULT_STACK: readonly StackPage[] = [
  { kind: 'one-thing', from: 5 },
  { kind: 'hours-today', from: 12 },
  { kind: 'today', from: 17 },
];

/**
 * What a Stack cannot hold: another stack, and the quick-add note (29-1c1) —
 * a page is drawn without settings of its own, so a note typed there would
 * have nowhere to be kept.
 */
export const NOT_A_PAGE: ReadonlySet<BlockKind> = new Set<BlockKind>(['stack', 'quick-add']);

/** Most pages one stack holds: a dot each fits down its edge. */
export const MAX_STACK_PAGES = 5;

/**
 * A stack's pages, earliest first. A page this build does not know (a newer
 * device), a stack inside a stack and a second page at the same hour are
 * dropped rather than drawn as nothing; none left is the default.
 */
export function stackPages(block: Pick<DashboardBlock, 'settings'>): StackPage[] {
  const raw = block.settings?.pages;
  if (!Array.isArray(raw)) return [...DEFAULT_STACK];
  const seen = new Set<number>();
  const pages = raw
    .filter((p): p is StackPage =>
      !!p && p.kind in BLOCK_SPECS && !NOT_A_PAGE.has(p.kind) && Number.isInteger(p.from) && p.from >= 0 && p.from <= 23)
    .sort((a, b) => a.from - b.from)
    .filter((p) => (seen.has(p.from) ? false : (seen.add(p.from), true)))
    .slice(0, MAX_STACK_PAGES);
  return pages.length > 0 ? pages : [...DEFAULT_STACK];
}

/**
 * The page for this hour: the last one that has started. Before the first
 * page's hour it is still yesterday's last page — at 2 am the evening page.
 */
export function stackPageAt(pages: readonly StackPage[], hour: number): number {
  if (pages.length === 0) return 0;
  let at = pages.length - 1;
  for (let i = 0; i < pages.length; i++) if (pages[i].from <= hour) at = i;
  return at;
}

export function clampSize(kind: BlockKind, w: number, h: number): { w: number; h: number } {
  const spec = BLOCK_SPECS[kind];
  return {
    w: Math.min(GRID_COLUMNS, Math.max(spec.minW, Math.round(w))),
    h: Math.min(MAX_ROWS, Math.max(spec.minH, Math.round(h))),
  };
}

/**
 * What a Dashboard starts with when nothing else built one: a new account's
 * three questions (`lib/dashboard/firstRun.ts`, 29-1c4) build their own, and
 * this is what Skip keeps. The "one thing" leads, as the scoping put it.
 */
export function defaultLayout(makeId: () => string): DashboardBlock[] {
  const make = (kind: BlockKind): DashboardBlock => {
    const spec = BLOCK_SPECS[kind];
    return { id: makeId(), kind, w: spec.defaultW, h: spec.defaultH };
  };
  return [
    make('one-thing'), make('today'), make('hours-today'), make('next-deadline'), make('overdue'),
    make('focus-week'), make('project-progress'),
  ];
}

/** How many columns a grid this many CSS pixels wide gets. */
export function columnsFor(width: number): number {
  if (width >= 900) return 4;
  if (width >= 520) return 2;
  return 1;
}

export interface Placement {
  id: string;
  /** Column, 0-based. */
  x: number;
  /** Row, 0-based. */
  y: number;
  /** Width as drawn at this column count. */
  w: number;
  h: number;
}

/**
 * First-fit packing in list order: each block takes the first free spot,
 * reading row by row, left to right, where its whole shape fits. A later small
 * block can fill a gap a big one left — that is what keeps the grid from
 * growing holes — but a block never jumps ahead of one before it in the same
 * row it could have shared, because the scan is in reading order.
 */
export function packBlocks(blocks: readonly DashboardBlock[], columns: number): Placement[] {
  const cols = Math.max(1, columns);
  const taken: boolean[][] = [];
  const free = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) {
      for (let c = x; c < x + w; c++) if (taken[r]?.[c]) return false;
    }
    return true;
  };
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let r = y; r < y + h; r++) {
      taken[r] ??= [];
      for (let c = x; c < x + w; c++) taken[r][c] = true;
    }
  };

  return blocks.map((block) => {
    const w = Math.min(block.w, cols);
    const h = block.h;
    for (let y = 0; ; y++) {
      for (let x = 0; x + w <= cols; x++) {
        if (free(x, y, w, h)) {
          mark(x, y, w, h);
          return { id: block.id, x, y, w, h };
        }
      }
    }
  });
}

/** Rows the packed grid occupies. */
export function rowsUsed(placements: readonly Placement[]): number {
  return placements.reduce((max, p) => Math.max(max, p.y + p.h), 0);
}

/** `blocks` with `id` moved to `toIndex` (an index into the result). */
export function moveBlock(blocks: readonly DashboardBlock[], id: string, toIndex: number): DashboardBlock[] {
  const from = blocks.findIndex((b) => b.id === id);
  if (from < 0) return [...blocks];
  const next = blocks.filter((b) => b.id !== id);
  const at = Math.max(0, Math.min(next.length, toIndex));
  next.splice(at, 0, blocks[from]);
  return next;
}

export interface GridMetrics {
  columns: number;
  /** Width of one column, px. */
  cell: number;
  /** Height of one row, px. */
  row: number;
  gap: number;
}

/**
 * Where a held block would go if dropped with the pointer at (`px`, `py`),
 * measured from the grid's top-left — as an index into the order with the
 * held block taken out, or `null` for "leave it where it is".
 *
 * **The held block's own ghost is a dead zone.** After a move the ghost is
 * drawn where the pointer is, so reading the pointer against the new layout
 * lands on the ghost and changes nothing. Without that, two blocks of
 * different sizes swap back and forth on every frame the pointer rests between
 * them — the flicker every hand-rolled grid drag has at first.
 *
 * Over another block, the pointer's side of it decides: the leading half puts
 * the held block before it, the trailing half after. Over an empty cell it
 * goes before the first block that comes later in reading order, or last.
 */
export function dropIndexAt(
  preview: readonly DashboardBlock[],
  heldId: string,
  px: number,
  py: number,
  m: GridMetrics,
): number | null {
  const placements = packBlocks(preview, m.columns);
  const col = Math.floor(px / (m.cell + m.gap));
  const row = Math.floor(py / (m.row + m.gap));
  if (col < 0 || row < 0 || col >= m.columns) return null;

  const hit = placements.find((p) => col >= p.x && col < p.x + p.w && row >= p.y && row < p.y + p.h);
  const others = preview.filter((b) => b.id !== heldId);

  if (hit) {
    if (hit.id === heldId) return null;
    const index = others.findIndex((b) => b.id === hit.id);
    const left = hit.x * (m.cell + m.gap);
    const width = hit.w * m.cell + (hit.w - 1) * m.gap;
    const trailing = px - left > width / 2;
    return trailing ? index + 1 : index;
  }

  /* An empty cell: before the first block that starts after it, reading row by row. */
  const later = placements.find((p) => p.id !== heldId && (p.y > row || (p.y === row && p.x > col)));
  if (!later) return others.length;
  return others.findIndex((b) => b.id === later.id);
}

/**
 * The size a corner drag has reached: the block's size when the drag began,
 * plus however many whole cells the pointer has travelled, rounded to the
 * nearest — so it snaps as it passes the middle of a cell, not its far edge.
 *
 * `start` is the **stored** size. On a screen narrower than the canonical grid
 * the block is drawn narrower than it is stored, so the drag is measured from
 * the drawn width — and a drag that ends at the drawn width keeps the stored
 * one. Otherwise making a four-wide block taller on the upright tablet would
 * quietly make it two wide on the laptop too.
 */
export function resizedSize(
  kind: BlockKind,
  start: { w: number; h: number },
  dx: number,
  dy: number,
  m: GridMetrics,
): { w: number; h: number } {
  const drawn = Math.min(start.w, m.columns);
  const size = clampSize(kind, drawn + dx / (m.cell + m.gap), start.h + dy / (m.row + m.gap));
  const w = Math.min(size.w, m.columns);
  return { w: w === drawn ? start.w : w, h: size.h };
}
