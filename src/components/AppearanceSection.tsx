import { useSyncExternalStore } from 'react';
import { Card, Icon, Kicker, Well } from '../ui';
import { DARK_TINTS, readDarkTint, setDarkTint, subscribeDarkTint, type DarkTint } from '../lib/darkTint';

/**
 * Settings → App → Appearance (29-1P1): the dark tint, idea 63. The same on
 * both his devices (`lib/darkTintSync.ts`), unlike the Speed switches below
 * it, which is why the kicker says so.
 */
export default function AppearanceSection() {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="both devices">Appearance</Kicker>
        <Well pad="var(--sp-3) var(--sp-5)">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', flexWrap: 'wrap', padding: 'var(--sp-2) 0' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
              <Icon name="sparkles" size={16} />
            </span>
            <div style={{ minWidth: 200, display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>Tint the dark</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                A trace of one colour in every dark grey, so the blacks look warm or cool instead of flat.
                Very faint, and it stays dark. No button changes colour.
              </span>
            </div>
            <DarkTintPicker />
          </div>
        </Well>
      </div>
    </Card>
  );
}

/** The swatch for each tint: the colour itself, or a mid grey for neutral. */
const SWATCH: Record<DarkTint, string> = {
  neutral: 'oklch(0.5 0 0)',
  emerald: 'var(--job-emerald)',
  orange: 'var(--job-orange)',
  violet: 'var(--job-violet)',
  sky: 'var(--job-sky)',
};

const NAME: Record<DarkTint, string> = {
  neutral: 'Neutral', emerald: 'Emerald', orange: 'Orange', violet: 'Violet', sky: 'Sky blue',
};

/** Five swatches, one chosen. Arrow keys move the choice, as a radio group's do. */
export function DarkTintPicker() {
  const tint = useSyncExternalStore(subscribeDarkTint, readDarkTint);
  const pick = (i: number) => {
    const next = DARK_TINTS[(i + DARK_TINTS.length) % DARK_TINTS.length];
    setDarkTint(next);
    document.getElementById(`dark-tint-${next}`)?.focus();
  };
  return (
    <div role="radiogroup" aria-label="Tint the dark" style={{ display: 'flex', gap: 2 }}>
      {DARK_TINTS.map((t, i) => {
        const on = t === tint;
        return (
          <button
            key={t}
            id={`dark-tint-${t}`}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={NAME[t]}
            title={NAME[t]}
            tabIndex={on ? 0 : -1}
            onClick={() => setDarkTint(t)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(i + 1); }
              else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(i - 1); }
            }}
            style={{
              display: 'grid', placeItems: 'center', width: 44, height: 44, padding: 0,
              border: 0, borderRadius: '50%', backgroundColor: 'transparent', cursor: 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 26, height: 26, borderRadius: '50%', backgroundColor: SWATCH[t],
                boxShadow: on
                  ? '0 0 0 2px var(--void-1), 0 0 0 3.5px var(--fg-2)'
                  : '0 0 0 2px var(--void-1), 0 0 0 3.5px transparent',
                transition: 'box-shadow var(--dur-fast) var(--ease-glass)',
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
