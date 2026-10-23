/**
 * Whether a store write right now is HIS — the one question `useUndoStore`'s
 * recorder cannot answer by itself (29-1P4a).
 *
 * His undo is for his own presses (BIG-15: "Atlas's own Revert is
 * untouched"). Since BIG-12 Atlas's tools run in this page too, through the
 * same store actions a tick box calls, so the tool server closes this gate for
 * the length of a call, and the undo store closes it while it puts something
 * back. A counter, not a flag, because those can nest.
 *
 * Its own module so `lib/agent/toolServer/` — which `mcp/` runs in Node —
 * needs nothing of the undo store to say so.
 */
let closed = 0;

export function withoutUndo<T>(run: () => T): T {
  closed += 1;
  try {
    return run();
  } finally {
    closed -= 1;
  }
}

export async function withoutUndoAsync<T>(run: () => Promise<T>): Promise<T> {
  closed += 1;
  try {
    return await run();
  } finally {
    closed -= 1;
  }
}

export function undoGateClosed(): boolean {
  return closed > 0;
}
