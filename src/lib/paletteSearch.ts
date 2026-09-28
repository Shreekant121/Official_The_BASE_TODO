/**
 * What the command palette finds, and in what order (BUILD-9).
 *
 * Pure — no store, no React, no clock — so `paletteSearch.test.ts` can hold
 * the ranking. `components/CommandPaletteHost.tsx` turns tasks, lists, projects
 * and commands into `PaletteEntry` rows, hands them here with what was typed,
 * and draws what comes back.
 *
 * **The scope is his call and is deliberately narrow**: tasks, lists and
 * projects by name and description, plus commands. Not the catalog and not
 * chat history — both live on the laptop, and a search that comes back empty
 * because the laptop is asleep reads as broken when it is not. Everything
 * searched here is already in this browser.
 *
 * THE RULE
 *   Every word typed has to appear somewhere in the entry — its name, its
 *   description or its keywords — or the entry is out. "call gst" finds
 *   "Call the CA" when GST is in its description; it does not find "Call the
 *   plumber". A word may be the start of a longer one — "ca" is in "Call" —
 *   which is how a half-typed word keeps matching. Each word then scores
 *   by *where* it landed, best first:
 *     the whole name                 100
 *     the start of the name           80
 *     the start of a word in the name 60
 *     anywhere in the name            40
 *     the start of a word elsewhere   20
 *     anywhere else                   10
 *   and the entry's score is the sum. A finished task drops a fixed amount,
 *   so an open task beats a finished one of the same name and a finished one
 *   still turns up — he may be looking for what he already did.
 *
 *   Ties go to kind (task, project, list, command), then to the order the
 *   entries were handed in — the sort is stable — so the order never shuffles
 *   between two keystrokes, and "focus" puts Smart Start, the first command,
 *   above New session rather than below it on the alphabet.
 */

export type PaletteKind = 'task' | 'project' | 'list' | 'command';

export interface PaletteEntry {
  /** Unique within its kind. */
  id: string;
  kind: PaletteKind;
  name: string;
  description?: string;
  /** Searched like the description, never shown. How "focus" finds Smart Start. */
  keywords?: string;
  /** A completed task: still found, ranked below an open one. */
  done?: boolean;
}

/** How many of each kind come back, at most. Commands are few enough to show whole. */
export const PALETTE_LIMITS: Record<PaletteKind, number> = {
  task: 8,
  project: 4,
  list: 4,
  command: 12,
};

const KIND_ORDER: Record<PaletteKind, number> = { task: 0, project: 1, list: 2, command: 3 };

/** What a finished task gives up against an open one. More than any one word earns. */
const DONE_PENALTY = 120;

/** Lower case, accents off, runs of space collapsed — "Café  Menu" is "cafe menu". */
export function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(query: string): string[] {
  const n = normalise(query);
  return n === '' ? [] : n.split(' ');
}

/** True when `token` starts a word in `text` — after the start or a non-letter. */
function startsAWord(text: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at === -1) return false;
    if (at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1])) return true;
    from = at + 1;
  }
}

/** The entry's score against the typed words, or `null` when a word is missing. */
export function scoreEntry(entry: PaletteEntry, tokens: string[]): number | null {
  const name = normalise(entry.name);
  const rest = normalise(`${entry.description ?? ''} ${entry.keywords ?? ''}`);
  let total = 0;

  for (const token of tokens) {
    let best = 0;
    if (name === token) best = 100;
    else if (name.startsWith(token)) best = 80;
    else if (startsAWord(name, token)) best = 60;
    else if (name.includes(token)) best = 40;
    else if (startsAWord(rest, token)) best = 20;
    else if (rest.includes(token)) best = 10;
    if (best === 0) return null;
    total += best;
  }

  /* The whole phrase as he typed it, when it is more than one word: "call
     the ca" should put "Call the CA" above "the CA call list". */
  if (tokens.length > 1) {
    const phrase = tokens.join(' ');
    if (name === phrase) total += 100;
    else if (name.startsWith(phrase)) total += 50;
    else if (name.includes(phrase)) total += 25;
  }

  return entry.done ? total - DONE_PENALTY : total;
}

/**
 * The entries that match `query`, best first, each kind capped by `limits`.
 *
 * An empty query returns the commands alone, in the order they were given —
 * the palette opened with nothing typed is a menu of things to do, not a dump
 * of every task.
 */
export function searchPalette(
  entries: PaletteEntry[],
  query: string,
  limits: Record<PaletteKind, number> = PALETTE_LIMITS,
): PaletteEntry[] {
  const tokens = tokensOf(query);
  if (tokens.length === 0) {
    return entries.filter((e) => e.kind === 'command').slice(0, limits.command);
  }

  const scored: { entry: PaletteEntry; score: number }[] = [];
  for (const entry of entries) {
    const score = scoreEntry(entry, tokens);
    if (score !== null) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind]);

  const taken: Record<PaletteKind, number> = { task: 0, project: 0, list: 0, command: 0 };
  const out: PaletteEntry[] = [];
  for (const { entry } of scored) {
    if (taken[entry.kind] >= limits[entry.kind]) continue;
    taken[entry.kind] += 1;
    out.push(entry);
  }
  return out;
}

const QUESTION_WORDS = new Set([
  'what', 'whats', "what's", 'when', 'where', 'which', 'who', 'why', 'how',
  'is', 'are', 'am', 'can', 'could', 'should', 'would', 'will', 'do', 'does', 'did',
  'add', 'create', 'make', 'remind', 'schedule', 'move', 'plan', 'find', 'tell', 'show', 'help',
]);

/**
 * Whether what he typed reads as something to ask Atlas rather than a name
 * to look up — a question mark, or a question or instruction word first
 * ("what's due", "add a task to call the CA"). Then the Ask Atlas row goes
 * to the top instead of the bottom. A guess, and a cheap one to get wrong:
 * both rows are always there, only which is highlighted first changes.
 */
export function looksLikeQuestion(query: string): boolean {
  const n = normalise(query);
  if (n === '') return false;
  if (n.endsWith('?')) return true;
  const words = n.split(' ');
  return words.length >= 3 && QUESTION_WORDS.has(words[0]);
}
