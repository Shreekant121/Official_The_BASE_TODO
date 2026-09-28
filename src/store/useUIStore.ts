import { create } from 'zustand';
import type { DeadlinePlan } from '../lib/deadlineMath';

/**
 * Tiny UI-only store (never persisted/synced) for cross-component chrome
 * state — e.g. hiding the floating bottom nav whenever a full-screen modal
 * (Task Detail, etc.) is open so its footer buttons never collide with the
 * fixed nav pill. Counter-based so nested/stacked overlays behave correctly.
 */
interface UIState {
  overlayCount: number;
  overlayOpen: boolean;
  pushOverlay: () => void;
  popOverlay: () => void;

  /**
   * Whether the Firestore cloud sync is currently healthy. Flips to `false`
   * whenever the realtime listener errors out or a debounced write fails
   * (see `lib/firestoreSync.ts`) — surfaced via `SyncStatusBanner` so a sync
   * outage is never silent again (it used to be a swallowed console.error,
   * which is exactly how a whole project's Firestore database not existing
   * went unnoticed for a while: every local edit looked like it "worked"
   * but was only ever saved to this browser's localStorage).
   */
  cloudSyncOk: boolean;
  setCloudSyncOk: (ok: boolean) => void;

  /**
   * Ephemeral message for a *genuine, actionable* Google Calendar sync
   * failure that happened while we DO hold a working token — a Calendar API
   * write error or an unexpected reconcile crash. Surfaced by
   * `ReminderSyncBanner`. Deliberately NOT used for the far more common
   * "not connected / needs reconnect" case (see `notificationsNeedReconnect`
   * below): a missing token used to spam this banner on every store write,
   * which was noisy and unhelpful. Cleared on dismiss or after a successful
   * sync.
   */
  reminderSyncIssue: string | null;
  /**
   * Which of the two things went wrong — BUILD-15.
   *
   * `failed` is the original: a write Google refused while the connection
   * itself is fine, and "Try again" is a sensible thing to offer. `reconnect`
   * is the grant being dead, where trying again is *exactly* the wrong button
   * to put in front of him — it will fail identically, for ever, and the only
   * way out is one click on Connect Google. Same banner, different offer; see
   * `ReminderSyncBanner`.
   */
  reminderSyncIssueKind: 'failed' | 'reconnect';
  setReminderSyncIssue: (message: string | null, kind?: 'failed' | 'reconnect') => void;

  /**
   * Quiet "Google is disconnected and something wants to sync" signal — set
   * when a background reconcile (or a quick-reminder sync) can't reach
   * Google because there's no valid token / the required Calendar scope is
   * missing. Deliberately does NOT raise a global banner/toast: it only
   * lights a small dot on the Alerts nav icon and is explained in full on the
   * Notifications page. Cleared automatically once a reconcile succeeds with
   * a working token, or when there's nothing pending to deliver.
   */
  notificationsNeedReconnect: boolean;
  setNotificationsNeedReconnect: (needed: boolean) => void;

  /**
   * Item 13F — whether the Atlas panel (Skills · The catalog · Action log ·
   * Atlas host) is open off the Atlas nav cell.
   *
   * It lives here rather than in `ChatPage` because the rule that opens it
   * belongs to the nav, not to the screen: `navModel`'s `go` toggles it on
   * `/chat` and clears it on every navigation, and the chat screen only
   * renders the panel and reads this flag. That keeps "what does the Atlas
   * button do" in one file next to the route table.
   *
   * Deliberately NOT `pushOverlay`: that hides the floating nav, and this
   * panel hangs off the nav — hiding it would take the panel's own anchor
   * away mid-animation.
   */
  atlasPanelOpen: boolean;
  setAtlasPanelOpen: (open: boolean) => void;

  /**
   * DESIGN-1 — is dock mode on?
   *
   * Here for the same reason `atlasPanelOpen` is: v3's `atlas.html` puts
   * **Dock mode** in the Atlas nav, so the thing that opens it is the nav
   * (`navModel`'s `go`), while the thing that draws it is `ChatPage` — it
   * needs that screen's send/reply pipeline and cannot be a route of its own.
   * One flag between them keeps "what does that nav row do" in the route
   * table beside every other answer to that question.
   *
   * In-memory, like everything else in this file, and deliberately: a
   * persisted flag would put a tablet straight back into a listening screen on
   * the next launch, which is not something to inherit from last week.
   */
  dockOpen: boolean;
  setDockOpen: (open: boolean) => void;

  /**
   * Item 18 — what the deadline rule just moved, and what it could not.
   *
   * Deadline maths is the first thing in this app that changes a date without
   * being asked to, and the settled decision is that it is **never applied
   * silently**: every push is surfaced in a banner naming what moved and why,
   * and a fixed task the rule cannot fix is surfaced as a conflict beside
   * them. `DeadlineShiftBanner` is the reader.
   *
   * It lives here rather than in the task store for the same reason
   * `reminderSyncIssue` does — it is a sentence about a write that already
   * happened, not part of the record, and it must not reach Firestore or
   * survive a reload. The write itself is in `backlogTasks` and is already
   * safe; this is only the telling.
   *
   * **Replaced rather than accumulated.** A second edit that moves dates is a
   * new answer to the same question, and two stacked banners describing
   * overlapping cascades is how you end up reading neither.
   */
  deadlineShift: DeadlinePlan | null;
  reportDeadlineShift: (plan: DeadlinePlan) => void;
  clearDeadlineShift: () => void;

  /**
   * BUILD-11 — the sentence after something was put away: "Archived Diwali
   * gift boxes 2025 · On the shelf · Settings → Archive". Global because the
   * project header's menu navigates Home on the same tap, and a page-local
   * toast would unmount with the page that raised it. `ArchiveToast` reads
   * it. A confirmation only — the undo is Put back, on `/archive`.
   */
  archiveNotice: { title: string; detail: string; tone: 'neutral' | 'overrun'; at: number } | null;
  showArchiveNotice: (notice: { title: string; detail: string; tone?: 'neutral' | 'overrun' }) => void;
  clearArchiveNotice: () => void;

  /**
   * APP-3 — a newer BASE is downloaded and parked, waiting to be taken.
   *
   * The cost of caching the app shell is that a new deploy no longer arrives
   * by itself, and the settled decision is that the staleness is **paid out
   * loud**: `UpdateBanner` offers it and nothing swaps the running app until
   * that offer is tapped. Set from `lib/appUpdate.ts`, which is the only thing
   * that knows what a waiting service worker is.
   *
   * It belongs here rather than anywhere persisted for the reason
   * `reminderSyncIssue` does, and one more: it is a fact about *this tab's*
   * worker registration, and a copy of it that survived a reload would be
   * describing a version that has already been taken.
   */
  updateReady: boolean;
  setUpdateReady: (ready: boolean) => void;

  /**
   * BUILD-1 — how many pixels of the bottom of the window the *current screen*
   * has already spoken for, so app-level floating chrome can sit above it
   * instead of on it.
   *
   * One screen sets it: Set Deadlines, whose work-session bar sits at the foot
   * of the window since FIX-6. The number is **measured rather than typed**
   * for that item's own reason — the bar wraps, so it is 76px on one line at
   * 1440 and 136px on two at 1000, and a constant tuned at one width is wrong
   * at the other. The nav's own lane is not in here: every screen carries the
   * same reserve for that and the offsets are already written into each piece
   * of floating furniture.
   *
   * Zero is the resting value and every screen that sets it must clear it on
   * the way out, or the pill would float above a bar that is no longer there.
   */
  footerReserve: number;
  setFooterReserve: (px: number) => void;

  /**
   * BUILD-9 — the command palette is open. Here rather than in the palette
   * because two things open it: Ctrl+K, which the palette owns, and Home's
   * magnifying glass, which is the only way in on the tablet.
   */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  /**
   * BUILD-9 — something picked in the palette that another screen has to
   * carry out, waiting for that screen to mount. Three things qualify, because
   * each lives in a screen's own state rather than behind a route: Home's New
   * project and Smart Start sheets, and a question for Atlas, which the chat
   * screen sends into a fresh conversation. The screen that acts on it clears
   * it; in memory only, so a reload can never re-send a question.
   */
  paletteHandoff: PaletteHandoff | null;
  setPaletteHandoff: (handoff: PaletteHandoff | null) => void;
}

export type PaletteHandoff =
  | { kind: 'new-project' }
  | { kind: 'smart-start' }
  | { kind: 'ask'; text: string };

export const useUIStore = create<UIState>()((set) => ({
  overlayCount: 0,
  overlayOpen: false,
  pushOverlay: () =>
    set((state) => {
      const overlayCount = state.overlayCount + 1;
      return { overlayCount, overlayOpen: overlayCount > 0 };
    }),
  popOverlay: () =>
    set((state) => {
      const overlayCount = Math.max(0, state.overlayCount - 1);
      return { overlayCount, overlayOpen: overlayCount > 0 };
    }),

  cloudSyncOk: true,
  setCloudSyncOk: (ok) => set((state) => (state.cloudSyncOk === ok ? state : { cloudSyncOk: ok })),

  reminderSyncIssue: null,
  reminderSyncIssueKind: 'failed',
  setReminderSyncIssue: (message, kind = 'failed') =>
    set((state) =>
      state.reminderSyncIssue === message && state.reminderSyncIssueKind === kind
        ? state
        : { reminderSyncIssue: message, reminderSyncIssueKind: kind },
    ),

  notificationsNeedReconnect: false,
  setNotificationsNeedReconnect: (needed) =>
    set((state) => (state.notificationsNeedReconnect === needed ? state : { notificationsNeedReconnect: needed })),

  atlasPanelOpen: false,
  setAtlasPanelOpen: (open) =>
    set((state) => (state.atlasPanelOpen === open ? state : { atlasPanelOpen: open })),

  dockOpen: false,
  setDockOpen: (open) => set((state) => (state.dockOpen === open ? state : { dockOpen: open })),

  deadlineShift: null,
  reportDeadlineShift: (plan) => set({ deadlineShift: plan }),
  clearDeadlineShift: () => set((state) => (state.deadlineShift === null ? state : { deadlineShift: null })),

  archiveNotice: null,
  showArchiveNotice: ({ title, detail, tone = 'neutral' }) => set({ archiveNotice: { title, detail, tone, at: Date.now() } }),
  clearArchiveNotice: () => set((state) => (state.archiveNotice === null ? state : { archiveNotice: null })),

  updateReady: false,
  setUpdateReady: (ready) => set((state) => (state.updateReady === ready ? state : { updateReady: ready })),

  footerReserve: 0,
  setFooterReserve: (px) => set((state) => (state.footerReserve === px ? state : { footerReserve: px })),

  paletteOpen: false,
  setPaletteOpen: (open) => set((state) => (state.paletteOpen === open ? state : { paletteOpen: open })),

  paletteHandoff: null,
  setPaletteHandoff: (handoff) => set({ paletteHandoff: handoff }),
}));
