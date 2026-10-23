/**
 * While you work (29-1P10b): the cards Focus shows in the middle of a task.
 * When each one shows is `lib/focusMoments.ts`; what it holds is
 * `useFocusRun`'s. Each card is a plain piece the `/design` page can draw on
 * a pretend task, and a host that places it.
 *
 *   - `AwayCard` / `FocusAwayHost` — idea 101, "You were away 4 min. The
 *     timer kept going." On every screen, because leaving BASE is leaving all
 *     of them (mounted in `App.tsx` beside the pill). Count them is the white
 *     confirm; Don't count them takes the minutes off his hours and puts them
 *     back on the clocks. No scolding, and it waits for his answer.
 *   - `HalfwayNote` — idea 103, "Halfway. Still on <task>?" On Focus only,
 *     silent, ten seconds with a draining line, then gone. Yes keeps going;
 *     Switch pauses the clock and opens `SwitchPicker`, today's queue.
 *   - `WrapUp` — idea 102's button beside a gold clock: it opens Mark done.
 *
 * Nothing here loops: the draining line moves on the second, with the clock.
 */
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Dialog, Icon, IconButton, SoftButton, useGlide, WhiteButton } from '../ui';
import { useFocusRun } from '../store/useFocusRun';
import { useUIStore } from '../store/useUIStore';
import { awayWords } from '../lib/focusMoments';
import { formatSpan } from '../lib/timeSpan';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';

/** The glass both cards are drawn on: the toast's material, a rounded rectangle. */
export function MomentCard({ icon, children, actions, drain }: {
  icon: 'hourglass' | 'timer';
  children: ReactNode;
  actions: ReactNode;
  /** 0-1 of the card's time left, for a card that goes on its own. */
  drain?: number;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-4) var(--sp-6)',
        maxWidth: 'min(560px, calc(100vw - 2 * var(--gutter-page-sm)))',
        padding: 'var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-6)',
        borderRadius: 'var(--r-md)',
        backgroundImage: 'var(--glass-fill-2)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        backdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flex: '1 1 220px', minWidth: 0 }}>
        <span style={{ display: 'flex', color: 'var(--job-teal)', flex: '0 0 auto' }}>
          <Icon name={icon} size={18} />
        </span>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
          {children}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginLeft: 'auto' }}>{actions}</span>
      {drain != null && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 0, bottom: 0, height: 2,
            width: `${Math.max(0, Math.min(1, drain)) * 100}%`,
            background: 'var(--job-teal)', opacity: 0.7,
            /* On the second, like every clock in Focus: linear, never eased. */
            transition: 'width 1s linear',
          }}
        />
      )}
    </div>
  );
}

/* ── 101: away ───────────────────────────────────────────────────────── */

export function AwayCard({ awayMs, onAnswer }: { awayMs: number; onAnswer: (count: boolean) => void }) {
  return (
    <MomentCard
      icon="hourglass"
      actions={(
        <>
          <SoftButton size="sm" onClick={() => onAnswer(false)}>Don’t count them</SoftButton>
          <WhiteButton size="sm" onClick={() => onAnswer(true)}>Count them</WhiteButton>
        </>
      )}
    >
      You were away {awayWords(awayMs)}. The timer kept going.
    </MomentCard>
  );
}

/** Top centre, the same lane on every screen; never on the share view or sign-in. */
export function FocusAwayHost() {
  const away = useFocusRun((s) => s.away);
  const answerAway = useFocusRun((s) => s.answerAway);
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const { pathname } = useLocation();
  const shown = away !== null && !overlayOpen && pathname !== '/login' && !pathname.startsWith('/s/');
  return (
    <MomentLane top>
      <AnimatePresence>
        {shown && (
          <motion.div
            key={away.from}
            initial={{ opacity: 0, y: -14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -14, scale: 0.97 }}
            style={{ pointerEvents: 'auto' }}
          >
            <AwayCard awayMs={away.to - away.from} onAnswer={answerAway} />
          </motion.div>
        )}
      </AnimatePresence>
    </MomentLane>
  );
}

/** A centred, click-through lane at the top of the window for a card to ride in. */
export function MomentLane({ children, top }: { children: ReactNode; top?: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0,
        ...(top ? { top: 'calc(var(--sp-5) + var(--safe-t))' } : {}),
        display: 'grid', placeItems: 'center', padding: '0 var(--gutter-page-sm)',
        zIndex: Z.toast, pointerEvents: 'none',
      }}
    >
      {children}
    </div>
  );
}

/* ── 103: halfway ────────────────────────────────────────────────────── */

export function HalfwayNote({ title, drain, onYes, onSwitch }: {
  title: string;
  /** 0-1 of its ten seconds left. */
  drain: number;
  onYes: () => void;
  /** Absent when there is no other task to switch to. */
  onSwitch?: () => void;
}) {
  return (
    <MomentCard
      icon="timer"
      drain={drain}
      actions={(
        <>
          {onSwitch && <SoftButton size="sm" onClick={onSwitch}>Switch</SoftButton>}
          <WhiteButton size="sm" onClick={onYes}>Yes</WhiteButton>
        </>
      )}
    >
      Halfway. Still on <strong style={{ fontWeight: 'var(--weight-semibold)' }}>{title}</strong>?
    </MomentCard>
  );
}

/** Switch's list: today's queue after the task on the clock. One tap puts a task on it. */
export function SwitchPicker({ tasks, onPick, onClose }: {
  tasks: Array<{ id: string; title: string; seconds: number }>;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  useOverlayDismiss(true, onClose);
  const { pad, hostProps } = useGlide();
  return (
    <Dialog
      open
      onClose={onClose}
      width={440}
      label="Switch to another task"
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-sheet)', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
              Switch to…
            </h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              The clock is paused. The task you were on stays next in line.
            </p>
          </div>
          <IconButton label="Keep going on this one" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>
        <div
          className="ag-scroll ag-fade"
          role="listbox"
          aria-label="Today's queue"
          style={{ position: 'relative', display: 'grid', gap: 2, maxHeight: '56vh', overflowY: 'auto', overscrollBehavior: 'contain' }}
          {...hostProps}
        >
          <span ref={pad} className="ag-glide" aria-hidden="true" />
          {tasks.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={false}
              data-glide=""
              onClick={() => onPick(t.id)}
              style={{
                position: 'relative', zIndex: 1,
                display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
                padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-md)', cursor: 'pointer',
                textAlign: 'left', background: 'transparent', color: 'var(--fg-1)', font: 'var(--type-label)',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>
                {formatSpan(t.seconds)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/* ── 102: flow ───────────────────────────────────────────────────────── */

/** Beside a gold clock: wrap up whenever he is ready (opens Mark done). */
export function WrapUp({ onClick }: { onClick: () => void }) {
  return (
    <SoftButton
      size="sm"
      onClick={onClick}
      icon={<Icon name="flag-triangle-right" size={15} style={{ color: 'var(--job-gold)' }} />}
    >
      Wrap up
    </SoftButton>
  );
}
