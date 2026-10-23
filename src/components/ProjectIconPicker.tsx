/**
 * Choosing a project's icon (29-1P8a2, idea 150, from Notion): every
 * Phosphor glyph, searched by name — his call, "a white icon (Phosphor,
 * searchable by name)". It grows out of the sheet's icon tile, inside a well,
 * as the emoji grid it replaces did.
 *
 * Built on first open (CLAUDE.md "Performance", rule 2): the catalogue is a
 * chunk of its own, fetched when this mounts. Before he types, it offers what
 * the project's name suggests ("Gym plan" → a barbell) and then a shortlist
 * of things projects are about; a search shows its best 96.
 */
import { useEffect, useMemo, useState } from 'react';
import { Bone, Icon, Input, SoftButton } from '../ui';
import { useMedia } from '../ui/useMedia';
import { loadCatalog } from '../lib/projectIcons/glyphs';
import type { CatalogRow } from '../lib/projectIcons/catalog.generated';
import { POPULAR_ICONS, searchIcons, suggestFromName } from '../lib/projectIcons/search';
import { iconLabel, phosphorIcon, phosphorName } from '../lib/projectIcon';

const SHOWN = 96;

export default function ProjectIconPicker({
  value, projectName, onPick,
}: {
  /** The project's `icon` as stored (`ph:…`, or an emoji he chose before). */
  value: string;
  projectName: string;
  onPick: (icon: string) => void;
}) {
  const [rows, setRows] = useState<readonly CatalogRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  /* No keyboard jumping up on the tablet the moment the picker opens. */
  const keyboard = useMedia('(hover: hover) and (pointer: fine)');

  useEffect(() => {
    let live = true;
    loadCatalog().then(
      (r) => { if (live) { setRows(r); setFailed(false); } },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [attempt]);

  const byName = useMemo(() => new Map(rows?.map((r) => [r[0], r[2]]) ?? []), [rows]);
  const chosen = phosphorName(value);

  const sections = useMemo(() => {
    if (!rows) return [];
    const q = query.trim();
    if (q) {
      const found = searchIcons(rows, q, SHOWN);
      return [{ title: found.length ? `${found.length === SHOWN ? `Best ${SHOWN}` : found.length} for “${q}”` : `Nothing called “${q}”`, names: found }];
    }
    const suggested = suggestFromName(rows, projectName, 8);
    const popular = POPULAR_ICONS.filter((n) => !suggested.includes(n));
    return [
      ...(suggested.length ? [{ title: `For “${projectName.trim()}”`, names: suggested }] : []),
      { title: 'Popular', names: popular },
    ];
  }, [rows, query, projectName]);

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-4)',
        borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-morph) both',
      }}
    >
      <Input
        size="sm"
        autoFocus={keyboard}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        iconLeft={<Icon name="search" size={16} />}
        placeholder={rows ? `Search ${rows.length.toLocaleString('en-IN')} icons` : 'Search icons'}
        aria-label="Search icons"
      />
      <div
        className="ag-scroll ag-fade"
        style={{ display: 'grid', gap: 'var(--sp-4)', maxHeight: 232, overflowY: 'auto', overscrollBehavior: 'contain' }}
      >
        {failed ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            The icons did not load.
            <SoftButton size="sm" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }}>Try again</SoftButton>
          </div>
        ) : !rows ? (
          /* 29-1P14d2, idea 116: the grid on its way, in the shape of the icons. */
          <div role="status" aria-busy="true" aria-label="Loading icons" style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            <Bone width={72} height={9} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
              {Array.from({ length: 14 }, (_, i) => (
                <Bone key={i} width={40} height={40} radius="var(--r-sm)" delay={(i % 7) * 60} />
              ))}
            </div>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.title} style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{section.title}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)' }}>
                {section.names.map((name) => {
                  const on = name === chosen;
                  const paths = byName.get(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => onPick(phosphorIcon(name))}
                      aria-label={iconLabel(name)}
                      title={iconLabel(name)}
                      aria-pressed={on}
                      style={{
                        display: 'grid', placeItems: 'center', width: 40, height: 40,
                        border: 0, cursor: 'pointer', borderRadius: 'var(--r-sm)',
                        color: on ? 'var(--fg-1)' : 'var(--fg-2)',
                        backgroundImage: on ? 'var(--glass-fill-3)' : 'none',
                        backgroundColor: 'transparent',
                        boxShadow: on ? 'var(--glass-rim-2)' : 'none',
                        transition: 'var(--t-hover)',
                      }}
                    >
                      {paths && (
                        <svg viewBox="0 0 256 256" width={22} height={22} fill="currentColor" aria-hidden="true">
                          {paths.map((d, i) => <path key={i} d={d} />)}
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
