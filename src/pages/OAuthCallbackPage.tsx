/**
 * Where Google drops the user after they approve Calendar access.
 *
 * Everything that matters happens in one effect: hand the one-time `code` in
 * the URL to `finishCalendarConnect`, which exchanges it server-side for the
 * refresh token that makes the connection permanent. On success the user is
 * bounced straight back to whichever page they clicked Connect from — the whole
 * detour should read as a single click, not as a place they have to navigate
 * out of. Only a failure ever renders more than a spinner.
 *
 * The ref guard is load-bearing, and it is deliberately the *only* guard. An
 * authorization code is single-use, and StrictMode double-invokes effects in
 * development, so without it the second run would burn a spent code and report
 * a bogus failure. The obvious companion — a `cancelled` flag cleared in the
 * effect's cleanup — is what must NOT be added here: the first run's cleanup
 * fires before the second run, the second run returns early on the ref, and the
 * only exchange in flight then has its result thrown away, leaving the page
 * spinning forever. That is a dev-only hang, which is exactly where this page
 * gets tested. Letting a resolved exchange call `setState` on an unmounted
 * component is harmless in React 19 and is the lesser evil by a wide margin.
 *
 * ── Aurora Glass (UI-19) ──────────────────────────────────────────────────
 *
 * Rebuilt on the design system; the effect above and every call into
 * `AuthContext` are untouched. What changed for the person looking at it:
 *
 *   - It is the last `liquid-glass` markup in the app. The panel is the `Card`
 *     primitive, so it arrives by condensing — the system's law for how a pane
 *     appears — instead of with this screen's own spring, and the backdrop is
 *     `ag-page--focal`, which `backdrop.css` describes as "one pool of light
 *     behind a single focal object". This page is exactly one object.
 *   - **The spinner is a travelling track.** A rotating ring says "busy" and
 *     nothing else; `motion.css` ships `ag-travel` — "indeterminate progress
 *     travelling along a track" — for precisely this, and it had no callers.
 *     Emerald is not being spent loosely: a token exchange is genuinely
 *     running, which is the one thing the accent is rationed to mean.
 *     The track itself moved to `ui/feedback/TravellingTrack.tsx` at UI-20,
 *     when `SplashScreen` became its second caller; it was declared in this
 *     file while it had exactly one.
 *   - **"Try again" is the view's one `solid` button**, which is the design
 *     system's cap of a single primary per view, and "Back to Notifications"
 *     dropped to `ghost` behind it. Before, the two were an emerald pill and a
 *     white pill of equal weight, so the screen offered two primaries.
 *   - The failure tile is coral since 29-1P2c2 (it was amber): his call,
 *     failed is coral's job. "Try again" is a sky gel, because what it
 *     reconnects is the calendar, and dates are sky's job.
 *
 * The `isolation: isolate` this wrapper used to carry inline now lives on
 * `.ag-page` itself, in `ui/tokens/backdrop.css` — UI-36 found that every
 * other screen needed it too, and this was one of only three that had it.
 * It is still load-bearing: `.ag-page` paints its pool and grain on
 * `::before`/`::after` at z-index -2/-1, and on a nested element with no
 * stacking context of its own they fall through to the root and land behind
 * this element's own opaque background.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button, Card, GelButton, Icon, TravellingTrack } from '../ui';

export default function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { finishCalendarConnect, startCalendarConnect } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    exchangedRef.current = true;
    finishCalendarConnect(params).then(({ result, returnTo }) => {
      if (result.ok) {
        navigate(returnTo, { replace: true });
      } else {
        setError(result.message);
      }
    });
  }, [finishCalendarConnect, navigate, params]);

  return (
    <div className="ag-page ag-page--focal h-screen overflow-y-auto">
      {/* `m-auto` on the card rather than centring here, so a short viewport
          scrolls instead of clipping the panel off-screen. LoginPage's rule. */}
      <div
        style={{
          display: 'flex',
          minHeight: '100%',
          padding: 'var(--sp-9) var(--gutter-page-sm)',
          boxSizing: 'border-box',
        }}
      >
        <Card
          pad="var(--pad-card-lg)"
          style={{
            margin: 'auto',
            width: '100%',
            maxWidth: 420,
            borderRadius: 'var(--r-card-lg)',
            display: 'grid',
            justifyItems: 'center',
            gap: 'var(--sp-6)',
            textAlign: 'center',
          }}
        >
          {error === null ? (
            <>
              <span
                style={{
                  font: 'var(--type-kicker)',
                  letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                  color: 'var(--fg-3)',
                }}
              >
                Connecting Google Calendar
              </span>
              <TravellingTrack />
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                Saving the permission so it lasts beyond this browser session…
              </p>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 54,
                  height: 54,
                  borderRadius: 'var(--r-circle)',
                  backgroundImage: 'var(--glass-tint-coral)',
                  boxShadow: 'var(--glass-rim-2)',
                  color: 'var(--status-overrun)',
                }}
              >
                <Icon name="triangle-alert" size={24} />
              </span>

              <h1
                style={{
                  font: 'var(--type-title)',
                  letterSpacing: 'var(--tracking-title)',
                  color: 'var(--fg-1)',
                }}
              >
                Google Calendar was not connected
              </h1>

              {/* The message comes from Google or from the token exchange, so it
                  can be a long unbroken string — it has to be allowed to break
                  rather than push the card wider than its own max width. */}
              <p
                style={{
                  font: 'var(--type-caption)',
                  color: 'var(--fg-3)',
                  overflowWrap: 'anywhere',
                  textWrap: 'pretty',
                }}
              >
                {error}
              </p>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 'var(--gap-inline)',
                  marginTop: 'var(--sp-2)',
                }}
              >
                {/* The screen's one action: the design system's plain gel
                    since 29-1P2, emerald as V3's gel was. */}
                <GelButton
                  tile={false}
                  size="md"
                  colour="sky"
                  disabled={retrying}
                  aria-busy={retrying || undefined}
                  icon={<Icon name="refresh-cw" size={16} />}
                  onClick={async () => {
                    setRetrying(true);
                    const started = await startCalendarConnect('/notifications');
                    // Only reached if the redirect could not even be started.
                    if (!started.started) {
                      setError(started.message);
                      setRetrying(false);
                    }
                  }}
                >
                  {retrying ? 'Opening Google…' : 'Try again'}
                </GelButton>
                <Button variant="ghost" onClick={() => navigate('/notifications', { replace: true })}>
                  Back to Notifications
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
