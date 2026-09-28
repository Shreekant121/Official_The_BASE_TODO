import { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { createBackDismiss, type BackDismiss } from './backDismiss';

interface OverlayEntry {
  /** Dismiss this overlay. Reads the caller's latest `onClose` through a ref. */
  close(): void;
}

/**
 * Open overlays, innermost last. Nesting is resolved with this stack rather
 * than `stopPropagation()` because every overlay listens on `window`: the
 * panels are portalled to `document.body` and a keypress with nothing focused
 * targets `<body>`, so nested overlays share no DOM ancestry for an event to
 * propagate through and "innermost listener wins" simply doesn't apply. The
 * stack is authoritative instead — mount order is nesting order, so only the
 * last-pushed overlay answers Escape.
 *
 * Since APP-2 it answers the Android back gesture on the same rule, through
 * `backDismiss.ts` below.
 */
const overlayStack: OverlayEntry[] = [];

/**
 * True while any overlay registered through `useOverlayDismiss` is open.
 *
 * For the few page-level Escape handlers that are not overlays but still
 * answer the key (ProjectView's "leave select mode"): they listen on `window`
 * like everything else, so without this check a single press would fire them
 * *and* dismiss whatever overlay is sitting on top of them.
 */
export function isOverlayOpen(): boolean {
  return overlayStack.length > 0;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * The back-gesture half, built on first use.
 *
 * Lazy rather than at module load for two reasons: nothing should touch
 * `window.history` on a page with no overlay in it, and `npm run test` runs in
 * Node, where this module is imported by anything that imports a panel and
 * there is no `window` to listen on. `backDismiss.test.ts` exercises the
 * mechanism directly instead, against a fake history.
 */
let backDismiss: BackDismiss | null = null;

function ensureBackDismiss(): BackDismiss | null {
  if (backDismiss) return backDismiss;
  if (typeof window === 'undefined') return null;

  const instance = createBackDismiss({
    history: window.history,
    depth: () => overlayStack.length,
    closeTop: () => {
      const top = overlayStack[overlayStack.length - 1];
      if (!top) return;
      // Same courtesy Escape gets: hand the gesture off visibly rather than
      // leaving a caret blinking in a field that is on its way out.
      if (isTypingTarget(document.activeElement)) (document.activeElement as HTMLElement).blur();
      top.close();
    },
  });

  window.addEventListener('popstate', () => {
    instance.onPopState();
    // React has not committed the close yet, so the stack cannot be re-read in
    // this tick — `sync` defers until it has. This call is what covers the
    // overlay that *declines* to close, or is mid-dissolve and still on the
    // stack: a fresh sentinel goes back in front of it so the next press is
    // not the one that quits BASE.
    instance.sync();
  });

  backDismiss = instance;
  return instance;
}

interface OverlayDismissOptions {
  /**
   * Register with `useUIStore` so the floating bottom nav tucks away while
   * open. True for anything full-screen; pass `false` for small transient
   * surfaces like dropdowns, which shouldn't disturb the page chrome.
   */
  hideNav?: boolean;
}

/**
 * Standard dismiss behaviour for every modal / panel / dropdown: hide the
 * floating bottom nav while open (see `useUIStore`), close on Escape, and —
 * since APP-2 — close on the Android back gesture, which in the installed app
 * would otherwise quit BASE. All three answer only for the topmost overlay, so
 * one press never collapses a whole nested stack.
 *
 * Escape closes even while a text field inside the overlay has focus (every
 * caller wants that), but the field is blurred first so the keystroke is
 * visibly handed off rather than silently swallowed.
 */
export function useOverlayDismiss(
  isOpen: boolean,
  onClose: () => void,
  { hideNav = true }: OverlayDismissOptions = {},
): void {
  // Held in a ref so a caller passing a fresh closure each render doesn't
  // re-subscribe — that would pop and re-push the overlay, moving it to the
  // top of the stack ahead of anything nested inside it.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const token: OverlayEntry = { close: () => onCloseRef.current() };
    overlayStack.push(token);
    const { pushOverlay, popOverlay } = useUIStore.getState();
    if (hideNav) pushOverlay();
    // The stack just became non-empty, or stayed non-empty; either way this is
    // where the back gesture's sentinel is put in place.
    ensureBackDismiss()?.sync();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overlayStack[overlayStack.length - 1] !== token) return;
      if (isTypingTarget(e.target)) (e.target as HTMLElement).blur();
      onCloseRef.current();
    };
    window.addEventListener('keydown', handler);

    return () => {
      window.removeEventListener('keydown', handler);
      const index = overlayStack.lastIndexOf(token);
      if (index !== -1) overlayStack.splice(index, 1);
      if (hideNav) popOverlay();
      // Takes the sentinel back out of the history when this was the last
      // overlay, so the next back press is the app's own and not a spent one.
      ensureBackDismiss()?.sync();
    };
  }, [isOpen, hideNav]);
}
