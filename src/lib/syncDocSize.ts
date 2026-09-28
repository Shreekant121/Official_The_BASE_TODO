/**
 * How much of Firestore's 1 MiB document budget the synced app state occupies.
 *
 * `firestoreSync.ts` writes the *entire* app — projects, lists, tasks,
 * subtasks, the focus log — into one document at `users/{uid}/data/main`, and
 * Firestore hard-caps a single document at 1 MiB. Past that the write is
 * rejected outright, so every edit would silently stop reaching the cloud
 * while the app carried on looking fine locally. This module turns that
 * invisible budget into a number the Storage panel can show.
 *
 * The size is computed the way *Firestore* counts it, not with
 * `JSON.stringify().length`. Those two disagree badly on this data: JSON pays
 * for quotes, commas and colons but writes a number like `1755538800000` as 13
 * characters, where Firestore stores every number in 8 bytes flat and charges
 * 1 byte of terminator per string and per map key. On a task list full of
 * timestamps and scores, stringify can be off by 30% in either direction — and
 * the direction that matters (under-reporting) is the one that lets the
 * document blow the cap while the panel still reads "fine".
 *
 * The rules below are Google's documented "storage size calculations":
 *   string    UTF-8 bytes + 1        number  8        boolean  1
 *   null      1                      map     Σ (key bytes + 1 + value size)
 *   array     Σ value sizes          doc     name size + fields + 32
 * `undefined` costs nothing because `firebase.ts` initialises Firestore with
 * `ignoreUndefinedProperties`, so the SDK drops those keys before they are
 * written (the app's optional fields are `undefined` all over the place).
 *
 * The result is an estimate in one direction only: `setDoc` uses
 * `{ merge: true }`, so a field written by an older version of the app and no
 * longer in the payload still occupies space in the real document. It cannot
 * over-report.
 */
import type { SyncPayload } from './syncPayload';

/** Firestore's hard per-document ceiling: 1 MiB, exactly. */
export const FIRESTORE_DOC_LIMIT_BYTES = 1_048_576;

/** Fraction of the cap at which the panel starts warning. */
const WARN_AT = 0.7;
/** Fraction at which it stops being advice and starts being urgent. */
const CRITICAL_AT = 0.9;

/**
 * UTF-8 byte length without allocating. `TextEncoder` would be shorter but
 * builds a whole `Uint8Array` per string, and this walks every string in the
 * dataset — thousands of them — on each store change while Settings is open.
 */
function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // Surrogate pair — one astral code point, 4 bytes, two UTF-16 units.
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/**
 * Size of one value, by Firestore's rules. Exported because the Trash keeps
 * its own document (`lib/trashModel.ts`) against the same 1 MiB ceiling and
 * has to know when to start dropping its oldest entries.
 */
export function firestoreValueSize(value: unknown): number {
  if (value === undefined) return 0;
  if (value === null) return 1;

  switch (typeof value) {
    case 'boolean': return 1;
    case 'number': return 8;
    case 'string': return utf8ByteLength(value) + 1;
    case 'object': break;
    // Functions and symbols never reach Firestore — the payload is data only.
    default: return 0;
  }

  if (Array.isArray(value)) {
    let bytes = 0;
    for (const entry of value) bytes += firestoreValueSize(entry);
    return bytes;
  }
  if (value instanceof Date) return 8;

  let bytes = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    // A dropped key costs nothing at all — not even its name.
    if (entry === undefined) continue;
    bytes += utf8ByteLength(key) + 1 + firestoreValueSize(entry);
  }
  return bytes;
}

/**
 * Fixed overhead Firestore adds to every document: the size of its full path
 * plus 32 bytes. Path segments are those `firestoreSync.ts` writes to; the uid
 * is the only part that varies, and only by a few bytes.
 */
function documentNameSize(uid: string): number {
  const segments = ['users', uid, 'data', 'main'];
  let bytes = 16;
  for (const segment of segments) bytes += utf8ByteLength(segment) + 1;
  return bytes;
}

/** One top-level field of the synced document, in words that mean something. */
export interface SyncDocSection {
  key: keyof SyncPayload;
  /** What this holds, said the way the app says it elsewhere. */
  label: string;
  bytes: number;
  /** Share of the *used* space, 0–1. */
  share: number;
}

export interface SyncDocUsage {
  /** Total document size as Firestore would count it. */
  bytes: number;
  limitBytes: number;
  /** 0–1, and can exceed 1 — the document is over the cap at that point. */
  fraction: number;
  level: 'ok' | 'warn' | 'critical';
  /** Every field, largest first. */
  sections: SyncDocSection[];
  /** Document path + per-document constant, i.e. what is not app data. */
  overheadBytes: number;
}

/**
 * Labels are deliberately the user's vocabulary, not the field names: the
 * store calls today's queue `tasks` and the real store of record
 * `backlogTasks`, which is exactly backwards from how the app reads on screen.
 */
const SECTION_LABELS: Record<keyof SyncPayload, string> = {
  backlogTasks: 'Tasks & subtasks',
  projects: 'Projects',
  taskLists: 'Lists',
  tasks: "Today's focus queue",
  focusLog: 'Time log',
  taskTimeMemory: 'Remembered timings',
  sessionDuration: 'Session length',
};

export function measureSyncDoc(payload: SyncPayload, uid: string | null): SyncDocUsage {
  const sections: SyncDocSection[] = (Object.keys(SECTION_LABELS) as (keyof SyncPayload)[])
    .map((key) => ({
      key,
      label: SECTION_LABELS[key],
      // Field name is charged too, same as a map key.
      bytes: payload[key] === undefined ? 0 : utf8ByteLength(key) + 1 + firestoreValueSize(payload[key]),
      share: 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const fieldBytes = sections.reduce((sum, section) => sum + section.bytes, 0);
  // An unauthenticated read can still show the shape of things; the uid only
  // moves the total by its own length, which is ~28 bytes out of a megabyte.
  const overheadBytes = documentNameSize(uid ?? '') + 32;
  const bytes = fieldBytes + overheadBytes;

  for (const section of sections) section.share = fieldBytes > 0 ? section.bytes / fieldBytes : 0;

  const fraction = bytes / FIRESTORE_DOC_LIMIT_BYTES;
  return {
    bytes,
    limitBytes: FIRESTORE_DOC_LIMIT_BYTES,
    fraction,
    level: fraction >= CRITICAL_AT ? 'critical' : fraction >= WARN_AT ? 'warn' : 'ok',
    sections,
    overheadBytes,
  };
}

/**
 * Binary units, labelled the short way. The cap itself is a power of two, so
 * counting in thousands would put "1 MB" 48 KB before the document actually
 * breaks — the one place this number must not be reassuring.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
