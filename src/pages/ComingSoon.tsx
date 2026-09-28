/**
 * The screen behind the three destinations that do not have one yet.
 *
 * Item 9A grew `navModel` to the fourteen the old `atlas.html` drew and
 * registered a route for every one; item 13F cut the nav back to six without
 * deleting any of them. Three still have no screen: **Inbox triage** and
 * **Contacts**, which are rows the Atlas panel is holding open for items 23
 * and 21, and **Dashboard**, which Settings will hold when it is designed.
 * This is what those routes serve until then.
 *
 * It is deliberately reachable ONLY by typing the URL. Shreekant's call at 9A
 * was that an unbuilt destination stays out of the nav rather than sitting in
 * it greyed out, and 13F applies the same rule to the Atlas panel — it ships
 * with four rows, not six. So nothing in the app links here. The route still
 * exists for three reasons: `App.tsx`'s `*` catch-all would otherwise bounce
 * a typed `/contacts` to Home with no explanation, a session building one of
 * these needs its route to exist first, and that session then flips one
 * `built: false` and points the route at its screen — two lines, not a nav
 * rewrite.
 *
 * The copy comes off the nav entry's `soon` field rather than being written
 * here, so the destination list stays in one file.
 *
 * `ag-page--focal` is `backdrop.css`'s "one pool of light behind a single
 * focal object", which is exactly what this is — the same treatment
 * `OAuthCallbackPage` and `LoginPage` take. The global `FloatingNav` renders
 * over it (this route is not in its hidden list), so the six destinations are
 * one press away. Since 13F its indicator is no longer a fallback here: the
 * two Atlas surfaces light **Atlas** and Dashboard lights **Settings**, which
 * is where each of them will be reached from once it exists.
 */
import type { CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Icon } from '../ui';
import { NAV_ENTRIES } from '../components/navModel';

export default function ComingSoon() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const entry = NAV_ENTRIES.find((e) => e.match(pathname));

  return (
    <div className="ag-page ag-page--focal h-screen overflow-y-auto">
      {/* `m-auto` on the card rather than centring here, so a short viewport
          scrolls instead of clipping the panel off-screen. LoginPage's rule. */}
      <div
        style={{
          display: 'flex',
          minHeight: '100%',
          padding: 'var(--sp-9) var(--gutter-page-sm) 140px',
          boxSizing: 'border-box',
        }}
      >
        <Card
          pad="var(--pad-card-lg)"
          style={{
            margin: 'auto',
            width: '100%',
            maxWidth: 460,
            borderRadius: 'var(--r-card-lg)',
            display: 'grid',
            justifyItems: 'center',
            gap: 'var(--sp-6)',
            textAlign: 'center',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 54,
              height: 54,
              borderRadius: 'var(--r-circle)',
              backgroundImage: 'var(--glass-fill-1)',
              boxShadow: 'var(--glass-rim-2)',
              color: 'var(--fg-3)',
            }}
          >
            <Icon name={entry?.icon ?? 'layout-dashboard'} size={24} />
          </span>

          <span
            style={{
              font: 'var(--type-kicker)',
              letterSpacing: 'var(--tracking-kicker)',
              textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
              color: 'var(--fg-3)',
            }}
          >
            Not built yet
          </span>

          <h1
            style={{
              font: 'var(--type-title)',
              letterSpacing: 'var(--tracking-title)',
              color: 'var(--fg-1)',
            }}
          >
            {entry?.label ?? 'This screen'}
          </h1>

          {entry?.soon && (
            <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {entry.soon.what}
            </p>
          )}

          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            {entry?.soon?.item
              ? `Built by ${entry.soon.item}. Until then this route exists so the address works and the queue has somewhere to build into.`
              : entry?.soon
                ? 'No session builds this yet — it has to be designed and exported first. Ask Shreekant to re-export the handoff bundle from Claude Design.'
                : 'This address has no screen behind it.'}
          </p>

          <Button variant="ghost" iconLeft={<Icon name="house" size={16} />} onClick={() => navigate('/')}>
            Back to Home
          </Button>
        </Card>
      </div>
    </div>
  );
}
