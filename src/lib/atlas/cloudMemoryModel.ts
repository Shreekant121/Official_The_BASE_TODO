import type {
  AtlasApproval,
  AtlasApprovalsIndex,
  AtlasConversation,
  AtlasConversationSummary,
  AtlasLogIndex,
  AtlasLogScope,
  AtlasLogTurn,
  AtlasSkill,
  AtlasSkillHeader,
  AtlasSkillsIndex,
  CatalogIndex,
  CatalogNote,
  CatalogNoteHeader,
} from './client';

/**
 * Atlas's memory as the cloud copy holds it, turned into exactly what each
 * screen already draws (BIG-4).
 *
 * Atlas keeps its notes, chats, skills, action log and "Waiting for you" tray
 * in Firestore beside the files on the laptop, under `users/{uid}/atlas*`
 * (`atlas/src/cloud/`). With the lid shut the tablet reads them from there.
 * **This module is the only place that knows the records' shape**, and it is
 * pure — no Firebase, no clock of its own — so every conversion is tested, and
 * the screens keep drawing the same types they draw from the laptop's routes.
 *
 * What each record is, written once here and in `atlas/src/cloud/sync.ts`:
 * - `atlasNotes/{path}` — a `NoteRecord`: the note plus its bookkeeping.
 * - `atlasChats/{id}` — `ConversationSummary`, small; `atlasChatBodies/{id}`
 *   — the whole conversation, fetched only when a chat is opened.
 * - `atlasSkills/{name}` — `{ skill, texts, writtenAt, writtenBy }`.
 * - `atlasLog/{day}/{turnId}` — `{ day, turn }`, the screen's view of a turn
 *   with no undo payload (that never leaves the laptop).
 * - `atlasApprovals/{id}` — the approval as the tray draws it.
 *
 * Every document carries `json` (the record), `updatedAt`, `by` (`laptop` or
 * `app`) and `deleted` — a tombstone, so a note deleted here is not put back
 * by the laptop's backup the next time Atlas starts.
 */

/** What a document holds, once any parts are joined back together. */
export interface CloudDoc {
  id: string;
  json: string;
  updatedAt: string;
  by: 'laptop' | 'app';
  deleted: boolean;
}

export interface NoteRecord {
  path: string;
  trigger: string;
  body: string;
  writtenAt: string;
  writtenBy: 'atlas' | 'you';
  opens: number;
  lastOpenedAt: string | null;
}

export interface SkillRecord {
  skill: AtlasSkill;
  texts: Record<string, string>;
  writtenAt: string | null;
  writtenBy: 'atlas' | 'you' | null;
}

/**
 * What the screens print where they would print a folder on the laptop.
 * `CatalogPage` and `SkillsPage` draw `root` as a kicker; with the lid shut it
 * says where the page is being read from instead.
 */
export const CLOUD_ROOT = 'The cloud copy — the laptop is asleep';

/** §4.4's four folders, which Atlas creates empty. The Catalog screen lists them even with nothing in them. */
const STARTING_FOLDERS = ['people', 'projects', 'preferences', 'how-to'];
const STALE_AFTER_DAYS = 21;
const MEMORY_BUDGET = 40;
const UNDO_RETENTION_DAYS = 30;

function parse<T>(json: string): T | null {
  try {
    const value: unknown = JSON.parse(json);
    return typeof value === 'object' && value !== null ? (value as T) : null;
  } catch {
    return null;
  }
}

function live(docs: CloudDoc[]): CloudDoc[] {
  return docs.filter((doc) => !doc.deleted && doc.json !== '');
}

function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

// ─── Notes ──────────────────────────────────────────────────────────────────

/** `folder/name.md`, with the same refusals Atlas makes (`catalog.ts` `splitPath`). */
export function splitNotePath(path: string): { folder: string; name: string } | null {
  const parts = path.split('/');
  if (parts.length !== 2) return null;
  const [folder, name] = parts;
  const safe = (segment: string) =>
    segment !== '' && segment !== '.' && segment !== '..' && !/[\\/\0:*?"<>|]/.test(segment) && !segment.startsWith('.');
  if (!safe(folder) || !safe(name) || !name.endsWith('.md') || name === '.md') return null;
  return { folder, name };
}

export function parseNoteRecord(doc: CloudDoc): NoteRecord | null {
  if (doc.deleted) return null;
  const record = parse<Partial<NoteRecord>>(doc.json);
  if (!record || typeof record.path !== 'string' || splitNotePath(record.path) === null) return null;
  if (typeof record.body !== 'string' || typeof record.writtenAt !== 'string') return null;
  return {
    path: record.path,
    trigger: typeof record.trigger === 'string' ? record.trigger : '',
    body: record.body,
    writtenAt: record.writtenAt,
    writtenBy: record.writtenBy === 'atlas' ? 'atlas' : 'you',
    opens: typeof record.opens === 'number' ? record.opens : 0,
    lastOpenedAt: typeof record.lastOpenedAt === 'string' ? record.lastOpenedAt : null,
  };
}

export function noteOf(record: NoteRecord, now: number): CatalogNote {
  const { folder, name } = splitNotePath(record.path) ?? { folder: '', name: record.path };
  const lastOpened = record.lastOpenedAt === null ? null : Date.parse(record.lastOpenedAt);
  return {
    path: record.path,
    folder,
    name,
    trigger: record.trigger,
    body: record.body,
    bytes: utf8Bytes(record.body),
    // Bullet lines, as Atlas counts them against the forty.
    memories: record.body.split('\n').filter((line) => /^\s*[-*]\s+\S/.test(line)).length,
    updatedAt: record.writtenAt,
    author: record.writtenBy,
    opens: record.opens,
    lastOpenedAt: record.lastOpenedAt,
    stale: lastOpened === null || now - lastOpened > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
  };
}

function headerOf(note: CatalogNote): CatalogNoteHeader {
  const { body: _body, ...header } = note;
  void _body;
  return header;
}

export function catalogIndexOf(docs: CloudDoc[], now: number): CatalogIndex {
  const notes = docs
    .map(parseNoteRecord)
    .filter((record): record is NoteRecord => record !== null)
    .map((record) => noteOf(record, now))
    .sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
  const folders = [...new Set([...STARTING_FOLDERS, ...notes.map((note) => note.folder)])].sort();
  return {
    root: CLOUD_ROOT,
    folders,
    notes: notes.map(headerOf),
    memories: notes.reduce((total, note) => total + note.memories, 0),
    budget: MEMORY_BUDGET,
  };
}

/**
 * The record a note edited with the lid shut is saved as. `by: 'app'` and a
 * `writtenAt` of now are what make the laptop take it when it wakes.
 */
export function editedNoteRecord(
  existing: NoteRecord | null,
  edit: { path: string; body: string; trigger?: string },
  nowIso: string,
): NoteRecord {
  return {
    path: edit.path,
    trigger: edit.trigger ?? existing?.trigger ?? '',
    body: edit.body,
    writtenAt: nowIso,
    writtenBy: 'you',
    opens: existing?.opens ?? 0,
    lastOpenedAt: existing?.lastOpenedAt ?? null,
  };
}

// ─── Chats ──────────────────────────────────────────────────────────────────

export function parseSummary(doc: CloudDoc): AtlasConversationSummary | null {
  if (doc.deleted) return null;
  const summary = parse<Partial<AtlasConversationSummary>>(doc.json);
  if (!summary || typeof summary.id !== 'string' || typeof summary.title !== 'string') return null;
  return {
    id: summary.id,
    title: summary.title,
    untitled: summary.untitled === true,
    pinned: summary.pinned === true,
    createdAt: typeof summary.createdAt === 'string' ? summary.createdAt : doc.updatedAt,
    updatedAt: typeof summary.updatedAt === 'string' ? summary.updatedAt : doc.updatedAt,
    messages: typeof summary.messages === 'number' ? summary.messages : 0,
    compactions: typeof summary.compactions === 'number' ? summary.compactions : 0,
  };
}

export function parseConversationBody(doc: CloudDoc): AtlasConversation | null {
  if (doc.deleted) return null;
  const body = parse<Record<string, unknown>>(doc.json);
  if (!body || typeof body.id !== 'string' || typeof body.title !== 'string' || !Array.isArray(body.history)) return null;
  // Handed over as the laptop's own route hands it over — the stored
  // conversation, unchanged — so a chat reads the same from either.
  return { ...body, activeSkill: typeof body.activeSkill === 'string' ? body.activeSkill : null } as unknown as AtlasConversation;
}

/** Does this chat say `needle` anywhere a person wrote or read it? Tool calls are skipped, as Atlas skips them. */
export function conversationMentions(conversation: AtlasConversation, needle: string): boolean {
  if (conversation.title.toLowerCase().includes(needle)) return true;
  return conversation.history.some((message) =>
    (message.parts as { type: string; text?: string }[]).some(
      (part) => part.type === 'text' && typeof part.text === 'string' && part.text.toLowerCase().includes(needle),
    ),
  );
}

/**
 * The list, ordered as Atlas orders it: pinned first, then newest, then id.
 * `bodies` is passed only when searching — a search reads the transcripts, as
 * it does on the laptop, and the list alone never downloads one.
 */
export function conversationListOf(
  docs: CloudDoc[],
  query: string,
  bodies: CloudDoc[] | null,
): AtlasConversationSummary[] {
  const rows = docs
    .map(parseSummary)
    .filter((summary): summary is AtlasConversationSummary => summary !== null)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
    });
  const needle = query.trim().toLowerCase();
  if (needle === '') return rows;
  const byId = new Map(
    (bodies ?? [])
      .map(parseConversationBody)
      .filter((body): body is AtlasConversation => body !== null)
      .map((body) => [body.id, body]),
  );
  return rows.filter((row) => {
    const body = byId.get(row.id);
    return body ? conversationMentions(body, needle) : row.title.toLowerCase().includes(needle);
  });
}

// ─── Skills ─────────────────────────────────────────────────────────────────

/** Atlas's `slugifySkillName`: the folder a skill made here will be written to. */
export function slugifySkillName(raw: string): string {
  const base = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base === '' ? 'skill' : base;
}

export function parseSkillRecord(doc: CloudDoc): SkillRecord | null {
  if (doc.deleted) return null;
  const record = parse<Partial<SkillRecord>>(doc.json);
  const skill = record?.skill;
  if (!record || !skill || typeof skill.name !== 'string' || typeof skill.body !== 'string') return null;
  return {
    skill: { ...skill, files: Array.isArray(skill.files) ? skill.files : [] },
    texts: typeof record.texts === 'object' && record.texts !== null ? record.texts : {},
    writtenAt: typeof record.writtenAt === 'string' ? record.writtenAt : null,
    writtenBy: record.writtenBy === 'atlas' || record.writtenBy === 'you' ? record.writtenBy : null,
  };
}

export function skillsIndexOf(docs: CloudDoc[]): AtlasSkillsIndex {
  const skills: AtlasSkillHeader[] = docs
    .map(parseSkillRecord)
    .filter((record): record is SkillRecord => record !== null)
    .map((record) => {
      const { body: _body, ...header } = record.skill;
      void _body;
      return header;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { root: CLOUD_ROOT, skills, enabled: skills.filter((skill) => skill.enabled).length, skillFile: 'SKILL.md' };
}

/** A skill written or rewritten with the lid shut. The same refusals as Atlas's `PUT /skills`. */
export function editedSkillRecord(
  existing: SkillRecord | null,
  edit: { name: string; description: string; body: string },
  nowIso: string,
): SkillRecord | { error: string } {
  if (edit.name.trim() === '') return { error: 'A skill needs a name.' };
  const description = edit.description.trim();
  if (description === '') {
    return { error: 'A skill needs a description saying when it applies. Without one Atlas can never load it.' };
  }
  if (edit.body.trim() === '') return { error: 'A skill needs a body — the instructions themselves.' };
  const name = slugifySkillName(edit.name);
  const base = existing?.skill;
  return {
    skill: {
      name,
      declaredName: name,
      description,
      body: edit.body,
      files: base?.files ?? [],
      bytes: utf8Bytes(edit.body) + Object.values(existing?.texts ?? {}).reduce((total, text) => total + utf8Bytes(text), 0),
      enabled: base?.enabled ?? true,
      uses: base?.uses ?? 0,
      lastUsedAt: base?.lastUsedAt ?? null,
      updatedAt: nowIso,
      author: 'you',
      valid: true,
      problem: null,
    },
    texts: existing?.texts ?? {},
    writtenAt: nowIso,
    writtenBy: 'you',
  };
}

// ─── The action log ─────────────────────────────────────────────────────────

/** `YYYY-MM-DD` in this device's zone — the tablet and the laptop share one. */
export function isoDay(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The first day `7 days` covers: today and the six before it, by the
 * calendar, done on the date alone in UTC so no day is 23 or 25 hours long.
 * It was the seven most recent days with anything in them, which on a quiet
 * month reached back weeks (OPT-2). Atlas's own route has the same rule
 * (`atlas/src/routes/log.ts`).
 */
export function weekStartOf(today: string): string {
  const at = new Date(`${today}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() - 6);
  return at.toISOString().slice(0, 10);
}

export function logIndexOf(docs: CloudDoc[], scope: AtlasLogScope, today: string): AtlasLogIndex {
  const byDay = new Map<string, AtlasLogTurn[]>();
  for (const doc of live(docs)) {
    const record = parse<{ day?: unknown; turn?: AtlasLogTurn; undo?: unknown }>(doc.json);
    if (!record || typeof record.day !== 'string' || !record.turn || !Array.isArray(record.turn.entries)) continue;
    const turns = byDay.get(record.day) ?? [];
    /* BIG-12: a turn Atlas ran here with the lid shut keeps its undo beside
       the view (`atlas/src/browser/engine.ts`), and only such a turn can be
       reverted from the tablet. The tokens themselves stay in the record. */
    turns.push(typeof record.undo === 'object' && record.undo !== null ? { ...record.turn, revertibleHere: true } : record.turn);
    byDay.set(record.day, turns);
  }
  const allDays = [...byDay.keys()].sort().reverse();
  const weekStart = weekStartOf(today);
  const inScope =
    scope === 'today'
      ? allDays.filter((day) => day === today)
      : scope === 'week'
        ? allDays.filter((day) => day >= weekStart)
        : allDays;
  const days = inScope.map((day) => ({
    day,
    // Newest turn first within a day, as the laptop's route sends them.
    turns: (byDay.get(day) ?? []).sort((a, b) => b.at.localeCompare(a.at)),
  }));
  const todays = (byDay.get(today) ?? []).flatMap((turn) => turn.entries);
  return {
    days,
    today,
    counts: {
      entries: todays.length,
      undoable: todays.filter((entry) => entry.undoable).length,
      frontDoor: [...byDay.values()].flat().flatMap((turn) => turn.entries).filter((entry) => entry.frontDoor).length,
    },
    undoRetentionDays: UNDO_RETENTION_DAYS,
  };
}

// ─── The tray ───────────────────────────────────────────────────────────────

export function approvalsIndexOf(docs: CloudDoc[]): AtlasApprovalsIndex {
  const approvals = live(docs)
    .map((doc) => parse<AtlasApproval>(doc.json))
    .filter((approval): approval is AtlasApproval => approval !== null && typeof approval.id === 'string')
    // Newest first, as the laptop keeps them.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { approvals, waiting: approvals.filter((approval) => approval.state === 'waiting').length };
}
