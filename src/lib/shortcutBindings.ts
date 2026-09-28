/**
 * BUILD-10 — which key does what, once he can change it.
 *
 * Pure: no React, no storage, no clock. `contexts/ShortcutsContext.tsx` holds
 * the keyboard and the sheet; this is the rulebook both read, so a key the
 * sheet accepts is exactly a key the registry will answer.
 *
 * WHAT CAN MOVE — his call, 2026-09-22: "B now, C later"
 *   - **The single keys screens register can be rebound.** They are the
 *     catalog below, by id, so a screen names the action and never the key.
 *     New task and New list are one action each even though two screens
 *     register them: he thinks of "the new-task key", not of two.
 *   - **He can add his own**: any command the palette offers (Smart Start, Go
 *     to Score, Dock mode…) on a key of his, live on every screen.
 *   - **The `g` sequences stay fixed.** User-defined two-key sequences produce
 *     conflicts he would then have to debug. That is also why `g` itself can
 *     never be taken: it is the first half of all four.
 *
 * WHY A CLASH IS REFUSED RATHER THAN SWAPPED
 *   The registry answers the first match, so two bindings live on one screen
 *   under one key means one of them silently never fires. Refusing, and
 *   naming what holds the key, is the only version of that he can see.
 *   Two bindings clash only where both are live: New task on `n` and a Home
 *   action on `n` never meet. His own shortcuts are live everywhere, so they
 *   clash with anything.
 */

/** Where a binding is live. His own shortcuts are `anywhere`. */
export type ShortcutPlace = 'home' | 'session' | 'project' | 'anywhere';

export interface BuiltInShortcut {
  label: string;
  /** The key it ships on. `keys[id]` in his prefs overrides it. */
  key: string;
  where: ShortcutPlace[];
}

/** Every single-key action a screen registers. Add one here, then register it by id. */
export const BUILT_IN_SHORTCUTS = {
  'new-project': { label: 'New project', key: 'p', where: ['home'] },
  'smart-start': { label: 'Smart Start', key: 's', where: ['home'] },
  'new-task': { label: 'New task', key: 'n', where: ['session', 'project'] },
  'new-list': { label: 'New list', key: 'l', where: ['session', 'project'] },
} as const satisfies Record<string, BuiltInShortcut>;

export type BuiltInShortcutId = keyof typeof BUILT_IN_SHORTCUTS;

export const BUILT_IN_IDS = Object.keys(BUILT_IN_SHORTCUTS) as BuiltInShortcutId[];

/** One shortcut of his own: a palette command on a key. */
export interface CustomShortcut {
  id: string;
  /** A palette command id (`components/paletteCommands.ts`). */
  command: string;
  key: string;
}

export interface ShortcutPrefs {
  /** Only the ones he moved. A key back on its default is removed, not stored. */
  keys: Partial<Record<BuiltInShortcutId, string>>;
  custom: CustomShortcut[];
}

export const EMPTY_PREFS: ShortcutPrefs = { keys: {}, custom: [] };

/** Never bindable: `g` opens the go-to sequences, `?` this sheet. */
const RESERVED: Record<string, string> = {
  g: 'G starts the go-to sequences, so it can’t be used on its own.',
  '?': '? opens this sheet.',
};

/**
 * A keypress as the registry will compare it — lower case, one character —
 * or null for anything that is not one printable character (Escape, Enter,
 * Tab, the arrows, Space, a dead key). The registry lowercases `e.key` the
 * same way, which is why Shift+P and P are one key here.
 */
export function normaliseKey(raw: string): string | null {
  if (raw.length !== 1 || raw.trim() === '') return null;
  return raw.toLowerCase();
}

/** How a key is drawn on a keycap. */
export function keyCap(key: string): string {
  return key.toUpperCase();
}

export function builtInKey(prefs: ShortcutPrefs, id: BuiltInShortcutId): string {
  return prefs.keys[id] ?? BUILT_IN_SHORTCUTS[id].key;
}

/** Which binding a check is for — the one being changed is never its own clash. */
export type ShortcutRef = { kind: 'built-in'; id: BuiltInShortcutId } | { kind: 'custom'; id: string };

interface LiveBinding {
  ref: ShortcutRef;
  key: string;
  label: string;
  where: readonly ShortcutPlace[];
}

function liveBindings(prefs: ShortcutPrefs, commandName: (command: string) => string | undefined): LiveBinding[] {
  const out: LiveBinding[] = BUILT_IN_IDS.map((id) => ({
    ref: { kind: 'built-in', id },
    key: builtInKey(prefs, id),
    label: BUILT_IN_SHORTCUTS[id].label,
    where: BUILT_IN_SHORTCUTS[id].where,
  }));
  for (const c of prefs.custom) {
    out.push({ ref: { kind: 'custom', id: c.id }, key: c.key, label: commandName(c.command) ?? 'a shortcut of yours', where: ['anywhere'] });
  }
  return out;
}

function overlaps(a: readonly ShortcutPlace[], b: readonly ShortcutPlace[]): boolean {
  if (a.includes('anywhere') || b.includes('anywhere')) return true;
  return a.some((p) => b.includes(p));
}

const PLACE_NAME: Record<ShortcutPlace, string> = {
  home: 'Home',
  session: 'New Session',
  project: 'project boards',
  anywhere: 'everywhere',
};

/** "on Home", "on New Session and project boards", "everywhere". */
export function placePhrase(where: readonly ShortcutPlace[]): string {
  if (where.includes('anywhere')) return PLACE_NAME.anywhere;
  const names = where.map((p) => PLACE_NAME[p]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `on ${list}`;
}

function sameRef(a: ShortcutRef, b: ShortcutRef): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * Why `key` cannot go on `ref`, in a sentence for him — or null when it can.
 * `where` is where `ref` would be live; for a built-in it is read from the
 * catalog, for one of his (including one not added yet) it is everywhere.
 */
export function refusal(
  prefs: ShortcutPrefs,
  ref: ShortcutRef,
  key: string,
  commandName: (command: string) => string | undefined,
): string | null {
  if (RESERVED[key]) return RESERVED[key];
  const where: readonly ShortcutPlace[] = ref.kind === 'built-in' ? BUILT_IN_SHORTCUTS[ref.id].where : ['anywhere'];
  const holder = liveBindings(prefs, commandName).find(
    (b) => !sameRef(b.ref, ref) && b.key === key && overlaps(b.where, where),
  );
  if (!holder) return null;
  return `${keyCap(key)} is already ${holder.label} ${placePhrase(holder.where)}.`;
}

/** Puts a built-in on `key`, dropping the override when that is its default. */
export function withBuiltInKey(prefs: ShortcutPrefs, id: BuiltInShortcutId, key: string): ShortcutPrefs {
  const keys = { ...prefs.keys };
  if (key === BUILT_IN_SHORTCUTS[id].key) delete keys[id];
  else keys[id] = key;
  return { ...prefs, keys };
}

export function withCustomKey(prefs: ShortcutPrefs, id: string, key: string): ShortcutPrefs {
  return { ...prefs, custom: prefs.custom.map((c) => (c.id === id ? { ...c, key } : c)) };
}

export function withCustomAdded(prefs: ShortcutPrefs, custom: CustomShortcut): ShortcutPrefs {
  return { ...prefs, custom: [...prefs.custom, custom] };
}

export function withCustomRemoved(prefs: ShortcutPrefs, id: string): ShortcutPrefs {
  return { ...prefs, custom: prefs.custom.filter((c) => c.id !== id) };
}

/**
 * Whatever came out of localStorage, made safe to run on.
 *
 * The stored value is JSON nobody validated — an older build, a hand edit, a
 * half-written quota failure. Anything that is not a clean binding is dropped
 * rather than trusted, and a stored set that clashes (which the sheet can
 * never produce) sheds bindings until it does not — his newest shortcut
 * first, then a moved built-in back to its default — so the registry is
 * never handed two live answers for one key.
 *
 * The set is judged WHOLE, not entry by entry: a swap (New project on S,
 * Smart Start on P) is valid, and checking it one entry at a time against
 * the defaults would throw it away.
 */
export function sanitisePrefs(raw: unknown): ShortcutPrefs {
  if (!raw || typeof raw !== 'object') return EMPTY_PREFS;
  const r = raw as { keys?: unknown; custom?: unknown };
  let prefs: ShortcutPrefs = { keys: {}, custom: [] };

  if (r.keys && typeof r.keys === 'object') {
    for (const id of BUILT_IN_IDS) {
      const k = (r.keys as Record<string, unknown>)[id];
      const key = typeof k === 'string' ? normaliseKey(k) : null;
      if (key) prefs = withBuiltInKey(prefs, id, key);
    }
  }
  if (Array.isArray(r.custom)) {
    const seen = new Set<string>();
    for (const c of r.custom as unknown[]) {
      if (!c || typeof c !== 'object') continue;
      const { id, command, key: k } = c as Record<string, unknown>;
      if (typeof id !== 'string' || typeof command !== 'string' || typeof k !== 'string' || seen.has(id)) continue;
      const key = normaliseKey(k);
      if (!key) continue;
      seen.add(id);
      prefs = withCustomAdded(prefs, { id, command, key });
    }
  }

  const noNames = () => undefined;
  /* Each pass removes one binding, so this ends; the bound is a backstop. */
  for (let pass = 0; pass <= BUILT_IN_IDS.length + prefs.custom.length; pass++) {
    const bad = liveBindings(prefs, noNames).filter((b) => refusal(prefs, b.ref, b.key, noNames));
    if (bad.length === 0) break;
    const custom = [...bad].reverse().find((b) => b.ref.kind === 'custom');
    if (custom) { prefs = withCustomRemoved(prefs, custom.ref.id); continue; }
    const moved = bad.find((b) => b.ref.kind === 'built-in' && prefs.keys[b.ref.id] !== undefined);
    if (!moved || moved.ref.kind !== 'built-in') break;
    const keys = { ...prefs.keys };
    delete keys[moved.ref.id];
    prefs = { ...prefs, keys };
  }
  return prefs;
}
