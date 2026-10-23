/* Item 25 — reading an answer aloud. Moved out of `pages/ChatPage.tsx`,
   unchanged, when it was split (BUILD-7); why the whole of voice was measured
   on the tablet first is written on the page, beside `useVoiceChoice`. */
import { useEffect, useMemo, useRef } from 'react';
import { useVoicePrefs, type useVoiceChoice } from '../../lib/voice/useVoice';
import { speak, speakable, stopSpeaking, trimForSpeech } from '../../lib/voice/synthesis';
import type { ChatTurn } from './chatShared';

export function useSpokenReplies(
  turns: ChatTurn[],
  busy: boolean,
  /** Dock mode does its own speaking. */
  docked: boolean,
  voice: ReturnType<typeof useVoiceChoice>,
) {
  /* Set in Settings → Atlas since OPT-8, so read from the shared store. */
  const speakReplies = useVoicePrefs((s) => s.speakReplies);

  /**
   * The answer to read out: the newest turn that has actually finished.
   *
   * Keyed by the turn's own id so that nothing is ever spoken twice — a page
   * that re-renders mid-answer would otherwise start the voice again from the
   * top, over itself. `status === 'done'` and not `busy` together are what
   * "finished" means here; an errored turn is deliberately not read aloud,
   * because a spoken stack trace helps nobody across a room.
   */
  const lastReply = useMemo(() => {
    const last = turns[turns.length - 1];
    if (last === undefined || last.status !== 'done') return null;
    const text = last.assistantText.trim();
    return text === '' ? null : { id: last.id, text };
  }, [turns]);

  /*
   * Item 25 — reading an ordinary reply out loud, when he has asked for it.
   *
   * Dock mode does its own speaking and must not be double-driven from here,
   * which is what `!docked` is for. The ref is what stops a re-render
   * repeating a line that has already been read.
   */
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (docked || !speakReplies || busy || lastReply === null) return;
    if (spokenFor.current === lastReply.id) return;
    spokenFor.current = lastReply.id;
    const line = trimForSpeech(speakable(lastReply.text));
    if (line.text !== '') speak(line.text, { voiceUri: voice.chosen });
  }, [docked, speakReplies, busy, lastReply, voice.chosen]);

  /* Leaving the screen with a voice still talking is the one thing this
     feature can do that has no visible off switch. */
  useEffect(() => () => stopSpeaking(), []);

  return { lastReply };
}
