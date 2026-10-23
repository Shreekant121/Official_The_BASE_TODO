/**
 * FloatingAddButton — the floating + (29-1P1, BIG-15): quick add from
 * anywhere, Android's floating action button. Lime, as the idea page drew it:
 * adding to today is "the current one", and its light is its own (idea 64).
 *
 * One per screen at most, and only where adding is what the screen is for
 * (29-1P2 puts it on the tablet for quick capture). `floating` pins it to the
 * bottom-right corner above the safe area; without it the button sits where
 * it is placed, as on `/design`.
 *
 * `open` (29-1P5c, idea 61): while what it opened is up, the + turns into an
 * ✕ and is the way to close it; the caller makes its click close and says so
 * in `label`.
 *
 * THE ✕ OVER THE DIM IS A TWIN. A screen's page isolates its own stacking
 * (`backdrop.css`), so from inside it no z-index climbs over a dialog — and
 * drawing the + from <body> instead put it over the page's own nav on a
 * phone (measured). So the + stays where it always was, and while `open` a
 * second button is drawn from <body> exactly over it, above the dim, turning
 * from + to ✕ as it arrives; the one underneath turns too, so closing shows
 * it turning back. The twin is placed from the +'s own box once, when it
 * opens. Its wrapper hides in a layout-effect cleanup: a kept screen's portal
 * is not hidden with the screen, and `<Activity>` does run that cleanup.
 */
import { useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import { gelVars } from '../core/colourJobs';
import { MorphIcon } from '../core/MorphIcon';
import { useMotion } from '../core/motion';
import { useV3, v3Attr } from '../core/v3Context';
import { Z } from '../../lib/zLayers';

export function FloatingAddButton({
  label = 'Add', floating = false, open = false, className = '', style, onClick, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; floating?: boolean; open?: boolean }) {
  const v3 = useV3();
  const m = useMotion();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const shell = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = shell.current;
    if (!el) return;
    el.style.display = 'contents';
    return () => { el.style.display = 'none'; };
  }, [open]);

  const look: CSSProperties = { ...gelVars('lime'), width: 60, height: 60, padding: 0, borderRadius: 'var(--r-md)' };

  /* The twin arrives over the + and turns from + to ✕ (a Web Animation: its
     own inline `rotate` is the end of it, which no stylesheet can start from).
     Stable, so a re-render while open does not place and turn it again. */
  const placeTwin = useCallback((el: HTMLButtonElement | null) => {
    const at = anchor.current?.getBoundingClientRect();
    if (!el || !at) return;
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
    const turn = el.querySelector<HTMLElement>('.ag-morph-turn');
    if (turn && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      turn.animate([{ rotate: '0deg' }, { rotate: '135deg' }], {
        duration: 380, easing: `cubic-bezier(${m.ease.springy.join(', ')})`,
      });
    }
  }, [m]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={['ds-gel', className].filter(Boolean).join(' ')}
        onClick={onClick}
        style={{
          ...look,
          ...(floating
            ? {
                position: 'fixed', zIndex: Z.nav,
                right: 'calc(var(--sp-8) + var(--safe-r))',
                bottom: 'calc(var(--sp-8) + var(--safe-b))',
              }
            : {}),
          ...style,
        }}
        {...rest}
      >
        <MorphIcon kind="plus-x" on={open} size={28} />
      </button>
      {open && createPortal(
        <div ref={shell} {...v3Attr(v3)} style={{ display: 'none' }}>
          <button
            ref={placeTwin}
            type="button"
            aria-label={label}
            title={label}
            className="ds-gel"
            onClick={onClick}
            style={{ ...look, position: 'fixed', zIndex: Z.modal + 1 }}
          >
            <MorphIcon kind="plus-x" on size={28} />
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
