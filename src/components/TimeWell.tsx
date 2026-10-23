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
 * - **`tone="coral"`**, for the one reading on the screen that can be wrong (a
 *   session window the plan has outrun). Over time is coral's job (29-1P2c2;
 *   it was amber, which is gold's hue).
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
 *
 * 29-1P10a, IDEA 97 — THE RULER. Given `ruler`, a press on the time opens
 * `MinuteRuler` under it (his call: "tapping a task's time opens the same
 * ruler; the boxes stay for typing"). With a mouse the caret still lands in
 * the box, so typing is unchanged. With a finger the keyboard is held back
 * (`inputMode="none"`) while the ruler is open — a keyboard rising over the
 * ruler it was opened for is the one thing the press did not ask for — and
 * "Type it" under the ruler brings it up. The boxes follow the ruler as it
 * slides; the task is written once it comes to rest, not on every click.
 */
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon, MinuteRuler, SoftButton } from '../ui';
import { cue } from '../lib/sound';
import { PortalDropdown } from './PortalDropdown';

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
  tone?: 'coral';
  /** Open the minute ruler on a press (29-1P10a). `hint` says what a length would mean. */
  ruler?: { hint?: (seconds: number) => ReactNode; maxMinutes?: number };
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
  ruler,
}: TimeWellProps) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const wellRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const [rulerOpen, setRulerOpen] = useState(false);
  /** Opened by a finger: the keyboard stays down until "Type it". */
  const [byTouch, setByTouch] = useState(false);
  /** Minutes the ruler is on before it comes to rest and writes. */
  const [sliding, setSliding] = useState<number | null>(null);
  const closeRuler = () => { setRulerOpen(false); setByTouch(false); setSliding(null); };
  const shownSeconds = rulerOpen && sliding !== null ? sliding * 60 : seconds;
  const h = Math.floor(shownSeconds / 3600);
  const m = Math.floor((shownSeconds % 3600) / 60);
  const blank = blankWhenZero && !shownSeconds;

  const big = size === 'lg';
  const height = big ? 52 : size === 'sm' ? 36 : 40;
  const numeral = big ? 'var(--text-xl)' : size === 'sm' ? 'var(--text-sm)' : 'var(--text-md)';

  const set = (nh: number, nm: number) => onSeconds(Math.min(MAX_SECONDS, Math.max(0, nh * 3600 + nm * 60)));
  /* 29-1P3, 123: every bump of the hours or minutes clicks. */
  const bump = (deltaSeconds: number) => {
    cue('detent');
    onSeconds(Math.min(MAX_SECONDS, Math.max(0, seconds + deltaSeconds)));
  };

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
    color: tone === 'coral' ? 'var(--job-coral-text)' : 'var(--fg-1)',
  };

  const keyboard = byTouch ? 'none' : 'numeric';

  return (
    <>
    <div
      ref={wellRef}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={ruler ? (e) => {
        /* The ±15 nudges are their own press. */
        if ((e.target as Element).closest('button')) return;
        if (!rulerOpen) setByTouch(e.pointerType !== 'mouse');
        setRulerOpen(true);
      } : undefined}
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
          ? 'var(--glass-well-shadow), var(--job-lime-focus)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <input
        className="ag-field"
        data-ag-field=""
        ref={hoursRef}
        inputMode={keyboard}
        placeholder="00"
        aria-label={`Hours ${name}`}
        value={blank ? '' : pad(h)}
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => { setSliding(null); set(digits(e.target.value, 23), m); }}
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
        inputMode={keyboard}
        placeholder="00"
        aria-label={`Minutes ${name}`}
        value={blank ? '' : pad(m)}
        onFocus={(e) => { setFocus(true); e.target.select(); }}
        onBlur={() => setFocus(false)}
        onChange={(e) => { setSliding(null); set(h, digits(e.target.value, 59)); }}
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

    {ruler && (
      <PortalDropdown isOpen={rulerOpen} onClose={closeRuler} triggerRef={wellRef} width={320} align="right">
        {/* Portalled, but React still bubbles its presses to the row it was
            opened from — and that row is a drag handle on Set Deadlines. */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-5) var(--sp-4) var(--sp-4)' }}
        >
          <MinuteRuler
            label={`Time ${name}`}
            value={sliding ?? Math.round(seconds / 60)}
            max={ruler.maxMinutes ?? 480}
            hint={ruler.hint?.((sliding ?? Math.round(seconds / 60)) * 60)}
            onChange={setSliding}
            onCommit={(minutes) => { onSeconds(minutes * 60); setSliding(null); }}
          />
          {byTouch && (
            <SoftButton
              size="sm"
              icon={<Icon name="keyboard" size={14} />}
              onClick={() => { setByTouch(false); window.setTimeout(() => hoursRef.current?.focus(), 0); }}
            >
              Type it
            </SoftButton>
          )}
        </div>
      </PortalDropdown>
    )}
    </>
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
