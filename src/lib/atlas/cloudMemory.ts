import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { AtlasMemoryUnavailable } from './client';
import type { CloudDoc } from './cloudMemoryModel';

/**
 * The cloud copy of Atlas's memory, read (and for notes and skills written)
 * straight from Firestore with the lid shut (BIG-4).
 *
 * Only the wire lives here; what a record means is `cloudMemoryModel.ts`.
 * Everything is under `users/{uid}/`, which `firestore.rules`' owner rule
 * already opens to him — nothing new to publish. The laptop writes these with
 * `by: 'laptop'`; a write from here says `by: 'app'`, which is what makes the
 * laptop take it when it wakes (`atlas/src/cloud/sync.ts`).
 *
 * **A read that only reached this browser's cache is a failure, not an empty
 * list.** Firestore answers an offline `getDocs` from its cache, which on a
 * fresh tab is nothing — and "no notes" would read as Atlas having forgotten
 * everything. So an empty answer from the cache throws, and the screen says it
 * could not reach the cloud copy instead.
 */

export const COLLECTIONS = {
  notes: 'atlasNotes',
  chats: 'atlasChats',
  chatBodies: 'atlasChatBodies',
  skills: 'atlasSkills',
  log: 'atlasLog',
  approvals: 'atlasApprovals',
} as const;

type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** The laptop's document ids (`atlas/src/cloud/firestore.ts` `docIdOf`). A note path carries a `/`. */
export function docIdOf(id: string): string {
  return encodeURIComponent(id).replace(/\./g, '%2E');
}

const unreachable = () => new AtlasMemoryUnavailable('Could not reach the cloud copy of Atlas’s memory.', false);

export async function toDoc(snap: DocumentSnapshot | QueryDocumentSnapshot): Promise<CloudDoc | null> {
  const data = snap.data();
  if (!data || typeof data.id !== 'string') return null;
  let json = typeof data.json === 'string' ? data.json : '';
  const parts = typeof data.parts === 'number' ? data.parts : 0;
  if (parts > 0) {
    // A record over Firestore's 1 MB is split by the laptop; join it back.
    const pieces = await getDocs(collection(snap.ref, 'parts'));
    const byIndex = new Map(pieces.docs.map((piece) => [piece.id, String(piece.get('chunk') ?? '')]));
    const joined: string[] = [];
    for (let i = 0; i < parts; i += 1) {
      const piece = byIndex.get(String(i));
      if (piece === undefined) return null;
      joined.push(piece);
    }
    json = joined.join('');
  }
  return {
    id: data.id,
    json,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date(0).toISOString(),
    by: data.by === 'app' ? 'app' : 'laptop',
    deleted: data.deleted === true,
  };
}

export async function readAll(uid: string, name: CollectionName): Promise<CloudDoc[]> {
  let snap;
  try {
    snap = await getDocs(collection(db, 'users', uid, name));
  } catch {
    throw unreachable();
  }
  if (snap.empty && snap.metadata.fromCache) throw unreachable();
  const docs = await Promise.all(snap.docs.map(toDoc));
  return docs.filter((one): one is CloudDoc => one !== null);
}

export async function readOne(uid: string, name: CollectionName, id: string): Promise<CloudDoc | null> {
  let snap;
  try {
    snap = await getDoc(doc(db, 'users', uid, name, docIdOf(id)));
  } catch {
    throw unreachable();
  }
  if (!snap.exists()) {
    if (snap.metadata.fromCache) throw unreachable();
    return null;
  }
  return toDoc(snap);
}

/** An edit made with the lid shut. Two-way collections only — notes and skills. */
export async function writeFromApp(
  uid: string,
  name: typeof COLLECTIONS.notes | typeof COLLECTIONS.skills,
  record: { id: string; json: string; updatedAt: string; deleted?: boolean },
): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid, name, docIdOf(record.id)), {
      id: record.id,
      json: record.json,
      updatedAt: record.updatedAt,
      by: 'app',
      deleted: record.deleted === true,
      parts: 0,
    });
  } catch {
    throw new AtlasMemoryUnavailable('Could not save to the cloud copy — check the connection and try again.', false);
  }
}
