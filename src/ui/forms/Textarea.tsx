/**
 * Aurora Glass — Textarea
 *
 * DERIVED, NOT MIRRORED — like Dialog, and for the same reason: the design
 * project has no `Textarea` component. What it has is a `Field` helper that
 * every screen mockup re-declares at the top of the file, carrying the note
 * that says why:
 *
 *   "A well, not a box: anything you type into looks carved in. Input.jsx
 *    covers single-line fields; a textarea needs the same recipe by hand."
 *
 * This is that recipe, extracted once so a screen migrating to Aurora Glass
 * gets the same trough as every other screen instead of re-deriving it. The
 * mockups' `Field` also handles the single-line case; that half is `Input`
 * and is not repeated here.
 *
 * Two departures from the inline helper, both to match `Input` rather than
 * the mockup — a textarea and a text field sitting in the same form must not
 * light up differently:
 *   - `onChange` is the native React handler (an event), not `Field`'s
 *     `(value) => …`. Every caller in this app is a controlled field.
 *   - `invalid` exists, with `Input`'s rose hairline.
 *
 * A third, added by UI-8: **`ref` reaches the inner `<textarea>`**, not the
 * well that wraps it. The Assistant's composer grows with what is typed, and
 * a textarea has no CSS-only way to do that — its height has to be measured
 * off `scrollHeight` after the change — and the same screen puts the caret
 * back in the field when a turn finishes. Both need the element itself. React
 * 19 passes `ref` as an ordinary prop, so this is a type widening rather than
 * a `forwardRef` wrapper; it is declared explicitly and forwarded explicitly
 * so it cannot be lost in the `...rest` spread.
 *
 * The inner `<textarea>` carries `data-ag-field`, which opts it out of the
 * global `:focus-visible` outline in `src/ui/tokens/base.css` — an outline
 * on the inner element would draw a hard rectangle inside the rounded well.
 * The well lights up instead. The `.ag-field` class in `screens.css` is what
 * puts the placeholder at `--fg-4`.
 *
 * A fourth, added by UI-33: **`trailing` puts a control INSIDE the well**,
 * bottom-aligned beside the text. `screens/assistant.html` draws its composer
 * as one surface holding both the field and a round Send — and `Input` already
 * has exactly this idiom in `iconLeft` / `suffix`, which are its own slots
 * inside its own well. The alternative was a second surface next to the first,
 * which is what UI-8 built and what the mockup says the composer is not.
 * (The mockup makes that surface a raised `--glass-fill-2` pane; it stays a
 * well here, because `Input.prompt.md` says flatly *"do not put a raised
 * `--glass-fill-*` background on an input"* and `readme.md`'s wells-vs-panes
 * law says the same. The layout is the mockup's; the material is the rule's.)
 */
import { useState } from 'react';
import type { CSSProperties, FocusEvent, ReactNode, Ref, TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Set in the mono face — for pasted lists and anything columnar. */
  mono?: boolean;
  /** A control rendered inside the well, aligned to the last line. */
  trailing?: ReactNode;
  /** Lands on the inner `<textarea>`, never on the well. */
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  invalid = false,
  mono = false,
  rows = 3,
  trailing,
  className = '',
  style,
  onFocus,
  onBlur,
  ref,
  ...rest
}: TextareaProps) {
  const [focus, setFocus] = useState(false);

  const wellShadow = invalid
    ? 'var(--glass-well-shadow), 0 0 0 1px oklch(0.70 0.15 20 / 0.7)'
    : focus
      ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
      : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)';

  const shell: CSSProperties = {
    padding: 'var(--sp-5) var(--sp-6)',
    borderRadius: 'var(--r-lg)',
    backgroundImage: 'var(--glass-well)',
    boxShadow: wellShadow,
    transition: 'box-shadow var(--dur-base) var(--ease-glass)',
    ...(trailing != null
      ? { display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-4)' }
      : null),
    ...style,
  };

  const handleFocus = (e: FocusEvent<HTMLTextAreaElement>) => {
    setFocus(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
    setFocus(false);
    onBlur?.(e);
  };

  return (
    <div className={className} style={shell}>
      <textarea
        ref={ref}
        data-ag-field=""
        className="ag-field"
        rows={rows}
        {...rest}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={{
          display: 'block',
          width: '100%',
          flex: trailing != null ? 1 : undefined,
          minWidth: trailing != null ? 0 : undefined,
          /* With a `trailing` control the well is padded for THAT — a 44px
             button — and the field is bottom-aligned beside it, so a one-line
             field would sit 10px below the optical centre. The source's own
             composer answers this with `padding: var(--sp-4) 0` on the field,
             which brings a single line up to the button's height and then
             travels with it as the field grows. */
          padding: trailing != null ? 'var(--sp-4) 0' : 0,
          border: 0,
          outline: 'none',
          boxShadow: 'none',
          background: 'transparent',
          resize: 'none',
          color: 'var(--fg-1)',
          font: mono ? 'var(--type-numeric)' : 'var(--type-body)',
          fontSize: 'var(--text-md)',
          letterSpacing: 'var(--tracking-ui)',
          lineHeight: 1.55,
        }}
      />
      {trailing}
    </div>
  );
}
