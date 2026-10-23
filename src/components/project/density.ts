/**
 * How much a task card shows (idea 159, 29-1P7c, BIG-15; Gmail's three
 * densities). One switch beside Board / List, remembered per project on this
 * device like that switch is (`useRememberedState`, `base.project.density.*`),
 * never synced.
 *
 *   - **comfortable** — everything, as the cards always were.
 *   - **compact** — one line: the title and its badges. The description, the
 *     facts line, the "Waiting on" line, the cover and the assignee fold away;
 *     a running task keeps its running block, the one live fact on a board.
 *   - **minimal** — the title alone; the badges fold too.
 *
 * In every density the tick, the ✦ Ask (his BUILD-4 call: always visible),
 * the ⋯ and the step wash stay. It is a context rather than a prop because it
 * reaches every row of both views through `ListColumn` and `ListTable`, and
 * the board provides it once.
 */
import { createContext, useContext } from 'react';

export type Density = 'comfortable' | 'compact' | 'minimal';

export const DENSITIES: readonly Density[] = ['comfortable', 'compact', 'minimal'];

export const DensityContext = createContext<Density>('comfortable');

export function useDensity(): Density {
  return useContext(DensityContext);
}
