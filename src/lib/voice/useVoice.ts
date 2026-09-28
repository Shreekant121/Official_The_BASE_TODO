/**
 * The two voice hooks the chat screen uses (items 24 and 25).
 *
 * `useDictation` is the microphone button's state machine; `useVoiceChoice`
 * is the picker's. Both are here rather than in the components because dock
 * mode needs the same machinery on a different screen, and the one thing worse
 * than no voice is two implementations of it that drift.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { readDeviceValue, writeDeviceValue, VOICE_URI_KEY } from '../atlas/devicePrefs';
import {
  dictationSupported,
  startDictation,
  type DictationError,
  type DictationSession,
} from './recognition';
import { onVoicesReady, stopSpeaking, synthesisSupported, voices, type VoiceChoice } from './synthesis';

export interface Dictation {
  /** Whether to draw the button at all. */
  supported: boolean;
  listening: boolean;
  /** The words so far, including the part he is still saying. */
  heard: string;
  error: DictationError | null;
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
  const session = useRef<DictationSession | null>(null);
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
        onStart: () => setListening(true),
        onTranscript: (text) => {
          latest.current = text;
          setHeard(text);
        },
        onError: (err) => setError(err),
        onEnd: () => {
          session.current = null;
          setListening(false);
          const finished = latest.current.trim();
          latest.current = '';
          setHeard('');
          if (finished !== '') sink.current(finished);
        },
      },
    );
    /* `startDictation` returning null already reported why. Clearing the flag
       here stops the button sticking in a listening state that never ends. */
    if (session.current === null) setListening(false);
  }, [stop]);

  /* A live microphone must not outlive the screen. Without this, leaving the
     chat page keeps the tablet listening with no way to see that it is. */
  useEffect(() => () => session.current?.abort(), []);

  return {
    supported: dictationSupported(),
    listening,
    heard,
    error,
    start,
    stop,
    dismiss: () => setError(null),
  };
}

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
  const [chosen, setChosen] = useState<string | null>(() => readDeviceValue(VOICE_URI_KEY));

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

  const choose = useCallback((uri: string | null) => {
    setChosen(uri);
    writeDeviceValue(VOICE_URI_KEY, uri);
    stopSpeaking();
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
