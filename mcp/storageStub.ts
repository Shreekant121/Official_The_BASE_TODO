/**
 * An in-memory `localStorage`, installed before the app's stores are imported.
 *
 * WHY THE MCP SERVER NEEDS ONE
 * -----------------------------
 * `useStore` and `useTrashStore` are wrapped in Zustand's `persist`
 * middleware, which reaches for `localStorage` on every write. Under Node
 * there is none, so each write logged
 *
 *   [zustand persist middleware] Unable to update item 'mutineer-os-storage',
 *   the given storage is currently unavailable.
 *
 * to stderr — which Atlas forwards into its own log. Harmless, and noise on
 * every single tool call that writes, which is the kind of thing that trains
 * you to stop reading a log.
 *
 * **The stand-in is deliberately a black hole.** Nothing here is ever read
 * back: the durable copy is the Firestore document, this process re-reads it
 * before every call (DESIGN.md §5.4), and a persisted local copy that outlived
 * a call would be a second source of truth competing with the one that
 * matters. `src/test/setup.ts` does the same thing for the same reason.
 *
 * **It must be imported before anything that imports a store**, because
 * `persist` reads `localStorage` at store-*creation* time — which is module
 * evaluation, not first use. `index.ts` imports this first and says so.
 */

const memory = new Map<string, string>();

const stub: Storage = {
  get length() {
    return memory.size;
  },
  clear: () => memory.clear(),
  getItem: (key) => memory.get(key) ?? null,
  key: (index) => [...memory.keys()][index] ?? null,
  removeItem: (key) => {
    memory.delete(key);
  },
  setItem: (key, value) => {
    memory.set(key, value);
  },
};

/*
 * Installed unconditionally, and "is there one already?" is the wrong question
 * — which cost a debugging round to find out.
 *
 * **Node 22 and later define `globalThis.localStorage` themselves**, and it
 * *throws* unless the process was started with `--localstorage-file`. So a
 * guard of `if (!('localStorage' in globalThis))` finds one, decides everything
 * is fine, installs nothing, and hands Zustand a global that fails on every
 * write — which is exactly the warning this file exists to stop, still being
 * printed by the fix meant to prevent it.
 *
 * `configurable: true` because that built-in is already defined and redefining
 * a non-configurable property throws.
 */
Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true, configurable: true });

/**
 * Drops the one log line the stand-in above cannot prevent.
 *
 * WHY A FILTER RATHER THAN A FIX
 * -------------------------------
 * Zustand resolves its storage **once, when `persist()` is evaluated** — module
 * evaluation — and caches `undefined` for the life of the process if the lookup
 * threw. The global above wins that race for `useStore`, and does not for
 * `useTrashStore`, which is evaluated earlier as one of its dependencies. The
 * obvious repair, `store.persist.setOptions`, is not available: neither store
 * exposes a `.persist` handle in the zustand build this app pins.
 *
 * So what is left is a warning about a *browser* facility, on a *server*, about
 * a copy of the data nothing reads — printed on every deletion. It is the kind
 * of line that teaches you to stop reading a log, which is expensive in a
 * process that also reports real failures on the same stream.
 *
 * The filter is deliberately exact: one prefix, one middleware, and everything
 * else console writes goes through untouched.
 */
const PERSIST_NOISE = '[zustand persist middleware]';

export function silenceStorageWarnings(): void {
  for (const level of ['warn', 'error', 'log'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith(PERSIST_NOISE)) return;
      original(...(args as []));
    };
  }
}
