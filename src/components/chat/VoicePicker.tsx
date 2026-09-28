/**
 * Ninety-five voices, searchable — and one row for the voice that is gone.
 *
 * WHY IT IS ITS OWN FILE (DESIGN-1)
 * ---------------------------------
 * There are two places to choose a voice and they must not be two lists: the
 * `VoiceDial` popover on the composer, and dock mode, where the tablet is on
 * its stand and the picker is the one thing on that screen you actually
 * operate. One component, two hosts — `big` is the only difference, and it is
 * type size, not behaviour.
 *
 * `screens/voice.html` does not draw this. It draws Leave and the state
 * harness and nothing else, so the layout below is the design system's own
 * parts rather than a reconciliation: `Input`'s trough for the search field,
 * the same row shape `VoiceDial` already had, no new colour and no new
 * motion. DESIGN-1's click-path is what says it belongs on the dock screen at
 * all — *"open the voice list, search it, and pick a voice"* — and Shreekant
 * chose on 2026-09-16 that one list serves both surfaces.
 *
 * THE TWO THINGS SEARCH FIXES
 * ---------------------------
 * His tablet reports **95 voices** with names that are engine identifiers.
 * Before this, finding one meant scrolling a list whose only structure was
 * `englishFirst` — good enough at twelve rows, not at ninety-five, and
 * useless if what he wants is the Gujarati one he heard last week.
 *
 * **A query searches every voice, not the visible half.** The English-first
 * split is a default ordering, not a filter to escape from: typing "guj" with
 * the list collapsed to English should find the Gujarati voice, and a search
 * that only looked at what was already on screen would find nothing and look
 * broken. Matching is on **name and language tag together**, because the row
 * shows both and either is a reasonable thing to type.
 *
 * THE MISSING-VOICE ROW
 * ---------------------
 * The choice is stored as a `voiceURI` on the device (`devicePrefs.ts`), and
 * a language pack can be uninstalled between sessions. `synthesis.speak`
 * already falls back to the device default in that case — losing the accent
 * rather than the feature — but silently, so the picker showed no selection
 * anywhere and the app looked like it had forgotten. This row is the answer
 * DESIGN-1 asks for: it names what is missing, says it is speaking in the
 * device's own voice meanwhile, and offers the one button that clears it.
 *
 * **Absent while the list is still empty.** Android returns no voices on the
 * first call and fills them in a moment later (`onVoicesReady`), and during
 * that moment every stored choice looks uninstalled.
 */
import { useMemo, useState } from 'react';
import { Icon, Input, MetaKicker } from '../../ui';
import { englishFirst, speak, type VoiceChoice } from '../../lib/voice/synthesis';

/** Short, and it names him, so a wrong-language voice is obvious at once. */
const SAMPLE = 'Shreekant, the Empire invoice is eleven days old.';

export interface VoicePickerProps {
  /** Every voice installed on this device. */
  all: VoiceChoice[];
  chosen: string | null;
  onChoose: (uri: string | null) => void;
  /**
   * Dock-mode sizing: the same list read from across a room. Type and rows
   * grow; nothing else changes.
   */
  big?: boolean;
  /**
   * Called after a pick, so a host that has something to close can. The
   * dial does not — choosing and auditioning are one gesture there.
   */
  onPicked?: () => void;
}

export function VoicePicker({ all, chosen, onChoose, big = false, onPicked }: VoicePickerProps) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const { english, rest } = useMemo(() => englishFirst(all), [all]);
  const trimmed = query.trim().toLowerCase();

  /* A query reaches every voice; with no query the English-first split is
     the ordering and `showAll` is the toggle. See the header. */
  const listed = useMemo(() => {
    if (trimmed !== '') {
      return [...english, ...rest].filter(
        (voice) => `${voice.name} ${voice.lang}`.toLowerCase().includes(trimmed),
      );
    }
    return showAll ? [...english, ...rest] : english;
  }, [trimmed, english, rest, showAll]);

  /* A stored voice that this device no longer has. Never while the list is
     still arriving — see the header. */
  const missing = chosen !== null && all.length > 0 && !all.some((voice) => voice.uri === chosen);

  const pick = (uri: string | null) => {
    onChoose(uri);
    /* Tapping a voice speaks in it. The names are engine identifiers and
       there is no other way to tell what one sounds like. */
    speak(SAMPLE, { voiceUri: uri });
    onPicked?.();
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', minHeight: 0 }}>
      <MetaKicker>Voice — tap to hear it</MetaKicker>

      <Input
        size={big ? 'md' : 'sm'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={all.length > 0 ? `Search ${all.length} voices` : 'Search voices'}
        iconLeft={<Icon name="search" size={16} />}
        aria-label="Search voices"
      />

      {missing && (
        <div
          style={{
            display: 'grid', gap: 'var(--sp-3)',
            padding: 'var(--sp-4)', borderRadius: 'var(--r-sm)',
            backgroundImage: 'var(--glass-fill-1)',
            boxShadow: 'var(--glass-rim-1), 0 0 0 1px color-mix(in oklab, var(--status-review) 35%, transparent)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--status-review)' }}>
            <Icon name="volume-x" size={16} />
            <span style={{ font: 'var(--type-body)', fontSize: big ? 'var(--text-md)' : 'var(--text-sm)' }}>
              The voice you chose is not installed any more
            </span>
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            Atlas is speaking in the device&rsquo;s own voice until you pick another.
          </span>
          <button
            type="button"
            onClick={() => onChoose(null)}
            style={{
              justifySelf: 'start', border: 0, background: 'none', cursor: 'pointer',
              padding: 0, color: 'var(--fg-2)', font: 'var(--type-caption)',
              textDecoration: 'underline', textUnderlineOffset: 3,
            }}
          >
            Use the device default
          </button>
        </div>
      )}

      {/* `alignContent: start` is load-bearing in the dock-mode sheet: this is
          a grid inside a `1fr` track, and without it four rows stretch to fill
          560px of sheet and the list reads as a menu with nothing in it. */}
      <div
        className="ag-scroll"
        style={{
          display: 'grid', gap: 2, alignContent: 'start',
          minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        }}
      >
        {/* The default is always reachable, including mid-search — it is the
            way back out of a voice that turned out to be wrong. */}
        <VoiceRow
          name="Device default"
          lang="whatever the tablet picks"
          selected={chosen === null}
          big={big}
          onPick={() => pick(null)}
        />

        {listed.map((voice) => (
          <VoiceRow
            key={voice.uri}
            name={voice.name}
            lang={voice.lang}
            selected={chosen === voice.uri}
            big={big}
            onPick={() => pick(voice.uri)}
          />
        ))}

        {all.length === 0 && (
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            {/* Not an error. Android fills this list in a moment late, which
                is exactly what `onVoicesReady` is waiting for. */}
            Looking for the voices on this device&hellip;
          </p>
        )}

        {all.length > 0 && trimmed !== '' && listed.length === 0 && (
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            No voice matches &ldquo;{query.trim()}&rdquo;.
          </p>
        )}
      </div>

      {/* Only with no query: during a search the list is already everything. */}
      {trimmed === '' && rest.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((cur) => !cur)}
          style={{
            justifySelf: 'start', border: 0, background: 'none', cursor: 'pointer',
            padding: 0, color: 'var(--fg-3)', font: 'var(--type-caption)',
          }}
        >
          {showAll ? 'English only' : `All ${all.length} languages`}
        </button>
      )}
    </div>
  );
}

/** One voice. The tick is always in the tree so the row never changes width. */
function VoiceRow({
  name,
  lang,
  selected,
  big,
  onPick,
}: {
  name: string;
  lang: string;
  selected: boolean;
  big: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
        padding: big ? 'var(--sp-4)' : 'var(--sp-3) var(--sp-4)',
        border: 0, cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--r-sm)',
        backgroundImage: selected || hover ? 'var(--glass-fill-1)' : 'none',
        color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
        transition: 'background-image var(--dur-fast) var(--ease-glass)',
      }}
    >
      <span style={{ opacity: selected ? 1 : 0, transition: 'opacity var(--dur-fast) var(--ease-glass)', display: 'grid', placeItems: 'center' }}>
        <Icon name="check" size={big ? 18 : 14} />
      </span>
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-body)', fontSize: big ? 'var(--text-md)' : 'var(--text-sm)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {name}
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{lang}</span>
      </span>
    </button>
  );
}

export default VoicePicker;
