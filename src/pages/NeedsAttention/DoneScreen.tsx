/**
 * Score — the end-of-session state, rebuilt on Aurora Glass (UI-9).
 *
 * `liquid-glass-float` is gone; this is a `Card`, which is the design system's
 * pane that ACTS — it is holding the two things you can do next.
 *
 * The green check in a circle became a `ProgressRing` reading `handled` out of
 * the tasks the session admitted at UI-9, the one number this screen exists
 * to report. **Since 29-1P14d2 it is just that number** — every progress
 * ring left in BASE is replaced, same numbers (his call): "3/5" in done's
 * green ramp (`GradientNumber`, idea 65), "Handled" under it.
 *
 * The number appears only when there was a session to measure. Arriving with an
 * empty queue — "All caught up" — has no fraction to show, so it gets a check
 * tile instead. (29-1P14c, idea 113: the calm sea with its gold sun now, and
 * both states say his approved lit sentence.)
 *
 * ON THE GREEN, since emerald is rationed to mean *live* everywhere else:
 * neither of those is a live state, and neither is the accent being spent
 * loosely. The design system settles this itself in `StatusPill` — its `done`
 * state is `--status-done` on a `--glass-tint-accent` fill, so *done* is
 * already an emerald-family thing in this system and not a fifth meaning
 * invented here. The tile is that exact pairing. (29-1P2c1: done is lime now.)
 *
 * It carries its own `<MiniNav>` like the queue screen does. `/scoring` is in
 * `FloatingNav`'s `HIDDEN_ROUTES` now, so without one this would be the only
 * screen in the app you can reach and then have no nav on.
 */
import { Card, EmptyDrawing, GelButton, GradientNumber, Icon, Lit, LitLine, MetaKicker, MiniNav, SoftButton, useMedia, WIDE } from '../../ui';
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
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
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
              <EmptyDrawing art="sea" />
            ) : (
              <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)' }}>
                <GradientNumber tone="done" style={{ fontSize: 72 }}>
                  {handledCount}/{totalTasks}
                </GradientNumber>
                <MetaKicker tone="var(--fg-4)">Handled</MetaKicker>
              </div>
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
              <LitLine as="p" style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>
                {caughtUp ? (
                  <>Every task has <Lit>a score</Lit>, <Lit>a deadline</Lit>, <Lit>an estimate</Lit> and <Lit>a description</Lit>. Ready to <Lit>focus</Lit>.</>
                ) : (
                  <>
                    You filled in <Lit>{handledCount} of {totalTasks}</Lit> task{totalTasks === 1 ? '' : 's'}.
                    {handledCount > 0 && <> {handledCount === 1 ? 'It\u2019s' : 'They\u2019re'} ready for <Lit>your focus queue</Lit>.</>}
                  </>
                )}
              </LitLine>
            </div>

            <div style={{ display: 'flex', gap: 'var(--sp-4)', width: '100%' }}>
              <SoftButton onClick={onHome} style={{ flex: 1 }}>
                Home
              </SoftButton>
              {/* Gel since V3-5 — this pane's primary, as Focus's end pane;
                  the design system's plain gel since 29-1P2. */}
              <GelButton
                colour="emerald"
                tile={false}
                size="md"
                onClick={onFocus}
                style={{ flex: 1, height: 44, padding: '0 var(--sp-6)' }}
              >
                Select tasks
                <Icon name="arrow-right" size={16} />
              </GelButton>
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
    </div>
  );
}
