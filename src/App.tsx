import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useMatch, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ShortcutsProvider, useShortcuts } from './contexts/ShortcutsContext';
import { useFirestoreSync } from './lib/firestoreSync';
import { useShareLiveRun } from './lib/useShareLiveRun';
import { useTrashSync } from './lib/trashSync';
import { useArchiveSync } from './lib/archiveSync';
import { useDeletionCleanup } from './lib/deletionCleanup';
import { isDevBypassUid } from './lib/devAuth';
import { scheduleReconcile } from './lib/notificationSync';
import { useCalendarSyncQueue } from './lib/calendarSyncQueue';
import { useStore } from './store/useStore';
import { UNBUILT_ENTRIES } from './components/navModel';
import Home from './components/Home';
import TaskSelection from './components/TaskSelection';
import SetDeadlines from './components/SetDeadlines';
import FocusMode from './components/FocusMode';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import ProjectView from './pages/ProjectView';
import NeedsAttention from './pages/NeedsAttention';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import OAuthCallbackPage from './pages/OAuthCallbackPage';
import SharePage from './pages/SharePage';
import ComingSoon from './pages/ComingSoon';
import AtlasHostPage from './pages/AtlasHostPage';
import TrashPage from './pages/TrashPage';
import ArchivePage from './pages/ArchivePage';
import CatalogPage from './pages/CatalogPage';
import SkillsPage from './pages/SkillsPage';
import LogPage from './pages/LogPage';
import AdminPage from './pages/AdminPage';
import StartFromPushPage from './pages/StartFromPushPage';
import { refreshPushSubscription } from './lib/push';
import FloatingNav from './components/FloatingNav';
import FocusRunHost from './components/FocusRunHost';
import FocusRunPill from './components/FocusRunPill';
import CommandPaletteHost from './components/CommandPaletteHost';
import SyncStatusBanner from './components/SyncStatusBanner';
import ReminderSyncBanner from './components/ReminderSyncBanner';
import DeadlineShiftBanner from './components/DeadlineShiftBanner';
import ArchiveToast from './components/ArchiveToast';
import UpdateBanner from './components/UpdateBanner';
import { GlassLens, TravellingTrack, V3Scope } from './ui';
import { Z } from './lib/zLayers';

/**
 * The boot screen, shown on every route while auth resolves — and the last
 * flat `bg-[#050505]` slab in the app until UI-20. Three things changed and
 * each is a rule the rest of the app already follows.
 *
 *   - **It is `.ag-page`, not an opaque rectangle.** The old wrapper painted
 *     over the body's own backdrop, so the very first frame of a cold load
 *     was the one screen in the product with no grid behind it — the app
 *     arrived looking like a different app and then became itself. `--focal`
 *     is the right variant by its own definition in `tokens/backdrop.css`:
 *     "one pool of light behind a single object", which is what this is.
 *     The `isolation: isolate` this used to carry inline is on `.ag-page`
 *     itself now, in `ui/tokens/backdrop.css` — UI-36 found that every other
 *     screen needed it too, and this was one of only three that had it. It
 *     is still load-bearing: `.ag-page` paints its pool and grain on
 *     `::before`/`::after` at z-index -2/-1, and on a nested element with no
 *     stacking context of its own they escape to the root and land behind
 *     that element's own opaque background, which is to say nowhere.
 *   - **The rotating ring is a `TravellingTrack`.** A spinning arc says
 *     "busy" and nothing else, and the design system already decided what
 *     indeterminate progress looks like: `motion.css` ships `ag-travel` for
 *     it. Emerald is not spent loosely — the app is genuinely still starting,
 *     which is the one thing `colors.css` rations the accent to mean.
 *   - **The mark replaces nothing and adds the one thing that was missing.**
 *     Home, Login and the share view all head themselves with
 *     `/brand/mark-white.png`; the screen shown before any of them did not.
 *
 * The pulsing opacity on the label went with the ring. The track is the
 * motion; a second thing breathing beside it says the same word twice, and
 * this screen is up for 600ms on a warm load. That leaves App.tsx with no
 * Framer Motion of its own, which is why the import is gone.
 *
 * `role="status"` rather than silence: `loading` here can be seconds on a
 * cold connection, and the track is `aria-hidden` because "indeterminate"
 * is not a value anybody can read out. The label is the accessible name and
 * it is visible — no second, hidden copy of a string that is already on
 * screen.
 */
function SplashScreen() {
  return (
    <div
      className="ag-page ag-page--focal flex items-center justify-center min-h-screen"
      role="status"
      aria-busy="true"
    >
      <div className="flex flex-col items-center" style={{ gap: 'var(--sp-6)' }}>
        <img
          src="/brand/mark-white.png"
          alt=""
          width={32}
          height={32}
          style={{ opacity: 0.95, display: 'block' }}
        />
        {/* --type-system is the app's own OS voice. The design system says
            keep it rare; the screen that says the OS is starting is one of
            the few places it belongs. */}
        <span
          style={{
            font: 'var(--type-system)',
            fontSize: 'var(--text-2xs)',
            letterSpacing: 'var(--tracking-system)',
            textTransform: 'uppercase',
            color: 'var(--fg-3)',
          }}
        >
          Starting up
        </span>
        <TravellingTrack width={160} />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <SplashScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * V3 for the whole app, bar one page (V3-9). Steps 6 to 13 switched one
 * screen at a time, each wrapping itself in `<V3Scope>`; step 14 moved every
 * screen that was left, and with that the scope belongs here, around the
 * router and everything that floats over it — the floating nav, the focus-run
 * pill and the banner stack sat outside every screen's scope and so stayed
 * old on screens that were not. The screens' own scopes are still there and
 * are now redundant, harmlessly (`display: contents`, same context value).
 *
 * The public share view was held out of it until BUILD-14 redrew it from his
 * design, so a client saw it change once; it is inside with everything else
 * now, and this was a branch rather than a wrapper only for that reason.
 */
function AppScope({ children }: { children: React.ReactNode }) {
  return <V3Scope>{children}</V3Scope>;
}

function AppRoutes() {
  const { user, loading, getCalendarAccessToken, hasCalendarAccess } = useAuth();
  const onShare = useMatch('/s/:shareId') !== null;
  const [isInitializing, setIsInitializing] = useState(true);
  const navigate = useNavigate();

  // Sync Zustand store to Firestore for the authenticated user; also drives
  // the Google Calendar notification reconciliation (see lib/notificationSync.ts).
  // The dev screenshot harness's stand-in user has no Firebase credentials, so
  // it opts out entirely — its realtime listener would error and raise the
  // "Not connected to the cloud" banner over every captured screen.
  const syncUid = isDevBypassUid(user?.uid) ? null : user?.uid ?? null;
  useFirestoreSync(syncUid, getCalendarAccessToken);
  // BUILD-14: a client-view share's live timer follows the focus run, which
  // writes nothing to the store for the sync above to notice.
  useShareLiveRun(syncUid);
  // The Trash rides in its own Firestore document (see lib/trashSync.ts), and
  // sweeps anything past thirty days as soon as that document has been read.
  useTrashSync(syncUid);
  // BUILD-11 — the Archive, in its own document too, and never swept.
  useArchiveSync(syncUid);
  // Registers the outside-the-store half of a delete: cancelling the public
  // share document and the Google Calendar deadline reminder.
  useDeletionCleanup(syncUid, getCalendarAccessToken);
  // BUILD-15's durable queue: runs a reconcile on open when the last one did
  // not finish, and raises the banner the moment Google's grant dies — which
  // is usually while no browser is open to notice.
  useCalendarSyncQueue(syncUid, getCalendarAccessToken);

  // Flush the pending notification "queue" the moment Google (re)connects.
  // While disconnected, reconciles go quiet and just mark `needsReconnect`;
  // when a token becomes available again — whether via the background silent
  // refresh or an explicit reconnect — re-run a full reconcile so every
  // waiting deadline reminder gets pushed to Calendar without needing a
  // separate store edit to trigger it. Coalesced by `scheduleReconcile`.
  const hadCalendarRef = useRef(false);
  useEffect(() => {
    if (hasCalendarAccess && !hadCalendarRef.current && user) {
      scheduleReconcile(user.uid, useStore.getState().backlogTasks, getCalendarAccessToken);
    }
    hadCalendarRef.current = hasCalendarAccess;
  }, [hasCalendarAccess, user, getCalendarAccessToken]);

  // Global "go to" navigation, available on every authenticated page —
  // press `g` then a letter. Kept separate from page-scoped bare-key
  // shortcuts (e.g. `n`/`l`) via the `leader: 'g'` flag so they never collide.
  useShortcuts('global-nav', user ? [
    { key: 'h', leader: 'g', label: 'Go to Home', handler: () => navigate('/') },
    { key: 'c', leader: 'g', label: 'Go to Atlas', handler: () => navigate('/chat') },
    { key: 's', leader: 'g', label: 'Go to Needs Attention', handler: () => navigate('/scoring') },
    { key: 'n', leader: 'g', label: 'Go to Notifications', handler: () => navigate('/notifications') },
  ] : []);

  useEffect(() => {
    const timer = setTimeout(() => setIsInitializing(false), 600);
    return () => clearTimeout(timer);
  }, []);

  /*
   * **An Emergency clears itself once the date it was anchored to has gone
   * by** (item 17). `lib/priority.ts` already *reads* a lapsed flag as zero,
   * so nothing on screen is waiting on this — what it fixes is the stored
   * field, which would otherwise sit at 4 for ever on a task whose deadline
   * went past in March, and come back to life the moment item 18's deadline
   * maths pushes that date into the future again.
   *
   * On load and then hourly. The action returns the state untouched when
   * nothing lapsed, so a quiet hour costs one pass over the backlog and no
   * re-render — and, crucially, no write to a Firestore document that is
   * rewritten whole under a 1 MB cap. Hourly rather than by the minute for
   * that reason alone: the visible behaviour is already exact, so the only
   * thing a finer sweep would buy is more writes.
   */
  useEffect(() => {
    if (!user) return;
    const sweep = () => useStore.getState().clearLapsedEmergencies();
    sweep();
    const timer = setInterval(sweep, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  /*
   * BUILD-5: this device's push registration carries its time zone, which is
   * how the sender knows what a stored "18:00" means. Re-recorded on every
   * open, quietly — it never asks for permission.
   */
  useEffect(() => {
    if (syncUid) void refreshPushSubscription(syncUid);
  }, [syncUid]);

  if (loading || isInitializing) return <AppScope><SplashScreen /></AppScope>;

  return (
    <AppScope>
      <Routes>
        {/* Public, unauthenticated read-only shared view — the target of every
            SimpleURL short link. Must stay outside ProtectedRoute so anyone
            with the link can open it whether or not they have an account. */}
        <Route path="/s/:shareId" element={<SharePage />} />
        {/* TEMP-SPLASH-PREVIEW - remove before commit */}
        <Route path="/__splash" element={<SplashScreen />} />
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/select"
          element={
            <ProtectedRoute>
              <TaskSelection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/deadlines"
          element={
            <ProtectedRoute>
              <SetDeadlines />
            </ProtectedRoute>
          }
        />
        <Route
          path="/focus"
          element={
            <ProtectedRoute>
              <FocusMode />
            </ProtectedRoute>
          }
        />
        {/* BUILD-5 — where tapping a notification lands. Starts the task and
            replaces itself with /focus, unless it has to ask first. */}
        <Route
          path="/start/:taskId"
          element={
            <ProtectedRoute>
              <StartFromPushPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/project/:projectId"
          element={
            <ProtectedRoute>
              <ProjectView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoring"
          element={
            <ProtectedRoute>
              <NeedsAttention />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        {/* Google's redirect target after the Calendar consent screen. The path
            is registered with Google verbatim (see lib/googleOAuthConnect.ts),
            so it must not move. Protected like any other route — the Firebase
            session is what proves whose refresh token is being stored. */}
        <Route
          path="/oauth/callback"
          element={
            <ProtectedRoute>
              <OAuthCallbackPage />
            </ProtectedRoute>
          }
        />
        {/* ITEM 9B — the program on the laptop: awake or asleep, which model
            is resident, and what a swap costs. `navModel`'s `host` entry is
            `built` now, so this route is in the nav rather than typed. */}
        <Route
          path="/atlas-host"
          element={
            <ProtectedRoute>
              <AtlasHostPage />
            </ProtectedRoute>
          }
        />
        {/* ITEM 9C — thirty days of deletions, moved off the Settings page
            that used to host them as a tab. `navModel`'s `trash` entry is
            `built` now, so this is a nav destination rather than a typed URL —
            which is the point of the item: Atlas can delete things, so where
            they went has to be somewhere you go, not somewhere you configure. */}
        <Route
          path="/trash"
          element={
            <ProtectedRoute>
              <TrashPage />
            </ProtectedRoute>
          }
        />
        {/* BUILD-11 — what was put away on purpose, kept for good. Reached
            from Settings, beside the Trash, and answers `/archive` directly. */}
        <Route
          path="/archive"
          element={
            <ProtectedRoute>
              <ArchivePage />
            </ProtectedRoute>
          }
        />
        {/* ITEM 10 — what Atlas remembers between conversations, as the plain
            text files it actually is. Nothing on this screen is in the browser:
            it reads the laptop over Tailscale, because a cached copy of his
            memory could disagree with the one he can open in Notepad, and that
            file being the truth is the whole design (DESIGN.md §4.4). */}
        <Route
          path="/catalog"
          element={
            <ProtectedRoute>
              <CatalogPage />
            </ProtectedRoute>
          }
        />
        {/* ITEM 12 — the skills Atlas has, as the folders they actually are.
            Like `/catalog` beside it, nothing on this screen is in the
            browser: it reads the laptop over Tailscale, because a skill is a
            folder somebody put there and the folder is the truth
            (DESIGN.md §7.2). */}
        <Route
          path="/skills"
          element={
            <ProtectedRoute>
              <SkillsPage />
            </ProtectedRoute>
          }
        />
        {/* ITEM 13 — everything Atlas has done, and the button that puts a
            turn back (DESIGN.md §5.3). On the laptop for `/catalog`'s reason,
            with one more: this is the record of what happened, and a second
            copy in a browser is a second thing that could disagree with it. */}
        <Route
          path="/log"
          element={
            <ProtectedRoute>
              <LogPage />
            </ProtectedRoute>
          }
        />
        {/* BUILD-6 — every account, and the two switches he sets on each.
            The screen sends anyone but him home, which is a courtesy: what it
            reads is locked by `firestore.rules` and `api/admin-accounts.ts`. */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminPage />
            </ProtectedRoute>
          }
        />
        {/*
            ITEM 9A — the destinations `navModel` knows about that have no
            screen yet. Registered here so a typed `/trash` says what it is
            waiting on instead of being bounced Home by the catch-all below,
            and so each later session points its own route at a real page
            rather than inventing one. Nothing in the app links to them:
            unbuilt entries stay out of the nav until the screen exists.
        */}
        {UNBUILT_ENTRIES.map((entry) => (
          <Route
            key={entry.route}
            path={entry.route}
            element={
              <ProtectedRoute>
                <ComingSoon />
              </ProtectedRoute>
            }
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {user && <FloatingNav />}
      {/*
        BUILD-1 — the focus session, once it stopped belonging to one screen.
        `FocusRunHost` draws nothing: it is what keeps the noise following the
        session, the queue mirrored into the run, and the focus log banked when
        the tablet backgrounds the tab. The pill is the visible half — the
        countdown, the way back to `/focus`, and the mute — and it shows itself
        only while a session is actually running.

        Both sit here, beside the router rather than inside it, because a
        session that survives a route change cannot live in the thing the route
        change unmounts.
      */}
      {user && <FocusRunHost />}
      {user && <FocusRunPill />}
      {/* BUILD-9 — Ctrl+K, and the sheet a task found there opens in. Here for
          FocusRunHost's reason: it answers on every screen, so it cannot live in
          one. Never on the share view, which is a client's, not his. */}
      {user && !onShare && <CommandPaletteHost />}
      {/*
        The four app-level banners share ONE fixed column (UI-18; item 18
        added the third, which reports what the deadline rule moved, and APP-3
        the fourth, which offers a new version rather than installing it).
        They used to position themselves, at `top-4` and `top-14` — offsets
        sized for the ~30px pills they were, and 40px apart. Rebuilt as
        `NotificationCard`s they are 130–145px tall, and both can be up at
        once, so those two numbers put the second one straight through the
        middle of the first. A stack cannot get that wrong: each banner
        renders only itself, this owns where they go, and the gap holds
        whether one of them is showing or both.

        `Z.panel` is the rung `zLayers.ts` reserves for exactly this — "app
        level sync banners, and the modals that have to clear them", because
        a banner reporting broken sync must stay readable over an open modal.
      */}
      {user && (
        <div
          className="fixed left-1/2 -translate-x-1/2 pointer-events-none w-full px-4"
          /* `top-4` was 1rem, which is `--sp-5`; written out so Android's
             status bar can be added to it (APP-2). `--safe-t` is 0 outside
             the installed app, so the stack has not moved. */
          style={{
            zIndex: Z.panel, maxWidth: 560, display: 'grid', gap: 'var(--sp-4)',
            top: 'calc(var(--sp-5) + var(--safe-t))',
          }}
        >
          <SyncStatusBanner />
          <ReminderSyncBanner />
          <DeadlineShiftBanner />
          {/* Last, deliberately. The three above it are about something that
              just happened to your data; this one is about the app itself and
              is never urgent — it can wait its turn under them. */}
          <UpdateBanner />
        </div>
      )}
      {user && <ArchiveToast />}
    </AppScope>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ShortcutsProvider>
          {/* V3's `#ag-lens` filter (V3-1). Draws nothing and bends nothing
              outside a `<V3Scope>`; mounted once here so any screen that
              switches to V3 finds it. */}
          <GlassLens />
          <AppRoutes />
        </ShortcutsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
