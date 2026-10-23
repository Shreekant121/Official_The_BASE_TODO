/**
 * The task's story in the browser (29-1P9c): the recorder that watches the
 * store, the writer that appends to `users/{uid}/story/{taskId}`, and the
 * reader the task sheet opens. `lib/taskStory.ts` is the pure half.
 *
 * ONE DOCUMENT PER TASK, NOT ONE FOR ALL
 * --------------------------------------
 * The Trash and the Archive are one document each because they are read
 * whole. A story is read one task at a time, when its sheet opens, so each
 * task gets its own small document: nothing is downloaded at startup, no
 * document can grow towards Firestore's 1 MB, and two devices writing to two
 * tasks never touch the same document. `firestore.rules` already lets the
 * owner write anything under `users/{uid}`, so no rules change.
 *
 * Appending is a transaction (read, add, trim to 30, write) while online, and
 * an `arrayUnion` while offline — Firestore queues that and lands it later,
 * and the next transaction on the task trims it. Both keep an identical
 * moment once, which is what makes a Red Alert seen by two devices one line.
 *
 * WHAT IS RECORDED, AND WHAT IS NOT
 * ---------------------------------
 * The recorder diffs the backlog around every store write, gathered per press
 * the way his undo is (one microtask), so a Save that writes eight fields and
 * the cascade it sets off are one diff. It does not wrap store actions as
 * the undo does: Atlas makes a task with a raw `setState`
 * (`agent/liveContext.ts`), and a Trash restore is one too. Instead the two
 * writers that change the backlog WITHOUT anybody doing anything — adopting
 * the cloud's copy (`firestoreSync.ts`) and swapping in a cover's pointer
 * (`covers/useCoverSync.ts`) — say so with `withoutStory`. Adopting the cloud
 * is the one that matters: the device that made a change records it, so the
 * device that receives it must not record it again.
 *
 * Atlas on the laptop writes through `mcp/`, never through this page, so
 * `mcp/store.ts` runs the same diff there and appends with the Admin SDK.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { arrayUnion, collection, deleteDoc, doc, getDocs, onSnapshot, runTransaction, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useStore, type Task } from '../store/useStore';
import { useTrashStore } from '../store/useTrashStore';
import { useArchiveStore } from '../store/useArchiveStore';
import { onScorePass } from '../store/usePriorityScores';
import { atlasIsWriting, storyIsQuiet } from '../store/storyActor';
import { appendToStory, newRedAlerts, readStoredStory, storyDiff, type StoryEvent } from './taskStory';

// ── Whose ────────────────────────────────────────────────────────────────────

let uid: string | null = null;
const uidListeners = new Set<() => void>();

function subscribeUid(fn: () => void): () => void {
  uidListeners.add(fn);
  return () => { uidListeners.delete(fn); };
}

const storyRef = (owner: string, taskId: string) => doc(db, 'users', owner, 'story', taskId);

// ── Writing ──────────────────────────────────────────────────────────────────

const pending = new Map<string, StoryEvent[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Moments to append, by task. With no account there is nowhere to write them,
 * and nothing is kept for later: signing in adopts the cloud's copy over
 * whatever was changed signed out (cloud wins, `firestoreSync.ts`), so a line
 * kept from then would describe an edit that no longer exists.
 */
export function queueStory(events: ReadonlyMap<string, StoryEvent[]>): void {
  if (events.size === 0 || !uid) return;
  for (const [id, list] of events) pending.set(id, [...(pending.get(id) ?? []), ...list]);
  if (timer) clearTimeout(timer);
  /* A short wait gathers a burst of presses (ticking five steps) into one
     write per task. */
  timer = setTimeout(flushStory, 800);
}

async function append(owner: string, taskId: string, events: StoryEvent[]): Promise<void> {
  const ref = storyRef(owner, taskId);
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        tx.set(ref, { events: appendToStory(readStoredStory(snap.data()), events) });
      });
      return;
    } catch { /* offline after all, or refused: fall through to the queued append */ }
  }
  await setDoc(ref, { events: arrayUnion(...events) }, { merge: true }).catch(() => {});
}

export function flushStory(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const owner = uid;
  if (!owner || pending.size === 0) return;
  const batch = [...pending];
  pending.clear();
  for (const [taskId, events] of batch) void append(owner, taskId, events);
}

// ── Recording ────────────────────────────────────────────────────────────────

function archivedIds(): Set<string> {
  return new Set(useArchiveStore.getState().entries.flatMap((e) => e.backlogTasks.map((t) => t.id)));
}

let installed = false;

/**
 * Once, at startup (`main.tsx`). The browser's half of the recorder; see the
 * header for why it watches the store rather than wrapping its actions.
 */
export function installStoryRecorder(): void {
  if (installed) return;
  installed = true;

  let before: readonly Task[] | null = null;
  let by: 'atlas' | undefined;

  const close = (after: readonly Task[]) => {
    const was = before;
    before = null;
    if (!was || was === after) return;
    const lists = useStore.getState().taskLists;
    queueStory(storyDiff(was, after, { now: Date.now(), lists, archived: archivedIds(), ...(by ? { by } : {}) }));
  };

  useStore.subscribe((state, prev) => {
    if (state.backlogTasks === prev.backlogTasks) return;
    if (storyIsQuiet()) {
      /* Whatever this press did before the cloud's copy landed is still his. */
      if (before) close(prev.backlogTasks);
      return;
    }
    if (!before) {
      before = prev.backlogTasks;
      by = atlasIsWriting() ? 'atlas' : undefined;
      queueMicrotask(() => { if (before) close(useStore.getState().backlogTasks); });
    }
  });

  /* Red Alert is worked out by the score, not stored, so it is caught where
     the score is: the app's one scoring pass. The first pass after a load
     only learns what is already red; a moment is a change seen. */
  let red: Set<string> | null = null;
  onScorePass((map, now, tasks) => {
    const isRed = new Map<string, number>();
    for (const task of tasks) {
      if (task.status === 'completed') continue;
      const entry = map.get(task.id);
      if (entry?.redAlert) isRed.set(task.id, entry.score);
    }
    if (red) queueStory(newRedAlerts(red, isRed, now));
    red = new Set(isRed.keys());
  });

  /* A task that leaves the Trash for good (swept, emptied, deleted from
     there) takes its story with it. Checked after a pause and against all
     three places, because a restore on the other device can empty the Trash
     here a moment before the backlog that holds it arrives. */
  useTrashStore.subscribe((state, prev) => {
    if (state.entries === prev.entries) return;
    const still = new Set(state.entries.flatMap((e) => e.backlogTasks.map((t) => t.id)));
    const left = prev.entries.flatMap((e) => e.backlogTasks.map((t) => t.id)).filter((id) => !still.has(id));
    if (left.length === 0) return;
    setTimeout(() => {
      const owner = uid;
      if (!owner) return;
      const here = new Set([
        ...useStore.getState().backlogTasks.map((t) => t.id),
        ...useTrashStore.getState().entries.flatMap((e) => e.backlogTasks.map((t) => t.id)),
        ...archivedIds(),
      ]);
      for (const id of left) if (!here.has(id)) void deleteDoc(storyRef(owner, id)).catch(() => {});
    }, 10_000);
  });

  if (typeof window !== 'undefined') window.addEventListener('pagehide', flushStory);
}

/**
 * Whose stories are written and read. Signed out, what was waiting is
 * dropped: a moment recorded under one account must never land in the next.
 */
export function setStoryOwner(owner: string | null): void {
  if (uid && uid !== owner) flushStory();
  uid = owner;
  for (const fn of uidListeners) fn();
  if (owner) flushStory();
  else pending.clear();
}

/** Mounted once in `App.tsx`, beside the Trash's and the Archive's sync. */
export function useStorySync(owner: string | null): void {
  useEffect(() => {
    setStoryOwner(owner);
    return () => { if (uid === owner) setStoryOwner(null); };
  }, [owner]);
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * One task's stored moments, live, while its sheet is open. Empty with no
 * account (the screenshot harness has none) or until the document answers —
 * the sheet still shows what the task itself says.
 */
export function useTaskStory(taskId: string): StoryEvent[] {
  const owner = useSyncExternalStore(subscribeUid, () => uid, () => null);
  const [stored, setStored] = useState<{ key: string; events: StoryEvent[] } | null>(null);
  const key = owner ? `${owner}/${taskId}` : '';

  useEffect(() => {
    if (!owner) return;
    return onSnapshot(
      storyRef(owner, taskId),
      (snap) => setStored({ key: `${owner}/${taskId}`, events: readStoredStory(snap.data()) }),
      () => { /* offline and uncached: the task's own facts still show */ },
    );
  }, [owner, taskId]);

  return stored && stored.key === key ? stored.events : NONE;
}

const NONE: StoryEvent[] = [];

/*
 * Every task's story at once, for the month's and the year's wrapped "the
 * task you pushed most" (29-1P14e2). Read once per page load per account,
 * only while a wrapped card is offered (the 1st to the 7th), never at
 * startup: one document per task makes this a read of the whole collection,
 * which is why it is fetched rather than watched.
 */
type AllStories = ReadonlyMap<string, readonly StoryEvent[]>;
const allStories = new Map<string, Promise<AllStories>>();

function readAllStories(owner: string): Promise<AllStories> {
  let read = allStories.get(owner);
  if (!read) {
    read = getDocs(collection(db, 'users', owner, 'story')).then(
      (snap) => new Map(snap.docs.map((d) => [d.id, readStoredStory(d.data())])),
      () => {
        allStories.delete(owner);
        return new Map();
      },
    );
    allStories.set(owner, read);
  }
  return read;
}

/**
 * Every task's stored story while `on`, or undefined until it has been read —
 * and always with no account (the screenshot harness has none), so the
 * pushed page is simply left out there.
 */
export function useAllStories(on: boolean): AllStories | undefined {
  const owner = useSyncExternalStore(subscribeUid, () => uid, () => null);
  const [read, setRead] = useState<{ owner: string; stories: AllStories } | null>(null);
  useEffect(() => {
    if (!on || !owner) return;
    let live = true;
    void readAllStories(owner).then((stories) => { if (live) setRead({ owner, stories }); });
    return () => { live = false; };
  }, [on, owner]);
  return on && read && read.owner === owner ? read.stories : undefined;
}
