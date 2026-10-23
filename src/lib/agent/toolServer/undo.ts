import { revertSnapshotEntries, useSnapshotStore, type SnapshotEntry, type TurnHandle } from '../../../store/useSnapshotStore';

/**
 * How an Atlas change is put back (item 13, DESIGN.md §5.3).
 *
 * WHY THE SERVER OWNS THE UNDO AND ATLAS ONLY STORES IT
 * ------------------------------------------------------
 * Atlas's log holds an opaque `payload` per entry and never looks inside it.
 * That is not squeamishness about types — it is the seam. Undoing a *deleted*
 * task means the Trash, undoing an *edited* one means a field patch, and
 * undoing a *created* one means a soft delete. All three are facts about this
 * app, and putting them in Atlas would mean the next MCP server plugged in
 * would either have to speak this app's dialect of undo or have none.
 *
 * So the shape of the deal is: this server hands back a payload with each
 * write, Atlas files it, and Atlas hands it back to `revert_actions` when
 * Shreekant taps Revert. A CRM server plugged in tomorrow answers the same
 * call with its own payload shape and Atlas is unchanged.
 *
 * THE PAYLOAD IS THE SNAPSHOT RING'S OWN ENTRIES
 * ------------------------------------------------
 * `useSnapshotStore` has done this since D6 — capture every entity a turn
 * touches before it is touched, keep the first value, restore with a minimal
 * patch through the store's own actions so the Firestore push and the share
 * and calendar reconciles all fire. The only thing it could not do was survive
 * leaving the process.
 *
 * It can now, because a `SnapshotEntry` is plain JSON: `prior` is a
 * `structuredClone` of a task, list or project, and those are strings,
 * numbers, booleans, arrays and object literals end to end. So the ring is run
 * here for the length of one tool call, the entries are lifted out, and they
 * travel down the pipe as-is.
 *
 * **The ring itself is not the record.** It is in-memory and this process may
 * be restarted between the change and the undo; Atlas's log is the durable
 * half. Only the ring's *capture* logic is used, and nothing is committed to it.
 *
 * **Shared since BIG-12.** This moved from `mcp/undo.ts` so the tablet, running
 * Atlas itself with the lid shut, captures and reverts through exactly the
 * code the laptop's MCP server does — `toolServer/index.ts` is both halves' call
 * handler, and an undo token made on one device is applied on the other.
 */

/** What travels to Atlas and comes back. Deliberately just the entries. */
export interface UndoPayload {
  entries: SnapshotEntry[];
}

let handleCounter = 0;

/** Opens a capture turn for one tool call. */
export function beginCapture(turnId: string, label: string): TurnHandle {
  handleCounter += 1;
  return useSnapshotStore.getState().beginTurn(`${label} (${turnId}#${handleCounter})`);
}

/**
 * Closes it and lifts the entries out, or `null` when the call touched
 * nothing.
 *
 * `null` is the ordinary answer for a read, and also for a write that refused
 * — a `create_task` that could not find its list captured nothing, and an
 * entry offering to undo a change that never happened would be worse than no
 * entry at all.
 *
 * The capture never reaches the ring. Twenty of these would otherwise sit in a
 * long-lived process holding complete copies of everything Atlas has read this
 * week, for an undo path that never reads them — and since BIG-12 this also
 * runs in the tablet's browser, where the ring is the basic assistant's Revert
 * history and must not be touched. (It used to commit and then clear the whole
 * ring, which was harmless only while this ran in its own process.)
 */
export function endCapture(handle: TurnHandle): UndoPayload | null {
  const turn = useSnapshotStore.getState().takeDraft(handle);
  if (turn === null) return null;
  return { entries: turn.entries };
}

export interface RevertReport {
  ok: boolean;
  summary: string;
}

/**
 * Applies one payload.
 *
 * `undoCreations: true` is the difference from the in-browser ring, and it is
 * D3 expiring: on this side Atlas *can* delete, deletion is soft into a 30-day
 * Trash, so undoing a creation is a delete that is itself undoable. Leaving
 * the created task standing — which is what the browser does — would mean
 * tapping "put this back" and watching nothing move.
 *
 * `revertSnapshotEntries` carries the whole of that reasoning.
 */
export function applyUndo(payload: unknown): RevertReport {
  const entries = (payload as UndoPayload | null)?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, summary: 'There is nothing recorded for that change, so it cannot be put back.' };
  }

  const outcomes = revertSnapshotEntries(entries, { undoCreations: true });

  const restored = outcomes.filter((outcome) => outcome.status === 'restored' || outcome.status === 'partial');
  const unchanged = outcomes.filter((outcome) => outcome.status === 'unchanged');
  const missing = outcomes.filter((outcome) => outcome.status === 'missing');
  const left = outcomes.filter((outcome) => outcome.status === 'created');

  const parts: string[] = [];
  if (restored.length > 0) parts.push(`put back ${restored.map((outcome) => `"${outcome.label}"`).join(', ')}`);
  if (unchanged.length > 0) parts.push(`${unchanged.length} already matched`);
  if (missing.length > 0) parts.push(`${missing.length} no longer exists and was skipped`);
  if (left.length > 0) parts.push(`${left.length} was created and could not be removed`);

  /*
   * "Nothing changed" is a success, and saying otherwise would be the lie this
   * whole file is built to avoid. If the world already looks the way the undo
   * wanted it to look, the undo is done.
   */
  const ok = restored.length > 0 || (unchanged.length > 0 && missing.length === 0 && left.length === 0);

  return {
    ok,
    summary: parts.length === 0 ? 'Nothing to put back.' : `${parts.join('; ')}.`,
  };
}
