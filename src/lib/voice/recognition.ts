/**
 * Turning speech into text, on the device (items 24 and 25).
 *
 * MEASURED ON HIS TABLET BEFORE ANY OF THIS WAS WRITTEN — 2026-09-14
 * ------------------------------------------------------------------
 * Item 24 was written believing the tablet had no speech of its own, and its
 * 2026-09-11 note corrected that to "Android in Chrome ships the Web Speech
 * API". Both were then thrown into doubt by the browser actually being
 * **Brave**, which is widely and credibly documented as shipping Chromium's
 * speech recognition dead — Google licenses the transcription service to
 * Chrome and Edge and to nobody else.
 *
 * So it was measured rather than argued, through a throwaway page served off
 * the Atlas host (`atlas/src/routes/voiceTest.ts`). **On his tablet, in Brave,
 * it works**: one-shot recognition returned clean text, continuous ran a full
 * twenty seconds without erroring, and `navigator.brave.isBrave()` was `true`
 * the whole time. Whatever the general state of that argument, it does not
 * hold on his device in September 2026.
 *
 * **That is why there is no Whisper here and no audio leaves the tablet.**
 * Item 24's original plan — stream audio over Tailscale to gemma or Whisper on
 * the laptop — costs VRAM the 8 GB card does not have spare and only works
 * while the laptop is awake. This costs nothing and works with the laptop shut.
 *
 * THE QUIRK THAT DECIDES HOW THIS FILE IS WRITTEN
 * ------------------------------------------------
 * The same measurement caught something no amount of reading would have. In
 * continuous mode the engine fires **`isFinal` repeatedly, cumulatively, on
 * the same result index**. One spoken sentence came back as twenty-four
 * "final" results, each a longer prefix of the last:
 *
 *     ""  /  "hello"  /  "hello"  /  "hello I"  /  "hello I am"  /  ...
 *     ...  "hello I am Srikanth and you are my eye and I think"
 *
 * The obvious implementation — push every final transcript onto an array —
 * therefore records the sentence twenty-four times. **So nothing here appends.
 * Results are stored per `resultIndex` and overwritten**, and the transcript is
 * composed from that map. The first final was also the empty string, which is
 * why empties are dropped rather than trusted as "he stopped talking".
 *
 * `onresult` starting at `event.resultIndex` and walking to the end is the
 * documented contract; what is not documented is that the same index can
 * arrive final more than once. It does here.
 */

/* The Web Speech API is not in every version of TypeScript's DOM library, and
   this app must not fail to build over a browser type. Declared minimally, to
   what is actually used, rather than pulled in as a dependency. */

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechCapableWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function constructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as SpeechCapableWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Whether this browser can hear at all.
 *
 * **The constructor existing is not the same as it working**, which is the
 * whole Brave question: a browser with the service switched off still exposes
 * the class and fails at run time with `error: 'network'`. So this answers
 * "worth showing the button", and `DictationError` answers "did it work".
 */
export function dictationSupported(): boolean {
  return constructor() !== null;
}

/** The language recognition runs in. Indian English — it is his tablet. */
export const DICTATION_LANG = 'en-IN';

export type DictationErrorKind =
  | 'unsupported'
  | 'blocked'
  | 'offline'
  | 'silent'
  | 'unknown';

export interface DictationError {
  kind: DictationErrorKind;
  /** A sentence for Shreekant, not an error code. */
  message: string;
  /** What the browser actually said, for a session reading this later. */
  raw: string;
}

/**
 * The browser's error strings, turned into something worth reading.
 *
 * `network` is called out deliberately: it is the documented signature of a
 * browser that will not transcribe, and it is the one failure where the fix is
 * a different browser rather than a different sentence. It is not expected on
 * his tablet — it did not happen once during the measurement — but if this
 * ever starts firing, that is what changed, and the message says so rather
 * than making him guess.
 */
function describe(raw: string): DictationError {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        kind: 'blocked',
        raw,
        message: 'The microphone is blocked for this site. Allow it in the browser’s site settings.',
      };
    case 'network':
      return {
        kind: 'offline',
        raw,
        message: 'This browser would not transcribe — it needs the network for speech, or has it switched off.',
      };
    case 'no-speech':
      return { kind: 'silent', raw, message: 'Did not hear anything.' };
    case 'aborted':
      return { kind: 'silent', raw, message: 'Stopped listening.' };
    case 'audio-capture':
      return { kind: 'blocked', raw, message: 'No microphone found on this device.' };
    default:
      return { kind: 'unknown', raw, message: `Could not listen — ${raw}.` };
  }
}

/**
 * Words the engine reliably gets wrong here, and their repairs.
 *
 * **Deliberately tiny, and it stays tiny.** The measurement produced two
 * mishearings — `Shreekant` came back as *"Srikanth"*, and *AI* came back as
 * *"eye"* — and only one of them is safe to fix automatically. A name has no
 * English homophone worth protecting, so repairing it costs nothing when the
 * guess is wrong. **"eye" is a real word and is not repaired**: silently
 * turning every "eye" into "AI" would introduce a worse error than the one it
 * fixes, in text he cannot see being changed.
 *
 * The real repair for the rest is gemma, which reads the sentence with the
 * backlog in front of it and knows that "Rahul" is a contact. Item 21's
 * contacts make that reliable. This table is for the handful that arrive
 * mangled *before* anything smart gets to look at them — chiefly his own name,
 * and the wake word, which has to be matched before a model is involved at all.
 */
const REPAIRS: [RegExp, string][] = [
  [/\b(?:srikanth|shrikant|sri kanth|shree kant|shrikanth)\b/gi, 'Shreekant'],
];

/** Fix the handful of words this engine is known to get wrong. */
export function repairTranscript(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REPAIRS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * What the wake word can come back as.
 *
 * *"Atlas"* is not a common English word and the engine reaches for one that
 * is. **"at last" is the mis-hear to expect** and it is accepted, because a
 * dock-mode wake word that works four times in five is not a feature. The cost
 * of a false wake is one ignored sentence; the cost of a missed one is him
 * saying it again, louder, which is exactly the failure that makes people stop
 * using a thing.
 */
const WAKE_WORDS = ['atlas', 'at last', 'atlus', 'adlas', 'at lass', 'atless'];

export interface WakeMatch {
  /** Everything said after the wake word, trimmed. May be empty. */
  rest: string;
  /** Which spelling actually matched, for the log. */
  matched: string;
}

/**
 * Find the wake word in a heard sentence, and return what followed it.
 *
 * Matched anywhere rather than only at the start: real speech arrives as
 * *"umm, Atlas, what's urgent"*, and an engine that dropped the "umm" would
 * be the only reason a start-anchored test passed.
 */
export function findWake(heard: string): WakeMatch | null {
  const lower = heard.toLowerCase();
  for (const word of WAKE_WORDS) {
    const at = lower.indexOf(word);
    if (at === -1) continue;
    /* The dash class covers the real ones as well as the ASCII hyphen: an
       engine that punctuates at all writes an em dash, and a test written with
       only `-` passed while "Atlas — add milk" kept the dash in the message. */
    const rest = heard.slice(at + word.length).replace(/^[\s,.:;!?‐-―-]+/u, '').trim();
    return { matched: word, rest };
  }
  return null;
}

export interface DictationHandlers {
  /** Fired as the words change. `final` says whether he has stopped talking. */
  onTranscript: (text: string, final: boolean) => void;
  onError?: (error: DictationError) => void;
  /** Fired once, whatever ended it — error, stop, or silence. */
  onEnd?: () => void;
  onStart?: () => void;
}

export interface DictationSession {
  stop: () => void;
  /** Drops the session without waiting for a last result. */
  abort: () => void;
}

/**
 * Start listening.
 *
 * Returns `null` when the browser has no recogniser at all, which the caller
 * should treat as "do not draw the button" rather than as a failure to report.
 */
export function startDictation(
  options: { continuous: boolean; lang?: string },
  handlers: DictationHandlers,
): DictationSession | null {
  const Recogniser = constructor();
  if (Recogniser === null) {
    handlers.onError?.({
      kind: 'unsupported',
      raw: 'no-constructor',
      message: 'This browser cannot turn speech into text.',
    });
    return null;
  }

  const recognition = new Recogniser();
  recognition.lang = options.lang ?? DICTATION_LANG;
  recognition.continuous = options.continuous;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  /*
   * THE FIX FOR THE CUMULATIVE-FINALS QUIRK, AND THE REASON THIS IS A MAP.
   *
   * Keyed on the engine's own result index and overwritten every time that
   * index arrives again. Appending here is the bug described at the top of the
   * file, and it is invisible in a one-shot test — the measurement only caught
   * it because continuous mode was run for a full twenty seconds.
   */
  const byIndex = new Map<number, { text: string; final: boolean }>();

  const compose = (): { text: string; allFinal: boolean } => {
    const indices = [...byIndex.keys()].sort((a, b) => a - b);
    const parts: string[] = [];
    let allFinal = indices.length > 0;
    for (const index of indices) {
      const entry = byIndex.get(index);
      if (entry === undefined) continue;
      // Empty finals arrive first and mean nothing; see the header.
      if (entry.text.trim() !== '') parts.push(entry.text.trim());
      if (!entry.final) allFinal = false;
    }
    return { text: repairTranscript(parts.join(' ').replace(/\s+/g, ' ').trim()), allFinal };
  };

  recognition.onstart = () => handlers.onStart?.();

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const alternative = result[0];
      if (alternative === undefined) continue;
      byIndex.set(i, { text: alternative.transcript, final: result.isFinal });
    }
    const { text, allFinal } = compose();
    if (text !== '') handlers.onTranscript(text, allFinal);
  };

  recognition.onerror = (event) => {
    const error = describe(event.error);
    /* Silence is not worth a red message on a screen across the room — it is
       what "nobody said anything" sounds like, and dock mode hits it every
       time the room is quiet for a few seconds. */
    if (error.kind !== 'silent') handlers.onError?.(error);
  };

  recognition.onend = () => handlers.onEnd?.();

  try {
    recognition.start();
  } catch (err) {
    /* `start()` throws synchronously when one is already running. Reported
       rather than swallowed: it means two things are trying to listen at once,
       which is a bug in the caller and not something he did. */
    handlers.onError?.({
      kind: 'unknown',
      raw: err instanceof Error ? err.name : String(err),
      message: 'Already listening.',
    });
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Already stopped. Nothing to do and nothing worth saying.
      }
    },
    abort: () => {
      try {
        recognition.abort();
      } catch {
        // As above.
      }
    },
  };
}
