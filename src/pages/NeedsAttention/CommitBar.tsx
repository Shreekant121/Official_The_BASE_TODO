/**
 * Score — the commit bar (UI-30).
 *
 * `screens/scoring.html:1400`, and its own note: *"Sticky, so the session's
 * only two verbs are always in reach."* UI-9 had them in the header, sharing a
 * row with the title and the score chip; putting them at the bottom is what
 * lets the header shrink to a pill and the subject become page content.
 *
 * **The primary is `frost`, not emerald.** `Button.prompt.md`: *"frost is the
 * loudest option on a busy photographic or gradient backdrop — white glass
 * always wins over accent glass there"*, and this bar floats over whatever the
 * page is scrolled to. It is also the ration: UI-9 spent emerald here on the
 * grounds that an affirmative primary earns it, and this screen now has a
 * genuinely live emerald — the session progress bar — which a tinted button
 * two inches below was competing with. Same correction UI-28 made on login.
 * **V3-5 made it `gel`**, V3's one primary, as Home, the board and Focus did
 * with theirs; it draws as `solid` outside a scope. The ration argument above
 * is the old system's — v4 spends its green on exactly this one button.
 *
 * **`Save & next` stays enabled while fields are outstanding, and that is a
 * deliberate divergence.** The source disables it until nothing is missing,
 * which is safe there because its edits are live — `patch()` writes straight
 * into state, so pressing Skip loses nothing. Ours are staged in
 * `useTaskDraft` and reach the store only through this button. Disabling it
 * would mean a user who filled two of three fields could leave only via Skip,
 * and Skip would silently throw both away. So the button is always live and
 * the message beside it carries the count instead, which is the half of the
 * source's rule that costs nothing: *"The footer restates the count, never a
 * red banner."*
 *
 * **⌘↵ / Ctrl+↵ commits and moves on**, because the source's copy promises it
 * and copy that names a shortcut has to have one behind it. The bare
 * ArrowLeft / ArrowRight bindings are NOT ported: the source can afford them
 * because its fields are a handful of inputs, and this screen is a wall of
 * tiles and pills where an arrow press on a focused quadrant button would
 * silently advance the whole session. The guard on the shortcut is the
 * source's own — a keystroke inside an input is ignored unless it carries the
 * modifier.
 */
import { useEffect } from 'react';
import { Button, Icon, ScoreDial } from '../../ui';
import { RedAlertBadge } from '../../components/task-fields/RedAlertBadge';

interface CommitBarProps {
  score: number;
  /** The highest score currently on screen — what `showMax` is read against. */
  peak: number;
  /** `W > 0.5`. Warms the chip and raises the badge beside it. */
  redAlert: boolean;
  /** How many of the four gated fields are still empty. */
  outstanding: number;
  isDirty: boolean;
  canGoPrevious: boolean;
  /** True on the session's last task — the primary finishes instead of stepping. */
  isLast: boolean;
  wide: boolean;
  onPrevious: () => void;
  onSkip: () => void;
  onSave: () => void;
}

export default function CommitBar({
  score, peak, redAlert, outstanding, isDirty, canGoPrevious, isLast, wide,
  onPrevious, onSkip, onSave,
}: CommitBarProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      e.preventDefault();
      onSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);

  /*
   * How far off the bottom of the window the bar floats. On a narrow window
   * that has to clear the floating `MiniNav`, which is the same offset Set
   * Deadlines' commit bar takes for the same reason.
   *
   * It is spent TWICE, and the second one is not decoration. A sticky element
   * at the end of its container is lifted by exactly this much at the end of
   * the scroll — which lifts it straight over whatever is above it. The tail
   * space that absorbs the lift has to be at least as big as the lift, so it
   * is the same value, written once. It must NOT be padding on the scroll
   * container: a sticky box is held inside that container's padding box, so
   * padding there is added to this offset as well, and the bar ends up
   * `inset + padding` up the window (measured at 100px, which is what sent
   * this back for a second look).
   */
  const inset = wide ? 'var(--sp-6)' : 'calc(60px + var(--sp-5) + var(--sp-4))';

  return (
    <div
      style={{
        position: 'sticky',
        bottom: inset,
        marginTop: inset,
        zIndex: 2,
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
        padding: 'var(--sp-4) var(--sp-5)',
        borderRadius: 'var(--r-pill)',
        /* Near-solid since 2026-09-24 (his "way too transparent", on this bar
           first): the fill carries `--glass-floor` now, like every glass fill. */
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-thick)',
      }}
    >
      {/* `lg showMax` — `ScoreDial.prompt.md` names this screen as one of the
          two where the score is the subject rather than a fact about
          something else. */}
      <ScoreDial value={score} max={peak} alert={redAlert} size="lg" showMax label="Priority" />
      <RedAlertBadge redAlert={redAlert} size="md" />

      <span
        style={{
          font: 'var(--type-label)', minWidth: 0, textWrap: 'pretty',
          color: outstanding > 0 ? 'oklch(0.95 0.07 82)' : 'var(--fg-2)',
        }}
      >
        {outstanding > 0
          ? `${outstanding} field${outstanding === 1 ? '' : 's'} still needed`
          : 'Scored. ⌘↵ to commit and move on.'}
      </span>

      <span style={{ flex: 1 }} />

      <Button
        variant="glass"
        size="sm"
        disabled={!canGoPrevious}
        onClick={onPrevious}
        iconLeft={<Icon name="arrow-left" size={16} />}
      >
        Previous
      </Button>
      <Button
        variant="glass"
        size="sm"
        onClick={onSkip}
        title="Leave this one as it is and move on"
        iconLeft={<Icon name="skip-forward" size={16} />}
      >
        Skip
      </Button>
      <Button
        variant="gel"
        size="sm"
        onClick={onSave}
        iconRight={<Icon name={isLast ? 'check' : 'arrow-right'} size={16} />}
      >
        {isLast ? 'Finish session' : isDirty ? 'Save & next' : 'Next'}
      </Button>
    </div>
  );
}
