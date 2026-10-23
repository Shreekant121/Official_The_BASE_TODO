/**
 * A lazily loaded screen that can be fetched ahead of time (2026-10-07, his
 * ask: a screen "loads first" before it opens).
 *
 * `React.lazy` alone always suspends on its first render, even when its code
 * is already on the device, and a screen visited for the first time sits in a
 * new Suspense boundary that shows its empty backdrop for that moment. This
 * wraps `lazy` with `preload()`: once the code has arrived, a screen that
 * mounts afterwards renders the real component directly and never suspends.
 *
 * Which of the two a mounted screen draws is fixed on its first render, so a
 * screen that did mount through `lazy` is never swapped for the plain
 * component mid-life (a different element type would remount it and lose its
 * state).
 */
import { lazy, useState, type ComponentType } from 'react';

type Module<P> = { default: ComponentType<P> };

export type Preloadable<P> = ComponentType<P> & { preload: () => Promise<unknown> };

export function preloadable<P extends object>(factory: () => Promise<Module<P>>): Preloadable<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<Module<P>> | null = null;
  const load = () => {
    pending ??= factory().then((m) => {
      loaded = m.default;
      return m;
    });
    return pending;
  };
  const Lazy = lazy(load);
  function Screen(props: P) {
    const [Drawn] = useState<ComponentType<P>>(() => loaded ?? Lazy);
    return <Drawn {...props} />;
  }
  return Object.assign(Screen, { preload: load });
}
