/**
 * The microphone, beside Send (item 24).
 *
 * Deliberately a separate file rather than more markup inside `Composer.tsx`:
 * the composer is a 700-line component that another session had open when this
 * was written, and a self-contained button that the composer renders through
 * one optional prop is the version of this change that does not collide with
 * theirs.
 *
 * **It matches Send exactly** — 34px, the same glass fills, the same rim and
 * the same transition — because they are two halves of one control: the two
 * ways to put a sentence into Atlas. A microphone drawn in a different idiom
 * beside it would read as a different kind of thing.
 *
 * `ag-ripple` is the design system's own animation for this, and its comment
 * in `tokens/motion.css` says so in as many words: *"Concentric rings leaving
 * a source (voice, sync, live)"*. The system anticipated voice; nothing here
 * needed inventing, and the ripple is therefore already covered by the
 * `prefers-reduced-motion` block at the bottom of that file.
 */
import { Icon } from '../../ui/core/Icon';
import type { DictationError } from '../../lib/voice/recognition';

export interface MicButtonProps {
  listening: boolean;
  /** What is being heard right now, for the title. Empty before he speaks. */
  heard: string;
  error: DictationError | null;
  onToggle: () => void;
  /** Atlas is mid-answer; dictating into a running turn is not a thing. */
  disabled?: boolean;
}

export function MicButton({ listening, heard, error, onToggle, disabled = false }: MicButtonProps) {
  const label = listening ? 'Stop listening' : 'Speak instead of typing';

  return (
    <span style={{ position: 'relative', flex: '0 0 auto', display: 'grid', placeItems: 'center' }}>
      {/*
        The ripple sits *behind* the button and is purely decorative, so it is
        hidden from assistive technology and takes no pointer events — the
        button underneath must stay the whole target, including the moment a
        ring happens to be drawn at its edge.
      */}
      {listening && (
        <span
          aria-hidden
          style={{
            position: 'absolute', width: 34, height: 34, borderRadius: '50%',
            border: '1.5px solid oklch(0.85 0.12 162)',
            animation: 'var(--kf-ripple) 1.6s ease-out infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        disabled={disabled}
        aria-label={label}
        aria-pressed={listening}
        /* The live transcript goes in the title so that hovering a stuck
           microphone says what it last heard, which is the only clue there is
           when a phrase is being misread rather than missed. */
        title={error !== null ? error.message : listening && heard !== '' ? heard : label}
        style={{
          position: 'relative',
          flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 34, height: 34,
          border: 0, borderRadius: '50%',
          cursor: disabled ? 'default' : 'pointer',
          backgroundImage: listening
            ? 'var(--glass-tint-accent)'
            : error !== null
              ? 'var(--glass-fill-1)'
              : 'var(--glass-fill-1)',
          boxShadow: listening
            ? 'var(--glass-rim-2), var(--glow-accent-sm)'
            : 'var(--glass-rim-1)',
          color: listening
            ? 'oklch(0.95 0.07 162)'
            : error !== null
              ? 'var(--fg-danger, oklch(0.72 0.17 25))'
              : 'var(--fg-4)',
          opacity: disabled ? 0.45 : 1,
          transition: 'var(--t-hover)',
        }}
      >
        <Icon name={error !== null && !listening ? 'mic-off' : 'mic'} size={16} />
      </button>
    </span>
  );
}
