/**
 * A text box that grows with what is typed, up to a cap, then scrolls (OPT-1).
 *
 * The Atlas composer and the AI side panel both draw one. A textarea has no
 * CSS-only way to do this — its height has to be measured after each change,
 * and the height is reset to `auto` first because `scrollHeight` on a box
 * already sized to its content reports that size and never shrinks back.
 *
 * *"Everytime I try to edit the prompt I am writing on the text box and if it
 * is long but the text is a bit in different position, it snaps the text"* —
 * Shreekant. The composer used to scroll to the bottom on **every** change
 * once a draft passed the cap, so a word fixed on line 10 of 30 threw line 10
 * out of the top of the box. Measured before the fix: one letter typed there
 * moved the box from 150px scrolled to 472.
 *
 * The rule now, in two halves:
 *   - **the caret at the end** (typing on, a dictated sentence, a draft handed
 *     in from the palette) pins the box to the bottom, so the line being
 *     written stays in view after the box grew;
 *   - **the caret anywhere else** puts back exactly where the box was
 *     scrolled. The browser has already kept the caret in view as it typed;
 *     the only thing that could move it since is the `auto` reset here.
 *
 * Pure apart from the element it is handed, so `growField.test.ts` can drive
 * it in Node with a stand-in that behaves the way a textarea does.
 */
export interface GrowableField {
  style: { height: string };
  readonly scrollHeight: number;
  scrollTop: number;
  readonly selectionEnd: number;
  readonly value: string;
}

export function growField(el: GrowableField, cap: number): void {
  const kept = el.scrollTop;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
  if (el.scrollHeight <= cap) return;
  el.scrollTop = el.selectionEnd === el.value.length ? el.scrollHeight : kept;
}
