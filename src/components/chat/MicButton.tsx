/**
 * The microphone, beside Send (item 24).
 *
 * Deliberately a separate file rather than more markup inside `Composer.tsx`:
 * the composer is a 700-line component that another session had open when this
 * was written, and a self-contained button that the composer renders through
 * one optional prop is the version of this change that does not collide with
 * theirs.
 *
 * **At rest it matches Send exactly** — 34px, the same glass fill, the same rim
 * and the same transition — because they are two halves of one control: the
 * two ways to put a sentence into Atlas. A microphone drawn in a different
 * idiom beside it would read as a different kind of thing.
 *
 * **Since 29-1P15d (idea 78) it becomes a timer while it listens**: it
 * stretches into a pill with the minutes on one side, the seconds on the other
 * and a glowing violet light between them, and when what he said lands in the
 * field the light turns lime for a moment and the pill folds back into the
 * mic. The face is `MicTimerFace` (`MicTimer.tsx`), shared with dock mode. The
 * pill grows into the field's width, which gives the line of text a little
 * less room while it listens; nobody types into a field they are talking to.
 * The old ripple ring behind the button is gone — the light is what says it is
 * listening now, and two signals for one state was one too many.
 */
import { useEffect, useState } from 'react';
import type { DictationError } from '../../lib/voice/recognition';
import { MicTimerFace, type MicFace } from './MicTimer';
import { MIC_DONE_MS, secondsWords, useSecondsSince } from './micClock';

export interface MicButtonProps {
  listening: boolean;
  /** What is being heard right now, for the title. Empty before he speaks. */
  heard: string;
  error: DictationError | null;
  onToggle: () => void;
  /** Atlas is mid-answer; dictating into a running turn is not a thing. */
  disabled?: boolean;
  /** When the microphone opened, for the timer. `useDictation().startedAt`. */
  startedAt?: number | null;
  /** When a sentence last landed, for the lime "got it". `useDictation().landedAt`. */
  landedAt?: number | null;
}

export function MicButton({
  listening,
  heard,
  error,
  onToggle,
  disabled = false,
  startedAt = null,
  landedAt = null,
}: MicButtonProps) {
  const seconds = useSecondsSince(startedAt, listening);
  /* The lime holds for `MIC_DONE_MS` after a sentence lands, then folds. Kept
     as "the last landing that has folded" rather than a flag set in an effect:
     the timeout writes it, so nothing is set during render or in an effect body. */
  const [folded, setFolded] = useState<number | null>(landedAt);
  useEffect(() => {
    if (landedAt === null) return;
    const timer = window.setTimeout(() => setFolded(landedAt), MIC_DONE_MS);
    return () => window.clearTimeout(timer);
  }, [landedAt]);
  const done = !listening && landedAt !== null && landedAt !== folded;
  const face: MicFace = listening ? 'listening' : done ? 'done' : 'idle';

  const label = listening ? `Stop listening, ${secondsWords(seconds)}` : 'Speak instead of typing';

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={disabled}
      aria-label={label}
      aria-pressed={listening}
      data-mic-button=""
      /* The live transcript goes in the title so that hovering a stuck
         microphone says what it last heard, which is the only clue there is
         when a phrase is being misread rather than missed. */
      title={error !== null ? error.message : listening && heard !== '' ? heard : label}
      style={{
        flex: '0 0 auto', display: 'grid', placeItems: 'center', padding: 0,
        border: 0, borderRadius: 'var(--r-pill)', background: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'var(--t-hover)',
      }}
    >
      <MicTimerFace face={face} seconds={seconds} error={error !== null && !listening} />
    </button>
  );
}
