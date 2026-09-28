import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { useStore } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { buildSyncPayload, hydrateFromPayload, type SyncPayload } from '../src/lib/syncPayload';
import { liveAgentStore } from '../src/lib/agent/liveContext';
import type { AgentStore } from '../src/lib/agent/types';
import { buildShareDoc } from '../src/lib/publicShareSnapshot';
import { log } from './protocol.ts';


/**
 * The app's own state, on the laptop.
 *
 * THE IDEA, WHICH IS THE WHOLE REASON THIS FILE IS SHORT
 * -------------------------------------------------------
 * BASE keeps its entire state in one Firestore document,
 * `users/{uid}/data/main`, and its Zustand store is a mirror of that document.
 * So this server does not reimplement the app: it **hydrates the app's real
 * store in Node**, runs the app's real tools against it through the same
 * `liveAgentStore` the browser uses, and writes the result back.
 *
 * That matters far more than it sounds. Deletion has to go through
 * `applyDeletion` or the focus-queue row, the subtask-proxy row, other tasks'
 * `dependsOn` and the `sharedListIds` cross-links are all left dangling.
 * Completing a task has to go through `updateBacklogTask` or a repeating task
 * spawns no successor. Clearing a field has to go through `withPatch` or
 * Firestore rejects the write and every later edit silently stops syncing.
 * CLAUDE.md warns about each of those separately. A hand-written server-side
 * model of this data would have had to get all three right and stay right;
 * running the real store gets them for free and cannot drift.
 *
 * `useStore` imports cleanly under Node — it pulls in `zustand`, four pure
 * modules of the app's own and nothing that knows about a browser. Its
 * `persist` middleware no-ops without `localStorage`, which is exactly what is
 * wanted here: this process's copy is transient by design and the document is
 * the only durable thing.
 *
 * SHREEKANT ALWAYS WINS (DESIGN.md §5.4)
 * ---------------------------------------
 * He and Atlas write to the same document, from two devices, under Firestore's
 * last-writer-wins. So this **re-reads before every call** rather than holding
 * state between them: a tool decides what to change against the document as it
 * is right now, not as it was when the conversation started. Locking was
 * rejected in the design and would be maddening within a day; re-reading costs
 * one document read per tool call and means he never loses work to his own
 * assistant.
 */

export interface AtlasStoreConfig {
  /** The stringified service-account JSON, from `FIREBASE_SERVICE_ACCOUNT`. */
  serviceAccountJson: string;
  /** Whose data. The uid of the Firebase account the app is signed in as. */
  uid: string;
}

function initFirestore(serviceAccountJson: string): Firestore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole downloaded key file as one line.');
  }

  const account = parsed as Record<string, unknown>;
  if (typeof account.project_id !== 'string' || typeof account.private_key !== 'string') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing "project_id" or "private_key" — that is not a service-account key.');
  }

  /*
   * A key pasted into an environment variable arrives with its newlines
   * escaped as the two characters `\` and `n`, because that is what survives a
   * single line of a `.env` file. `cert()` needs real newlines or the PEM will
   * not parse. `api/chat.ts` does the same normalisation for the same reason.
   */
  const normalised = { ...account, private_key: (account.private_key as string).replace(/\\n/g, '\n') };

  const existing = getApps().find((app) => app.name === 'atlas-mcp');
  const app = existing ?? initializeApp({ credential: cert(normalised as unknown as ServiceAccount) }, 'atlas-mcp');

  const db = getFirestore(app);

  /*
   * `ignoreUndefinedProperties`, exactly as `src/lib/firebase.ts` sets it on
   * the browser client, and for exactly the reason written there: this app's
   * types are full of optional fields, so a literal `undefined` turns up all
   * over a document — and Firestore's default behaviour is to throw the
   * instant *any* nested field anywhere in the write is `undefined`, taking
   * down the whole document push rather than the one offending field.
   *
   * Not a precaution. Without it `delete_task` failed on real data at the
   * first attempt: a Trash entry records `ancestors: { project?, list? }`, and
   * a task in a list that belongs to no project leaves `ancestors.project`
   * undefined. That is the ordinary case, not an edge one — three of the app's
   * own default lists have no project.
   */
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export class AtlasStore {
  private readonly db: Firestore;
  private readonly uid: string;

  /** True once a document has been read into the Zustand store at least once. */
  private hydrated = false;

  constructor(config: AtlasStoreConfig) {
    this.db = initFirestore(config.serviceAccountJson);
    this.uid = config.uid;
  }

  private get mainRef() {
    return this.db.doc(`users/${this.uid}/data/main`);
  }

  private get trashRef() {
    return this.db.doc(`users/${this.uid}/data/trash`);
  }

  /**
   * Pulls both documents into the store.
   *
   * The two upgrades are not optional and are not belt-and-braces. The cloud
   * document carries **no schema version** and lands straight in `setState`,
   * so a snapshot written before the RRULE migration or before the two
   * importance fields merged would put the old shape back — and an unmigrated
   * `humanOverride` reads as *scored zero* rather than *not judged*, which
   * empties Needs Attention. `firestoreSync.ts` runs exactly these two on the
   * same document for exactly this reason; this is the same door, opened from
   * the laptop instead of the browser.
   */
  async hydrate(): Promise<void> {
    const [main, trash] = await Promise.all([this.mainRef.get(), this.trashRef.get()]);

    const data = (main.exists ? main.data() : undefined) as Partial<SyncPayload> | undefined;
    if (!data || !Array.isArray(data.backlogTasks) || !Array.isArray(data.taskLists)) {
      throw new Error(
        `users/${this.uid}/data/main is missing or does not hold a task list. Check ATLAS_FIREBASE_UID names the right account.`,
      );
    }

    /*
     * `hydrateFromPayload`, not a hand-written spread. The browser reads this
     * same document and both sides write the *whole* payload back, so a
     * default that disagrees does not read oddly — it overwrites. This was not
     * hypothetical: `sessionDuration` defaults to four hours and an earlier
     * draft of this file defaulted it to `0`, which would have set his focus
     * session to nothing on the first thing Atlas saved.
     *
     * No local focus log to union in: this process holds no unsynced time
     * entries of its own, so the cloud's is the whole truth here.
     */
    useStore.setState(hydrateFromPayload(data as SyncPayload));

    const trashData = trash.exists ? (trash.data() as { entries?: unknown } | undefined) : undefined;
    useTrashStore.setState({ entries: Array.isArray(trashData?.entries) ? trashData.entries : [] });

    this.hydrated = true;
  }

  /**
   * Writes both documents back.
   *
   * `merge: true` on the main document, matching `firestoreSync.ts`: the store
   * holds only the synced slices, and a full overwrite would delete anything
   * the app writes into that document from somewhere this process does not
   * model. The Trash document is written whole because `entries` is the only
   * thing in it.
   *
   * THE TRASH IS WRITTEN FIRST, AND IN SEQUENCE, AND THAT IS THE WHOLE POINT
   * -------------------------------------------------------------------------
   * These are two documents and Firestore gives no transaction across them
   * here, so one can land while the other fails. The order therefore decides
   * what a half-failure costs.
   *
   * Backup first, then removal. If the Trash write fails, the main document is
   * never touched: the task is still in the backlog, the tool reports the
   * failure, and nothing is lost. The other order loses the task outright —
   * removed from the backlog with no entry to restore it from, which is the
   * one outcome a *soft* delete exists to prevent.
   *
   * This was written the other way round first, as a `Promise.all`, and it
   * failed exactly like that on the first real run: the Trash write threw on
   * an undefined field while the main write went through, and the task was
   * deleted with no undo. That was a test task. It would not always be.
   */
  async flush(): Promise<void> {
    // `buildSyncPayload`, not a hand-picked object: CLAUDE.md's rule is that
    // there is exactly one place the synced slices are chosen, so that a slice
    // added to the app cannot be forgotten here.
    const payload: SyncPayload = buildSyncPayload(useStore.getState());

    await this.trashRef.set({ entries: useTrashStore.getState().entries });
    await this.mainRef.set(payload, { merge: true });
  }

  /**
   * The app's own store, unchanged.
   *
   * Returned rather than reimplemented — `liveAgentStore` reaches
   * `useStore`/`useTrashStore` through their real actions, and those are now
   * this process's stores. Everything in `src/lib/agent/tools/` therefore runs
   * here exactly as it runs in the browser, against the same code paths, with
   * the same cascade and the same recurrence behaviour.
   */
  get agentStore(): AgentStore {
    if (!this.hydrated) throw new Error('The store was used before it was hydrated. Call hydrate() first.');
    return liveAgentStore;
  }

  /** A one-line description of what was loaded, for the stderr log on startup. */
  describe(): string {
    const state = useStore.getState();
    return `${state.backlogTasks.length} tasks, ${state.taskLists.length} lists, ${state.projects.length} projects, ${useTrashStore.getState().entries.length} in the Trash`;
  }

  /**
   * Runs one tool call against a freshly-read copy, and writes back only if it
   * changed something.
   *
   * The read is unconditional and the write is not. A read-only tool —
   * `search_tasks`, `get_task`, `list_trash` — must not touch the document at
   * all: a write from Atlas lands on Shreekant's tablet as a live snapshot
   * update, so a server that flushed after every call would make his screen
   * flicker every time he asked it a question.
   */
  async withFreshState<T>(mutates: boolean, run: () => Promise<T>): Promise<T> {
    await this.hydrate();
    const shareIdsBefore = this.shareIds();
    const result = await run();
    if (mutates) {
      await this.flush();
      await this.reconcileShares(shareIdsBefore);
      log('[mcp] wrote', this.describe());
    }
    return result;
  }

  /**
   * Every share id in the store right now, with what it points at.
   *
   * A `Map` rather than a `Set` because reconciling needs both halves of the
   * comparison: which ids appeared (publish), which vanished (take down), and
   * which are still there attached to something that just changed (refresh).
   */
  private shareIds(): Map<string, { type: 'task' | 'list' | 'project'; id: string }> {
    const state = useStore.getState();
    const out = new Map<string, { type: 'task' | 'list' | 'project'; id: string }>();
    for (const task of state.backlogTasks) if (task.shareId) out.set(task.shareId, { type: 'task', id: task.id });
    for (const list of state.taskLists) if (list.shareId) out.set(list.shareId, { type: 'list', id: list.id });
    for (const project of state.projects) if (project.shareId) out.set(project.shareId, { type: 'project', id: project.id });
    return out;
  }

  /**
   * Writes and deletes the `publicShares/{id}` documents a call changed
   * (item 13).
   *
   * THE EXTERNAL HALF, WRITTEN HERE BECAUSE THE APP CANNOT BE ASSUMED OPEN
   * -----------------------------------------------------------------------
   * A share is two things: a `shareId` on the entity, and a denormalised
   * snapshot at `publicShares/{shareId}` that anonymous readers actually load.
   * `shareTools.ts` writes the first and deliberately not the second — it
   * cannot, since reaching `publicShare.ts` from Node would initialise a
   * browser Firebase client.
   *
   * In the browser `firestoreSync.ts` closes that gap on the next sync. Here
   * it has to be closed **now**: Atlas publishing a link and handing Shreekant
   * a URL that 404s until he next opens the tablet would be worse than not
   * publishing at all — it is a promise the front door just made on his
   * behalf.
   *
   * **Only what changed.** Republishing every shared entity after every write
   * would be N document writes per tool call to keep snapshots fresh that
   * nothing touched. A snapshot going stale because the app has not been
   * opened is the behaviour this app already had; a link that does not exist
   * is not.
   */
  private async reconcileShares(before: Map<string, { type: string; id: string }>): Promise<void> {
    const after = this.shareIds();

    const gone = [...before.keys()].filter((shareId) => !after.has(shareId));
    const added = [...after.keys()].filter((shareId) => !before.has(shareId));
    if (gone.length === 0 && added.length === 0) return;

    const state = useStore.getState();

    for (const shareId of gone) {
      try {
        await this.db.doc(`publicShares/${shareId}`).delete();
        log('[mcp] took down share', shareId);
      } catch (err) {
        // Reported, not thrown. The `shareId` is already off the entity, so
        // the app's own reconcile will not re-publish it; the worst case is an
        // orphan document, which is what `deletionCleanup.ts` already tolerates.
        log('[mcp] could not take down share', shareId, err instanceof Error ? err.message : String(err));
      }
    }

    // The focus log is the client view's "time taken" (BUILD-14). A live run
    // is the browser's alone; its next reconcile adds one if there is.
    const extras = { focusLog: state.focusLog };
    for (const shareId of added) {
      const target = after.get(shareId);
      if (!target) continue;

      try {
        const doc =
          target.type === 'task'
            ? (() => {
                const task = state.backlogTasks.find((candidate) => candidate.id === target.id);
                return task ? buildShareDoc(shareId, this.uid, undefined, { type: 'task', task }, extras) : null;
              })()
            : target.type === 'list'
              ? (() => {
                  const list = state.taskLists.find((candidate) => candidate.id === target.id);
                  return list
                    ? buildShareDoc(shareId, this.uid, undefined, { type: 'list', list, allTasks: state.backlogTasks }, extras)
                    : null;
                })()
              : (() => {
                  const project = state.projects.find((candidate) => candidate.id === target.id);
                  return project
                    ? buildShareDoc(shareId, this.uid, undefined, {
                        type: 'project',
                        project,
                        allLists: state.taskLists,
                        allTasks: state.backlogTasks,
                      }, extras)
                    : null;
                })();

        if (doc === null) continue;
        await this.db.doc(`publicShares/${shareId}`).set(doc);
        log('[mcp] published share', shareId, `(${target.type})`);
      } catch (err) {
        log('[mcp] could not publish share', shareId, err instanceof Error ? err.message : String(err));
      }
    }
  }
}
