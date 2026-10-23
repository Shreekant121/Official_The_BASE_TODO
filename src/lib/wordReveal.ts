/**
 * Atlas writes as it thinks (29-1P15a, idea 20): how far a reply has been
 * shown, a word at a time. Pure: no clock, no timers; `useWordReveal` owns
 * those and asks this how far to go.
 *
 * A model's text arrives in lumps — gemma on the laptop a few words a packet,
 * a cloud model a sentence or a paragraph at once — and drawn as it lands a
 * lump just appears. The card's answer is a steady pace: one word every
 * `WORD_MS`. Two rules keep that pace honest:
 *
 * - **It never falls far behind.** A paragraph arriving at once would take
 *   seconds to type out at the card's pace, and a reply that is already here
 *   must not be held back for show. Past `MAX_LAG_MS` of words still to show,
 *   it takes several per step: half of any backlog is on screen within about
 *   `MAX_LAG_MS`, and the last words slow back to the card's pace, an ease-out.
 * - **It goes by the time that passed, not the steps taken.** A tab in the
 *   background has its timers slowed to once a second; counted per step the
 *   reply would crawl there and then be a minute behind on return.
 */

/** The idea card's pace: one word every 70ms. */
export const WORD_MS = 70;

/**
 * About how far behind the words may fall. Measured in the dev tab with
 * packets every 30ms (gemma's rate): at 1200 the reply trailed the model by
 * over a second and finished 1.5s after it; at 700 it finished about 1s after,
 * and a slow stream still gets the card's pace.
 */
export const MAX_LAG_MS = 700;

/** Where the word starting at or after `from` ends (spaces before it count with it). */
export function nextWordEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i++;
  while (i < text.length && !/\s/.test(text[i])) i++;
  return i;
}

/** How many words of `text` are still to show after `shown` characters. */
export function wordsLeft(text: string, shown: number): number {
  let count = 0;
  let i = Math.max(0, shown);
  while (i < text.length) {
    const end = nextWordEnd(text, i);
    if (end === i) break;
    if (/\S/.test(text.slice(i, end))) count++;
    i = end;
  }
  return count;
}

/**
 * How many characters to show after `elapsedMs` more of revealing, starting
 * from `shown`. Always ends on a word's end (or the whole text), always moves
 * at least one word while any are left, and never shrinks below what was shown
 * unless the text itself got shorter.
 */
export function revealStep(text: string, shown: number, elapsedMs: number): number {
  const from = Math.min(Math.max(0, shown), text.length);
  const left = wordsLeft(text, from);
  if (left === 0) return text.length;
  const steps = Math.max(1, Math.round(elapsedMs / WORD_MS));
  const catchUp = Math.max(1, Math.ceil((left * WORD_MS) / MAX_LAG_MS));
  let at = from;
  for (let n = Math.min(left, steps * catchUp); n > 0; n--) at = nextWordEnd(text, at);
  /* What is left after the last word is only space: show it too, or the
     caret would sit one blank short of the end for ever. */
  return wordsLeft(text, at) === 0 ? text.length : at;
}
