/**
 * PERT Estimation — RECONCILED (UI-27) against `PertDialog` in
 * `design-system/screens/deadlines.html`, which is where the real screen
 * defines it. Its own comment states the correction this session made:
 * *"A PERT dialog that was three inputs and a number. It is a distribution, so
 * it draws one."*
 *
 * WHAT WAS TAKEN
 * --------------
 * - **The shape gets drawn.** Three numbers describe a distribution, so the
 *   sheet plots it: a cyan→amber span from optimistic to pessimistic, a tick on
 *   each of the three, and the expected value as an emitting accent line
 *   labelled `E` that slides as you type. That drawing is the whole difference
 *   between a calculator and three boxes you are told to fill in.
 * - **It opens valid and already drawing.** The defaults come off the task's
 *   current allocation — `0.6×` and `1.8×` it, rounded to five minutes — so the
 *   sheet answers before it asks. The old file opened with three empty boxes
 *   and an expected time of zero.
 * - **A hint under each label, and a coloured dot that ties it to the drawing.**
 *   "Nothing gets in the way." / "The honest guess." / "Everything that can
 *   slip, slips."
 * - **`Deviation`, not `Variance`.** `(p − o) / 6` is a standard deviation; the
 *   old label named the wrong statistic. And the sentence the source spends it
 *   on — *"Roughly five in six sessions finish inside {e + sd}"* — which is
 *   what a deviation is actually FOR.
 * - **An order guard.** Optimistic ≤ most likely ≤ pessimistic, or the drawing
 *   is replaced by the sentence saying so and Allocate is disabled. The old
 *   file happily averaged a pessimistic 5 against an optimistic 90.
 * - Width 560 (was 460), the two-button footer, and an Allocate button that
 *   **says the number it will apply** — `variant="frost"`, the system's own
 *   choice for the single most important action on a busy surface.
 *
 * WHAT WAS KEPT
 * -------------
 * - **The contract and the arithmetic.** `(o + 4m + p) / 6`, `onApply` fires
 *   whole minutes and only above zero, and both call sites are untouched — Set
 *   Deadlines and `task-fields/EstimateField.tsx`, which opens this sheet over
 *   a modal, which is why `Z.modalOverModal` stays.
 * - `useOverlayDismiss` with `closeOnEscape={false}`, so Escape answers for the
 *   topmost overlay only. See Dialog's port note 2.
 * - The **render-phase reset off `isOpen`** rather than an unmount: `Dialog`
 *   holds its children through the dissolve, so a body that unmounted the
 *   instant it closed would leave an empty pane shrinking on screen. It now
 *   resets to the derived defaults instead of to blank.
 * - The hand-composed header, because this app's `Dialog` takes no `title` /
 *   `description` / `actions` props — the mockups compose all three inline and
 *   the port followed them.
 *
 * WHAT DIVERGES: the source stamps the row it came from with a "PERT ±12m"
 * kicker, so the estimate's provenance survives. That needs a stored field on
 * `Task`, which is a schema change and belongs to the functional queue, not to
 * a reconciliation. Not ported.
 *
 * The three inputs are the screen's own `TimeWell`, as they are in the source —
 * every other time on this screen is set in h/m and an estimate is not a
 * different kind of number.
 */
import { useState } from 'react';
import { Button, Dialog, Icon, IconButton } from '../ui';
import { TimeWell } from './TimeWell';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { formatSpanMinutes } from '../lib/timeSpan';
import { Z } from '../lib/zLayers';

interface PertEstimationModalProps {
  isOpen: boolean;
  /** Shown as a subtitle under the header, e.g. the task's title. */
  subtitle?: string;
  /** What the task is allocated now, in minutes. Seeds the three defaults. */
  baseMinutes?: number;
  onClose: () => void;
  /** Called with the PERT expected time in whole minutes when Allocate is pressed. */
  onApply: (expectedMinutes: number) => void;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** The source's own seeds: 0.6× and 1.8× what is allocated now. */
function defaultsFor(baseMinutes: number | undefined) {
  const base = Math.max(5, Math.round(baseMinutes || 0) || 30);
  return { o: round5(base * 0.6), m: base, p: round5(base * 1.8) };
}

/**
 * Shared PERT (Optimistic / Most Likely / Pessimistic) estimation dialog.
 * Used by both the Set Deadlines page and the task detail panel so the
 * calculator looks and behaves identically everywhere it appears.
 */
export default function PertEstimationModal({
  isOpen, subtitle, baseMinutes, onClose, onApply,
}: PertEstimationModalProps) {
  useOverlayDismiss(isOpen, onClose);

  const [{ o, m, p }, setEstimate] = useState(() => defaultsFor(baseMinutes));

  // Back to the defaults for THIS task each time the sheet opens, so the
  // numbers from the last one are never sitting in the boxes for this one.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) setEstimate(defaultsFor(baseMinutes));
  }

  const valid = o <= m && m <= p && p > 0;
  const expected = valid ? (o + 4 * m + p) / 6 : 0;
  const deviation = valid ? (p - o) / 6 : 0;
  const safe = expected + deviation;

  const handleApply = () => {
    const whole = Math.round(expected);
    if (valid && whole > 0) onApply(whole);
  };

  /* Where a value sits across the drawing, 0–100%. */
  const lo = Math.min(o, m, p);
  const hi = Math.max(o, m, p, 1);
  const at = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);

  const rows = [
    { key: 'o' as const, label: 'Optimistic', hint: 'Nothing gets in the way.', value: o, dot: 'var(--hue-cyan)' },
    { key: 'm' as const, label: 'Most likely', hint: 'The honest guess.', value: m, dot: 'var(--fg-1)' },
    { key: 'p' as const, label: 'Pessimistic', hint: 'Everything that can slip, slips.', value: p, dot: 'var(--hue-amber)' },
  ];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={560}
      labelledBy="pert-title"
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.modalOverModal}
      style={{ gap: 'var(--sp-7)' }}
    >
      <header style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 44,
              height: 44,
              flex: '0 0 auto',
              borderRadius: 'var(--r-circle)',
              backgroundImage: 'var(--glass-fill-2)',
              boxShadow: 'var(--glass-rim-2)',
              color: 'var(--fg-2)',
            }}
          >
            <Icon name="calculator" size={20} />
          </span>
          <h2
            id="pert-title"
            style={{
              flex: 1,
              minWidth: 0,
              font: 'var(--type-title)',
              fontSize: 'var(--text-xl)',
              letterSpacing: 'var(--tracking-title)',
              color: 'var(--fg-1)',
            }}
          >
            PERT estimation
          </h2>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </div>
        {subtitle && (
          <p
            className="ag-clamp-2"
            style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}
          >
            {subtitle}
          </p>
        )}
      </header>

      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        {rows.map(({ key, label, hint, value, dot }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
            <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-label)', color: 'var(--fg-1)' }}>
                {/* The dot is the tie between this row and its tick in the
                    drawing below — the same three colours, in the same order. */}
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--r-circle)', background: dot, flex: '0 0 auto' }} />
                {label}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{hint}</span>
            </div>
            <TimeWell
              size="sm"
              seconds={value * 60}
              name={`for the ${label.toLowerCase()} estimate`}
              onSeconds={(secs) => setEstimate((cur) => ({ ...cur, [key]: Math.round(secs / 60) }))}
            />
          </div>
        ))}
      </div>

      {/* A trough, because this is what you read OUT of the three you put in —
          the Card/Well inversion in `layout/panels.tsx`. */}
      <div
        style={{
          display: 'grid',
          gap: 'var(--sp-4)',
          padding: 'var(--sp-6)',
          borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow)',
        }}
      >
        {valid ? (
          <>
            <div aria-hidden="true" style={{ position: 'relative', height: 56 }}>
              <span
                style={{
                  position: 'absolute', left: `${at(o)}%`, right: `${100 - at(p)}%`, bottom: 12, height: 6,
                  borderRadius: 'var(--r-pill)',
                  background: 'linear-gradient(90deg, oklch(0.70 0.15 210 / 0.45), oklch(0.75 0.15 82 / 0.45))',
                }}
              />
              {[
                { v: o, c: 'var(--hue-cyan)', h: 18 },
                { v: m, c: 'var(--fg-1)', h: 34 },
                { v: p, c: 'var(--hue-amber)', h: 18 },
              ].map((k, i) => (
                <span
                  key={i}
                  style={{
                    position: 'absolute', left: `${at(k.v)}%`, bottom: 12, width: 2, height: k.h,
                    marginLeft: -1, borderRadius: 1, background: k.c, opacity: 0.8,
                  }}
                />
              ))}
              <span
                style={{
                  position: 'absolute', left: `${at(expected)}%`, bottom: 6, width: 2, height: 46, marginLeft: -1,
                  borderRadius: 1, background: 'var(--accent)', boxShadow: '0 0 12px 0 var(--accent)',
                  transition: 'left var(--dur-base) var(--ease-glass)',
                }}
              />
              <span
                style={{
                  position: 'absolute', left: `${at(expected)}%`, bottom: 52, transform: 'translateX(-50%)',
                  font: 'var(--type-kicker)', color: 'var(--accent)', whiteSpace: 'nowrap',
                }}
              >
                E
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 2 }}>
                <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>Expected</span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-3xl)', color: 'var(--fg-1)',
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                  }}
                >
                  {formatSpanMinutes(expected)}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>Deviation</span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-lg)', color: 'var(--fg-3)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  ±{formatSpanMinutes(deviation)}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty', maxWidth: '26ch' }}>
                Roughly five in six sessions finish inside {formatSpanMinutes(safe)}.
              </span>
            </div>
          </>
        ) : (
          <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'oklch(0.95 0.07 82)' }}>
            Optimistic must be the shortest and pessimistic the longest.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--sp-4)' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="frost"
          disabled={!valid || Math.round(expected) <= 0}
          onClick={handleApply}
          iconRight={<Icon name="check" size={16} />}
        >
          {valid ? `Allocate ${formatSpanMinutes(expected)}` : 'Allocate'}
        </Button>
      </div>
    </Dialog>
  );
}
