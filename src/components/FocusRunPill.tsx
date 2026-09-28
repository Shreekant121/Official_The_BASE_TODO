/**
 * The mini-player — BUILD-1's other half, and the only thing on screen that
 * says a focus session is still going.
 *
 * Shreekant's ask, 2026-09-15: *"a mini player… which could allow me to just
 * directly back to the focus session going on"*, answered in the nav (his Q12)
 * and extended so that the same object also silences the noise. **One new
 * object, not two** — which is why the countdown, the way back and the mute
 * are one pill rather than a player and a separate sound control.
 *
 * It appears only while a session exists, and never on `/focus` itself: the
 * thing it offers is already the screen you are on.
 *
 * WHERE IT SITS, AND WHY IT IS NOT ONE ANCHOR
 * -------------------------------------------
 * His call, asked directly: **bottom-left on the laptop**, where nothing else
 * in the app lives — every floating bar in this product is centred and every
 * capture button is bottom-right. On a narrow window the nav itself is a
 * centred floating bar, so the pill takes the **112px lane** directly above
 * it: the same offset `FocusMode`'s own toast and `TaskSelection`'s use, which
 * is what keeps three different floating objects off each other.
 *
 * `footerReserve` is the one screen that can still collide with it. Set
 * Deadlines carries a work-session bar at the foot of the window (FIX-6) whose
 * height is *measured* because it wraps — 76px on one line, 136px on two — so
 * the pill reads that measurement rather than carrying a number that would be
 * right at 1440 and wrong at 1000.
 *
 * It is deliberately **not** a second pause button. The pill's two targets are
 * "take me back" and "shut the noise up"; pausing the work is a decision that
 * belongs on the screen showing you what you are pausing. **Shreekant was
 * offered one on 2026-09-22 (FIX-10), read this paragraph, and agreed.** Do
 * not add it.
 *
 * FIX-10 — IT SNAPS TO A CORNER
 * -----------------------------
 * His ask: *"allow the mini time player to be shifted"*, because wherever it
 * sits it is sometimes on top of the thing he wants. **Snapping, not
 * dragging** — a drag on a tablet fights the page's own scroll for the same
 * finger. So a third, smaller target: **Move** puts four corner targets on the
 * screen, and tapping one sends the pill there; two taps to anywhere, his
 * pick of the three offered. The corner is remembered on the device
 * (`useRememberedState`, FIX-1's rule), not synced: it is about this screen's
 * furniture, not about his account.
 *
 * `auto` is the placement above, and what a device that has never chosen
 * gets. A chosen corner holds at every width. Both bottom-right placements
 * sit in the 112px lane, because bottom-right is where every capture button in
 * the app lives and the pill would otherwise cover it.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Countdown, Icon, useMedia, WIDE } from '../ui';
import { useFocusRun, taskSecondsLeft } from '../store/useFocusRun';
import { useUIStore } from '../store/useUIStore';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { useRememberedState } from '../lib/useRememberedState';
import { getNoisePrefs, subscribeNoisePrefs, type NoisePrefs } from '../lib/brownNoise';
import { noisePhaseAt } from '../lib/noiseSchedule';
import { useNow } from '../lib/useNow';
import { Z } from '../lib/zLayers';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Placement = Corner | 'auto';

const CORNERS: { id: Corner; label: string; icon: 'arrow-up-left' | 'arrow-up-right' | 'arrow-down-left' | 'arrow-down-right' }[] = [
  { id: 'tl', label: 'Top left', icon: 'arrow-up-left' },
  { id: 'tr', label: 'Top right', icon: 'arrow-up-right' },
  { id: 'bl', label: 'Bottom left', icon: 'arrow-down-left' },
  { id: 'br', label: 'Bottom right', icon: 'arrow-down-right' },
];

/** Stored on the device; see the header. */
const PLACEMENT_KEY = 'base.focusRunPill.corner';

/**
 * Where a corner is, as a fixed box's offsets. The pill and the four targets
 * that choose it read the same numbers, so a target is where its pill lands.
 */
function cornerOffsets(corner: Corner, wide: boolean, footerReserve: number): CSSProperties {
  const edge = wide ? 'var(--sp-7)' : 'var(--gutter-page-sm)';
  /* The bottom-left keeps the old rule: clear of the floating nav on a narrow
     window, and of a screen's own measured footer (FIX-6) on any. */
  const lane = corner === 'br' || !wide ? '112px' : 'var(--sp-7)';
  /* Bottom-right also clears a capture button that is itself lifted over a
     footer — Set Deadlines puts its 52px one `--sp-5` above the bar, so the
     pill goes a further 64px up. Measured there: without it the two overlap. */
  const overFooter = corner === 'br' ? `${footerReserve}px + var(--sp-5) + 64px` : `${footerReserve}px + var(--sp-4)`;
  const vertical: CSSProperties = corner[0] === 't'
    ? { top: `calc(${wide ? 'var(--sp-7)' : 'var(--sp-5)'} + var(--safe-t))` }
    : { bottom: `max(${lane} + var(--safe-b), ${overFooter} + var(--safe-b))` };
  const horizontal: CSSProperties = corner[1] === 'l'
    ? { left: `calc(${edge} + var(--safe-l))` }
    : { right: `calc(${edge} + var(--safe-r))` };
  return { ...vertical, ...horizontal };
}

export default function FocusRunPill() {
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const footerReserve = useUIStore((s) => s.footerReserve);

  /* The whole run rather than five selectors: this component draws every part
     of it, and it repaints on the second anyway while one is going. */
  const run = useFocusRun();
  const { task, running, runningSince, muted } = run;

  const [placement, setPlacement] = useRememberedState<Placement>(PLACEMENT_KEY, 'auto');
  /** The four corner targets are showing. */
  const [picking, setPicking] = useState(false);
  /* Escape and the back gesture put the targets away. `hideNav: false`, or
     opening the picker would hide the very pill it is moving. */
  useOverlayDismiss(picking, () => setPicking(false), { hideNav: false });

  const [prefs, setPrefs] = useState<NoisePrefs>(getNoisePrefs);
  useEffect(() => subscribeNoisePrefs(setPrefs), []);

  /* One repaint a second, and only while something is moving. The value it
     returns is not the clock — `taskSecondsLeft` reads that off `Date.now()`
     — it is what makes the component ask again. */
  const now = useNow(running);
  const left = taskSecondsLeft(run, now);

  /*
   * Hidden rather than unmounted, so the pill leaves the way the nav does
   * instead of vanishing mid-spring. `/s/` and `/login` are the two routes
   * that are not the app — the public share view and the sign-in screen —
   * and `/focus` is where this control would be pointing at itself.
   */
  const hidden =
    !task
    || location.pathname === '/focus'
    || location.pathname === '/login'
    || location.pathname.startsWith('/s/')
    || overlayOpen;

  /* The break half of the focus/break cycle, so the speaker can explain its
     own silence rather than looking broken. */
  const phase = running && runningSince !== null ? noisePhaseAt(prefs, runningSince, now) : null;
  const resting = phase !== null && !phase.on;

  /* Nothing to move once it has gone. */
  if (hidden && picking) setPicking(false);

  /* `auto` on a narrow window keeps its centred lane; everywhere else it is a
     corner, and `auto` on a wide one is the bottom-left it always was. */
  const corner: Corner | null = placement !== 'auto' ? placement : wide ? 'bl' : null;
  const fromTop = corner !== null && corner[0] === 't';

  const title = task?.title ?? '';
  const soundLabel = muted
    ? 'Sound off. Tap to bring the noise back'
    : resting
      ? 'Break — the noise comes back on its own'
      : 'Mute the noise';

  return (
    <>
    <div
      style={{
        position: 'fixed',
        zIndex: Z.nav,
        pointerEvents: 'none',
        /* `max`, not a sum: the reserve is where the screen's own bottom
           furniture starts, and on most screens there is none — adding it
           blindly would push the pill up by nothing on twelve screens and by
           the wrong amount on the one that has it. */
        ...(corner
          ? { ...cornerOffsets(corner, wide, footerReserve), maxWidth: 'calc(100vw - 2 * var(--gutter-page-sm))' }
          : {
              bottom: `max(112px + var(--safe-b), ${footerReserve}px + var(--sp-4) + var(--safe-b))`,
              left: 0,
              right: 0,
              display: 'grid',
              placeItems: 'center',
              padding: '0 var(--gutter-page-sm)',
            }),
      }}
    >
      <motion.div
        initial={false}
        /* It leaves toward the edge it sits on. */
        animate={hidden ? { y: fromTop ? -110 : 110, opacity: 0, scale: 0.92 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ pointerEvents: hidden ? 'none' : 'auto', maxWidth: '100%' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-4)',
            maxWidth: '100%',
            padding: 'var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-5)',
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-fill-2)',
            backdropFilter: 'var(--glass-bd-lg)',
            WebkitBackdropFilter: 'var(--glass-bd-lg)',
            /* `elevation.css` — a live object emits, a resting one does not.
               Paused is exactly "resting": the session is still there, and
               nothing about it is happening. */
            boxShadow: running
              ? 'var(--glass-rim-2), var(--glass-cast-2), var(--glow-accent-sm)'
              : 'var(--glass-rim-2), var(--glass-cast-2)',
          }}
        >
          <button
            type="button"
            onClick={() => navigate('/focus')}
            aria-label={`Back to the focus session on ${title}`}
            title={`Back to ${title}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
              minWidth: 0, maxWidth: wide ? 260 : 220,
              border: 0, padding: 0, background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Countdown seconds={left} format="clock" size="sm" running={running} />
            <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
              <span
                style={{
                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                  color: running ? 'var(--accent)' : 'var(--fg-4)',
                }}
              >
                {running ? 'Focus' : 'Paused'}
              </span>
              <span
                style={{
                  font: 'var(--type-label)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {title}
              </span>
            </span>
          </button>

          {/* Only where there is something to silence. With the master switch
              off in Settings, a mute button would be a control over nothing. */}
          {prefs.enabled && (
            <button
              type="button"
              onClick={run.toggleMuted}
              aria-pressed={muted}
              aria-label={soundLabel}
              title={soundLabel}
              style={{
                flex: '0 0 auto',
                display: 'grid', placeItems: 'center',
                width: 38, height: 38, border: 0, cursor: 'pointer',
                borderRadius: 'var(--r-pill)',
                backgroundImage: muted ? 'var(--glass-well)' : 'var(--glass-fill-3)',
                boxShadow: muted ? 'var(--glass-well-shadow)' : 'var(--glass-rim-2)',
                color: muted ? 'var(--fg-4)' : resting ? 'var(--fg-3)' : 'var(--fg-1)',
                transition: 'var(--t-hover)',
              }}
            >
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={17} />
            </button>
          )}

          {/* The third target, and the quietest: it moves the pill, it does
              nothing to the session. */}
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            aria-expanded={picking}
            aria-label="Move the timer to another corner"
            title="Move the timer to another corner"
            style={{
              flex: '0 0 auto',
              display: 'grid', placeItems: 'center',
              width: 32, height: 32, border: 0, cursor: 'pointer',
              borderRadius: 'var(--r-pill)',
              backgroundImage: picking ? 'var(--glass-fill-3)' : 'none',
              backgroundColor: 'transparent',
              boxShadow: picking ? 'var(--glass-rim-2)' : 'none',
              color: picking ? 'var(--fg-1)' : 'var(--fg-4)',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon name="move" size={15} />
          </button>
        </div>
      </motion.div>
    </div>

    {/* The four places it can go. A tap anywhere else puts them away. */}
    {picking && !hidden && (
      <div style={{ position: 'fixed', inset: 0, zIndex: Z.nav }}>
        <button
          type="button"
          aria-label="Keep the timer where it is"
          tabIndex={-1}
          onClick={() => setPicking(false)}
          style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'oklch(0.04 0 0 / 0.32)', cursor: 'default' }}
        />
        {/* A lighter wash than `Dialog`'s 0.62: this is a choice about the
            page, so the page should still be legible under it. */}
        {CORNERS.map(({ id, label, icon }) => {
          const here = id === corner;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={here}
              onClick={() => { setPlacement(id); setPicking(false); }}
              style={{
                position: 'absolute',
                ...cornerOffsets(id, wide, footerReserve),
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
                height: 48, padding: '0 var(--sp-6)', border: 0, cursor: 'pointer',
                borderRadius: 'var(--r-pill)',
                backgroundImage: here ? 'var(--glass-tint-accent)' : 'var(--glass-fill-3)',
                backdropFilter: 'var(--glass-bd-lg)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: here ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-2), var(--glass-cast-2)',
                color: here ? 'var(--fg-1)' : 'var(--fg-2)',
                font: 'var(--type-label)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              <Icon name={icon} size={16} />
              {here ? `${label} · here now` : label}
            </button>
          );
        })}
      </div>
    )}
    </>
  );
}
