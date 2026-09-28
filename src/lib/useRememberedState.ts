/**
 * `useState`, except the value survives a reload.
 *
 * Shreekant, 2026-09-15: *"can you make sure that everything is remembered,
 * like whatever I set is remembered, it doesn't change to its default value"*.
 * His complaint about Show done turned out to be one instance of a pattern —
 * four real preferences were plain `useState` in components that unmount on
 * every route change, so each one forgot itself the moment he looked at
 * another screen.
 *
 * WHY `localStorage` AND NOT THE STORE
 * -------------------------------------
 * CLAUDE.md's standing rule: `users/{uid}/data/main` is rewritten whole on
 * every task edit under a 1 MB cap, and anything added to the persisted store
 * spends that budget. Which tab was open is not task data. It also fails the
 * other test — these are facts about the device you are sitting at, not about
 * the account, which is the same reasoning `atlas/devicePrefs.ts` states for
 * the model picker and `lib/brownNoise.ts` states for the noise.
 *
 * WHY NOT IN `devicePrefs.ts` WITH THE REST
 * ------------------------------------------
 * That file is Atlas's. Every comment in it is about which model answers,
 * which conversation is open, and how big a context window this machine can
 * hold. A board/list toggle filed under "the things about Atlas that belong to
 * this device" would be the first entry there with nothing to do with Atlas.
 *
 * THE KEY CAN CHANGE, AND THAT IS THE WHOLE COMPLICATION
 * -------------------------------------------------------
 * Board-vs-List and Show done are remembered **per project** — a reference
 * project wants a list where a working project wants a board, and one global
 * "last used" is wrong the first time you open the other kind. So the key
 * moves as you navigate between projects while the component stays mounted.
 * Re-reading in an effect would paint one frame of the previous project's
 * choice first; re-reading during render is React's documented way to adjust
 * state when its input changes, and it costs an immediate re-render that is
 * never committed to the DOM.
 */
import { useCallback, useState } from 'react';

/* `localStorage` THROWS in a private window rather than returning null, so
   every access is wrapped. A device with no storage gets the fallback, which
   is a working screen rather than a blank one. */
function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Out of quota, or a private window. The choice still holds this session. */
  }
}

/**
 * Remembers one value under `key`.
 *
 * Shaped like `useState` — including the updater form — so adopting it at a
 * call site is a one-word change and nothing below it has to know.
 *
 * Pass a key built from whatever scopes the preference (`base.project.view.
 * ${projectId}`); changing it re-reads, so the same hook serves a per-project
 * choice and a global one.
 */
export function useRememberedState<T>(
  key: string,
  fallback: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  /*
   * The state carries the key it was read for.
   *
   * See the header — the key moves under a mounted component when he navigates
   * from one project to the next, and the re-read has to happen during render
   * rather than in an effect or the previous project's view paints for a
   * frame. Holding the key IN state is how that is done without writing to a
   * ref mid-render, which `react-hooks/refs` rejects and is right to: a ref
   * write is invisible to React's rendering model, so a concurrent re-render
   * would see the new key with the old value.
   */
  const [held, setHeld] = useState<{ key: string; value: T }>(() => ({ key, value: read(key, fallback) }));

  let value = held.value;
  if (held.key !== key) {
    /* React re-renders immediately and never commits this pass, so the DOM
       only ever sees the right project's choice. `value` is taken locally as
       well because `held` is still the stale object for the rest of THIS
       render. */
    value = read(key, fallback);
    setHeld({ key, value });
  }

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setHeld((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev.value) : next;
      /* Written here rather than in an effect so the value is on disk before
         the component can unmount — which is exactly what a route change does
         to every one of these call sites. */
      write(key, resolved);
      return { key, value: resolved };
    });
  }, [key]);

  return [value, set];
}
