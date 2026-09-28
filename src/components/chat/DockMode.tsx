/**
 * Dock mode — the tablet on its charger, listening (items 24 and 25).
 * Mockup: `design-system/screens/voice.html`.
 *
 * WHAT IT IS, IN ONE PARAGRAPH
 * -----------------------------
 * The tablet sits on its stand, plugged in, screen held awake. It listens for
 * the word *"Atlas"*, takes whatever follows as the message, sends it, and
 * reads the answer out loud. Then it goes back to waiting. It is a Nest Hub
 * made out of the app that is already installed, and it exists because
 * Shreekant asked for *"Atlas like Google Assistant, on my tablet"* and this is
 * the part of that which a web page can actually be.
 *
 * **What it is not**, and the screen says so rather than letting him find out:
 * it cannot hear him with the screen off, from another app, or from across the
 * house. Android reserves that for a native app holding the assistant role.
 * The honest boundary is drawn under the wake-word line, which is where
 * `voice.html` puts it — not in a footnote and not in this comment.
 *
 * DESIGN-1 — RECONCILED AGAINST THE SCREEN HE DREW
 * ------------------------------------------------
 * This file used to carry a warning that it had never been through Claude
 * Design. It has now: the v3 export (2026-09-16) brought `screens/voice.html`,
 * and the drawing below is that screen. What it settled, and what this file
 * had guessed:
 *
 *   **One object, four states.** `Orb` is mounted once and never unmounts —
 *   only its contents and the rings behind it change. The old indicator
 *   swapped a 96px disc between four hard-coded treatments; this one is a
 *   single surface whose fill, rim, glow and contents transition. The mockup
 *   keys its whole `<main>` on the state, which would remount the orb on every
 *   change and contradicts its own comment; the key is on the **copy block**
 *   here, so the words condense in and the object stays put.
 *
 *   **Emerald is on the orb while the microphone is open, and nowhere else.**
 *   That is `design-system/readme.md`'s accent ration on the screen most
 *   tempted to light itself up. The old version tinted the disc emerald while
 *   *speaking* as well, which spent the ration on the one state where the
 *   microphone is deliberately off. Speaking is now white bars — the mockup's
 *   `tone="white"`, which is why `ui/feedback/Waveform.tsx` has that tone back.
 *
 *   **Two metres, one column, nothing small.** Every size is fluid against
 *   *both* axes (`vmin`), so the screen fits portrait and landscape without
 *   ever scrolling. Nothing here is a fixed pixel except what a `clamp` floor
 *   and ceiling say. The old screen was 132px of indicator and a `4.5vw`
 *   headline, which is a phone-sized object on a tablet across a room.
 *
 *   **The microphone-permission fix is drawn**, not left to fail silently —
 *   see `THE BLOCKED MICROPHONE` below.
 *
 * Two things the mockup draws that are **not** built, deliberately. Its footer
 * is a state harness — four buttons that force the orb into each state — which
 * is a spec affordance for reading the drawing, not a control for a screen
 * across a room; the real states come from the real microphone. And its
 * *"Open sound & permissions"* button cannot exist: no web page can open the
 * browser's own settings. What replaced it does the part that works.
 *
 * THE FOUR STATES, AND WHY EACH EXISTS
 * -------------------------------------
 *   waiting   — listening for the wake word. The resting state.
 *   hearing   — heard "Atlas"; collecting the rest of the sentence.
 *   thinking  — sent; Atlas is working. **The microphone is off.**
 *   speaking  — reading the answer. **The microphone is off.**
 *
 * The microphone being off in the last two is not an optimisation, it is the
 * bug that otherwise defines this feature: a tablet listening while it talks
 * **hears its own voice**, matches the wake word in its own answer, and asks
 * itself the question again. Every always-listening device solves this with
 * hardware echo cancellation that a web page does not get, so this solves it
 * by not listening. The voice picker takes the microphone away for exactly the
 * same reason — auditioning a voice is the tablet talking.
 *
 * THE BLOCKED MICROPHONE
 * ----------------------
 * A dock that cannot hear is the failure this screen exists on top of, so it
 * is a state of the screen rather than a red line in a corner: the orb goes
 * grey and crossed through, and the copy says what to do. The button asks the
 * browser for the microphone again — which is the whole fix when the prompt
 * was dismissed rather than denied, and is all a page is allowed to do. If the
 * browser refuses without asking, the permission is a standing one and only
 * its own site settings can change it, so that is what the screen then says.
 *
 * V3-8 — THE ORB IS ATLAS'S PRESENCE NOW
 * --------------------------------------
 * He chose (2026-09-24) to put `Atlas.dc.html`'s WebGL orb here in place of
 * the glass disc, knowing the disc was the thing that turned emerald while
 * the microphone was open. **The green did not go; it moved outward.** The
 * disc's emerald glow now sits behind the orb, and the rings leaving it are
 * still emerald — both only while the microphone is open, slow while it
 * waits for the word, fast and brighter while it hears him — and the pulsing
 * dot beside the state word is unchanged. The orb itself is blue
 * in every state, and its ripples say the rest: calm while waiting, quick while
 * thinking, speaking while he talks and while it answers. Blocked is the orb
 * greyed and still, with the crossed-out microphone over it. The two labels on
 * this screen are sentence case, as on every other V3 screen.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { AiPresence, Button, Icon, IconButton, type AiPresenceState } from '../../ui';
import { Z } from '../../lib/zLayers';
import { useOverlayDismiss } from '../../lib/useOverlayDismiss';
import { VoicePicker } from './VoicePicker';
import { devDockAnswer, devDockHeard, type DockFixture } from '../../lib/devDockFixture';
import { findWake, startDictation, type DictationError, type DictationSession } from '../../lib/voice/recognition';
import { speak, speakable, stopSpeaking, trimForSpeech, type VoiceChoice } from '../../lib/voice/synthesis';

/** `navigator.wakeLock` is not in every DOM lib this project may build against. */
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}
interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * How long a sentence may pause before it counts as finished.
 *
 * **A timer rather than the engine's own `isFinal`**, and that is a
 * measurement rather than a preference: this engine fires `isFinal`
 * repeatedly and cumulatively on one utterance (see `recognition.ts`), so
 * "final" arrives many times in the middle of a sentence and cannot be used
 * to decide he has stopped. Silence can.
 *
 * 1400ms is long enough for the pause in *"Atlas… add a task for Rahul"* and
 * short enough not to feel broken.
 */
const SETTLE_MS = 1400;

/**
 * The type scale, straight out of `voice.html`.
 *
 * Fluid against **both** axes — `min(vh, vmin)` — because this screen is read
 * standing up in either orientation and must never scroll. They are here as
 * constants rather than in `screens.css` because nothing else in the app is
 * sized like this and a shared class would invite something to be.
 */
const LEAD = 'var(--weight-medium) clamp(28px, min(4.6vh, 5.2vmin), 68px) / 1.08 var(--font-sans)';
const BODY = 'var(--weight-normal) clamp(20px, min(3vh, 2.9vmin), 36px) / 1.36 var(--font-sans)';
const SUB = 'var(--weight-normal) clamp(17px, min(2.4vh, 2.2vmin), 26px) / 1.4 var(--font-sans)';
const KICK = 'var(--weight-normal) clamp(12px, min(1.7vh, 1.5vmin), 16px) / 1.2 var(--font-mono)';
/** A label's case: capitals outside a V3 scope, sentence case inside (V3-8). */
const KICKER_CASE = 'var(--kicker-transform)' as CSSProperties['textTransform'];
/** The stage's own rhythm. One gap, used between every block on it. */
const STACK_GAP = 'clamp(12px, min(2.6vh, 3vmin), 44px)';

export type DockState = 'waiting' | 'hearing' | 'thinking' | 'speaking';

export interface DockModeProps {
  /** Send a message as if typed. */
  onAsk: (text: string) => void;
  /** Atlas is mid-turn. */
  busy: boolean;
  /**
   * The finished answer to read out, and an id that changes when it is a new
   * one. `null` while nothing has been answered yet.
   */
  reply: { id: string; text: string } | null;
  /** The chosen voice, or `null` for the device default. */
  voiceUri: string | null;
  /** Every voice this device has, for the picker. */
  voices: VoiceChoice[];
  onChooseVoice: (uri: string | null) => void;
  onExit: () => void;
  /** Named so the screen can say which assistant is actually answering. */
  assistant: string;
  /**
   * Dev only, and `null` everywhere else: pin one state and leave the
   * microphone alone, so the screenshot harness can photograph a screen whose
   * every state comes from a live microphone. `lib/devDockFixture.ts` says
   * why it is here rather than in the footer the mockup draws it in.
   */
  fixture?: DockFixture | null;
}

export function DockMode({
  onAsk,
  busy,
  reply,
  voiceUri,
  voices,
  onChooseVoice,
  onExit,
  assistant,
  fixture = null,
}: DockModeProps) {
  /* The pinned states are the fixture's, and only ever in a dev build — see
     `devDockFixture.ts`. In production `fixture` is `null` and every one of
     these is the resting value it always was. */
  const [state, setState] = useState<DockState>(
    fixture !== null && fixture !== 'blocked' ? fixture : 'waiting',
  );
  const [heard, setHeard] = useState('');
  const [captured, setCaptured] = useState(fixture === 'hearing' ? devDockHeard() : '');
  const [spoken, setSpoken] = useState(fixture === 'speaking' ? devDockAnswer() : '');
  const [error, setError] = useState<DictationError | null>(
    fixture === 'blocked'
      ? { kind: 'blocked', raw: 'not-allowed', message: 'The microphone is blocked for this site.' }
      : null,
  );
  const [picker, setPicker] = useState(false);
  /** The browser refused the microphone without asking — see the header. */
  const [standing, setStanding] = useState(false);

  const session = useRef<DictationSession | null>(null);
  const settle = useRef<number | null>(null);
  const pending = useRef('');
  const spokenFor = useRef<string | null>(null);
  /* `state` is read inside callbacks that the recogniser owns and that must
     not be rebuilt on every state change — tearing down a live microphone to
     change a label would drop the sentence being spoken into it.

     Both are written in an effect rather than during render. They are only
     ever read from a callback the browser fires later, by which time the
     effect has run, and a ref written mid-render is wrong on any render that
     React throws away. */
  const stateRef = useRef<DockState>('waiting');
  const askRef = useRef(onAsk);
  /** Lets `onEnd` restart the microphone without `listen` referring to itself. */
  const listenRef = useRef<() => void>(() => {});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    askRef.current = onAsk;
  }, [onAsk]);

  const clearSettle = () => {
    if (settle.current !== null) {
      window.clearTimeout(settle.current);
      settle.current = null;
    }
  };

  const stopListening = useCallback(() => {
    clearSettle();
    session.current?.abort();
    session.current = null;
  }, []);

  /**
   * Start, or restart, the microphone.
   *
   * **Restarting is not optional.** Android ends a continuous session on its
   * own after a stretch of quiet — it is not an error and there is no event
   * that distinguishes it from a deliberate stop — so a dock that does not
   * restart works for a minute and is then silently deaf, which is the worst
   * possible failure for a device across the room. `onEnd` below restarts
   * whenever the state still wants a microphone.
   */
  const listen = useCallback(() => {
    if (session.current !== null) return;
    session.current = startDictation(
      { continuous: true },
      {
        onTranscript: (text) => {
          setHeard(text);
          const state_ = stateRef.current;
          if (state_ !== 'waiting' && state_ !== 'hearing') return;

          const wake = findWake(text);
          if (wake === null) return;

          setState('hearing');
          pending.current = wake.rest;
          setCaptured(wake.rest);

          /* Every new word pushes the deadline out; the send happens when the
             words stop coming. See `SETTLE_MS`. */
          clearSettle();
          settle.current = window.setTimeout(() => {
            const ask = pending.current.trim();
            pending.current = '';
            setCaptured('');
            setHeard('');
            if (ask === '') {
              /* He said "Atlas" and nothing else. Going back to waiting is
                 right; sending an empty turn would be an answer to nothing. */
              setState('waiting');
              return;
            }
            setState('thinking');
            stopListening();
            askRef.current(ask);
          }, SETTLE_MS);
        },
        onError: (err) => {
          /* A dead microphone must be visible. Anything else and he is talking
             to a screen that stopped listening without saying so. */
          setError(err);
          if (err.kind === 'blocked' || err.kind === 'unsupported' || err.kind === 'offline') {
            stopListening();
          }
        },
        onEnd: () => {
          session.current = null;
          const state_ = stateRef.current;
          if (state_ === 'waiting' || state_ === 'hearing') {
            /* A tick later, not immediately: `start()` throws if the previous
               session has not finished tearing down, and the throw would end
               the dock silently. Through the ref so this callback does not
               have to close over the function that installs it. */
            window.setTimeout(() => {
              if (stateRef.current === 'waiting' || stateRef.current === 'hearing') listenRef.current();
            }, 250);
          }
        },
      },
    );
  }, [stopListening]);

  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  /* The microphone is blocked, or this browser has none. Drawn as a state of
     the whole screen rather than as a message beside a live-looking orb. */
  const blocked = error !== null && (error.kind === 'blocked' || error.kind === 'unsupported');
  /* Only a blocked *permission* is worth a button. "This browser cannot turn
     speech into text" is not something a prompt can fix. */
  const askable = error !== null && error.kind === 'blocked' && !standing;

  /* The microphone follows the state machine: on while waiting or hearing,
     off while Atlas is thinking or talking, off while it is auditioning a
     voice, and off when it is blocked. See the header for all three. */
  useEffect(() => {
    if (fixture === null && !blocked && !picker && (state === 'waiting' || state === 'hearing')) listen();
    else stopListening();
  }, [fixture, state, blocked, picker, listen, stopListening]);

  /* Atlas finishing a turn moves the machine on. Tracked by turn id so that a
     re-render cannot read the same answer out twice. */
  useEffect(() => {
    if (fixture !== null || reply === null || busy) return;
    if (spokenFor.current === reply.id) return;
    spokenFor.current = reply.id;

    /*
     * **The state follows the speech rather than leading it**, which is why
     * nothing is set synchronously here: `speak` calls back asynchronously on
     * every path including the empty one (see `synthesis.ts`), so the screen
     * says it is reading when the voice actually starts and returns to
     * listening when it actually stops. Setting it here instead would show the
     * waveform during the silence before a voice loads, and leave it showing
     * if the utterance never started at all.
     */
    const line = trimForSpeech(speakable(reply.text));
    speak(line.text, {
      voiceUri,
      onStart: () => {
        setSpoken(reply.text);
        setState('speaking');
      },
      /* Back to listening whether it finished or failed — a dock that stops
         listening because a voice errored is a dock that is now furniture.
         This is also the path the empty answer takes, and the path the Stop
         button takes. */
      onEnd: () => setState('waiting'),
      onError: (message) => setError({ kind: 'unknown', raw: 'speak', message }),
    });
  }, [fixture, reply, busy, voiceUri]);

  /*
   * THE SCREEN STAYS AWAKE, AND GOES BACK TO SLEEP ON THE WAY OUT.
   *
   * Without this the tablet dims and locks after thirty seconds and the whole
   * mode is over. The lock is re-taken on `visibilitychange` because Android
   * drops it whenever the tab is backgrounded — switching apps and coming back
   * would otherwise leave a dock that looks live and sleeps in a minute.
   */
  useEffect(() => {
    const lockHolder = navigator as unknown as { wakeLock?: WakeLockLike };
    if (lockHolder.wakeLock === undefined) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let dropped = false;

    const take = () => {
      if (document.visibilityState !== 'visible' || dropped) return;
      void lockHolder.wakeLock
        ?.request('screen')
        .then((got) => {
          if (dropped) void got.release();
          else sentinel = got;
        })
        .catch(() => {
          /* Refused — a battery saver, or no permission. The mode still works
             for as long as he keeps the screen on himself, which is better
             than refusing to start. */
        });
    };

    take();
    document.addEventListener('visibilitychange', take);
    return () => {
      dropped = true;
      document.removeEventListener('visibilitychange', take);
      if (sentinel !== null && !sentinel.released) void sentinel.release();
    };
  }, []);

  /* Leaving must leave nothing running: a microphone or a voice that outlives
     this screen is invisible and has no off switch. */
  useEffect(
    () => () => {
      stopListening();
      stopSpeaking();
    },
    [stopListening],
  );

  const leave = () => {
    stopListening();
    stopSpeaking();
    onExit();
  };

  /*
   * Escape, and the Android back gesture, leave dock mode — and close the
   * voice list first if it is open, which is what the shared overlay stack is
   * for. `hideNav: false` on both: this screen already covers the nav, and
   * asking for it to be hidden would fold it away underneath for nothing.
   */
  useOverlayDismiss(true, leave, { hideNav: false });
  /* Closing the list stops a preview mid-sentence — and here it matters twice,
     because the microphone comes straight back on when the list goes and would
     otherwise hear the tablet finishing the sample. */
  const closePicker = () => {
    stopSpeaking();
    setPicker(false);
  };

  useOverlayDismiss(picker, closePicker, { hideNav: false });

  /**
   * Ask for the microphone again.
   *
   * The only half of the mockup's *"Open sound & permissions"* a page is
   * allowed to do — and the half that works, because the common case is a
   * prompt that was dismissed rather than a permission that was denied. The
   * stream is stopped immediately: this is asking, not recording. A rejection
   * means the answer is standing and only the browser's own site settings can
   * change it, which is what the screen then says.
   */
  const allowMic = () => {
    const media = navigator.mediaDevices;
    if (media === undefined || typeof media.getUserMedia !== 'function') {
      setStanding(true);
      return;
    }
    void media
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        setStanding(false);
        /* Clearing the error un-blocks the screen, and the effect above puts
           the microphone back on by itself. */
        setError(null);
      })
      .catch(() => setStanding(true));
  };

  const live = !blocked && (state === 'waiting' || state === 'hearing');
  const label = blocked
    ? 'Microphone blocked'
    : state === 'waiting'
      ? 'Listening for “Atlas”'
      : state === 'hearing'
        ? 'Hearing you'
        : state === 'thinking'
          ? 'Working'
          : 'Reading it out';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dock mode"
      style={{
        position: 'fixed', inset: 0, zIndex: Z.dock,
        boxSizing: 'border-box',
        display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto',
        /* The mockup's own page padding, fluid like everything else on it. */
        padding: 'clamp(20px, 3vmin, 40px)',
        minWidth: 0, overflow: 'hidden',
        backgroundColor: 'oklch(0.115 0.004 260 / 0.98)',
        backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
      }}
    >
      {/* Two facts and one way out — plus the voice, which is the one setting
          this screen is operated with. `voice.html` draws only Leave; DESIGN-1's
          click-path is what puts the list here ("open the voice list, search
          it, and pick a voice"), and Shreekant's call on 2026-09-16 was that it
          is the same list the composer's Voice dial opens. */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
        <span
          style={{
            font: KICK, letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
            color: 'var(--fg-3)', flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          Dock mode · {assistant}
        </span>
        {/* Deliberately never `active`: that prop draws IconButton's accent
            emission ring, and the emerald on this screen belongs to the orb
            while the microphone is open. */}
        <IconButton label="Voice" variant="ghost" size="lg" onClick={() => (picker ? closePicker() : setPicker(true))}>
          <Icon name="volume-2" size={18} />
        </IconButton>
        <Button variant="ghost" size="lg" iconLeft={<Icon name="corner-up-left" size={18} />} onClick={leave}>
          Leave
        </Button>
      </header>

      {/* The stage. One column, centred, never taller than the row. */}
      <main
        style={{
          minHeight: 0, minWidth: 0, overflow: 'hidden',
          display: 'grid', justifyItems: 'center', alignContent: 'center',
          gap: STACK_GAP, textAlign: 'center',
        }}
      >
        {/* ONE OBJECT, FOUR STATES — mounted once, outside the keyed block
            below, so that the words change and the orb does not. */}
        <Orb state={state} blocked={blocked} />

        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          {live && (
            <span
              aria-hidden="true"
              style={{
                width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)',
                boxShadow: '0 0 10px var(--accent)', animation: 'var(--kf-pulse) 1800ms var(--ease-in-out) infinite',
              }}
            />
          )}
          <span
            aria-live="polite"
            style={{
              font: KICK, letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
              color: live ? 'var(--accent)' : blocked ? 'var(--status-review)' : 'var(--fg-3)',
            }}
          >
            {label}
          </span>
        </span>

        {/* The words. Keyed so each state condenses in — the mockup's
            `ag-condense` on `<main>`, moved down one level to keep the orb
            mounted. */}
        <div
          key={state + String(blocked)}
          style={{
            display: 'grid', justifyItems: 'center', gap: STACK_GAP, minWidth: 0,
            animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
          }}
        >
          {blocked ? (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 'clamp(12px, min(2.2vh, 2.6vmin), 32px)', maxWidth: '26ch' }}>
              <p style={{ margin: 0, font: LEAD, letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', textWrap: 'balance' }}>
                {error?.kind === 'unsupported' ? 'This browser cannot listen.' : 'Allow the microphone.'}
              </p>
              <p style={{ margin: 0, font: SUB, letterSpacing: 'var(--tracking-title)', color: 'var(--fg-3)' }}>
                {error?.kind === 'unsupported'
                  ? 'Dock mode needs speech recognition. Chrome or Brave on the tablet has it.'
                  : standing
                    ? 'The browser is refusing without asking, so the block is saved for this site. Tap the padlock beside the address and switch the microphone back on.'
                    : 'Dock mode cannot hear the wake word until you do.'}
              </p>
              {askable && (
                <Button variant="frost" size="lg" iconLeft={<Icon name="mic" size={18} />} onClick={allowMic}>
                  Allow the microphone
                </Button>
              )}
            </div>
          ) : state === 'waiting' ? (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 'clamp(12px, min(1.9vh, 2.2vmin), 28px)' }}>
              <p style={{ margin: 0, maxWidth: '20ch', font: LEAD, letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', textWrap: 'balance' }}>
                Say “Atlas”, then the message.
              </p>
              {/* The honest boundary, on the screen and in the mockup's own
                  words. Not a placeholder to be designed away. */}
              <p style={{ margin: 0, maxWidth: '38ch', font: SUB, letterSpacing: 'var(--tracking-title)', color: 'var(--fg-3)' }}>
                Only from this screen, awake and in front. Not with the screen off, not from another
                app, not from the next room.
              </p>
              {/* What it thought it heard before the wake word, so a mis-hear
                  is visible rather than mysterious — the engine turns
                  "Shreekant" into "Srikanth", and seeing that is the
                  difference between fixing it and giving up. */}
              {heard !== '' && (
                <p style={{ margin: 0, maxWidth: '40ch', font: KICK, color: 'var(--fg-4)' }}>heard: {heard}</p>
              )}
            </div>
          ) : state === 'hearing' ? (
            <p style={{ margin: 0, maxWidth: '20ch', font: LEAD, letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', textWrap: 'balance' }}>
              <Words text={captured} />
            </p>
          ) : state === 'thinking' ? (
            <p style={{ margin: 0, maxWidth: '20ch', font: LEAD, letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)' }}>
              Thinking<span style={{ color: 'var(--fg-4)' }}>…</span>
            </p>
          ) : (
            <div style={{ display: 'grid', justifyItems: 'center', gap: 'clamp(14px, min(2.4vh, 3vmin), 36px)' }}>
              {/* Clamped, never scrolled: this screen fits or it is not this
                  screen. A long answer is read out in full and stays in the
                  conversation, which is where it is read rather than heard. */}
              <p
                style={{
                  margin: 0, maxWidth: '26ch', font: BODY, letterSpacing: 'var(--tracking-title)',
                  color: 'var(--fg-2)', textWrap: 'pretty',
                  display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 6, overflow: 'hidden',
                }}
              >
                {speakable(spoken)}
              </p>
              <Button variant="frost" size="lg" iconLeft={<Icon name="square" size={18} />} onClick={() => stopSpeaking()}>
                Stop
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Anything that is wrong but not disabling — no network for the
          transcription, a voice that would not load. The blocked microphone is
          not here; it is the whole screen above. */}
      <footer style={{ display: 'grid', justifyItems: 'center', minHeight: 'var(--sp-6)' }}>
        {error !== null && !blocked && (
          <p style={{ margin: 0, maxWidth: '46ch', textAlign: 'center', font: SUB, color: 'var(--status-review)' }}>
            {error.message}
          </p>
        )}
      </footer>

      {picker && <VoiceSheet voices={voices} chosen={voiceUri} onChoose={onChooseVoice} onClose={closePicker} />}
    </div>
  );
}

/**
 * The words as they arrive, the last one dimmed.
 *
 * `voice.html`'s `v-word`: each word condenses in as it lands, and the one
 * still being heard is `--fg-4`, so the sentence visibly grows rather than
 * re-rendering as a block of text. Keyed by word *and* index, so a repeated
 * word still animates.
 */
function Words({ text }: { text: string }) {
  const words = text.split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return <span style={{ color: 'var(--fg-4)' }}>…</span>;
  return (
    <>
      {words.map((word, i) => (
        <span
          key={word + String(i)}
          style={{
            display: 'inline-block',
            color: i === words.length - 1 ? 'var(--fg-4)' : undefined,
            animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
          }}
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </>
  );
}

/**
 * The orb. One object, four states, mounted once.
 *
 * Since V3-8 the object is `AiPresence`, Atlas's WebGL mark, and this
 * function is what maps the dock's four states onto its three: waiting is
 * idle, thinking is thinking, and both hearing him and answering are
 * speaking — the one state whose ripples follow a voice. The emerald rings
 * outside it are what still say the microphone is open.
 *
 * The presence box is drawn 160% of the stage's disc, because the sphere
 * fills only the middle ~62% of its own square (the rest is room for the
 * ripples and the cast light) — so the sphere comes out the size the disc
 * was, and the rings still leave from its edge. It is measured only for the
 * blocked glyph, which `Icon` takes in pixels.
 */
function Orb({ state, blocked }: { state: DockState; blocked: boolean }) {
  const live = !blocked && (state === 'waiting' || state === 'hearing');
  const hot = state === 'hearing';
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSize(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const presence: AiPresenceState =
    state === 'thinking' ? 'thinking' : state === 'hearing' || state === 'speaking' ? 'speaking' : 'idle';

  return (
    <div
      ref={box}
      style={{
        position: 'relative', width: 'clamp(104px, min(19vh, 26vmin), 260px)', aspectRatio: '1',
        display: 'grid', placeItems: 'center', flex: '0 0 auto',
      }}
    >
      {/* Concentric rings leaving a source — `motion.css` names voice as what
          `ag-ripple` is for, and since V3-8 they are the whole of the accent
          on this screen's object. Only while the microphone is actually open. */}
      {live &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: '1px solid var(--accent-hairline)', boxShadow: 'var(--glow-accent-sm)', opacity: 0,
              animation: `var(--kf-ripple) ${hot ? 2000 : 3600}ms var(--ease-glass) ${i * (hot ? 660 : 1200)}ms infinite`,
            }}
          />
        ))}

      {/* The glow the disc used to carry while the microphone was open —
          `--glow-accent-md` waiting, `-lg` hearing — kept behind the orb,
          because without it the green shrank to hairline rings and a dot
          and "it is listening" stopped reading from across the room. */}
      {live && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', inset: '4%', borderRadius: '50%',
            boxShadow: hot ? 'var(--glow-accent-lg)' : 'var(--glow-accent-md)',
            transition: 'box-shadow var(--dur-morph) var(--ease-glass)',
          }}
        />
      )}

      <AiPresence
        state={presence}
        dim={blocked}
        size="auto"
        style={{ position: 'absolute', inset: '-31%' }}
      />

      {blocked && (
        <span style={{ position: 'relative', display: 'grid', placeItems: 'center', color: 'var(--fg-2)' }}>
          <Icon name="mic-off" size={Math.max(16, Math.round(size * 0.4))} />
        </span>
      )}
    </div>
  );
}

/**
 * The voice list, over the dock screen.
 *
 * A sheet rather than a popover: the tablet is on a stand and the list is the
 * one thing on this screen that is actually operated, so it takes the middle
 * of the screen at a size that can be read and tapped from where he is
 * standing. The scrim closes it, and `useOverlayDismiss` in the parent gives
 * it Escape and the Android back gesture.
 */
function VoiceSheet({
  voices,
  chosen,
  onChoose,
  onClose,
}: {
  voices: VoiceChoice[];
  chosen: string | null;
  onChoose: (uri: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, background: 'oklch(0 0 0 / 0.42)' }}
      />
      <div
        role="dialog"
        aria-label="Voice"
        style={{
          position: 'absolute', inset: 0, margin: 'auto',
          width: 'min(460px, calc(100% - var(--sp-9)))', height: 'min(560px, calc(100% - var(--sp-9)))',
          boxSizing: 'border-box', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto',
          gap: 'var(--sp-5)', padding: 'var(--sp-7)',
          borderRadius: 'var(--r-lg)',
          backgroundColor: 'oklch(0.145 0.004 260 / 0.97)', backgroundImage: 'var(--glass-fill-1)',
          border: '1px solid oklch(1 0 0 / 0.10)',
          backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
          boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
          animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        }}
      >
        <VoicePicker all={voices} chosen={chosen} onChoose={onChoose} big />
        <Button variant="frost" size="lg" block onClick={onClose}>
          Done
        </Button>
      </div>
    </>
  );
}
