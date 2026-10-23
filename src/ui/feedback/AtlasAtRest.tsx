/**
 * Atlas at rest (29-1P15b, ideas 83, 88 and 94): how Atlas looks when it is not
 * working, the other half of 29-1P15a's `EdgeLight`. All violet, Atlas's job;
 * the look and why it costs nothing are in `atlasAtRest.css`.
 *
 *   <Horizon top="78%" lit={hearing} />         — 83, a planet's edge of light
 *   <AskGlow typed={value !== ''} radius=…>…    — 88, the ask box glows
 *   <Remembered name="Gym" onOpen={…} />         — 94, Atlas saved a note
 *
 * Nothing here loops. The horizon and the glow are still shadows, always in the
 * tree; turning them up is an opacity fade, never a mount.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Icon } from '../core/Icon';

export interface HorizonProps {
  /** Where the curve peaks, from the top of the box it fills (`70%`, a `calc`). */
  top: string;
  /** Brighter, while Atlas listens. */
  lit?: boolean;
  /** Fade the sides to nothing, for a horizon narrower than the window. */
  fade?: boolean;
  style?: CSSProperties;
}

/**
 * 83, a horizon of light: Atlas's screen sits above a curved edge of violet
 * light, like a planet's. It fills its positioned parent **behind** what is in
 * it (`z-index: -1`), so the parent must be a stacking context of its own: a
 * positioned box with a `z-index` (`0` will do). Measured: `isolation: isolate`
 * alone did not hold it here, and the light went behind the page.
 */
export function Horizon({ top, lit = false, fade = false, style }: HorizonProps) {
  return (
    <span
      aria-hidden="true"
      className="ag-horizon"
      data-lit={lit ? '' : undefined}
      data-fade={fade ? '' : undefined}
      data-horizon=""
      style={{ zIndex: -1, ...style, ['--horizon-top' as string]: top }}
    >
      <i />
      <i />
    </span>
  );
}

export interface AskGlowProps {
  /** There is text in the box. It glows only while he types: text, and the caret in it. */
  typed: boolean;
  /** The box's corners, for its lit rim (`var(--r-xl)`). */
  radius?: string;
  /** A box with no edge of its own (the palette's row): a lit line along its foot instead. */
  line?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

/**
 * 88, an ask box that glows: wrap a box that asks Atlas. While it holds the
 * caret and has text in it, a violet light rises under it and its rim lights;
 * empty it or leave it, and both fade. Pure CSS (`:focus-within`), so the box
 * needs no focus state of its own.
 */
export function AskGlow({ typed, radius, line = false, children, style }: AskGlowProps) {
  return (
    <div
      className="ag-ask"
      data-typed={typed ? '' : undefined}
      data-line={line ? '' : undefined}
      /* `z-index: 0` makes it the stacking context its glow sits at the
         bottom of; without one the glow goes behind the page. */
      style={{ zIndex: 0, ...style, ...(radius ? { ['--ask-r' as string]: radius } : {}) }}
    >
      <span aria-hidden="true" className="ag-ask-glow" style={line ? undefined : { zIndex: -1 }} />
      {children}
      <span aria-hidden="true" className="ag-ask-rim" />
    </div>
  );
}

export interface RememberedProps {
  /** The note, as he would say it ("Gym", "Rahul mehta"). */
  name: string;
  /** Opens the note (his call, 2026-10-15). */
  onOpen: () => void;
}

/**
 * 94, "Remembered": under a reply in which Atlas saved a note, a small violet
 * chip. A tap opens the note (his call, 2026-10-15), where he can read exactly
 * what was saved and change it.
 */
export function Remembered({ name, onOpen }: RememberedProps) {
  return (
    <button
      type="button"
      className="ag-remembered"
      onClick={onOpen}
      aria-label={`Remembered in ${name}. Open the note`}
      title="Open the note"
    >
      <Icon name="sparkles" size={13} />
      <span>Remembered</span>
      <span>· {name}</span>
    </button>
  );
}
