import { describe, expect, it } from 'vitest';
import { MAX_LAG_MS, WORD_MS, nextWordEnd, revealStep, wordsLeft } from './wordReveal';

describe('words (idea 20)', () => {
  it('a word carries the spaces before it', () => {
    expect(nextWordEnd('Start with the paperwork', 0)).toBe(5);
    expect(nextWordEnd('Start with the paperwork', 5)).toBe(10);
    expect(nextWordEnd('a\n\n**bold**', 1)).toBe(11);
    expect(nextWordEnd('end', 3)).toBe(3);
  });

  it('counts what is left, ignoring trailing space', () => {
    expect(wordsLeft('one two three', 0)).toBe(3);
    expect(wordsLeft('one two three', 3)).toBe(2);
    expect(wordsLeft('one two ', 7)).toBe(0);
    expect(wordsLeft('', 0)).toBe(0);
  });
});

describe('revealStep', () => {
  const text = 'Start with the paperwork while your focus is high.';

  it('moves one word per WORD_MS at the card pace', () => {
    expect(revealStep(text, 0, WORD_MS)).toBe(5);
    expect(revealStep(text, 5, WORD_MS)).toBe(10);
    expect(revealStep(text, 0, WORD_MS * 3)).toBe(14);
  });

  it('always moves at least one word, even on a short tick', () => {
    expect(revealStep(text, 0, 1)).toBe(5);
  });

  it('ends on the whole text, trailing space included', () => {
    expect(revealStep('one two  ', 3, WORD_MS)).toBe(9);
    expect(revealStep(text, 0, 10_000)).toBe(text.length);
  });

  it('a long backlog is half shown within MAX_LAG_MS, then eases out', () => {
    const long = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
    let shown = 0;
    let ms = 0;
    let half = 0;
    while (shown < long.length) {
      shown = revealStep(long, shown, WORD_MS);
      ms += WORD_MS;
      if (half === 0 && wordsLeft(long, shown) <= 150) half = ms;
    }
    expect(half).toBeLessThanOrEqual(MAX_LAG_MS);
    expect(ms).toBeLessThanOrEqual(MAX_LAG_MS * 4);
    // Word by word at the card's pace it would have taken 21 seconds.
    expect(ms).toBeLessThan(300 * WORD_MS / 4);
  });

  it('a slowed background timer catches up by elapsed time', () => {
    expect(revealStep(text, 0, 1000)).toBe(text.length);
  });

  it('a text that shrank is clamped, never read past its end', () => {
    expect(revealStep('short', 40, WORD_MS)).toBe(5);
  });
});
