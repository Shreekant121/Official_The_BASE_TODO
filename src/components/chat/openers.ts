/**
 * The empty chat's three openers, from a pool (OPT-9).
 *
 * *"In the Ai page I would like if instead of seeing same 3 mockups message on
 * the page there were only 3 shown but different most of the times"* — his
 * BASE list, 2026-10-06. So each pool holds more than three, and every time
 * the empty chat is drawn afresh (opening the app, New chat) it shows the next
 * three.
 *
 * **"Next", not random, and that is what makes it testable and photographable.**
 * A device counts its visits (`base.chat.openerVisit`, localStorage, never
 * synced — which openers a tablet showed is nothing to the laptop). Visit *v*
 * shows three consecutive entries of one shuffled order of the pool; when a
 * pass through the pool runs out, the next pass is shuffled differently. So
 * two visits in a row never show the same three, and every opener comes round
 * before any comes back. **Pass 0 is the pool in written order**, so the first
 * visit on a fresh device — which is every shot the harness takes — is still
 * the three the screen always showed.
 *
 * The kept screen stays mounted while he is away, so leaving the AI tab with a
 * chat still empty and coming back is the same visit. That is the one case
 * that repeats, and it is the "most of the times" he allowed.
 */
import type { IconName } from '../../ui';

export interface Opener {
  icon: IconName;
  text: string;
}

/** How many are on the screen. */
export const SHOWN = 3;

/**
 * For an Atlas with hands — the usual case. The glyph says what kind of thing
 * each one is (read, write, find), which he asked for by name at UI-33.
 * The first three are the screen's original three, in their order.
 */
export const OPENERS: Opener[] = [
  { icon: 'list-checks', text: 'What am I doing today?' },
  { icon: 'plus', text: 'Add a task to call the CA, due Thursday 6pm' },
  { icon: 'clock', text: 'What’s overdue?' },
  { icon: 'calendar', text: 'What’s due this week?' },
  { icon: 'target', text: 'What should I start with right now?' },
  { icon: 'repeat', text: 'Remind me to pay rent on the 1st of every month' },
  { icon: 'folder-kanban', text: 'Which project has slipped the most?' },
  { icon: 'hourglass', text: 'What can I finish in 30 minutes?' },
  { icon: 'list-tree', text: 'Break my biggest task into steps' },
  { icon: 'users', text: 'What am I waiting on from other people?' },
  { icon: 'flame', text: 'What’s urgent that I haven’t started?' },
  { icon: 'calendar-clock', text: 'Plan my afternoon around my deadlines' },
];

/**
 * For an Atlas whose tools did not connect (item 9): things it can do with
 * no hands — think, draft, decompose. The first three are the original three.
 */
export const HANDS_FREE_OPENERS: Opener[] = [
  { icon: 'list-checks', text: 'Break "file the GST return" into the steps it actually takes' },
  { icon: 'pencil', text: 'Draft a short message chasing an overdue invoice' },
  { icon: 'clock', text: 'I have three hours and four jobs. Help me decide the order.' },
  { icon: 'pencil', text: 'Write a polite reply turning down a meeting' },
  { icon: 'target', text: 'Help me pick three goals for this month' },
  { icon: 'list-tree', text: 'Turn a messy idea into a short checklist' },
  { icon: 'file-text', text: 'Summarise a long message I paste in' },
  { icon: 'brain', text: 'Talk me through a week with too much in it' },
  { icon: 'pencil', text: 'Draft a message asking a client for a deadline' },
];

/** A small seeded generator (mulberry32): the same pass always shuffles the same way. */
function seeded(seed: number): () => number {
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
 * The pool's order for every pass up to `pass`. Pass 0 is the order it is
 * written in; each later one is shuffled, then **its first three are kept
 * clear of the last three of the pass before**, so the visit either side of a
 * pass boundary never repeats an opener — a shuffle alone put the same three
 * on two visits in a row.
 */
function ordersUpTo(size: number, pass: number): number[][] {
  const orders = [Array.from({ length: size }, (_, i) => i)];
  for (let p = 1; p <= pass; p++) {
    const order = Array.from({ length: size }, (_, i) => i);
    const random = seeded(p * 2654435761);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const tail = orders[p - 1].slice(-SHOWN);
    for (let head = 0; head < SHOWN; head++) {
      if (!tail.includes(order[head])) continue;
      const swap = order.findIndex((entry, at) => at >= SHOWN && !tail.includes(entry));
      [order[head], order[swap]] = [order[swap], order[head]];
    }
    orders.push(order);
  }
  return orders;
}

/** The three for visit `visit` (0-based): the next three of one long run of passes. */
export function pickOpeners(pool: Opener[], visit: number): Opener[] {
  if (pool.length <= SHOWN * 2) return pool.slice(0, SHOWN);
  const start = Math.max(0, Math.floor(visit)) * SHOWN;
  const orders = ordersUpTo(pool.length, Math.floor((start + SHOWN - 1) / pool.length));
  return Array.from({ length: SHOWN }, (_, k) => {
    const slot = start + k;
    return pool[orders[Math.floor(slot / pool.length)][slot % pool.length]];
  });
}

const VISIT_KEY = 'base.chat.openerVisit';

/** This device's visit count. 0 when storage is unreadable, which is the original three. */
export function readOpenerVisit(): number {
  try {
    const raw = Number(localStorage.getItem(VISIT_KEY));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  } catch {
    return 0;
  }
}

/** Written as an absolute number, so a second call for the same visit changes nothing. */
export function writeOpenerVisit(next: number): void {
  try {
    localStorage.setItem(VISIT_KEY, String(next));
  } catch {
    // A private window: every visit is the first, which is the old screen.
  }
}
