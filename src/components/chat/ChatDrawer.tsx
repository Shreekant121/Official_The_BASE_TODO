/**
 * The chat list as a drawer, on a window too narrow to dock it (item 13G).
 *
 * **Motion 2 of 4.** It slides from `translateX(calc(-100% - var(--sp-9)))` on
 * `--dur-sheet`/`--ease-glass`, with `opacity` on the shorter `--dur-base` so
 * it is legible before it has finished arriving, and `visibility` on a
 * zero-length transition delayed by `--dur-sheet` on the way out. The extra
 * `--sp-9` past its own width is what stops the drawer's shadow leaking back
 * onto the page from the left edge while it is closed.
 *
 * **Motion 6 is the scrim**: `opacity` on `--dur-fast`/`--ease-glass` and
 * `visibility 0s linear`, which is every scrim in this screen — this one and
 * 13F's Atlas panel — behaving the same way.
 *
 * IT IS MOUNTED WHETHER OR NOT IT IS OPEN, and that is the whole reason this
 * is a component rather than a `{open && …}` in the page. Item 10 built the
 * sheet by mounting it on demand, so it had no closed state to slide out of
 * and simply appeared. A panel that did not exist a frame ago has nowhere to
 * come from — the same note `Tray.tsx` already carries.
 *
 * The scrim is a `<button>` rather than a div with a click handler: it is the
 * way out of the drawer, and a way out that only a mouse can take is not one.
 */
import type { ReactNode } from 'react';
import { Z } from '../../lib/zLayers';

export function ChatDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        aria-label="Close the chat list"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: Z.panel - 1, border: 0, cursor: 'default',
          background: 'oklch(0 0 0 / 0.55)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'opacity var(--dur-fast) var(--ease-glass),' +
            ` visibility 0s linear ${open ? '0s' : 'var(--dur-sheet)'}`,
        }}
      />
      <aside
        aria-label="Chats"
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 'calc(var(--sp-5) + var(--safe-t))', left: 'calc(var(--sp-5) + var(--safe-l))', bottom: 'calc(var(--sp-5) + var(--safe-b))',
          width: 'min(320px, calc(100vw - var(--sp-10)))',
          zIndex: Z.panel, boxSizing: 'border-box',
          padding: 'var(--sp-7)',
          borderRadius: 'var(--r-sheet)',
          backgroundColor: 'oklch(0.145 0.004 260 / 0.96)', backgroundImage: 'var(--glass-fill-1)',
          border: '1px solid oklch(1 0 0 / 0.10)',
          backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
          boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
          transform: open ? 'translateX(0)' : 'translateX(calc(-100% - var(--sp-9)))',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'transform var(--dur-sheet) var(--ease-glass),' +
            ' opacity var(--dur-base) var(--ease-glass),' +
            ` visibility 0s linear ${open ? '0s' : 'var(--dur-sheet)'}`,
        }}
      >
        {children}
      </aside>
    </>
  );
}
