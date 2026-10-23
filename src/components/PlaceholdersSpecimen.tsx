/**
 * `/design`'s "Placeholders and numbers" (29-1P14d2): a pretend list that
 * waits in the shape of its rows, then fades them in (Load again replays
 * it), and the two numbers that replaced the last progress rings. Local
 * state only — nothing here fetches.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Card, GradientNumber, Icon, MetaKicker, SkeletonRows, SoftButton, useArrival } from '../ui';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };

const ROWS: Array<[string, string]> = [
  ['Draft the pitch deck', 'Fri'],
  ['Email the accountant', 'Today'],
  ['Book the venue', 'Sat'],
  ['Weekly review', 'Sun'],
];

export function PlaceholdersSpecimen() {
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useArrival(list, !loading);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const load = () => {
    if (timer.current) clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => setLoading(false), 1600);
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <span style={{ ...kicker, flex: 1 }}>A list on its way</span>
            <SoftButton size="sm" icon={<Icon name="refresh-cw" size={14} />} onClick={load} disabled={loading}>
              Load again
            </SoftButton>
          </div>
          {loading ? (
            <SkeletonRows rows={ROWS.length} label="Loading the pretend list" />
          ) : (
            <div ref={list} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              {ROWS.map(([title, when]) => (
                <div
                  key={title}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 44,
                    padding: '0 var(--sp-4)', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                  }}
                >
                  <span style={{ width: 20, height: 20, borderRadius: '50%', boxShadow: 'inset 0 0 0 1.5px var(--line-strong)', flex: '0 0 auto' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{when}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <span style={kicker}>Rings, now numbers</span>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 'var(--sp-7)', flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)' }}>
              <GradientNumber tone="done" style={{ fontSize: 56 }}>3/5</GradientNumber>
              <MetaKicker tone="var(--fg-4)">Handled</MetaKicker>
            </div>
            <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)' }}>
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xl)', color: 'var(--job-lime-text)', fontVariantNumeric: 'tabular-nums' }}>
                100%
              </span>
              <MetaKicker tone="var(--fg-4)">on the card</MetaKicker>
            </div>
          </div>
          <span style={kicker}>The Score screen's session end, and the model's share of the graphics card on the Atlas host screen.</span>
        </div>
      </Card>
    </div>
  );
}
