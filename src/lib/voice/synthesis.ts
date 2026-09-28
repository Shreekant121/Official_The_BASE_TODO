/**
 * Atlas answering out loud (item 25).
 *
 * WHY THIS IS THE BROWSER AND NOT CHATTERBOX
 * -------------------------------------------
 * Item 25 says Chatterbox, open source, **with the voice Shreekant supplies**,
 * and that is still the only way to get *his* voice. What changed on
 * 2026-09-14 is the price of the alternative: his tablet reports **95 voices**
 * already installed, many of them Indian-language, and speaking through them
 * costs no VRAM, no model load, and no laptop. Chatterbox wants 1–2 GB beside
 * gemma's 3.2 GB on an 8 GB card — the item itself calls that tight — and only
 * works while the laptop is awake.
 *
 * Put to him as exactly that trade, he chose the device's own voices **and
 * asked to pick which one**, which is what `voices()` and `chooseVoice()` are
 * for. Chatterbox is not ruled out and nothing here forecloses it: everything
 * that speaks goes through `speak()`, so a second engine is one function.
 *
 * SPEAKING MARKDOWN IS THE BUG NOBODY PREDICTS
 * ---------------------------------------------
 * Atlas writes markdown — item 13B is the whole session about the app
 * rendering what it actually writes — and a synthesiser reads markdown
 * literally. Unstripped, a normal answer is read out as *"star star Rahul star
 * star"*, a table is read as a wall of pipes, and a link is read as its URL,
 * one character at a time. `speakable()` is not a nicety; without it the
 * feature is unusable on its first sentence.
 */

/** A voice as the picker needs it. */
export interface VoiceChoice {
  /** The stable id to store. Voice *names* are not unique across engines. */
  uri: string;
  name: string;
  lang: string;
  /** Whether the engine believes it runs without the network. */
  local: boolean;
}

export function synthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Every voice the device has.
 *
 * **Android populates this asynchronously and returns an empty array on the
 * first call**, which is why `onVoicesReady` exists and why no caller should
 * treat "no voices" as "no speech". The measurement saw 95 arrive, but not
 * immediately.
 */
export function voices(): VoiceChoice[] {
  if (!synthesisSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .map((voice) => ({
      uri: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      local: voice.localService,
    }))
    .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
}

/**
 * Call `then` when the voice list is actually populated. Returns a cleanup.
 *
 * Belt and braces on purpose: the event is listened for *and* a late poll is
 * scheduled, because `voiceschanged` is not fired by every engine and a picker
 * that stays empty for ever is indistinguishable from a broken one.
 */
export function onVoicesReady(then: () => void): () => void {
  if (!synthesisSupported()) return () => {};
  const synth = window.speechSynthesis;
  const handler = () => then();
  synth.addEventListener('voiceschanged', handler);
  const timer = window.setTimeout(then, 1200);
  return () => {
    synth.removeEventListener('voiceschanged', handler);
    window.clearTimeout(timer);
  };
}

/**
 * The voices worth offering first.
 *
 * His 95 span dozens of languages — Assamese, Bulgarian, Bhojpuri, Bengali —
 * and a Gujarati voice reading an English backlog is a novelty he would turn
 * off within a day. English leads, Indian English first because it is his
 * tablet and it says his place names correctly; everything else stays one tap
 * away rather than being hidden, because deciding for him which language he
 * wants read aloud is not this file's business.
 */
export function englishFirst(all: VoiceChoice[]): { english: VoiceChoice[]; rest: VoiceChoice[] } {
  const english = all.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const rest = all.filter((voice) => !voice.lang.toLowerCase().startsWith('en'));
  english.sort((a, b) => {
    const rank = (lang: string) => (lang.toLowerCase() === 'en-in' ? 0 : lang.toLowerCase().startsWith('en-') ? 1 : 2);
    return rank(a.lang) - rank(b.lang) || a.name.localeCompare(b.name);
  });
  return { english, rest };
}

/**
 * Markdown, and everything else Atlas writes that must not be read aloud.
 *
 * Each rule is here because the raw text is worse spoken than the stripped
 * text, not for tidiness. Code fences go entirely — a synthesiser reading a
 * JSON tool argument aloud is thirty seconds of noise nobody listens to.
 */
export function speakable(markdown: string): string {
  return (
    markdown
      // Fenced code: dropped whole. Nobody wants a payload read to them.
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      // Links: the words, never the URL.
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      // Emphasis and headings.
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .replace(/~~(.*?)~~/g, '$1')
      // Tables: pipes and rule rows read as gibberish. Cells become clauses.
      .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
      .replace(/\|/g, ', ')
      // Bullets and quotes lead every line with punctuation otherwise.
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * How much of a long answer to speak.
 *
 * A turn that lists forty tasks is a minute and a half of talking that cannot
 * be skimmed, and the tablet is across the room. Cut at a sentence boundary
 * near the limit and say so out loud, rather than stopping mid-word or reading
 * the lot — **the screen still has all of it**, which is the point of dock
 * mode showing the answer as well as speaking it.
 */
export function trimForSpeech(text: string, limit = 700): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  const window_ = text.slice(0, limit);
  const lastStop = Math.max(window_.lastIndexOf('. '), window_.lastIndexOf('? '), window_.lastIndexOf('! '));
  const cut = lastStop > limit * 0.5 ? window_.slice(0, lastStop + 1) : window_;
  return { text: `${cut.trim()} There is more on screen.`, truncated: true };
}

export interface SpeakOptions {
  /** `voiceURI` from the picker. Falsy means the device default. */
  voiceUri?: string | null;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
}

/**
 * Say something.
 *
 * Cancels whatever is already speaking, deliberately: two overlapping voices
 * is the single worst thing this feature can do, and it is what happens by
 * default when a second answer arrives before the first has finished.
 */
export function speak(text: string, options: SpeakOptions = {}): void {
  if (!synthesisSupported()) {
    options.onError?.('This browser cannot speak.');
    return;
  }
  const line = text.trim();
  if (line === '') {
    /*
     * Asynchronous even though there is nothing to say, so that **every path
     * out of `speak` calls back asynchronously**. A caller driving a state
     * machine from `onEnd` — dock mode does — would otherwise be re-entered
     * synchronously on the empty case and only the empty case, which is the
     * kind of difference that produces one unreproducible bug.
     */
    queueMicrotask(() => options.onEnd?.());
    return;
  }

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(line);
  if (options.voiceUri) {
    const match = synth.getVoices().find((voice) => voice.voiceURI === options.voiceUri);
    /* A voice that is no longer installed falls back to the device default
       rather than failing: language packs get removed, and losing one should
       cost him the accent, not the feature. */
    if (match !== undefined) {
      utterance.voice = match;
      utterance.lang = match.lang;
    }
  }
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (event) => {
    /* `interrupted` and `canceled` are this module cancelling itself one line
       above, on every single call. Reporting them would put an error on screen
       every time Atlas answered twice. */
    const reason = event.error ?? 'unknown';
    if (reason === 'interrupted' || reason === 'canceled') {
      options.onEnd?.();
      return;
    }
    options.onError?.(`Could not speak — ${reason}.`);
    options.onEnd?.();
  };

  synth.speak(utterance);
}

/** Shut up. Used when he taps the mic, leaves dock mode, or sends a new turn. */
export function stopSpeaking(): void {
  if (!synthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing was speaking.
  }
}
