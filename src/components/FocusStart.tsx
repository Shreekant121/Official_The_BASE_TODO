/**
 * Starting a task on Focus, and the time in it (29-1P10a). Four pieces the
 * stage in `FocusMode.tsx` places; the run they read is `useFocusRun`'s.
 *
 *   - `FocusBreath` — idea 95, "Settle in with one breath". One soft teal
 *     circle grows as he breathes in and shrinks as he breathes out, then the
 *     clock starts. Five seconds, Skip always there. His call: only at the
 *     start of a session. It plays from `settleUntil`, so coming back to the
 *     screen mid-breath picks it up where it is rather than starting over.
 *   - `FocusIntent` — idea 96, "Say what done looks like": "When this ends,
 *     I'll have…", asked under the title before the task's clock first runs,
 *     then shown there as his own words while he works (press it to change).
 *   - `DoneQuestion` — Mark done asks about that line: Yes, Partly, Not yet.
 *     His call: Not yet keeps the task open and the clock going.
 *   - `AddTime` — idea 97, "Drag the minutes": +5m / +15m became one
 *     "+ time" that opens the minute ruler, saying when the task would end.
 *
 * Nothing here loops at rest: the breath is one five-second Web Animation that
 * exists only while the session is settling in.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { PortalDropdown } from './PortalDropdown';
import { formatClock, formatSpan } from '../lib/timeSpan';
import { doneQuestion, INTENT_MAX, SETTLE_MS, SETTLE_TURN_MS } from '../lib/focusIntent';
import { GelButton, Icon, MetaKicker, MinuteRuler, SoftButton, WhiteButton } from '../ui';

/* ── 95: the breath ──────────────────────────────────────────────────── */

export function FocusBreath({ until, onSkip }: { until: number; onSkip: () => void }) {
  const circle = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [out, setOut] = useState(false);

  /* A layout effect, so the circle never paints a frame at the wrong size
     before the animation takes it. One animation for the whole breath, its
     clock set to how far into the breath we already are. */
  useLayoutEffect(() => {
    const elapsed = Math.max(0, SETTLE_MS - (until - Date.now()));
    const el = circle.current;
    const anim = el && !reduced
      ? el.animate(
        [
          { transform: 'scale(0.5)', easing: 'ease-in-out' },
          { transform: 'scale(1)', offset: SETTLE_TURN_MS / SETTLE_MS, easing: 'ease-in-out' },
          { transform: 'scale(0.55)' },
        ],
        { duration: SETTLE_MS, fill: 'both' },
      )
      : null;
    if (anim) anim.currentTime = elapsed;
    const turn = window.setTimeout(() => setOut(true), Math.max(0, SETTLE_TURN_MS - elapsed));
    return () => { anim?.cancel(); window.clearTimeout(turn); };
  }, [until, reduced]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 'var(--sp-4)' }}
    >
      <div style={{ display: 'grid', placeItems: 'center', width: 140, height: 140 }}>
        <div
          ref={circle}
          aria-hidden="true"
          style={{
            gridArea: '1 / 1', width: 140, height: 140, borderRadius: '50%',
            transform: reduced ? 'scale(0.8)' : 'scale(0.5)',
            backgroundImage:
              'radial-gradient(circle, color-mix(in oklab, var(--job-teal) 55%, transparent),'
              + ' color-mix(in oklab, var(--job-teal) 8%, transparent) 70%)',
            boxShadow: 'var(--job-teal-shine-md), inset 0 0 0 1px var(--job-teal-line)',
          }}
        />
        <span style={{ gridArea: '1 / 1', font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>
          {out ? '…and out.' : 'Breathe in…'}
        </span>
      </div>
      <SoftButton size="sm" onClick={onSkip}>Skip</SoftButton>
    </div>
  );
}

/* ── 96: what done looks like ────────────────────────────────────────── */

export function FocusIntent({
  intent, asking, onChange, onEditing, onEnter,
}: {
  intent: string;
  /** Show the box: before the task's clock first runs, or while he is changing the line. */
  asking: boolean;
  onChange: (intent: string) => void;
  onEditing: (editing: boolean) => void;
  /** Enter in the box. Before the clock has run, that is Start. */
  onEnter: () => void;
}) {
  const line = intent.trim();
  if (asking) {
    return (
      <label style={{ display: 'grid', gap: 'var(--sp-2)', width: '100%', maxWidth: 420, textAlign: 'left' }}>
        <MetaKicker tone="var(--fg-3)">When this ends, I’ll have…</MetaKicker>
        <input
          className="ag-field"
          data-ag-field=""
          value={intent}
          maxLength={INTENT_MAX}
          placeholder="uploaded the signed forms"
          enterKeyHint="go"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onEditing(true)}
          onBlur={() => onEditing(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            e.currentTarget.blur();
            onEnter();
          }}
          style={{
            height: 40, padding: '0 var(--sp-5)', border: 0, outline: 'none',
            borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-well)',
            boxShadow: 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
            font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
          }}
        />
      </label>
    );
  }
  if (!line) return null;
  return (
    <button
      type="button"
      title="Change what done looks like"
      onClick={() => onEditing(true)}
      style={{
        maxWidth: '32ch', padding: 0, border: 0, background: 'none', cursor: 'pointer',
        font: 'var(--type-body)', fontSize: 'var(--text-md)', fontStyle: 'italic',
        color: 'var(--fg-2)', textWrap: 'balance',
      }}
    >
      <span aria-hidden="true" style={{ color: 'var(--job-teal-text)', fontStyle: 'normal' }}>→ </span>
      {line}
    </button>
  );
}

/** Mark done's question, in place of the controls until he answers. */
export function DoneQuestion({
  intent, onAnswer,
}: {
  intent: string;
  onAnswer: (answer: 'yes' | 'partly' | 'notYet') => void;
}) {
  return (
    <div
      role="group"
      aria-label="Did you do what you said?"
      style={{
        display: 'grid', justifyItems: 'center', gap: 'var(--sp-5)', maxWidth: 460,
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <p style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)', textWrap: 'balance' }}>
        {doneQuestion(intent)}
      </p>
      <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-4)' }}>
        <SoftButton onClick={() => onAnswer('notYet')}>Not yet</SoftButton>
        <SoftButton onClick={() => onAnswer('partly')}>Partly</SoftButton>
        {/* Yes finishes the task: done is lime's, as Mark done was. */}
        <GelButton colour="lime" tile={false} onClick={() => onAnswer('yes')} icon={<Icon name="check" size={18} />}>
          Yes
        </GelButton>
      </div>
    </div>
  );
}

/* ── 97: + time ──────────────────────────────────────────────────────── */

/** Minutes past midnight, for `formatClock`. */
function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function AddTime({
  timeLeft, running, now, onAdd, onOpenChange,
}: {
  /** Seconds left on the task's clock; negative once over. */
  timeLeft: number;
  running: boolean;
  /** The screen's repaint clock, so the hint never reads `Date.now()` in a render. */
  now: number;
  onAdd: (seconds: number) => void;
  /** The ruler opened or closed: the pill's panel stays open while it is (29-1P11b). */
  onOpenChange?: (open: boolean) => void;
}) {
  const trigger = useRef<HTMLSpanElement>(null);
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => { setOpenState(next); onOpenChange?.(next); };
  /* Kept between opens: the last amount he chose is the likeliest next one. */
  const [minutes, setMinutes] = useState(15);
  const after = timeLeft + minutes * 60;
  const hint = after <= 0
    ? 'still over the time you gave it'
    : running
      ? `ends at ${formatClock(minutesOfDay(now + after * 1000))}`
      : `${formatSpan(after)} left on this task`;

  return (
    <>
      {/* The anchor is a wrapper: `SoftButton` takes no ref. */}
      <span ref={trigger} style={{ display: 'inline-flex' }}>
      <SoftButton
        size="sm"
        aria-expanded={open}
        title="Add time to this task"
        icon={<Icon name="plus" size={14} />}
        onClick={() => setOpen(!open)}
      >
        time
      </SoftButton>
      </span>
      <PortalDropdown isOpen={open} onClose={() => setOpen(false)} triggerRef={trigger} width={320}>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-5) var(--sp-4) var(--sp-4)' }}>
          <MinuteRuler label="Minutes to add" sign="+" value={minutes} min={5} max={120} hint={hint} onChange={setMinutes} />
          <WhiteButton size="sm" onClick={() => { onAdd(minutes * 60); setOpen(false); }}>
            Add {formatSpan(minutes * 60)}
          </WhiteButton>
        </div>
      </PortalDropdown>
    </>
  );
}
