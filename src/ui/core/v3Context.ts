/**
 * The V3 context and its two readers (V3-1). Kept apart from `V3.tsx`, which
 * holds `<V3Scope>`, so that file exports only a component — Vite's fast
 * refresh needs that. Read `V3.tsx` for what the scope does.
 */
import { createContext, useContext } from 'react';

export const V3Context = createContext(false);

/** True inside a `<V3Scope>`. Components branch on this; screens should not need to. */
export function useV3(): boolean {
  return useContext(V3Context);
}

/**
 * The attribute a portal root spreads to stay in the scope it was opened from:
 * `<div {...v3Attr(useV3())}>`. Empty outside V3, so an old screen's portal
 * gains no attribute at all.
 */
export function v3Attr(on: boolean): { 'data-v3'?: '' } {
  return on ? { 'data-v3': '' } : {};
}
