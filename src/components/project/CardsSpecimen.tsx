/**
 * `/design`'s 29-1P7c section: densities, quick actions on hover and the
 * wires between blocked tasks, on three pretend cards. Local state only —
 * nothing here reads or writes a real task, so pressing Done or Tomorrow
 * changes this page and nothing else. The real pieces are `density.ts` +
 * `Fold` (parts.tsx), `QuickActions.tsx` and `BlockWires.tsx`; this borrows
 * their classes and `wirePath`, not their store wiring.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Card, Icon, SegmentedControl, ScoreDial } from '../../ui';
import { Fold } from './parts';
import { DENSITIES, type Density } from './density';
import { wirePath } from '../../lib/blockWires';

interface Pretend { id: string; title: string; note: string; facts: string; locked?: boolean; score: number }

const CARDS: Pretend[] = [
  { id: 'a', title: 'File the incorporation paperwork', note: 'Form INC-32 plus the MOA and AOA.', facts: 'tomorrow · 90 min', score: 14.3 },
  { id: 'b', title: 'Open the current account', note: 'Needs the certificate of incorporation.', facts: 'in 8 days · 120 min', score: 8.6, locked: true },
  { id: 'c', title: 'Rewrite the landing page copy', note: 'Lead with the outcome, not the process.', facts: 'in 4 days · 150 min', score: 21.3 },
];

export function CardsSpecimen() {
  const [density, setDensity] = useState<Density>('comfortable');
  const [said, setSaid] = useState('');
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [pointing, setPointing] = useState<string | null>(null);
  const [wire, setWire] = useState<{ d: string; x: number; y: number; lx: number; ly: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const comfy = density === 'comfortable';

  /* The wire between "a" (the blocker) and "b", measured on a hover. */
  useLayoutEffect(() => {
    if (!pointing) return;
    const root = host.current;
    let live = true;
    queueMicrotask(() => {
      if (!live || !root) return;
      const h = root.getBoundingClientRect();
      const box = (id: string) => {
        const r = root.querySelector(`[data-pretend="${id}"]`)!.getBoundingClientRect();
        return { left: r.left - h.left, top: r.top - h.top, right: r.right - h.left, bottom: r.bottom - h.top };
      };
      const w = wirePath(box('a'), box('b'), window.innerWidth - h.left);
      setWire({ d: w.d, x: w.end.x, y: w.end.y, lx: w.label.x, ly: w.label.y });
    });
    return () => { live = false; };
  }, [pointing, density]);

  const drawn = pointing === 'a' || pointing === 'b' ? wire : null;
  const lit = pointing === 'b' ? 'a' : pointing === 'a' ? 'b' : null;

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)', maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <SegmentedControl
            size="sm"
            look="soft"
            aria-label="Card density"
            value={density}
            onChange={(v) => { if ((DENSITIES as readonly string[]).includes(v)) setDensity(v as Density); }}
            options={[
              { value: 'comfortable', label: null, ariaLabel: 'Comfortable: everything on each card', icon: <Icon name="rows-2" size={16} /> },
              { value: 'compact', label: null, ariaLabel: 'Compact: one line with badges', icon: <Icon name="align-justify" size={16} /> },
              { value: 'minimal', label: null, ariaLabel: 'Minimal: titles only', icon: <Icon name="equal" size={16} /> },
            ]}
          />
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{said || 'Point at a card.'}</span>
        </div>
        <div ref={host} style={{ position: 'relative', display: 'grid', gap: 'var(--sp-3)' }}>
          {CARDS.map((c) => {
            const done = doneIds.includes(c.id);
            return (
              <div
                key={c.id}
                data-pretend={c.id}
                className="ag-card ag-row"
                data-wire-lit={lit === c.id ? 'true' : undefined}
                onMouseEnter={() => setPointing(c.id)}
                onMouseLeave={() => setPointing(null)}
                style={{
                  display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', columnGap: 'var(--sp-5)',
                  padding: comfy ? 'var(--sp-6)' : density === 'compact' ? 'var(--sp-4) var(--sp-6)' : 'var(--sp-3) var(--sp-6)',
                  borderRadius: 'var(--r-xs)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                  opacity: c.locked && pointing !== c.id ? 0.62 : done ? 0.48 : 1,
                  transition: 'padding var(--dur-base) var(--ease-glide), opacity var(--dur-fast) var(--ease-glass)',
                }}
              >
                <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, color: 'var(--fg-3)' }}>
                  <Icon name={c.locked ? 'lock' : done ? 'check' : 'circle'} size={c.locked ? 14 : 18} />
                </span>
                <div style={{ minWidth: 0, display: 'grid' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
                    <span className={comfy ? 'ag-clamp-2' : 'ag-clamp-1'} style={{ flex: '1 1 0', minWidth: 0, font: 'var(--type-body)', color: done ? 'var(--fg-3)' : 'var(--fg-1)' }}>{c.title}</span>
                    {density !== 'minimal' && <ScoreDial value={c.score} max={21.3} size="sm" warm={!done} />}
                    <span className="ag-card-actions ag-quick-host" style={{ display: 'flex', marginTop: -4 }}>
                      {!done && (
                        <div className="ag-quick">
                          {!c.locked && (
                            <button type="button" className="ag-quick__btn" title="Start now" onClick={() => setSaid(`Would start “${c.title}”.`)}>
                              <Icon name="play" size={14} style={{ color: 'var(--job-orange)' }} />Start
                            </button>
                          )}
                          <button type="button" className="ag-quick__btn" title="Start it tomorrow" onClick={() => setSaid(`“${c.title}” starts tomorrow.`)}>
                            <Icon name="calendar-plus" size={14} style={{ color: 'var(--job-sky)' }} />Tomorrow
                          </button>
                          {!c.locked && (
                            <button type="button" className="ag-quick__btn" title="Done" onClick={() => { setDoneIds((d) => [...d, c.id]); setSaid(`Ticked “${c.title}”.`); }}>
                              <Icon name="check" size={14} style={{ color: 'var(--job-lime)' }} />Done
                            </button>
                          )}
                        </div>
                      )}
                      <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, color: 'var(--fg-3)' }}>
                        <Icon name="ellipsis" size={16} />
                      </span>
                    </span>
                  </div>
                  <Fold open={comfy}>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{c.note}</span>
                    {c.locked && (
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                        <Icon name="lock" size={12} /> Waiting on <span style={{ color: 'var(--fg-2)' }}>File the incorporation paperwork</span>
                      </span>
                    )}
                    <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)' }}>{c.facts}</span>
                  </Fold>
                </div>
              </div>
            );
          })}
          {drawn && (
            <svg aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
              <path d={drawn.d} fill="none" stroke="oklch(1 0 0 / 0.78)" strokeWidth={1.75} strokeDasharray="4 5" strokeLinecap="round" />
              <circle cx={drawn.x} cy={drawn.y} r={3.5} fill="oklch(1 0 0 / 0.9)" />
              <text x={drawn.lx} y={drawn.ly - 7} textAnchor="middle" style={{ font: '600 10px var(--font-sans)', fill: 'oklch(1 0 0 / 0.78)' }}>
                {pointing === 'b' ? 'waits on' : 'unblocks'}
              </text>
            </svg>
          )}
        </div>
      </div>
    </Card>
  );
}
