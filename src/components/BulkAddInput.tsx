import { forwardRef, useEffect, useRef, type CSSProperties } from 'react';
import { parseBulkLines } from '../lib/bulkAdd';

interface BulkAddInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with every non-empty line once the user submits — a single-line submit calls this with a one-item array, so callers can treat it exactly like their old single-add handler. */
  onSubmitLines: (lines: string[]) => void;
  onCancel?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  autoFocus?: boolean;
  /**
   * The field's accessible name. Without one a screen reader falls back to the
   * placeholder, which here is a sentence about pasting multiple lines rather
   * than a name for the field. Added at UI-15 for New Session's two inline
   * forms; the other call sites are free to keep leaning on the placeholder.
   */
  ariaLabel?: string;
}

/**
 * Drop-in replacement for a single-line text `<input>` that also supports
 * bulk creation: pasting text containing newlines immediately creates one
 * item per non-empty line, and `Shift+Enter` lets you type several lines by
 * hand (the field grows like a textarea) before a plain `Enter` submits all
 * of them at once. Used everywhere a single task/list/project name is
 * quick-added (see `ProjectView`, `TaskSelection`, `CreateProjectModal`).
 *
 * THIS COMPONENT HAS NO LOOK, AND THAT IS DELIBERATE (UI-18)
 * ----------------------------------------------------------
 * It is a bare `<textarea>` styled entirely by whoever renders it, so
 * "migrating it to Aurora Glass" meant giving its four call sites tokens —
 * which UI-15 and UI-16 already did. All four now pass `.ag-field` plus a
 * `--glass-well` style object, so the field carries the design system's
 * placeholder colour and sits in the same trough as an `Input`. Nothing here
 * should grow a surface of its own; a second opinion about what a field looks
 * like is exactly what this file must not have.
 *
 * The one class it does own is the hidden scrollbar. That was
 * `.no-scrollbar` from `src/index.css` — the old design's copy of it — and is
 * now `.ag-scroll` from `src/ui/screens.css`, which is the identical rule
 * under the design system's own name. It matters here for the same reason it
 * matters on a sheet: this field grows to 160px and then scrolls, and a track
 * appearing inside a pane of glass reads as browser chrome resting on the
 * surface.
 */
const BulkAddInput = forwardRef<HTMLTextAreaElement, BulkAddInputProps>(function BulkAddInput(
  { value, onChange, onSubmitLines, onCancel, onBlur, placeholder, className, style, autoFocus, ariaLabel },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    const lines = parseBulkLines(value);
    if (lines.length === 0) return;
    onSubmitLines(lines);
    onChange('');
  };

  return (
    <textarea
      ref={(node) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={(e) => {
        const pasted = e.clipboardData.getData('text');
        if (!pasted.includes('\n')) return;
        const lines = parseBulkLines(pasted);
        if (lines.length === 0) return;
        e.preventDefault();
        onSubmitLines(lines);
        onChange('');
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          submit();
        } else if (e.key === 'Escape') {
          onCancel?.();
        }
      }}
      onBlur={onBlur}
      placeholder={placeholder}
      className={`resize-none ag-scroll ${className ?? ''}`}
      style={{ ...style, overflow: 'hidden', maxHeight: '160px' }}
    />
  );
});

export default BulkAddInput;
