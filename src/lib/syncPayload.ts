import {
  DEFAULT_LISTS,
  mergeFocusLogs,
  upgradeTaskRecurrence,
  upgradeTaskScoring,
  type FocusLogEntry,
  type Project,
  type Task,
  type TaskList,
} from '../store/useStore';

/**
 * What goes into the cloud, and the one place it is picked out of the store.
 *
 * Split out of `firestoreSync.ts` (item 9) and unchanged in every other
 * respect. That file is a React hook module: it opens an `onSnapshot`
 * listener, reads `window` and `document`, and pulls in Firebase, the
 * notification reconcile and the share reconcile behind it. This shape and the
 * function that builds it need none of that, and two things that must not need
 * it were importing them anyway —
 *
 * - `syncDocSize.ts`, which is a pure byte-counter for the Storage panel, and
 *   which `trashModel.ts` depends on, so the whole of the pure delete/trash
 *   model transitively depended on a browser module;
 * - `mcp/`, which writes this same document from the laptop with the Admin SDK
 *   and has no browser at all.
 *
 * The second is what forced it. The alternative was for the MCP server to keep
 * its own copy of this interface, which would have been a second answer to
 * "what is in the cloud document" — and the rule in CLAUDE.md is that there is
 * exactly one, so that a slice added here cannot be forgotten there.
 *
 * `firestoreSync.ts` re-exports both, so every existing import still works.
 */
export interface SyncPayload {
  taskLists: TaskList[];
  backlogTasks: Task[];
  tasks: Task[];
  sessionDuration: number;
  taskTimeMemory: Record<string, number>;
  projects: Project[];
  /** Optional so a doc written before the focus time-log existed still validates. */
  focusLog?: FocusLogEntry[];
}

/**
 * The single place the synced slices are picked out of the store. Every push
 * goes through this, so "what is in the cloud document" has one answer.
 */
export function buildSyncPayload(state: SyncPayload): SyncPayload {
  return {
    taskLists: state.taskLists,
    backlogTasks: state.backlogTasks,
    tasks: state.tasks,
    sessionDuration: state.sessionDuration,
    taskTimeMemory: state.taskTimeMemory,
    projects: state.projects,
    focusLog: state.focusLog,
  };
}

/**
 * The cloud document, turned into the store slices it stands for.
 *
 * ONE PLACE, BECAUSE THERE ARE NOW TWO READERS AND A SILENT WAY TO GET IT
 * WRONG
 * -----------------------------------------------------------------------
 * The browser reads this document over `onSnapshot`; `mcp/` reads it on the
 * laptop with the Admin SDK. Both then write the *whole* payload back, so a
 * default that disagrees between them does not merely read oddly — it
 * overwrites. `sessionDuration` is the one that bites: its default is four
 * hours, and a reader that defaulted it to `0` would push a zero back and set
 * the focus session to nothing the next time it saved.
 *
 * The two migrations are not belt-and-braces either. This document carries **no
 * schema version**, so `useStore`'s persist migration never sees it: a snapshot
 * written before repeats became RRULE strings, or before the two importance
 * fields merged into one dial, would put the old shapes straight back — and an
 * unmigrated `humanOverride` reads as *scored zero* rather than *not judged*,
 * which empties Needs Attention.
 *
 * `localFocusLog` is the caller's own unsynced time entries, unioned in rather
 * than replaced. Pass `undefined` where there are none to union — which is the
 * case on the host, and across an account switch in the browser, where
 * unioning would hand one user another's logged hours.
 */
export function hydrateFromPayload(
  data: SyncPayload,
  localFocusLog?: FocusLogEntry[],
): Required<Omit<SyncPayload, 'focusLog'>> & { focusLog: FocusLogEntry[] } {
  return {
    taskLists: data.taskLists.length > 0 ? data.taskLists : DEFAULT_LISTS,
    backlogTasks: upgradeTaskScoring(upgradeTaskRecurrence(data.backlogTasks)),
    tasks: upgradeTaskScoring(upgradeTaskRecurrence(data.tasks ?? [])),
    sessionDuration: data.sessionDuration ?? 14400,
    taskTimeMemory: data.taskTimeMemory ?? {},
    projects: data.projects ?? [],
    focusLog: mergeFocusLogs(localFocusLog, data.focusLog),
  };
}
