/**
 * The two browser globals the stores need under Node.
 *
 * Zustand's `persist` middleware reads `localStorage` at store-creation time —
 * without it, importing `useStore` at all throws before a single test runs.
 * An in-memory stand-in is also what keeps tests isolated from each other:
 * `resetStores` in the tests clears it.
 */
const memory = new Map<string, string>();

const stub: Storage = {
  get length() { return memory.size; },
  clear: () => memory.clear(),
  getItem: (key) => memory.get(key) ?? null,
  key: (index) => [...memory.keys()][index] ?? null,
  removeItem: (key) => { memory.delete(key); },
  setItem: (key, value) => { memory.set(key, value); },
};

Object.defineProperty(globalThis, 'localStorage', { value: stub, writable: true });
