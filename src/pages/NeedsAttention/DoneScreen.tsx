/**
 * Score — the end-of-session state, rebuilt on Aurora Glass (UI-9).
 *
 * `liquid-glass-float` is gone; this is a `Card`, which is the design system's
 * pane that ACTS — it is holding the two things you can do next.
 *
 * The green check in a circle is now a `ProgressRing` reading `handled` out of
 * the tasks the session admitted, which is the one number this screen exists
 * to report and which the old copy could only say in prose. It is a ring on
 * purpose: this genuinely IS a fraction of a whole, which is what that
 * component is for.
 *
 * The ring appears only when there was a session to measure. Arriving with an
 * empty queue — "All caught up" — has no fraction to show, so it gets a check
 * tile instead.
 *
 * ON THE GREEN, since emerald is rationed to mean *live* everywhere else:
 * neither of those is a live state, and neither is the accent being spent
 * loosely. The design system settles this itself in `StatusPill` — its `done`
 * state is `--status-done` on a `--glass-tint-accent` fill, so *done* is
 * already an emerald-family thing in this system and not a fifth meaning
 * invented here. The tile is that exact pairing. The ring is `tone="accent"`
 * because `ProgressRing`'s tone list has no `done` and the two hues are 12°
 * apart — a distinction no eye makes, and not worth a departure in a ported
 * file to encode.
 *
 * It carries its own `<MiniNav>` like the queue screen does. `/scoring` is in
 * `FloatingNav`'s `HIDDEN_ROUTES` now, so without one this would be the only
 * screen in the app you can reach and then have no nav on.
 */
import { Button, Card, Icon, MiniNav, ProgressRing, useMedia, WIDE } from '../../ui';
import { useNavModel } from '../../components/navModel';
import { RailMark } from '../../components/BrandMark';
import { Z } from '../../lib/zLayers';

interface DoneScreenProps {
  handledCount: number;
  totalTasks: number;
  onHome: () => void;
  onFocus: () => void;
}

export default function DoneScreen({ handledCount, totalTasks, onHome, onFocus }: DoneScreenProps) {
  const nav = useNavModel();
  const wide = useMedia(WIDE);
  const caughtUp = totalTasks === 0;

  return (
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
        </div>
      )}

      <div
        style={{
          flex: 1, minWidth: 0, overflowY: 'auto', display: 'grid', placeItems: 'center',
          boxSizing: 'border-box',
          padding: wide
            ? 'var(--sp-9) var(--gutter-page)'
            : 'var(--sp-8) var(--gutter-page-sm) 128px',
        }}
      >
        <Card pad="var(--pad-card-lg)" style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-7)', textAlign: 'center' }}>
            {caughtUp ? (
              <span
                aria-hidden="true"
                style={{
                  display: 'grid', placeItems: 'center', width: 96, height: 96,
                  borderRadius: '50%', backgroundImage: 'var(--glass-tint-accent)',
                  boxShadow: 'var(--glass-rim-2)', color: 'var(--status-done)',
                }}
              >
                <Icon name="check" size={40} />
              </span>
            ) : (
              <ProgressRing
                value={handledCount}
                max={totalTasks}
                size={120}
                thickness={9}
                tone="accent"
                label="Handled"
                showValue={false}
              >
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-2xl)',
                    color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {handledCount}
                  <span style={{ color: 'var(--fg-4)' }}>/{totalTasks}</span>
                </span>
              </ProgressRing>
            )}

            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              <h1
                style={{
                  font: 'var(--type-display)', fontSize: 'var(--text-3xl)',
                  letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)',
                }}
              >
                {caughtUp ? 'All caught up' : 'Session complete'}
              </h1>
              <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
                {caughtUp
                  ? 'Every task has a score, a deadline, an estimate and a description.'
                  : `You handled ${handledCount} of ${totalTasks} task${totalTasks === 1 ? '' : 's'}.`}
              </p>
              {(caughtUp || handledCount > 0) && (
                <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                  {caughtUp
                    ? 'Head back to start a focus session.'
                    : 'Details filled in — those tasks are ready for your focus queue.'}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-4)', width: '100%' }}>
              <Button variant="glass" block onClick={onHome} style={{ flex: 1 }}>
                Home
              </Button>
              {/* Gel since V3-5 — this pane's primary, as Focus's end pane. */}
              <Button
                variant="gel"
                block
                onClick={onFocus}
                iconRight={<Icon name="arrow-right" size={16} />}
                style={{ flex: 1 }}
              >
                Select tasks
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}
    </div>
  );
}
