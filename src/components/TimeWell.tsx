/**
 * The h/m pair, seated in a well — Set Deadlines' one field.
 *
 * RECONCILED (UI-27) against `TimeField` in `design-system/screens/deadlines.html`,
 * which is where the real screen defines this control. It is not a design-system
 * *component* — the mockup composes it inline, like `Kicker` and `Well` — so the
 * mockup is the whole of the source for it.
 *
 * WHAT WAS TAKEN
 * --------------
 * - **A pill, not a rounded rectangle** (`--r-pill`), with the digits set to the
 *   right rather than centred and the unit as a `--text-2xs` mono kicker beside
 *   them, so "01h 30m" reads as one number instead of four boxes.
 * - **Three sizes.** 40px `md`, 52px `lg` for the one that sets the session,
 *   and `sm` for a subtask row. The old file was 44px everywhere.
 * - **A ±15 stepper that only appears when you reach for it** — the row stays a
 *   readout until the pointer is over it or the caret is in it.
 * - **Arrow keys bump**: ±1h on the hours box, ±5m on the minutes box.
 * - **`locked`** — the shape a parent with subtasks takes. A `--glass-fill-1`
 *   pill with a Σ and `--fg-2` digits, which says *this number is the sum of
 *   what is below it* without a sentence. The mockup: *"a parent with subtasks
 *   stops being typed at all — its allocation is the sum."*
 * - **`tone="amber"`**, for the one reading on the screen that can be wrong (a
 *   session window the plan has outrun).
 * - The source's own digit parse — strip everything that is not a digit, keep
 *   the last two, clamp — instead of `parseInt`, which turned "1e5" into 1 and
 *   let "99" stand as an hour.
 *
 * WHAT WAS KEPT
 * -------------
 * - **The boxes are real `<input>` elements, and that is load-bearing**
 *   (IMPROVEMENTS.md flags it on UI-10). Two rules key off the tag: `index.css`
 *   exempts `[data-drag-row] input` back to `user-select: text`, or the digits
 *   cannot be selected to correct them on a tablet; and `SortableList`'s
 *   `isInteractiveTarget` lets a press on an `input` through instead of
 *   starting a drag.
 * - **`blankWhenZero`** — empty boxes rather than `00h 00m` when nothing is
 *   allocated. The source always pads; this app pairs the blank with a "Needs
 *   time" pill and a disabled Start Protocol, so the field has to look
 *   unanswered rather than answered with zero.
 * - `.ag-field` and `data-ag-field`, which keep `index.css`'s number-input rule
 *   and `base.css`'s global focus outline off these boxes — the well lights up
 *   instead, which is the system's rule for a composed field.
 *
 * WHAT CHANGED IN THE CONTRACT: `onHours`/`onMinutes` became one
 * `onSeconds(total)`. Every call site already rebuilt the total from the two
 * halves, and the stepper and the arrow keys have no half to report.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Icon } from '../ui';

export type TimeWellSize = 'sm' | 'md' | 'lg';

export interface TimeWellProps {
  seconds: number;
  /** Show empty boxes rather than `00` when nothing is allocated yet. */
  blankWhenZero?: boolean;
  /** Called with the new total in seconds. */
  onSeconds: (seconds: number) => void;
  /** Names the two fields for a screen reader, e.g. "allocated". */
  name: string;
  size?: TimeWellSize;
  /** Rolled up from below: a read-only Σ pill instead of two inputs. */
  locked?: boolean;
  /** The one reading here that can be wrong. */
  tone?: 'amber';
}

/** The source's clamp: hours to 23, minutes to 59, so 23h 59m is the ceiling. */
const MAX_SECONDS = (23 * 60 + 59) * 60;

const pad = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Strip anything that is not a digit, keep the last two, clamp. */
function digits(raw: string, cap: number): number {
  const n = Number(raw.replace(/[^0-9]/g, '').slice(-2) || 0);
  return Math.min(cap, n);
}

export function TimeWell({
  seconds,
  blankWhenZero = false,
  onSeconds,
  name,
  size = 'md',
  locked = false,
  tone,
}: TimeWellProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const blank = blankWhenZero && !seconds;

  const big = size === 'lg';
  const height = big ? 52 : size === 'sm' ? 36 : 40;
  const numeral = big ? 'var(--text-xl)' : size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)';

  const set = (nh: number, nm: number) => onSeconds(Math.min(MAX_SECONDS, Math.max(0, nh * 3600 + nm * 60)));
  const bump = (deltaSeconds: number) => onSeconds(Math.min(MAX_SECONDS, Math.max(0, seconds + deltaSeconds)));

  const unit: CSSProperties = {
    font: 'var(--type-kicker)',
    fontSize: 'var(--text-2xs)',
    color: 'var(--fg-4)',
    marginLeft: 1,
  };

  if (locked) {
    return (
      /* `role="img"` rather than a bare `aria-label`: the digits inside are
         split across five elements with a glyph in the middle, so they have to
         be announced as one reading — and an `aria-label` on a *generic* span
         is not reliably exposed at all, which would have left this field
         silent now that it is no longer a pair of labelled inputs. */
      <span
        role="img"
        title="Rolled up from the subtasks"
        aria-label={`${pad(h)} hours ${pad(m)} minutes ${name}, rolled up from the subtasks`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          height,
          flex: '0 0 auto',
          padding: '0 var(--sp-5)',
          borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-fill-1)',
          boxShadow: 'var(--glass-rim-1)',
        }}
      >
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)' }}>
          <Icon name="sigma" size={13} />
        </span>
        <span
          aria-hidden="true"
          style={{ font: 'var(--type-numeric)', fontSize: numeral, color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}
        >
          {pad(h)}
        </span>
        <span aria-hidden="true" style={unit}>h</span>
        <span
          aria-hidden="true"
          style={{
            font: 'var(--type-numeric)', fontSize: numeral, color: 'var(--fg-2)',
            fontVariantNumeric: 'tabular-nums', marginLeft: 6,
          }}
        >
          {pad(m)}
        </span>
        <span aria-hidden="true" style={unit}>m</span>
      </span>
    );
  }

  const cell: CSSProperties = {
    width: big ? 40 : 26,
    padding: 0,
    border: 0,
    outline: 'none',
    boxShadow: 'none',
    background: 'transparent',
    textAlign: 'right',
    font: 'var(--type-numeric)',
    fontSize: numeral,
    fontVariantNumeric: 'tabular-nums',
    color: tone === 'amber' ? 'oklch(0.95 0.07 82)' : 'var(--fg-1)',
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-2)',
        height,
        flex: '0 0 auto',
        padding: big ? '0 var(--sp-3) 0 var(--sp-6)' : '0 var(--sp-2) 0 var(--sp-5)',
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: focus
          ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <input
        className="ag-field"
        data-ag-field=""
        inputMode="numeric"
        placeholder="00"
        aria-label={`Hours ${name}`}
        value={blank ? '' : pad(h)}
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => set(digits(e.target.value, 23), m)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(3600); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-3600); }
        }}
        style={cell}
      />
      <span style={unit}>h</span>
      <input
        className="ag-field"
        data-ag-field=""
        inputMode="numeric"
        placeholder="00"
        aria-label={`Minutes ${name}`}
        value={blank ? '' : pad(m)}
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => set(h, digits(e.target.value, 59))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); bump(300); }
          if (e.key === 'ArrowDown') { e.preventDefault(); bump(-300); }
        }}
        style={{ ...cell, marginLeft: 6 }}
      />
      <span style={{ ...unit, marginRight: 0 }}>m</span>

      {/* The row stays a readout until you reach for it. */}
      <span
        style={{
          display: 'grid',
          gap: 1,
          marginLeft: 'var(--sp-3)',
          opacity: hover || focus ? 1 : 0,
          pointerEvents: hover || focus ? 'auto' : 'none',
          transition: 'opacity var(--dur-fast) var(--ease-glass)',
        }}
      >
        <Nudge label={`Add 15 minutes to ${name}`} icon="chevron-up" big={big} onClick={() => bump(900)} />
        <Nudge label={`Take 15 minutes off ${name}`} icon="chevron-down" big={big} onClick={() => bump(-900)} />
      </span>
    </div>
  );
}

function Nudge({
  label, icon, big, onClick,
}: {
  label: string;
  icon: 'chevron-up' | 'chevron-down';
  big: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: big ? 26 : 22,
        height: big ? 22 : 18,
        padding: 0,
        border: 0,
        cursor: 'pointer',
        borderRadius: 'var(--r-2xs)',
        backgroundImage: hover ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)',
        boxShadow: hover ? 'var(--glass-rim-2)' : 'none',
        color: hover ? 'var(--fg-1)' : 'var(--fg-3)',
        transition: 'var(--t-hover)',
      }}
    >
      <Icon name={icon} size={12} />
    </button>
  );
}
