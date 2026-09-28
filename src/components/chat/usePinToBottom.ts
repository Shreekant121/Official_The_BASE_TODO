/* How the transcript follows a conversation. Moved out of
   `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import { useEffect, type RefObject } from 'react';
import type { ChatTurn } from './chatShared';

/**
 * How close to the bottom counts as "following along" (item 13G).
 *
 * The mockup's own 240. Above it the transcript stops chasing the newest turn,
 * because somebody that far up is reading rather than waiting.
 */
const NEAR_BOTTOM_PX = 240;

/** `turns`, `busy` and `conversationId` are read only as the moments to pin again. */
export function usePinToBottom(
  scrollRef: RefObject<HTMLDivElement | null>,
  turns: ChatTurn[],
  busy: boolean,
  conversationId: string | null,
) {
  /*
   * ITEM 13G — THE AUTOSCROLL RULE CHANGED, AND THE NEW ONE IS THE FIX.
   *
   * What was here was one line: smooth-scroll to the bottom whenever `turns`
   * changed. It has two faults and the second is the one Shreekant felt.
   *
   * **It pins too late.** A conversation restored from the laptop paints
   * before its images and its expanders have settled, so a single scroll on
   * the render that added the turns lands short and the newest answer opens
   * half off-screen. The mockup pins three times — now, on the next frame, and
   * again at 120ms — which is cheap and covers all three settle points.
   *
   * **It pins too eagerly.** `behavior: 'smooth'` on every change means
   * opening a 48-row tool result — which grows the transcript by 320px without
   * adding a turn — yanks the page away from whatever he was reading. The
   * mockup's answer is a `ResizeObserver` on the transcript's first child that
   * re-pins **only when he is already within 240px of the bottom**, in its own
   * words: *"expanding a long result must not yank the transcript."* Reading
   * something further up is now a decision the screen respects.
   *
   * The jump is instant rather than smooth for the same reason. A smooth
   * scroll started while a stream is still appending tokens is a scroll that
   * is always chasing and never arrives.
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const pin = () => { el.scrollTop = el.scrollHeight; };
    pin();
    const frame = requestAnimationFrame(pin);
    const settle = setTimeout(pin, 120);

    let observer: ResizeObserver | null = null;
    const growing = el.firstElementChild;
    if (typeof ResizeObserver !== 'undefined' && growing) {
      observer = new ResizeObserver(() => {
        if (el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX) pin();
      });
      observer.observe(growing);
    }

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      observer?.disconnect();
    };
  }, [scrollRef, turns, busy, conversationId]);
}
