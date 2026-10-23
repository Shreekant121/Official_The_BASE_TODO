import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { docIdOf, toDoc } from '../cloudMemory';
import type { CloudDoc } from '../cloudMemoryModel';
import type { CloudCollection, CloudPort, CloudRecord } from './atlasEngine.generated';

/**
 * BIG-4's cloud copy as Atlas's own `CloudPort`, for Atlas running in this
 * page with the lid shut (BIG-12).
 *
 * The laptop's port is `atlas/src/cloud/firestore.ts`, on the Admin SDK; this
 * is the same contract on the web SDK, under `users/{uid}/`, which
 * `firestore.rules`' owner rule already opens to him. The layout is the
 * laptop's to the byte — `docIdOf` for the document id, the real id inside it,
 * `parts` for a record over `CHUNK_BYTES` — so either device reads what the
 * other wrote. Reading reuses BIG-4's `toDoc`; only writing and listening are
 * new here.
 */

/** The laptop's figure (`firestore.ts`): comfortably under Firestore's 1 MB a document. */
const CHUNK_BYTES = 800_000;

const encoder = new TextEncoder();

/** Splits a string into pieces no larger than `maxBytes` of UTF-8, never inside a character. */
export function splitUtf8(text: string, maxBytes: number): string[] {
  if (encoder.encode(text).length <= maxBytes) return [text];
  const out: string[] = [];
  let start = 0;
  let bytes = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i) ?? 0;
    const width = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    const units = code > 0xffff ? 2 : 1;
    if (bytes + width > maxBytes) {
      out.push(text.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += width;
    i += units;
  }
  out.push(text.slice(start));
  return out;
}

const recordOf = (one: CloudDoc): CloudRecord => ({
  id: one.id,
  json: one.json,
  updatedAt: one.updatedAt,
  by: one.by,
  ...(one.deleted ? { deleted: true } : {}),
});

export function firestoreCloud(uid: string): CloudPort {
  const port: CloudPort = {
    collection(name): CloudCollection {
      const ref = collection(db, 'users', uid, name);

      const clearParts = async (docId: string, keep: number): Promise<void> => {
        const pieces = await getDocs(collection(ref, docId, 'parts'));
        const stale = pieces.docs.filter((piece) => Number(piece.id) >= keep);
        if (stale.length === 0) return;
        const batch = writeBatch(db);
        for (const piece of stale) batch.delete(piece.ref);
        await batch.commit();
      };

      return {
        name,

        async list() {
          const snap = await getDocs(ref);
          const docs = await Promise.all(snap.docs.map(toDoc));
          return docs.filter((one): one is CloudDoc => one !== null).map(recordOf);
        },

        async get(id) {
          const snap = await getDoc(doc(ref, docIdOf(id)));
          if (!snap.exists()) return null;
          const one = await toDoc(snap);
          return one === null ? null : recordOf(one);
        },

        async put(record, options) {
          const docId = docIdOf(record.id);
          const head = { id: record.id, updatedAt: record.updatedAt, by: record.by, deleted: record.deleted === true };
          const small = encoder.encode(record.json).length <= CHUNK_BYTES;

          if (options?.keepNewerEdit === true) {
            /* The check and the write in one transaction, exactly as the
               laptop does it: an edit made a moment later — here, on the
               laptop's browser or a second tablet — is never overwritten. */
            const kept = await runTransaction(db, async (tx) => {
              const current = (await tx.get(doc(ref, docId))).data();
              if (current?.by === 'app' && typeof current.updatedAt === 'string' && current.updatedAt > record.updatedAt) {
                return true;
              }
              if (small) tx.set(doc(ref, docId), { ...head, json: record.json, parts: 0 });
              return false;
            });
            if (kept) return 'kept';
            if (small) return 'written';
          }

          const pieces = splitUtf8(record.json, CHUNK_BYTES);
          if (pieces.length === 1) {
            await setDoc(doc(ref, docId), { ...head, json: record.json, parts: 0 });
            await clearParts(docId, 0);
            return 'written';
          }
          const batch = writeBatch(db);
          pieces.forEach((chunk, index) => batch.set(doc(ref, docId, 'parts', String(index)), { chunk }));
          await batch.commit();
          await setDoc(doc(ref, docId), { ...head, json: '', parts: pieces.length });
          await clearParts(docId, pieces.length);
          return 'written';
        },

        async remove(id) {
          const docId = docIdOf(id);
          await clearParts(docId, 0);
          await deleteDoc(doc(ref, docId));
        },

        watch(onChange, onError) {
          return onSnapshot(
            ref,
            (snap) => {
              /* A fresh tab's first answer can come from an empty cache before
                 the server's does. Passing that on would tell Atlas he has no
                 notes; the server's snapshot follows, and the engine's wait
                 is capped, so nothing is lost by skipping it. */
              if (snap.metadata.fromCache && snap.empty) return;
              const changes = snap.docChanges();
              const removed = changes
                .filter((change) => change.type === 'removed')
                .map((change) => String(change.doc.get('id') ?? ''))
                .filter((id) => id !== '');
              const live = changes.filter((change) => change.type !== 'removed').map((change) => change.doc);
              void Promise.all(live.map(toDoc)).then((docs) => {
                const records = docs.filter((one): one is CloudDoc => one !== null).map(recordOf);
                if (records.length > 0 || removed.length > 0 || !snap.metadata.fromCache) onChange({ records, removed });
              }, onError);
            },
            onError,
          );
        },
      };
    },

    async close() {},
  };
  return port;
}
