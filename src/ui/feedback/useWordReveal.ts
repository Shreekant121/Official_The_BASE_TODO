/**
 * Atlas writes as it thinks (29-1P15a, idea 20): the part of a reply to draw
 * right now, a word at a time. The pace and its catch-up are the pure
 * `lib/wordReveal.ts`; this owns the timer.
 *
 * - **Only text that arrives while you watch is revealed.** A reply that is
 *   already finished when it mounts (a reopened conversation, the side panel
 *   coming back) is drawn whole at once; replaying it would be theatre.
 * - **It finishes after the turn does.** The last lump of a reply usually
 *   lands with the turn's end, and it is still typed out — the card's "then
 *   stops" — so `revealing` stays true until it catches up, and the caret
 *   with it.
 * - **The timer is not restarted by new text.** gemma sends a packet every
 *   20-50ms, under the 70ms pace; a timer reset on every packet would never
 *   fire, and the reply would sit unrevealed until the model stopped.
 * - Reduced motion draws everything at once.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMedia } from '../useMedia';
import { revealStep, WORD_MS } from '../../lib/wordReveal';

const STILL = '(prefers-reduced-motion: reduce)';

export function useWordReveal(text: string, live: boolean): { shown: string; revealing: boolean } {
  const still = useMedia(STILL);
  const [shown, setShown] = useState(() => (live ? 0 : text.length));
  const textRef = useRef(text);
  useLayoutEffect(() => {
    textRef.current = text;
  });

  const at = Math.min(shown, text.length);
  const revealing = !still && at < text.length;

  useEffect(() => {
    if (!revealing) return;
    const started = Date.now();
    const timer = setTimeout(() => {
      const full = textRef.current;
      setShown((cur) => revealStep(full, Math.min(cur, full.length), Date.now() - started));
    }, WORD_MS);
    return () => clearTimeout(timer);
  }, [revealing, at]);

  return { shown: revealing ? text.slice(0, at) : text, revealing };
}
