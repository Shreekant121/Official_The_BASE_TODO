/**
 * Aurora Glass — CommandPalette
 *
 * Ported at BUILD-9 from `design-system/components/overlay/CommandPalette.jsx`,
 * which had been drawn and never built. The look is the prototype's: one
 * heavy pane hung 14vh from the top, a search row ruled off from the results,
 * rows at 46px with the icon lit in accent while selected, a kicker on the
 * right naming the kind of thing each row is.
 *
 * WHAT CHANGED FROM THE PROTOTYPE, AND WHY
 *   1. It sits on `Dialog`. The prototype renders in place and drops a closed
 *      palette with `return null`; the Dialog brings the portal, the focus
 *      trap, focus return, the dissolve, the press-origin backdrop guard and
 *      the V3 scope across the portal — every one of which this app has had to
 *      learn the hard way (see the top of `Dialog.tsx`). `placement="top"` is
 *      the prototype's `paddingTop: 14vh`.
 *   2. It does not filter. The prototype matches `label` with `includes`; the
 *      app's search reads descriptions, ranks and caps by kind, and hands a
 *      question to Atlas when nothing matches, none of which belongs in a
 *      design-system component. So the query is CONTROLLED — the caller
 *      searches and passes back `items` — and this file only draws them and
 *      moves the selection.
 *   3. The keys ride the input, not `document`. The prototype's document
 *      listener would answer for a palette with a sheet stacked on top of it,
 *      and Escape here belongs to `useOverlayDismiss` in the caller (Dialog's
 *      port note 2), so this file does not handle Escape at all.
 *   4. A row may carry a `detail` line under its label — where a task lives.
 *      Not drawn in the prototype, whose rows are commands and task titles
 *      alone; without it two tasks called "Call" are one row twice.
 *   5. The group kicker reads `--kicker-transform` rather than writing
 *      `uppercase`, so it follows the V3 rule on its own.
 *   6. The lit row is one pad that glides (29-1P5c, idea 59): the arrows and
 *      the mouse slide it from result to result instead of each row lighting
 *      on its own. It is the selection, so it follows the keys too, and jumps
 *      without gliding when the results change under it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Icon } from '../core/Icon';
import { useGlide } from '../core/useGlide';
import { KeyCaps } from '../core/KeyCaps';
import { LitLine } from '../feedback/LitLine';
import { AskGlow } from '../feedback/AtlasAtRest';
import { litSafe } from '../feedback/litParts';

export interface CommandPaletteItem {
  /** Unique across the list; the row's key. */
  value: string;
  label: ReactNode;
  /** A quieter second line under the label. */
  detail?: ReactNode;
  icon?: ReactNode;
  /** Small kicker on the right, e.g. "Task". */
  group?: string;
  /** The command's key, drawn as raised keys before the kicker (idea 18, 29-1P6a). */
  keys?: string[];
  /** A task's id: holding the row peeks at it (idea 22, 29-1P6b, `lib/peek.ts`). */
  peek?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Already searched and ordered by the caller. See note 2. */
  items: CommandPaletteItem[];
  /** A row was chosen, by Enter or by a click. Closing is the caller's call. */
  onRun: (item: CommandPaletteItem) => void;
  placeholder?: string;
  /** Shown when `items` is empty; `**` lights words (`LitLine`). The default
   *  is his approved line (29-1P14c), with what he typed lit. */
  emptyText?: string;
  /** Rung on the app's stacking ladder, as `Dialog` takes it. */
  zIndex?: number;
}

const LIST_ID = 'ag-command-palette-list';

export function CommandPalette({
  open,
  onClose,
  query,
  onQueryChange,
  items,
  onRun,
  placeholder = 'Search tasks and commands',
  emptyText,
  zIndex,
}: CommandPaletteProps) {
  const [sel, setSel] = useState(0);
  /* Back to the first row whenever the results change under it — adjusted
     during render, the pattern `Dialog` uses for `open`, rather than in an
     effect that would draw one frame with the old row lit. */
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    setSel(0);
  }
  const listRef = useRef<HTMLDivElement | null>(null);

  const at = Math.min(sel, items.length - 1);

  /* Note 6: the pad goes to the lit row — gliding as the selection moves,
     jumping when the results changed or the palette has just opened. */
  const { pad: glidePad, moveTo: glideTo } = useGlide();
  const glidedFor = useRef<CommandPaletteItem[] | null>(null);
  useLayoutEffect(() => {
    if (!open) { glidedFor.current = null; glideTo(null); return; }
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${at}"]`) ?? null;
    glideTo(row, { snap: glidedFor.current !== items });
    glidedFor.current = items;
  }, [open, at, items, glideTo]);

  /* Keep the lit row in view as the arrows walk past the list's edge. */
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${at}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    /* An IME mid-word uses Enter and the arrows for itself. */
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel(Math.min(at + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel(Math.max(at - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = items[at];
      if (hit) onRun(hit);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={560}
      label="Command palette"
      closeOnEscape={false}
      zIndex={zIndex}
      placement="top"
      style={{
        gap: 0,
        padding: 0,
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        borderRadius: 'var(--r-xl)',
        overflow: 'hidden',
      }}
    >
      {/* 29-1P15b, idea 88: while he types, a violet line lights along
          the field's foot, as Atlas's ask box glows under it. */}
      <AskGlow typed={query.trim() !== ''} line>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
            padding: 'var(--sp-6) var(--sp-7)',
            borderBottom: '1px solid var(--line-soft)',
          }}
        >
          <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
            <Icon name="search" size={18} />
          </span>
          <input
            /* The Dialog keeps focus on whatever inside it already has it, so
               this is what the palette opens typing into. */
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={LIST_ID}
            aria-activedescendant={items[at] ? `${LIST_ID}-${at}` : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            style={{
              flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
              color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-base)',
            }}
          />
          <span
            aria-hidden="true"
            style={{
              font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)',
              padding: '3px 7px', borderRadius: 'var(--r-2xs)', boxShadow: 'inset 0 0 0 1px var(--line-soft)',
            }}
          >
            ESC
          </span>
        </div>
      </AskGlow>

      <div
        ref={listRef}
        id={LIST_ID}
        role="listbox"
        aria-label="Results"
        className="ag-scroll ag-fade"
        style={{ position: 'relative', maxHeight: 340, overflowY: 'auto', overscrollBehavior: 'contain', padding: 'var(--sp-3)' }}
      >
        <span ref={glidePad} className="ag-glide" aria-hidden="true" />
        {items.length === 0 && (
          <LitLine
            as="div"
            text={emptyText ?? (query.trim() === ''
              ? 'No matches.'
              : `Nothing matches **“${litSafe(query.trim())}”**. Try **a project**, **a task** or **a screen**.`)}
            style={{ padding: 'var(--sp-8)', textAlign: 'center', font: 'var(--type-body)', color: 'var(--fg-4)' }}
          />
        )}
        {items.map((c, i) => {
          const lit = i === at;
          return (
            <button
              key={c.value}
              id={`${LIST_ID}-${i}`}
              data-index={i}
              data-peek={c.peek}
              type="button"
              role="option"
              aria-selected={lit}
              /* Not focusable: focus stays in the field so typing never
                 stops, and the arrows are how the keyboard moves. */
              tabIndex={-1}
              onMouseMove={() => { if (!lit) setSel(i); }}
              onClick={() => onRun(c)}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                width: '100%', minHeight: 46, padding: 'var(--sp-2) var(--sp-5)',
                border: 0, textAlign: 'left', cursor: 'pointer',
                borderRadius: 'var(--r-sm)',
                /* The lit row's fill is the gliding pad (note 6). */
                background: 'transparent',
                color: lit ? 'var(--fg-1)' : 'var(--fg-2)',
                font: 'var(--type-body)',
                transition: 'color var(--dur-instant) var(--ease-glass)',
              }}
            >
              {c.icon && (
                <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', color: lit ? 'var(--job-lime)' : 'var(--fg-4)' }}>
                  {c.icon}
                </span>
              )}
              <span style={{ flex: 1, minWidth: 0, display: 'grid' }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                {c.detail && (
                  <span
                    style={{
                      font: 'var(--type-caption)', color: 'var(--fg-4)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {c.detail}
                  </span>
                )}
              </span>
              {c.keys && <KeyCaps keys={c.keys} />}
              {c.group && (
                <span
                  style={{
                    flex: '0 0 auto', font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                    textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-4)',
                  }}
                >
                  {c.group}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
