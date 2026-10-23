/**
 * The project sheet's cover picker (idea 149, 29-1P8a): six styles, chosen
 * per project — his call, "Can I get all of them? I can customize the look
 * of a project". A big preview, a row of the six as small tiles, then what
 * the chosen style lets him change: its pattern (A), its colours, Shuffle.
 *
 * His photo still wins on the card. While one is set the preview is the
 * photo and the tiles are offers: picking one takes the photo out (the
 * sheet's own Remove does the same), so what he sees is what he saves.
 *
 * The tiles are the real cover drawn at the card's size and scaled down,
 * so each is exactly what the card would show — no second drawing to drift.
 */
import type { CSSProperties } from 'react';
import { CoverImage, Icon, PROJECT_COVER_RATIO, SegmentedControl, SoftButton, SoftToggle } from '../ui';
import {
  COVER_COLOURS, COVER_COLOURS_LABEL, COVER_KINDS, COVER_KIND_LABEL, COVER_PATTERNS, COVER_H, COVER_W,
  resolveCover, shuffleSeed, type CoverColours, type CoverKind, type CoverPattern, type ProjectCoverStyle,
} from '../lib/projectCover';
import { MadeCover, type CoverSubject } from './ProjectCover';

const TILE_W = 72;
const PATTERN_LABEL: Record<CoverPattern | 'mixed', string> = {
  mixed: 'Mixed', mesh: 'Mesh', waves: 'Waves', stripes: 'Stripes', dots: 'Dots',
};

const frame: CSSProperties = {
  position: 'relative',
  aspectRatio: PROJECT_COVER_RATIO,
  overflow: 'hidden',
  backgroundColor: 'var(--void-1)',
};

interface CoverPickerProps {
  subject: CoverSubject;
  onCoverChange: (next: ProjectCoverStyle) => void;
  /** Picking a style while a photo is set takes the photo out. */
  onClearPhoto: () => void;
}

export default function CoverPicker({ subject, onCoverChange, onClearPhoto }: CoverPickerProps) {
  const resolved = resolveCover(subject.id, subject.cover);
  const photo = !!subject.imageUrl;
  /* Every change writes the whole style, seed included, so a project that
     only ever had the default keeps the very cover it was showing. */
  const set = (patch: Partial<ProjectCoverStyle>) => onCoverChange({
    kind: resolved.kind,
    pattern: resolved.patternFixed ? resolved.pattern : undefined,
    colours: resolved.colours,
    seed: resolved.seed,
    ...patch,
  });
  const pickKind = (kind: CoverKind) => {
    if (photo) onClearPhoto();
    set({ kind });
  };
  const coloured = resolved.kind !== 'glimpse' && resolved.kind !== 'none';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-5)' }}>
      {/* The preview: what Home's card will show, a little smaller than the card. */}
      <div
        className="ag-licon-host"
        style={{
          ...frame,
          width: '100%',
          maxWidth: 280,
          borderRadius: 'var(--r-lg)',
          boxShadow: 'var(--glass-rim-1), var(--glass-cast-1)',
          ...(!photo && resolved.kind === 'none'
            ? { backgroundColor: 'transparent', boxShadow: 'none', border: '1px dashed var(--line-strong)', display: 'grid', placeItems: 'center' }
            : {}),
        }}
      >
        {photo ? <CoverImage src={subject.imageUrl!} /> : resolved.kind === 'none' ? (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', padding: 'var(--sp-6)', textAlign: 'center' }}>
            No cover. The card starts with its icon and name, and is shorter.
          </span>
        ) : <MadeCover project={subject} style={resolved} />}
      </div>

      {photo && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
          Your photo is the cover. Picking a style below takes its place.
        </span>
      )}

      <div role="radiogroup" aria-label="Cover style" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
        {COVER_KINDS.map((kind) => {
          const on = !photo && resolved.kind === kind;
          return (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={`${COVER_KIND_LABEL[kind]} cover`}
              onClick={() => pickKind(kind)}
              style={{
                display: 'grid', gap: 'var(--sp-2)', justifyItems: 'center',
                padding: 0, border: 0, background: 'none', cursor: 'pointer',
                color: on ? 'var(--fg-1)' : 'var(--fg-3)',
                font: 'var(--type-caption)',
                transition: 'var(--t-hover)',
              }}
            >
              <span
                style={{
                  ...frame,
                  width: TILE_W,
                  borderRadius: 'var(--r-sm)',
                  boxShadow: on ? '0 0 0 2px var(--job-lime-line)' : 'inset 0 0 0 1px var(--line-faint)',
                  ...(kind === 'none' ? { backgroundColor: 'transparent', border: '1px dashed var(--line-strong)' } : {}),
                }}
              >
                {kind !== 'none' && (
                  <span
                    style={{
                      position: 'absolute', left: 0, top: 0, width: COVER_W, height: COVER_H,
                      transform: `scale(${TILE_W / COVER_W})`, transformOrigin: '0 0',
                    }}
                  >
                    <MadeCover project={subject} style={{ ...resolved, kind }} />
                  </span>
                )}
              </span>
              {COVER_KIND_LABEL[kind]}
            </button>
          );
        })}
      </div>

      {!photo && resolved.kind === 'pattern' && (
        <div role="radiogroup" aria-label="Pattern" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          {(['mixed', ...COVER_PATTERNS] as const).map((p) => {
            const on = p === 'mixed' ? !resolved.patternFixed : resolved.patternFixed && resolved.pattern === p;
            return (
              <SoftToggle
                key={p}
                size="sm"
                role="radio"
                aria-checked={on}
                pressed={on}
                onPressedChange={() => set({ pattern: p === 'mixed' ? undefined : p })}
              >
                {PATTERN_LABEL[p]}
              </SoftToggle>
            );
          })}
        </div>
      )}

      {!photo && coloured && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <SegmentedControl
            size="sm"
            look="soft"
            aria-label="Cover colours"
            options={COVER_COLOURS.map((c) => ({ value: c, label: COVER_COLOURS_LABEL[c] }))}
            value={resolved.colours}
            onChange={(v) => set({ colours: v as CoverColours })}
          />
          <SoftButton
            size="sm"
            icon={<Icon name="shuffle" size={15} />}
            onClick={() => set({ seed: shuffleSeed(resolved.seed, Math.random) })}
          >
            Shuffle
          </SoftButton>
        </div>
      )}
    </div>
  );
}
