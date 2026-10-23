import { useState, useEffect, useRef, Suspense, Activity, type ReactNode } from 'react';
import { preloadable, type Preloadable } from './lib/preloadable';
import ScreenTransitions from './components/ScreenTransitions';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ShortcutsProvider, useShortcuts } from './contexts/ShortcutsContext';
import { GO_KEYS } from './lib/shortcutBindings';
import { useFirestoreSync } from './lib/firestoreSync';
import { useShareLiveRun } from './lib/useShareLiveRun';
import { useTrashSync } from './lib/trashSync';
import { useArchiveSync } from './lib/archiveSync';
import { useStorySync } from './lib/taskStorySync';
import { useDashboardSync } from './lib/dashboardSync';
import { useDarkTintSync } from './lib/darkTintSync';
import { useBreakIdeaSync } from './lib/breakIdeaSync';
import { useBirthdaySync } from './lib/birthdaySync';
import { useEventSync } from './lib/eventSync';
import { useCoverSync } from './lib/covers/useCoverSync';
import { useTodayHoursMirror } from './lib/dashboard/todayHours';
import { useScreenLight } from './lib/useScreenLight';
import { readLanding } from './lib/landingPref';
import { useDeletionCleanup } from './lib/deletionCleanup';
import { isDevBypassUid } from './lib/devAuth';
import { scheduleReconcile } from './lib/notificationSync';
import { useCalendarSyncQueue } from './lib/calendarSyncQueue';
import { useStore } from './store/useStore';
import { UNBUILT_ENTRIES } from './components/navModel';
import Home from './components/Home';
import { refreshPushSubscription } from './lib/push';
import FloatingNav from './components/FloatingNav';
import FocusRunHost from './components/FocusRunHost';
import FocusRunPill from './components/FocusRunPill';
import { FocusAwayHost } from './components/FocusMoments';
import { FocusBreakHost } from './components/FocusBreak';
import CommandPaletteHost from './components/CommandPaletteHost';
import UndoHost from './components/UndoHost';
import PeekHost from './components/PeekHost';
import TickCheerHost from './components/TickCheerHost';
import MomentsHost from './components/MomentsHost';
import EventSheetHost from './components/events/EventSheetHost';
import SyncStatusBanner from './components/SyncStatusBanner';
import ReminderSyncBanner from './components/ReminderSyncBanner';
import DeadlineShiftBanner from './components/DeadlineShiftBanner';
import ArchiveToast from './components/ArchiveToast';
import UpdateBanner from './components/UpdateBanner';
import OfflinePill from './components/OfflinePill';
import SpeedMeter from './components/SpeedMeter';
import { FocusGlide, NoticeStack, TravellingTrack, V3Scope } from './ui';
import { Z } from './lib/zLayers';

/*
 * Every screen but Home arrives when it is first opened, not before (2026-09-28).
 * The app used to be one 2.2 MB script, Atlas's whole agent included, all of it
 * parsed before the first frame of Home on a phone that may never open the chat.
 * Home stays eager because it is where every cold start lands. After the first
 * visit the service worker has every chunk on disk (`scripts/build-sw.mjs` walks
 * `dist/`), so a later open is a read from the device, not the network.
 */
const TaskSelection = preloadable(() => import('./components/TaskSelection'));
const SetDeadlines = preloadable(() => import('./components/SetDeadlines'));
const FocusMode = preloadable(() => import('./components/FocusMode'));
const LoginPage = preloadable(() => import('./pages/LoginPage'));
const ChatPage = preloadable(() => import('./pages/ChatPage'));
const ProjectView = preloadable(() => import('./pages/ProjectView'));
const NeedsAttention = preloadable(() => import('./pages/NeedsAttention'));
const NotificationsPage = preloadable(() => import('./pages/NotificationsPage'));
const SettingsPage = preloadable(() => import('./pages/SettingsPage'));
const OAuthCallbackPage = preloadable(() => import('./pages/OAuthCallbackPage'));
const SharePage = preloadable(() => import('./pages/SharePage'));
const ComingSoon = preloadable(() => import('./pages/ComingSoon'));
const AtlasHostPage = preloadable(() => import('./pages/AtlasHostPage'));
const TrashPage = preloadable(() => import('./pages/TrashPage'));
const ArchivePage = preloadable(() => import('./pages/ArchivePage'));
const CatalogPage = preloadable(() => import('./pages/CatalogPage'));
const SkillsPage = preloadable(() => import('./pages/SkillsPage'));
const LogPage = preloadable(() => import('./pages/LogPage'));
const AdminPage = preloadable(() => import('./pages/AdminPage'));
const StartFromPushPage = preloadable(() => import('./pages/StartFromPushPage'));
const DashboardPage = preloadable(() => import('./pages/DashboardPage'));
const CalendarPage = preloadable(() => import('./pages/CalendarPage'));
const DesignSystemPage = preloadable(() => import('./pages/DesignSystemPage'));

/*
 * Fetching a screen's code before it opens (2026-10-07, his ask: a screen
 * "loads first"). `ScreenTransitions` waits for this before it moves to a
 * screen, so the old screen stays up instead of an empty one; and once BASE is
 * idle the nav's screens are fetched quietly, so a first visit is usually
 * instant. Fetching is all it does: nothing is drawn until it is opened, so a
 * screen still costs nothing at startup (CLAUDE.md "Performance", rule 7).
 */
const ROUTE_SCREENS: Array<[string, Pick<Preloadable<object>, 'preload'>]> = [
  ['/dashboard', DashboardPage],
  ['/calendar', CalendarPage],
  ['/chat', ChatPage],
  ['/select', TaskSelection],
  ['/deadlines', SetDeadlines],
  ['/focus', FocusMode],
  ['/scoring', NeedsAttention],
  ['/notifications', NotificationsPage],
  ['/settings', SettingsPage],
  ['/project/', ProjectView],
  ['/start/', StartFromPushPage],
  ['/trash', TrashPage],
  ['/archive', ArchivePage],
  ['/catalog', CatalogPage],
  ['/skills', SkillsPage],
  ['/log', LogPage],
  ['/admin', AdminPage],
  ['/atlas-host', AtlasHostPage],
  ['/design', DesignSystemPage],
  ['/login', LoginPage],
  ['/oauth/callback', OAuthCallbackPage],
  ['/s/', SharePage],
  ['/inbox', ComingSoon],
  ['/contacts', ComingSoon],
];

function preloadRoute(pathname: string): Promise<unknown> {
  const hit = ROUTE_SCREENS.find(([path]) => (path.endsWith('/') ? pathname.startsWith(path) : pathname === path));
  return hit ? hit[1].preload() : Promise.resolve();
}

/* The seven nav screens and a project board: what a tap is most likely to open next. */
const WARM_SCREENS = [DashboardPage, ChatPage, TaskSelection, NeedsAttention, NotificationsPage, SettingsPage, ProjectView];

function useWarmScreens(): void {
  useEffect(() => {
    let cancelled = false;
    const idle = (fn: () => void) =>
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(fn, { timeout: 4000 }) : window.setTimeout(fn, 1500);
    /* One at a time, each in its own idle moment, so a slow device is never
       made to parse seven screens in one go. */
    const next = (i: number) => {
      if (cancelled || i >= WARM_SCREENS.length) return;
      idle(() => { void WARM_SCREENS[i].preload().finally(() => next(i + 1)); });
    };
    const timer = window.setTimeout(() => next(0), 2500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, []);
}

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
      className="ag-page ag-page--focal ag-page--brand flex items-center justify-center min-h-screen"
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

/*
 * THE NAV SCREENS ARE KEPT, NOT REBUILT (2026-09-28, his call: "keep it ready").
 * Switching tabs used to tear the old screen down and build the new one from
 * nothing, which on a phone-speed CPU froze for 0.5-1.2s per tap (New Session,
 * Scoring, and the way back to Home). Each of these six is built the first time
 * it is visited and after that only hidden and shown, through React's
 * `<Activity>`: a hidden screen keeps its DOM and its state, runs no effects
 * (so no listeners, shortcuts or timers of its own), and re-runs them when it
 * is shown — the same double-mount every effect here already survives under
 * StrictMode.
 *
 * What a kept screen remembers is only its own local state: a search typed,
 * a filter, an open form. Everything that matters — the queue, the backlog —
 * is in the store, so a kept screen can never show stale data. Their routes
 * stay in `<Routes>` below with an empty element, so the login redirect and
 * the catch-all behave exactly as before.
 */
const KEPT_SCREENS: { path: string; render: () => ReactNode }[] = [
  /* BIG-6 — the Dashboard is a nav screen, so it is kept like the rest. */
  { path: '/dashboard', render: () => <DashboardPage /> },
  { path: '/', render: () => <Home /> },
  /* 29-2e1 — the Calendar, a nav screen (his call, 2026-10-21). */
  { path: '/calendar', render: () => <CalendarPage /> },
  { path: '/chat', render: () => <ChatPage /> },
  { path: '/select', render: () => <TaskSelection /> },
  { path: '/scoring', render: () => <NeedsAttention /> },
  { path: '/notifications', render: () => <NotificationsPage /> },
  { path: '/settings', render: () => <SettingsPage /> },
];
const KEPT_PATHS = new Set(KEPT_SCREENS.map((k) => k.path));

function KeptScreens() {
  const { pathname } = useLocation();
  const [visited, setVisited] = useState<string[]>([]);
  /* Derived during render, React's own pattern for "remember what props were". */
  if (KEPT_PATHS.has(pathname) && !visited.includes(pathname)) setVisited([...visited, pathname]);
  return (
    <>
      {KEPT_SCREENS.filter((k) => visited.includes(k.path)).map((k) => (
        <Activity key={k.path} mode={k.path === pathname ? 'visible' : 'hidden'}>
          <Suspense fallback={<div className="ag-page min-h-screen" />}>{k.render()}</Suspense>
        </Activity>
      ))}
    </>
  );
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
  // 29-1P9c — each task's story, one small document per task (lib/taskStorySync.ts).
  useStorySync(syncUid);
  // BIG-6 — the Dashboard's layout, in its own document for the same reason.
  useDashboardSync(syncUid);
  // 29-1P1 — the dark tint (idea 63) is the same on both devices, in its own
  // small document too (lib/darkTintSync.ts says why not data/main).
  useDarkTintSync(syncUid);
  useBreakIdeaSync(syncUid);
  // 29-1P14b — his birthday, for the Dashboard's greeting (idea 109), the same way.
  useBirthdaySync(syncUid);
  // 29-2a — events and their countdowns, in their own document (lib/eventSync.ts).
  useEventSync(syncUid, getCalendarAccessToken);
  // Cover pictures in their own documents, out of `data/main`'s 1 MB, and the
  // ones nothing uses any more deleted at once (lib/covers/).
  useCoverSync(syncUid);
  // BIG-6, 29-1b — today's hours and the work session are one number; this
  // keeps `sessionDuration` on today's answer (lib/dashboard/todayHours.ts).
  useTodayHoursMirror();
  // 29-1P5a — each screen's light, and the Dashboard's hour sky, on <html>.
  useScreenLight();
  // Screen code fetched ahead of a tap, once BASE is idle (ScreenTransitions).
  useWarmScreens();
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
    { key: GO_KEYS.dashboard, leader: 'g', label: 'Go to Dashboard', handler: () => navigate('/dashboard') },
    { key: GO_KEYS.home, leader: 'g', label: 'Go to Home', handler: () => navigate('/') },
    { key: GO_KEYS.calendar, leader: 'g', label: 'Go to Calendar', handler: () => navigate('/calendar') },
    { key: GO_KEYS.atlas, leader: 'g', label: 'Go to Atlas', handler: () => navigate('/chat') },
    { key: GO_KEYS.score, leader: 'g', label: 'Go to Needs Attention', handler: () => navigate('/scoring') },
    { key: GO_KEYS.alerts, leader: 'g', label: 'Go to Notifications', handler: () => navigate('/notifications') },
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
      {/* The empty page backdrop, not the splash: a screen's chunk is on disk
          after the first visit, so this is up for a frame or two, and a
          backdrop with nothing on it reads as the next screen arriving. */}
      <Suspense fallback={<div className="ag-page min-h-screen" />}>
      <Routes>
        {/* Public, unauthenticated read-only shared view — the target of every
            SimpleURL short link. Must stay outside ProtectedRoute so anyone
            with the link can open it whether or not they have an account. */}
        <Route path="/s/:shareId" element={<SharePage />} />
        {/* TEMP-SPLASH-PREVIEW - remove before commit */}
        <Route path="/__splash" element={<SplashScreen />} />
        {/* Signing in lands where BASE opens (BIG-6): the Dashboard, unless
            this device was set to open on Home. */}
        <Route path="/login" element={user ? <Navigate to={readLanding() === 'dashboard' ? '/dashboard' : '/'} replace /> : <LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/select"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
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
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>{null}</ProtectedRoute>
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
        {/* 29-1P1 (BIG-15) — the design system, every colour and button live.
            His call: a hidden address, typed, with nothing in the app pointing
            at it. Every 29-1P session adds its pieces here as they land. */}
        <Route
          path="/design"
          element={
            <ProtectedRoute>
              <DesignSystemPage />
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
      </Suspense>
      {user && <KeptScreens />}
      <SpeedMeter />
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
      {/* 29-1P1, idea 70 — one keyboard focus ring for the whole app, gliding
          from control to control. Draws nothing until a key is pressed. */}
      <FocusGlide />
      {user && <FocusRunHost />}
      {user && <FocusRunPill />}
      {/* 29-1P10b, idea 101: "You were away 4 min" — on whatever screen he
          comes back to, for the pill's reason. */}
      {user && <FocusAwayHost />}
      {user && <FocusBreakHost />}
      {/* BUILD-9 — Ctrl+K, and the sheet a task found there opens in. Here for
          FocusRunHost's reason: it answers on every screen, so it cannot live in
          one. Never on the share view, which is a client's, not his. */}
      {user && !onShare && <CommandPaletteHost />}
      {/* 29-1P4a — his undo: the toast, Ctrl+Z beside Ctrl+K, and two fingers
          on the tablet. Every screen, for the palette's reason; never the
          share view. */}
      {user && !onShare && <UndoHost />}
      {/* 29-1P6b — hold a task in a list that is not sortable to peek at it. */}
      {user && !onShare && <PeekHost />}
      {/* 29-1P4b — a task's tick floats a gold +1 and builds "3 in a row!". */}
      {user && !onShare && <TickCheerHost />}
      {/* 29-1P14a — confetti when today's hours are met (a perfect day). */}
      {user && !onShare && <MomentsHost />}
      {/* 29-2a — the event sheet and the archive of passed events: opened from
          the Countdown widget, Capture and Ctrl+K, so on every screen. */}
      {user && !onShare && <EventSheetHost />}
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

        29-1P14d1: the four are a pile now (idea 26, `NoticeStack`) — the first
        in front, at most three, fanned out by a point or a tap — and the
        offline pill (idea 114) sits above it, outside the pile.
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
          <OfflinePill />
          <NoticeStack max={3} gap={12}>
            <SyncStatusBanner />
            <ReminderSyncBanner />
            <DeadlineShiftBanner />
            {/* Last, deliberately. The three above it are about something that
                just happened to your data; this one is about the app itself and
                is never urgent — it can wait its turn under them, and is the
                one left waiting when all four are up. */}
            <UpdateBanner />
          </NoticeStack>
        </div>
      )}
      {user && <ArchiveToast />}
    </AppScope>
  );
}

/**
 * BASE opens on the Dashboard (BIG-6, his call 2026-09-30) — decided once,
 * before the router reads the address, so opening the app at `/` never builds
 * Home first and never flashes it. Only a cold open at `/` moves: a tap on
 * Home later is a tap on Home. Settings → App sets this device back to Home
 * (`lib/landingPref.ts`), and the screenshot harness does, so Home's
 * baselines still photograph Home.
 */
function landOnce(): true {
  if (typeof window !== 'undefined' && window.location.pathname === '/' && readLanding() === 'dashboard') {
    window.history.replaceState(window.history.state, '', `/dashboard${window.location.search}${window.location.hash}`);
  }
  return true;
}

export default function App() {
  useState(landOnce);
  return (
    <BrowserRouter>
      {/* Every change of screen animates, and waits for the new screen's code. */}
      <ScreenTransitions preloadRoute={preloadRoute}>
        <AuthProvider>
          <ShortcutsProvider>
            <AppRoutes />
          </ShortcutsProvider>
        </AuthProvider>
      </ScreenTransitions>
    </BrowserRouter>
  );
}
