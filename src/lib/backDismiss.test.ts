import { describe, it, expect } from 'vitest';
import { createBackDismiss, BACK_DISMISS_SENTINEL, type BackDismissHistory } from './backDismiss';

/**
 * What the Android back button does to BASE once it is installed (APP-2).
 *
 * The real mechanism is three things at once — a browser history, a React tree
 * unmounting, and a gesture nobody here can make. Only the first is worth
 * asserting and it is the only one that can be: `createBackDismiss` takes its
 * history *and its scheduler* as arguments precisely so this file can hand it
 * fakes and step through the sequence by hand.
 *
 * **What this does NOT prove.** It does not prove that back closes a task sheet
 * on the tablet — no test in Node can, and `curl-is-not-a-browser` applies. It
 * proves the five things that would be invisible if they were wrong: that a
 * sentinel exists exactly while something is open (so the press has something
 * to spend itself on), that closing a panel any other way takes that sentinel
 * back out again (so the *next* press is not swallowed by an entry nothing is
 * waiting on), that a nested stack comes off one layer at a time, that a press
 * with nothing open is left alone so it can leave the app, and that React's
 * StrictMode remount does not leave the two out of step — which is the bug the
 * first version of this shipped with, and the reason the reconcile pass is
 * deferred at all. The gesture itself is in the commit's click-path.
 */

/**
 * A history stack, as small as the module's own interface — and asynchronous
 * in the two ways that matter, because a synchronous fake hid the real bug
 * completely and reported the broken version green:
 *
 *   - `back()` only *queues* the traversal. The entry is still the one you are
 *     standing on for the rest of the tick.
 *   - `pushState` **abandons a queued traversal.** A `back()` is a "traverse
 *     the history by a delta" task and mutating the session history before it
 *     runs drops it, so the entry it was going to take away simply stays — and
 *     the `popstate` that was going to balance the bookkeeping never arrives.
 *     That is the whole failure: it leaves the counter that swallows our own
 *     traversals permanently above zero, so nothing ever arms again.
 */
function fakeHistory() {
  const entries: unknown[] = [{ idx: 0 }];
  let queued = 0;
  return {
    get state() {
      return entries[entries.length - 1];
    },
    pushState(data: unknown) {
      queued = 0;
      entries.push(data);
    },
    back() {
      queued += 1;
    },
    depth: () => entries.length,
    /** The user's own gesture: one entry off, no queue involved. */
    traverse() {
      entries.pop();
    },
    /** Let every `back()` the module queued actually happen. */
    runQueued() {
      const ran = queued;
      while (queued > 0) {
        queued -= 1;
        entries.pop();
      }
      return ran;
    },
  } satisfies BackDismissHistory & Record<string, unknown>;
}

/** A stand-in for the overlay stack: a list of names, innermost last. */
function harness() {
  const open: string[] = [];
  const history = fakeHistory();
  const tasks: (() => void)[] = [];
  const back = createBackDismiss({
    history,
    depth: () => open.length,
    closeTop: () => {
      open.pop();
    },
    schedule: (task) => tasks.push(task),
  });

  /** Drain the scheduler, then let any traversal it asked for happen. */
  function settle() {
    for (let pass = 0; pass < 5; pass++) {
      while (tasks.length) tasks.shift()!();
      if (history.runQueued() === 0) break;
      // The traversal fires a popstate of its own, which the module has to
      // recognise as the echo of its own `back()` rather than as a press.
      back.onPopState();
    }
  }

  return {
    history,
    open,
    back,
    settle,
    /** Open an overlay, the way `useOverlayDismiss`'s effect does. */
    push(name: string) {
      open.push(name);
      back.sync();
      settle();
    },
    /** Close one by Escape / its X / a backdrop click. */
    dismiss(name: string) {
      open.splice(open.lastIndexOf(name), 1);
      back.sync();
      settle();
    },
    /** The system back gesture: the browser pops, *then* tells the page. */
    press() {
      history.traverse();
      const answered = back.onPopState();
      back.sync();
      settle();
      return answered;
    },
  };
}

const isSentinel = (entry: unknown) =>
  !!entry && (entry as Record<string, unknown>)[BACK_DISMISS_SENTINEL] === true;

describe('back dismiss', () => {
  it('adds one history entry while an overlay is open, and takes it away again', () => {
    const h = harness();
    expect(h.history.depth()).toBe(1);

    h.push('task sheet');
    expect(h.history.depth()).toBe(2);
    expect(isSentinel(h.history.state)).toBe(true);

    h.dismiss('task sheet');
    expect(h.history.depth()).toBe(1);
    expect(h.back.isArmed()).toBe(false);
  });

  it('adds only one however deep the stack goes', () => {
    const h = harness();
    h.push('task sheet');
    h.push('deadline picker');
    h.push('a dropdown inside it');
    expect(h.history.depth()).toBe(2);
  });

  it('closes the innermost overlay and leaves the rest open', () => {
    const h = harness();
    h.push('task sheet');
    h.push('a dropdown inside it');

    expect(h.press()).toBe(true);
    expect(h.open).toEqual(['task sheet']);
    // Re-armed for the next press, because something is still open.
    expect(h.history.depth()).toBe(2);
    expect(isSentinel(h.history.state)).toBe(true);

    expect(h.press()).toBe(true);
    expect(h.open).toEqual([]);
    expect(h.history.depth()).toBe(1);
  });

  it('does not answer a press once nothing is open — that one leaves the app', () => {
    const h = harness();
    h.push('task sheet');
    h.press();
    expect(h.open).toEqual([]);

    expect(h.press()).toBe(false);
  });

  it('survives the mount / unmount / mount StrictMode does to every effect', () => {
    const h = harness();
    // One commit, no frame in between — this is what `useOverlayDismiss(true,
    // …)` does on the task sheet, and the eager version of this module came
    // out of it believing it was armed with no sentinel underneath.
    h.open.push('task sheet');
    h.back.sync();
    h.open.pop();
    h.back.sync();
    h.open.push('task sheet');
    h.back.sync();
    h.settle();

    expect(h.back.isArmed()).toBe(true);
    expect(isSentinel(h.history.state)).toBe(true);
    expect(h.history.depth()).toBe(2);
    // And the press that follows still closes the sheet rather than the app.
    expect(h.press()).toBe(true);
    expect(h.open).toEqual([]);
  });

  it('leaves a buried sentinel alone rather than undoing a navigation', () => {
    const h = harness();
    h.push('share modal');
    // ShareModal's "Settings" link: it closes itself and react-router pushes
    // its own entry in the same handler, so by the time the close settles the
    // sentinel is no longer the entry we are standing on.
    h.history.pushState({ idx: 1 });
    h.dismiss('share modal');

    // Three entries, not two: the sentinel is left buried rather than spent,
    // because spending it would have taken the user off /settings.
    expect(h.history.depth()).toBe(3);
    expect(isSentinel(h.history.state)).toBe(false);
  });
});
