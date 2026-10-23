/**
 * The two voice hooks the chat screen uses (items 24 and 25).
 *
 * `useDictation` is the microphone button's state machine; `useVoiceChoice`
 * is the picker's. Both are here rather than in the components because dock
 * mode needs the same machinery on a different screen, and the one thing worse
 * than no voice is two implementations of it that drift.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { readDeviceValue, writeDeviceValue, SPEAK_REPLIES_KEY, VOICE_URI_KEY } from '../atlas/devicePrefs';
import {
  dictationSupported,
  startDictation,
  type DictationError,
  type DictationSession,
} from './recognition';
import { onVoicesReady, stopSpeaking, synthesisSupported, voices, type VoiceChoice } from './synthesis';

/**
 * How long the microphone may stay open in one go: two minutes, his call
 * (2026-10-15, 29-1P15d). Dictation here and dock mode's sentence both obey it.
 */
export const MIC_CAP_MS = 2 * 60 * 1000;

export interface Dictation {
  /** Whether to draw the button at all. */
  supported: boolean;
  listening: boolean;
  /** The words so far, including the part he is still saying. */
  heard: string;
  error: DictationError | null;
  /** When the microphone opened (`Date.now()`), for the mic's timer (29-1P15d). */
  startedAt: number | null;
  /** When a heard sentence last landed in the field, for the mic's lime "got it". */
  landedAt: number | null;
  start: () => void;
  stop: () => void;
  /** Clears a message without starting again. */
  dismiss: () => void;
}

/**
 * One press, one sentence.
 *
 * `onFinal` fires with the finished text when he stops talking, which is what
 * puts the words in the composer. **It is not auto-sent** — dictation lands in
 * the field so he can see what was heard and fix it before it goes, which
 * matters because the engine mishears names (see `repairTranscript`). Dock
 * mode is the surface that sends without asking, and it is a separate,
 * deliberate gesture rather than this one behaving differently in two places.
 */
export function useDictation(onFinal: (text: string) => void): Dictation {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<DictationError | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [landedAt, setLandedAt] = useState<number | null>(null);
  const session = useRef<DictationSession | null>(null);
  /* Two minutes and the microphone closes on its own (29-1P15d, his call):
     a mic left open by mistake would otherwise listen to the room until the
     engine gave up, which on some engines is never. Stopping is the same as
     his second tap, so what was heard still lands in the field. */
  const cap = useRef<number | null>(null);
  const clearCap = () => {
    if (cap.current !== null) {
      window.clearTimeout(cap.current);
      cap.current = null;
    }
  };
  /* The callback is read through a ref so that `start` does not change
     identity every time the composer's draft changes — without it, every
     keystroke would tear down a live microphone. Written in an effect rather
     than during render: a ref assigned mid-render is torn by a re-render that
     never commits, and it is only ever read from an event that fires later. */
  const sink = useRef(onFinal);
  useEffect(() => {
    sink.current = onFinal;
  }, [onFinal]);
  const latest = useRef('');

  const stop = useCallback(() => {
    clearCap();
    session.current?.stop();
    session.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (session.current !== null) {
      stop();
      return;
    }
    setError(null);
    setHeard('');
    latest.current = '';
    /* Anything Atlas is saying stops the moment he reaches for the
       microphone: talking over the assistant is how a person finds out it is
       not listening. */
    stopSpeaking();

    session.current = startDictation(
      { continuous: false },
      {
        onStart: () => {
          setStartedAt(Date.now());
          setListening(true);
        },
        onTranscript: (text) => {
          latest.current = text;
          setHeard(text);
        },
        onError: (err) => setError(err),
        onEnd: () => {
          clearCap();
          session.current = null;
          setListening(false);
          const finished = latest.current.trim();
          latest.current = '';
          setHeard('');
          if (finished !== '') {
            setLandedAt(Date.now());
            sink.current(finished);
          }
        },
      },
    );
    /* `startDictation` returning null already reported why. Clearing the flag
       here stops the button sticking in a listening state that never ends. */
    if (session.current === null) setListening(false);
    else cap.current = window.setTimeout(stop, MIC_CAP_MS);
  }, [stop]);

  /* A live microphone must not outlive the screen. Without this, leaving the
     chat page keeps the tablet listening with no way to see that it is. */
  useEffect(
    () => () => {
      clearCap();
      session.current?.abort();
    },
    [],
  );

  return {
    supported: dictationSupported(),
    listening,
    heard,
    error,
    startedAt,
    landedAt,
    start,
    stop,
    dismiss: () => setError(null),
  };
}

/**
 * The two voice settings, in one store rather than in each screen's state
 * (OPT-8). They are set in Settings → Atlas now and read by the chat, and the
 * chat is a kept screen (`App.tsx`'s `KEPT_SCREENS`): state copied out of
 * localStorage when it first mounted would go on speaking in last week's voice.
 */
export const useVoicePrefs = create<{
  /** The stored `voiceURI`, or `null` for the device default. */
  chosen: string | null;
  /** Whether ordinary replies are read aloud. Off unless set; dock mode ignores it. */
  speakReplies: boolean;
  choose: (uri: string | null) => void;
  chooseSpeakReplies: (on: boolean) => void;
}>()((set) => ({
  chosen: readDeviceValue(VOICE_URI_KEY),
  speakReplies: readDeviceValue(SPEAK_REPLIES_KEY) === '1',
  choose: (uri) => {
    writeDeviceValue(VOICE_URI_KEY, uri);
    stopSpeaking();
    set({ chosen: uri });
  },
  chooseSpeakReplies: (on) => {
    writeDeviceValue(SPEAK_REPLIES_KEY, on ? '1' : null);
    if (!on) stopSpeaking();
    set({ speakReplies: on });
  },
}));

export interface VoiceChoiceState {
  supported: boolean;
  all: VoiceChoice[];
  /** The stored `voiceURI`, or `null` for the device default. */
  chosen: string | null;
  choose: (uri: string | null) => void;
  /** The chosen voice's display name, for the dial's label. */
  label: string;
}

/**
 * Which of the device's voices Atlas answers in.
 *
 * **Device-local, like the model picker and for the identical reason**
 * (`devicePrefs.ts`): which voice reads a task list is a fact about the
 * machine in front of him — the tablet has 95 and the laptop has three — and a
 * choice synced between them would select a voice that is not installed.
 */
export function useVoiceChoice(): VoiceChoiceState {
  const [all, setAll] = useState<VoiceChoice[]>(() => voices());
  const chosen = useVoicePrefs((s) => s.chosen);
  const choose = useVoicePrefs((s) => s.choose);

  useEffect(() => {
    /*
     * Android returns an empty list on the first call and fills it in later,
     * so the initial read above is not the last word. Subscribing is the whole
     * of the work here: `onVoicesReady` fires on the browser's own
     * `voiceschanged` **and** on a late timer, which covers the engines that
     * never fire the event and the case where the list was already populated
     * before this mounted. Re-reading synchronously as well would be a second
     * render for a value the subscription is about to deliver anyway.
     */
    return onVoicesReady(() => setAll(voices()));
  }, []);

  const match = chosen === null ? undefined : all.find((voice) => voice.uri === chosen);
  return {
    supported: synthesisSupported(),
    all,
    chosen,
    choose,
    /* A stored voice that is no longer installed says so rather than showing a
       blank pill — a language pack can be removed between sessions. */
    label: chosen === null ? 'Default voice' : (match?.name ?? 'Voice not installed'),
  };
}
