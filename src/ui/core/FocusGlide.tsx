/**
 * A focus ring that glides (idea 70, 29-1P1, BIG-15; Raycast, Arc). While he
 * uses the keyboard, ONE lime ring marks the focused control and slides to
 * the next one on Tab, so the eye never loses where it is. Lime because the
 * focused control is "the current one", lime's job — his call, 2026-09-30.
 *
 * Mounted once in `App.tsx`. It draws nothing until a key is pressed, and
 * disappears the moment a mouse or a finger touches the screen: a click on a
 * text field matches `:focus-visible` too, and that must not raise it. While
 * it is up, `<html data-focus-glide="on">` hides every control's own outline
 * (`buttons.css`), so there is only ever one ring; with it down, every
 * outline is exactly as it was.
 *
 * Cost: nothing at rest. It measures the focused control on a focus change
 * and, while shown, on scroll and resize — event-driven, never on a screen's
 * way in (Performance rule 6) — and its glide is a CSS transition on one
 * fixed element. A ring that follows a scroll jumps instead of gliding, or
 * it would trail behind what it marks.
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { v3Attr } from './v3Context';
import { Z } from '../../lib/zLayers';

/** How far the ring stands off the control. */
const GAP = 3;

/*
 * What gets a ring: a control. A sheet or a panel that takes focus itself
 * when it opens (the `?` sheet, a dialog, `tabIndex={-1}` on a container)
 * is where focus waits, not something to press, and a ring round the whole
 * sheet reads as a selection. A button or a tab at `tabIndex={-1}` still
 * counts: a roving tab list moves focus onto one before it re-renders it
 * as the tabbable one.
 */
const CONTROL = [
  'a[href]', 'button', 'input', 'select', 'textarea', 'summary', '[contenteditable="true"]',
  '[role="button"]', '[role="tab"]', '[role="radio"]', '[role="switch"]', '[role="slider"]',
  '[role="checkbox"]', '[role="menuitem"]', '[role="option"]', '[role="link"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/*
 * Never a field you type in (his BASE list, 2026-10-06: "the strong glowing
 * lime light looks utter shit, just remove it"). Typing is keyboard use, so
 * the ring went up around the add-task box at the size it had then, and a
 * long title grew the box out from under it. A field keeps its own outline.
 */
const TEXT_ENTRY = [
  'textarea', '[contenteditable="true"]',
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"])',
].join(', ');

const ringable = (el: Element) => el.matches(CONTROL) && !el.matches(TEXT_ENTRY);

/** Each corner of a computed radius, grown by the gap so the ring stays concentric. */
function ringRadius(radius: string): string {
  return radius
    .split(' ')
    .map((part) => (part === '0px' ? `${GAP}px` : `calc(${part} + ${GAP}px)`))
    .join(' ');
}

export function FocusGlide() {
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    let keyboard = false;
    let target: Element | null = null;
    let shown = false;
    let frame = 0;

    const hide = () => {
      target = null;
      if (!shown) return;
      shown = false;
      const ring = ringRef.current;
      if (ring) ring.style.opacity = '0';
      delete root.dataset.focusGlide;
    };

    /** `jump` places it without the glide: a first appearance, or a scroll. */
    const place = (jump: boolean) => {
      const ring = ringRef.current;
      if (!ring || !target || !target.isConnected) { hide(); return; }
      const r = target.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { hide(); return; }
      if (jump) ring.style.transition = 'none';
      ring.style.transform = `translate(${r.left - GAP}px, ${r.top - GAP}px)`;
      ring.style.width = `${r.width + GAP * 2}px`;
      ring.style.height = `${r.height + GAP * 2}px`;
      ring.style.borderRadius = ringRadius(getComputedStyle(target).borderRadius);
      if (jump) {
        void ring.offsetWidth; /* commit the jump before the glide comes back */
        ring.style.transition = '';
      }
      ring.style.opacity = '1';
      root.dataset.focusGlide = 'on';
      shown = true;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
      keyboard = true;
      /* Focus that moved without a focus event this ring saw (a key that
         reopened the same control) still gets marked. */
      const el = document.activeElement;
      if (!shown && el && el !== document.body && el.matches(':focus-visible') && ringable(el)) {
        target = el;
        place(true);
      }
    };
    const onPointerDown = () => { keyboard = false; hide(); };
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target;
      if (!(el instanceof Element) || !keyboard || !el.matches(':focus-visible') || !ringable(el)) { hide(); return; }
      target = el;
      place(!shown);
    };
    const onFocusOut = () => {
      /* Wait for the focus to land: the next control's focusin moves the ring
         itself, and only focus leaving for nowhere takes it down. */
      setTimeout(() => {
        const el = document.activeElement;
        if (!el || el === document.body) hide();
      }, 0);
    };
    const follow = () => {
      if (!shown || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; place(true); });
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      if (frame) cancelAnimationFrame(frame);
      delete root.dataset.focusGlide;
    };
  }, []);

  return createPortal(
    <span ref={ringRef} aria-hidden="true" className="ds-focus-glide" style={{ zIndex: Z.focusRing }} {...v3Attr(true)} />,
    document.body,
  );
}
