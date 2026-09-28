/* The nav on this screen, with the Atlas panel hanging off it (item 13F):
   the rail on a wide window and the bottom pill on a narrow one. Moved out
   of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import { MiniNav } from '../../ui';
import { AtlasNavPanel } from '../AtlasNavPanel';
import { RailMark } from '../BrandMark';
import type { useNavModel } from '../navModel';
import { Z } from '../../lib/zLayers';
import { useUIStore } from '../../store/useUIStore';

type Nav = ReturnType<typeof useNavModel>;

export function ChatRail({ nav }: { nav: Nav }) {
  const atlasPanelOpen = useUIStore((s) => s.atlasPanelOpen);
  const setAtlasPanelOpen = useUIStore((s) => s.setAtlasPanelOpen);

  return (
    <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
      {/* ITEM 13F — the rail placement. The panel hangs off the right of
          the rail, top-aligned, and the wrapper is `inline-flex` so
          `left: 100%` means "the rail's own width" rather than the
          column's. `Z.nav` so it clears the page, matching the bar. */}
      <div style={{ position: 'relative', display: 'inline-flex', zIndex: Z.nav }}>
        {/* V3-8: the mark heads the rail, as on every V3 screen with one. */}
        <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
        {/* `pointerEvents` is not optional and was missing until Shreekant
            hit it: *"the place where the AI's mini nav opens, that part is
            unclickable even if nav is not open"*. A closed `AtlasNavPanel`
            is `visibility: hidden`, which still takes layout — so this
            wrapper shrink-wraps to a 244x198 box hanging over the top of
            the chat list, and an element with no background is a hit-test
            target all the same. Measured with `elementFromPoint`: it, and
            not the two chat rows under it, was what a click landed on.
            The panel itself already opts out; the box holding it did not.
            The narrow copy below always had this. */}
        <div
          style={{
            position: 'absolute', left: 'calc(100% + var(--sp-4))', top: 0,
            pointerEvents: atlasPanelOpen ? 'auto' : 'none',
          }}
        >
          <AtlasNavPanel
            open={atlasPanelOpen}
            onClose={() => setAtlasPanelOpen(false)}
            onPick={nav.go}
          />
        </div>
      </div>
    </div>
  );
}

export function ChatBottomNav({ nav }: { nav: Nav }) {
  const atlasPanelOpen = useUIStore((s) => s.atlasPanelOpen);
  const setAtlasPanelOpen = useUIStore((s) => s.setAtlasPanelOpen);

  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
        display: 'grid', placeItems: 'center',
        zIndex: Z.nav, pointerEvents: 'none',
      }}
    >
      {/* ITEM 13F — the bottom-pill placement. The panel opens *above*
          the bar, centred on it; it carries the mockup's `min(360px,
          100vw - var(--sp-9))` itself. The wrapper is `relative` so the
          panel is positioned against the pill rather than the viewport,
          and it centres with a grid rather than the mockup's
          `translateX(-50%)` — a transform here would become the
          containing block for the panel's own fixed scrim and shrink it
          from the viewport to this box. `AtlasNavPanel`'s header has the
          whole story. */}
      <span style={{ position: 'relative', pointerEvents: 'auto' }}>
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + var(--sp-4))',
            left: 0,
            right: 0,
            display: 'grid',
            justifyItems: 'center',
            pointerEvents: atlasPanelOpen ? 'auto' : 'none',
          }}
        >
          <AtlasNavPanel
            open={atlasPanelOpen}
            onClose={() => setAtlasPanelOpen(false)}
            onPick={nav.go}
            narrow
          />
        </span>
        <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
      </span>
    </div>
  );
}
