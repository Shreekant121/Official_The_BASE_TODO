/**
 * THE ANDROID BACK BUTTON CLOSES WHAT IS OPEN BEFORE IT CLOSES THE APP (APP-2).
 *
 * In a browser tab this problem does not exist: back is the tab's own history
 * and the worst it can do is leave the page. Installed to the home screen there
 * is no tab and no address bar, so the system back gesture is the *only* back
 * there is — and once a route has no history behind it, pressing back quits
 * BASE outright. Dismissing a task sheet with back is the habit every Android
 * app teaches, and without this it would close the app instead, mid-edit.
 *
 * HOW IT WORKS, AND WHY IT IS ONE SENTINEL RATHER THAN ONE PER OVERLAY
 * --------------------------------------------------------------------
 * There is no "back was pressed" event to listen for — the only hook is
 * `popstate`, which fires *after* the navigation. So the app puts something in
 * front of itself to be consumed: while any overlay is open, one extra history
 * entry — a "sentinel" — sits on top of the stack. It carries the same URL as
 * the entry below it, so react-router renders exactly the same route and
 * nothing moves on screen. Back then pops the sentinel instead of leaving the
 * page, and this module answers by closing the topmost overlay.
 *
 * One sentinel for the whole stack, not one per overlay. Both work for a single
 * panel; the difference shows in the nested case, which this app has everywhere
 * (a dropdown inside the task sheet). With one sentinel there is a single
 * invariant to keep — *a sentinel exists if and only if something is open* —
 * and it is restored after every change by the same `sync()`. With one each,
 * closing overlays out of order leaves orphan entries in the history that a
 * later back press spends doing nothing visible.
 *
 * THE INVARIANT IS RESTORED LATE, AND THAT IS THE LOAD-BEARING PART
 * -----------------------------------------------------------------
 * `sync()` does not touch the history. It schedules one `reconcile()`, and
 * every further `sync()` before that runs is folded into it. Built the obvious
 * way — arm and disarm the instant the stack changes — this was broken on the
 * very first panel it was tried on, and the reason is worth keeping written
 * down because nothing about it is visible in the code:
 *
 *   - `history.back()` is **asynchronous**. Disarming queues a traversal; the
 *     entry is still there on the next line.
 *   - React's StrictMode mounts every effect, tears it down and mounts it
 *     again — synchronously, in one commit. A panel that registers on mount
 *     rather than on a flag (`useOverlayDismiss(true, …)`, which is how the
 *     task sheet and the share sheet register) therefore takes the stack
 *     0 → 1 → 0 → 1 with no frame in between.
 *
 * So the eager version pushed a sentinel, queued a `back()` to take it away,
 * pushed a *second* sentinel on top of the first one before the traversal had
 * happened, and then swallowed the traversal's `popstate` as its own. It ended
 * up believing it was armed while standing on an entry that was not a sentinel
 * — and the very next back press would have quit the app with the sheet open.
 * That is measured in the running app rather than reasoned about: the task
 * sheet opened with no sentinel behind it every single time.
 *
 * Deferring collapses the whole sequence to nothing: by the time `reconcile()`
 * runs the stack is back at 1 and it simply arms, once. The same deferral makes
 * "close one panel and open another in the same click" free.
 *
 * WHAT EACH FLAG IS FOR
 * ---------------------
 * `armed` — our sentinel is on top of the history stack right now. Not derived
 * from `history.state` at the moment of a pop, because by then the browser has
 * already replaced it with the state of the entry we landed *on*.
 *
 * `consuming` — how many `history.back()` calls we made ourselves and whose
 * `popstate` must therefore be ignored. Closing a panel by Escape, by its X, or
 * by a backdrop click has to take the sentinel back out of the history, or the
 * next real back press would be swallowed by an entry nothing is waiting on.
 * A counter rather than a boolean: `history.back()` is asynchronous, and two
 * overlays can close in one frame. `reconcile()` refuses to run while it is
 * non-zero — arming on top of an entry that is already on its way out is
 * exactly the bug above — and the traversal's own `popstate` asks for the pass
 * that was skipped.
 *
 * KNOWN EDGE, DELIBERATELY NOT SOLVED: an overlay that survives a route change
 * would leave its sentinel buried under the new entry, and the next back press
 * would then both navigate and close the overlay. Nothing in the app does that
 * — the only overlay with a link out of it, `ShareModal`, closes itself first,
 * which is the path `disarm()`'s `sentinelIsCurrent()` check is written for:
 * once react-router has pushed its own entry on top, the sentinel is no longer
 * ours to consume and is left where it is.
 *
 * The module is deliberately free of React and of `window`: the history and the
 * scheduler both arrive through `createBackDismiss`, which is what lets
 * `backDismiss.test.ts` drive the whole mechanism — the StrictMode sequence
 * included — against fakes in Node. `useOverlayDismiss.ts` is the only caller.
 */

/** Marks a history entry as the app's own. */
const SENTINEL = '__baseOverlayBack';

/** The slice of `window.history` this needs. */
export interface BackDismissHistory {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | null): void;
  back(): void;
}

export interface BackDismissOptions {
  history: BackDismissHistory;
  /** How many overlays are open. */
  depth: () => number;
  /** Close the innermost one. */
  closeTop: () => void;
  /**
   * Run the reconcile pass once the current commit has settled. The default,
   * `queueMicrotask`, is the first moment React's mount / unmount / mount has
   * finished; the test passes a manual one so it can flush by hand.
   */
  schedule?: (task: () => void) => void;
}

export interface BackDismiss {
  /**
   * Note that the overlay stack has changed. Cheap and idempotent, so it is
   * safe to call on every open and every close — the work is coalesced into
   * one pass.
   */
  sync(): void;
  /**
   * Answer a `popstate`. Returns true when the press was ours — i.e. it was
   * spent closing an overlay, or it was the echo of our own `history.back()`
   * — and false when it was a real navigation that should be left alone.
   */
  onPopState(): boolean;
  /** Whether a sentinel of ours is currently on top. Test seam. */
  isArmed(): boolean;
}

export function createBackDismiss({
  history,
  depth,
  closeTop,
  schedule = queueMicrotask,
}: BackDismissOptions): BackDismiss {
  let armed = false;
  let consuming = 0;
  let scheduled = false;

  const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

  const sentinelIsCurrent = () => asRecord(history.state)[SENTINEL] === true;

  const arm = () => {
    // The entry's existing state is copied rather than replaced: react-router
    // keeps its own position index and the route's `location.state` in there,
    // and a sentinel that dropped them would make the router treat this as a
    // different place and re-render the route it is already showing.
    history.pushState({ ...asRecord(history.state), [SENTINEL]: true }, '');
    armed = true;
  };

  const disarm = () => {
    armed = false;
    // Only ours to spend while it is still the entry we are standing on. If
    // something navigated while the overlay was open, the sentinel is buried
    // and going back would leave the page the user just arrived at.
    if (!sentinelIsCurrent()) return;
    consuming += 1;
    history.back();
  };

  const reconcile = () => {
    scheduled = false;
    // A traversal of ours is still in flight, and pushing anything now would
    // abandon it — see the fake history in `backDismiss.test.ts`. Its
    // `popstate` asks for the pass this one is declining to make.
    if (consuming > 0) return;
    const open = depth();
    if (open > 0 && !armed) arm();
    else if (open === 0 && armed) disarm();
  };

  const sync = () => {
    if (scheduled) return;
    scheduled = true;
    schedule(reconcile);
  };

  const onPopState = () => {
    if (consuming > 0) {
      consuming -= 1;
      // The stack may well have changed while the traversal was in flight.
      if (consuming === 0) sync();
      return true;
    }
    if (!armed) return false;
    // The sentinel is what the browser just popped, so it is gone whatever
    // happens next.
    armed = false;
    if (depth() === 0) return false;
    closeTop();
    return true;
  };

  return { sync, onPopState, isArmed: () => armed };
}

export const BACK_DISMISS_SENTINEL = SENTINEL;
