/**
 * Pressing a Needs chip goes to the field it names (UI-30).
 *
 * Built inside `TaskDetailPanel.tsx` at UI-26 and extracted here when the
 * scoring screen turned out to ask for exactly the same three things.
 * `TaskSheet.prompt.md` and `screens/scoring.html` agree on all of them:
 * *"pressing one focuses that field and rings it amber for a beat"*.
 *
 * `block: 'nearest'` and `preventScroll`, not the source's plain `focus()`.
 * The source lets the browser decide how far to scroll off the focused
 * element's box at that instant, which is the exact non-determinism UI-23
 * spent a session tracking down in `home-smart-start`. Scrolling once,
 * explicitly, and then focusing without scrolling again cannot race itself.
 *
 * The field is found by `data-need` rather than held in a ref: a screen only
 * ever has one of each on it, and building a ref-writing closure per field
 * during render is what `react-hooks/refs` exists to stop.
 *
 * `beforeJump` is the scoring screen's half — that screen files Description
 * inside a collapsible Section, so a chip pointing at it has to open the
 * section before there is anything to scroll to. The source does the same
 * (`if (id === 'desc') setOpen(o => ({ ...o, essentials: true }))`), one tick
 * ahead of the focus for the same reason.
 */
import { useEffect, useRef, useState } from 'react';
import type { NeedId } from './needs';

/** How long the amber ring stays on a field a Needs chip jumped to. */
export const FLASH_MS = 1400;

/** What a Needs chip puts the caret in once it has scrolled its field up. */
const NEED_FOCUSABLE = 'input:not([type="hidden"]), textarea, select, button:not([disabled])';

/**
 * A tick is enough for a `setState` in `beforeJump` to have painted the field
 * being jumped to. The source waits 40ms for the same reason.
 */
const REVEAL_MS = 40;

export function useNeedsJump(beforeJump?: (id: NeedId) => void) {
  const [flash, setFlash] = useState<NeedId | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const revealTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearTimeout(flashTimer.current);
    window.clearTimeout(revealTimer.current);
  }, []);

  const jump = (id: NeedId) => {
    setFlash(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), FLASH_MS);

    beforeJump?.(id);
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-need="${id}"]`);
      el?.scrollIntoView({ block: 'nearest' });
      el?.querySelector<HTMLElement>(NEED_FOCUSABLE)?.focus({ preventScroll: true });
    }, REVEAL_MS);
  };

  /** Ties a field to the Needs chip that points at it. */
  const need = (id: NeedId) => ({ flash: flash === id, needId: id });

  return { flash, jump, need };
}
