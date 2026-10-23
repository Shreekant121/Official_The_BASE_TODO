import { describe, expect, it } from 'vitest';
import { growField, type GrowableField } from './growField';

/**
 * A stand-in textarea: content of a fixed height, a box whose height is what
 * `style.height` says (one 25px row for `auto`), and a `scrollTop` the box
 * clamps the way a browser does. `resetsScroll` plays the browser that drops
 * the scroll to 0 whenever the box is resized, which is the worst case the
 * restore has to survive.
 */
function field(opts: { content: number; value: string; caret: number; scrollTop: number; resetsScroll?: boolean }) {
  let height = 'auto';
  let top = opts.scrollTop;
  const box = () => (height === 'auto' ? 25 : parseFloat(height));
  const clamp = (n: number) => Math.max(0, Math.min(n, opts.content - box()));
  const el: GrowableField = {
    style: {
      get height() {
        return height;
      },
      set height(next: string) {
        height = next;
        top = opts.resetsScroll ? 0 : clamp(top);
      },
    },
    scrollHeight: opts.content,
    get scrollTop() {
      return top;
    },
    set scrollTop(next: number) {
      top = clamp(next);
    },
    selectionEnd: opts.caret,
    value: opts.value,
  };
  return el;
}

const LONG = 'x'.repeat(1000);

describe('growField', () => {
  it('keeps the scroll where it was when the caret is mid-draft', () => {
    const el = field({ content: 732, value: LONG, caret: 485, scrollTop: 150 });
    growField(el, 168);
    expect(el.style.height).toBe('168px');
    expect(el.scrollTop).toBe(150);
  });

  it('keeps it even on a browser that resets the scroll on resize', () => {
    const el = field({ content: 732, value: LONG, caret: 485, scrollTop: 150, resetsScroll: true });
    growField(el, 168);
    expect(el.scrollTop).toBe(150);
  });

  it('pins to the bottom when the caret is at the end', () => {
    const el = field({ content: 732, value: LONG, caret: LONG.length, scrollTop: 150 });
    growField(el, 168);
    expect(el.scrollTop).toBe(732 - 168);
  });

  it('grows to fit and leaves the scroll alone under the cap', () => {
    const el = field({ content: 100, value: 'short', caret: 5, scrollTop: 0 });
    growField(el, 168);
    expect(el.style.height).toBe('100px');
    expect(el.scrollTop).toBe(0);
  });

  it('stops at the cap', () => {
    const el = field({ content: 2000, value: LONG, caret: 0, scrollTop: 0 });
    growField(el, 260);
    expect(el.style.height).toBe('260px');
    expect(el.scrollTop).toBe(0);
  });
});
