/**
 * Finding an icon by name (29-1P8a2, idea 150) — pure, so the ranking is
 * tested. The rows are the catalogue's (`catalog.generated.ts`): a Phosphor
 * name and its search words (Phosphor's own tags plus its categories).
 *
 * A name beats a tag, the start of a word beats the middle: typing "car"
 * puts `car` and `car-profile` before `credit-card` and `scarf`.
 */

export interface SearchRow {
  readonly 0: string;
  readonly 1: string;
}

/**
 * What the picker shows before he types: things a project is about. Every
 * name is checked against the catalogue by `search.test.ts`.
 */
export const POPULAR_ICONS = [
  'rocket-launch', 'briefcase', 'folder-simple', 'house', 'buildings', 'storefront', 'target',
  'lightning', 'star', 'heart', 'sparkle', 'fire', 'trophy', 'flag', 'lightbulb', 'brain',
  'book-open', 'graduation-cap', 'pen-nib', 'notebook', 'code', 'terminal-window', 'database',
  'paint-brush', 'palette', 'camera', 'film-slate', 'music-notes', 'microphone', 'headphones',
  'game-controller', 'puzzle-piece', 'barbell', 'person-simple-run', 'bicycle', 'heartbeat',
  'leaf', 'plant', 'tree', 'mountains', 'sun', 'moon', 'globe-hemisphere-west', 'airplane',
  'car', 'map-trifold', 'coffee', 'cooking-pot', 'shopping-cart', 'gift', 'money', 'bank',
  'chart-line-up', 'calendar', 'users-three', 'handshake', 'baby', 'dog', 'cat', 'wrench',
  'hammer', 'gear-six', 'diamond', 'crown', 'shield-check', 'megaphone', 'envelope-simple',
  'chat-circle', 'calculator', 'scales', 'first-aid-kit', 'package', 'truck', 'anchor',
] as const;

/** Up to `limit` names that match `query`, best first. An empty query matches nothing. */
export function searchIcons(rows: readonly SearchRow[], query: string, limit: number): string[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored: { name: string; score: number }[] = [];
  for (const row of rows) {
    const name = row[0];
    const words = row[1];
    let score = 0;
    let all = true;
    for (const term of terms) {
      const s = termScore(name, words, term);
      if (s === 0) { all = false; break; }
      score += s;
    }
    if (all) scored.push({ name, score });
  }
  /* Shorter names first among equals: `car` before `car-battery`. */
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map((s) => s.name);
}

function termScore(name: string, words: string, term: string): number {
  if (name === term) return 100;
  const parts = name.split('-');
  if (parts.includes(term)) return 60;
  if (name.startsWith(term)) return 50;
  if (parts.some((p) => p.startsWith(term))) return 40;
  const tags = words.split(' ');
  if (tags.includes(term)) return 30;
  if (tags.some((t) => t.startsWith(term))) return 20;
  if (name.includes(term)) return 10;
  if (term.length >= 3 && words.includes(term)) return 5;
  return 0;
}

/**
 * A few icons the project's own name suggests — "Gym plan" offers a barbell
 * before he types anything. Each word of three letters or more is searched
 * on its own, its best two kept; the name's words are not stop-listed, so
 * "plan" may add a clipboard, which is no worse than nothing.
 */
export function suggestFromName(rows: readonly SearchRow[], projectName: string, limit: number): string[] {
  const out: string[] = [];
  for (const word of projectName.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length < 3) continue;
    for (const name of searchIcons(rows, word, 2)) if (!out.includes(name)) out.push(name);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}
