/**
 * The words of a lit sentence (29-1P14c, idea 87), for a sentence that is
 * built as a string — a pure module that returns words, like
 * `boardFilter.ts`'s `noMatchSentence`. `**two words**` marks a part that
 * lights; everything else is the grey of the sentence.
 *
 * Something HE typed goes in through `litSafe`, which takes out the
 * asterisks, so a search for `**` cannot light half the sentence.
 */

export interface LitPart {
  text: string;
  lit: boolean;
}

/** `"Nothing **left to do** here."` → grey, lit, grey. An unclosed `**` stays grey. */
export function litParts(text: string): LitPart[] {
  const parts: LitPart[] = [];
  const pieces = text.split('**');
  /* An even count of pieces means an odd number of markers: the last one is
     unclosed, so its piece is grey and keeps the asterisks it came with. */
  const closed = pieces.length % 2 === 1 ? pieces.length : pieces.length - 1;
  pieces.forEach((piece, i) => {
    if (i >= closed) {
      parts.push({ text: `**${piece}`, lit: false });
      return;
    }
    if (piece !== '') parts.push({ text: piece, lit: i % 2 === 1 });
  });
  return parts;
}

/** Typed text, safe to put between `**` markers. */
export function litSafe(typed: string): string {
  return typed.replace(/\*/g, '');
}

/** The words as he reads them, markers gone — for an `aria-label` or a test. */
export function litPlain(text: string): string {
  return litParts(text).map((part) => part.text).join('');
}
