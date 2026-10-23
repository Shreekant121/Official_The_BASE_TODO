/**
 * A real break (29-1P11a, idea 104, after Pomofocus and Stretchly).
 *
 *   - `BreakOffer` — in pomodoro mode, when a focus block ends: "25 minutes
 *     of focus. Time for a 5-minute break." Keep going starts a fresh block;
 *     Take a break starts it. The away card's lane and glass, on every screen.
 *   - `BreakCard` — the break itself, in calm teal: its countdown and one
 *     small thing to do from his own list, with Another idea and +2 min. At
 *     zero it says "Break over. Ready when you are." and waits for Back to
 *     work, so a break never turns into minutes counted while he is away.
 *   - `FocusBreakHost` — places both, once, in `App.tsx`.
 *
 * His calls: pomodoro mode only; his own lengths (Settings → Brown noise); his own list, seeded with hundreds; break time does not count (the
 * run is paused through it). What is offered when is `lib/breaks.ts`, the
 * state is `useFocusBreak`, the timers are `FocusRunHost`'s.
 *
 * Nothing loops: the break's clock repaints on the second only while it runs.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { BlurAcross, Dialog, Icon, MetaKicker, SoftButton, WhiteButton } from '../ui';
import { useFocusRun } from '../store/useFocusRun';
import { takeBreak, useFocusBreak, type BreakOn } from '../store/useFocusBreak';
import { useUIStore } from '../store/useUIStore';
import { getNoisePrefs } from '../lib/brownNoise';
import { breakClock, breakMinutes, pickIdea, type BreakIdea } from '../lib/breaks';
import { useBreakIdeas } from '../lib/breakIdeaStore';
import { useNow } from '../lib/useNow';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { MomentCard, MomentLane } from './FocusMoments';

/* ── The offer ───────────────────────────────────────────────────────── */

export function BreakOffer({ focusMinutes, minutes, long, onKeepGoing, onTake }: {
  focusMinutes: number;
  minutes: number;
  long: boolean;
  onKeepGoing: () => void;
  onTake: () => void;
}) {
  return (
    <MomentCard
      icon="timer"
      actions={(
        <>
          <SoftButton size="sm" onClick={onKeepGoing}>Keep going</SoftButton>
          <WhiteButton size="sm" onClick={onTake}>Take a break</WhiteButton>
        </>
      )}
    >
      {/* A non-breaking hyphen keeps "5-minute" on one line. */}
      {long
        ? <>Four blocks done. Time for a {minutes}{'‑'}minute long break.</>
        : <>{focusMinutes} {focusMinutes === 1 ? 'minute' : 'minutes'} of focus. Time for a {minutes}{'‑'}minute break.</>}
    </MomentCard>
  );
}

/* ── The break ───────────────────────────────────────────────────────── */

export function BreakCard({ long, secondsLeft, over, idea, ideaTurn, backLabel, onAnotherIdea, onAddTime, onBack }: {
  long: boolean;
  secondsLeft: number;
  over: boolean;
  idea: BreakIdea | null;
  /** How many ideas have been shown, so each new one slides on. */
  ideaTurn: number;
  /** "Back to work", or "Done" when there is no task to go back to. */
  backLabel: string;
  onAnotherIdea: () => void;
  onAddTime: () => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-6)', textAlign: 'center', minWidth: 0 }}>
      <MetaKicker icon="hourglass" tone="var(--job-teal)">{long ? 'Long break' : 'Break'}</MetaKicker>
      <div
        role="timer"
        aria-label={over ? 'Break over' : `${breakClock(secondsLeft)} of break left`}
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-5xl)', lineHeight: 1,
          fontWeight: 'var(--weight-bold)', fontVariantNumeric: 'tabular-nums',
          color: over ? 'var(--fg-2)' : 'var(--job-teal-text)',
        }}
      >
        {breakClock(over ? 0 : secondsLeft)}
      </div>
      <BlurAcross value={over ? 'over' : (idea?.id ?? 'none')} index={over ? ideaTurn + 1 : ideaTurn} style={{ width: '100%' }}>
        <p
          style={{
            margin: 0, minHeight: '3em', font: 'var(--type-body)', fontSize: 'var(--text-lg)',
            color: 'var(--fg-1)', textWrap: 'balance',
          }}
        >
          {over
            ? 'Break over. Ready when you are.'
            : idea?.text ?? 'Rest your eyes and breathe. Add your own ideas in Settings.'}
        </p>
      </BlurAcross>
      <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-3)' }}>
        {!over && idea && (
          <SoftButton size="sm" icon={<Icon name="shuffle" size={15} />} onClick={onAnotherIdea}>
            Another idea
          </SoftButton>
        )}
        <SoftButton size="sm" onClick={onAddTime}>+2 min</SoftButton>
        {over
          ? <WhiteButton size="sm" onClick={onBack}>{backLabel}</WhiteButton>
          : <SoftButton size="sm" onClick={onBack}>Skip break</SoftButton>}
      </div>
    </div>
  );
}

/** `on` is the break, or the last one while its sheet dissolves (`open` false). */
function BreakDialog({ on, open }: { on: BreakOn; open: boolean }) {
  const ideas = useBreakIdeas();
  const hasTask = useFocusRun((s) => s.task !== null);
  const now = useNow(open && !on.over);
  const [turn, setTurn] = useState(0);
  const idea = ideas.find((i) => i.id === on.ideaId) ?? ideas[0] ?? null;
  const { showIdea, addBreakTime, endBreak } = useFocusBreak.getState();
  /* Escape and the back gesture are Skip break, through the app's one stack. */
  useOverlayDismiss(open, endBreak);
  return (
    <Dialog
      open={open}
      onClose={endBreak}
      width={460}
      label={on.long ? 'Long break' : 'Break'}
      closeOnEscape={false}
      closeOnBackdrop={false}
      zIndex={Z.modal}
      style={{ boxShadow: 'var(--glass-shadow-pane), var(--job-teal-shine)' }}
    >
      <BreakCard
        long={on.long}
        secondsLeft={(on.endsAt - now) / 1000}
        over={on.over}
        idea={idea}
        ideaTurn={turn}
        backLabel={hasTask ? 'Back to work' : 'Done'}
        onAnotherIdea={() => {
          setTurn((t) => t + 1);
          showIdea(pickIdea(ideas, Math.random(), idea?.id)?.id ?? null);
        }}
        onAddTime={addBreakTime}
        onBack={endBreak}
      />
    </Dialog>
  );
}

/** Both cards, on every screen; never on the share view or sign-in. */
export function FocusBreakHost() {
  const offer = useFocusBreak((s) => s.offer);
  const on = useFocusBreak((s) => s.breakOn);
  const awayShowing = useFocusRun((s) => s.away !== null);
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const { pathname } = useLocation();
  const outside = pathname === '/login' || pathname.startsWith('/s/');
  /* One card in the top lane at a time: the away card answers first. */
  const offerShown = offer !== null && on === null && !awayShowing && !overlayOpen && !outside;
  const prefs = getNoisePrefs();
  /* The last break, kept so its sheet can dissolve after it ends. */
  const [last, setLast] = useState<BreakOn | null>(on);
  if (on && on !== last) setLast(on);
  return (
    <>
      <MomentLane top>
        <AnimatePresence>
          {offerShown && (
            <motion.div
              key="break-offer"
              initial={{ opacity: 0, y: -14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.97 }}
              style={{ pointerEvents: 'auto' }}
            >
              <BreakOffer
                focusMinutes={prefs.focusMinutes}
                minutes={breakMinutes(prefs, offer.long)}
                long={offer.long}
                onKeepGoing={useFocusBreak.getState().keepGoing}
                onTake={takeBreak}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </MomentLane>
      {last && <BreakDialog on={on ?? last} open={on !== null && !outside} />}
    </>
  );
}
