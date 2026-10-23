import { useMemo } from 'react';
import { auth } from '../firebase';
import { useAtlasStore } from './atlasStore';
import {
  AtlasMemoryUnavailable,
  deleteNote,
  deleteSkill,
  fetchApprovals,
  fetchCatalog,
  fetchConversation,
  fetchConversations,
  fetchLog,
  fetchNote,
  fetchSkill,
  fetchSkillFile,
  fetchSkills,
  saveNote,
  saveSkill,
  setSkillEnabled,
  type AtlasApprovalsIndex,
  type AtlasConversation,
  type AtlasConversationSummary,
  type AtlasLogIndex,
  type AtlasLogScope,
  type AtlasSkill,
  type AtlasSkillHeader,
  type AtlasSkillsIndex,
  type CatalogIndex,
  type CatalogNote,
} from './client';
import { COLLECTIONS, readAll, readOne, writeFromApp } from './cloudMemory';
import {
  approvalsIndexOf,
  catalogIndexOf,
  conversationListOf,
  editedNoteRecord,
  editedSkillRecord,
  isoDay,
  logIndexOf,
  noteOf,
  parseConversationBody,
  parseNoteRecord,
  parseSkillRecord,
  skillsIndexOf,
  splitNotePath,
} from './cloudMemoryModel';

/**
 * Where a memory screen reads from: the laptop, or the cloud copy (BIG-4).
 *
 * **The laptop whenever it is awake** — it is the one that thinks, and its
 * routes are what every screen was built on. **The cloud copy when it is
 * asleep**, which is the whole of BIG-4: Shreekant's call was that with the
 * lid shut the tablet reads the notes, the chats, the skills, the log and the
 * tray, and can edit notes and skills. While the probe is still in flight the
 * answer is `null`, so a screen does not flash the cloud copy and then swap.
 *
 * The cloud copy needs a real signed-in account. The screenshot harness's
 * stand-in user never signs in to Firebase, so under it this is `null` with
 * the lid shut and every screen draws its asleep state exactly as before.
 */
export type MemorySource = { kind: 'laptop'; baseUrl: string } | { kind: 'cloud'; uid: string };

export function useMemorySource(): MemorySource | null {
  const status = useAtlasStore((s) => s.status);
  const baseUrl = useAtlasStore((s) => s.baseUrl);
  const uid = status === 'asleep' ? (auth.currentUser?.uid ?? null) : null;
  // One object per answer, so an effect keyed on the source runs when the
  // answer changes and not on every render.
  return useMemo<MemorySource | null>(() => {
    if (status === 'awake' && baseUrl !== null) return { kind: 'laptop', baseUrl };
    if (uid !== null) return { kind: 'cloud', uid };
    return null;
  }, [status, baseUrl, uid]);
}

const nowIso = () => new Date().toISOString();

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function loadCatalog(source: MemorySource, signal?: AbortSignal): Promise<CatalogIndex> {
  if (source.kind === 'laptop') return fetchCatalog(source.baseUrl, signal);
  return catalogIndexOf(await readAll(source.uid, COLLECTIONS.notes), Date.now());
}

export async function loadNote(source: MemorySource, path: string, signal?: AbortSignal): Promise<CatalogNote> {
  if (source.kind === 'laptop') return fetchNote(source.baseUrl, path, signal);
  const found = await readOne(source.uid, COLLECTIONS.notes, path);
  const record = found === null ? null : parseNoteRecord(found);
  if (record === null) throw new AtlasMemoryUnavailable(`There is no note at ${path}.`, false);
  return noteOf(record, Date.now());
}

export async function storeNote(
  source: MemorySource,
  note: { path: string; body: string; trigger?: string },
): Promise<CatalogNote> {
  if (source.kind === 'laptop') return saveNote(source.baseUrl, note);
  if (splitNotePath(note.path) === null) {
    throw new AtlasMemoryUnavailable(`"${note.path}" is not a valid note path — it must be folder/name.md.`, false);
  }
  const found = await readOne(source.uid, COLLECTIONS.notes, note.path);
  const record = editedNoteRecord(found === null ? null : parseNoteRecord(found), note, nowIso());
  await writeFromApp(source.uid, COLLECTIONS.notes, {
    id: record.path,
    json: JSON.stringify(record),
    updatedAt: record.writtenAt,
  });
  return noteOf(record, Date.now());
}

export async function removeNote(source: MemorySource, path: string): Promise<void> {
  if (source.kind === 'laptop') return deleteNote(source.baseUrl, path);
  // A tombstone, so the laptop's backup does not put it back when it wakes.
  await writeFromApp(source.uid, COLLECTIONS.notes, { id: path, json: '', updatedAt: nowIso(), deleted: true });
}

// ─── Chats ──────────────────────────────────────────────────────────────────

export async function loadConversations(
  source: MemorySource,
  query: string,
  signal?: AbortSignal,
): Promise<AtlasConversationSummary[]> {
  if (source.kind === 'laptop') return fetchConversations(source.baseUrl, query, signal);
  const summaries = await readAll(source.uid, COLLECTIONS.chats);
  // Transcripts are downloaded only to search them, as the laptop searches them.
  const bodies = query.trim() === '' ? null : await readAll(source.uid, COLLECTIONS.chatBodies);
  return conversationListOf(summaries, query, bodies);
}

export async function loadConversation(source: MemorySource, id: string, signal?: AbortSignal): Promise<AtlasConversation> {
  if (source.kind === 'laptop') return fetchConversation(source.baseUrl, id, signal);
  const found = await readOne(source.uid, COLLECTIONS.chatBodies, id);
  const conversation = found === null ? null : parseConversationBody(found);
  if (conversation === null) throw new AtlasMemoryUnavailable('That chat is not in the cloud copy.', false);
  return conversation;
}

// ─── Skills ─────────────────────────────────────────────────────────────────

export async function loadSkills(source: MemorySource, signal?: AbortSignal): Promise<AtlasSkillsIndex> {
  if (source.kind === 'laptop') return fetchSkills(source.baseUrl, signal);
  return skillsIndexOf(await readAll(source.uid, COLLECTIONS.skills));
}

async function cloudSkill(uid: string, name: string) {
  const found = await readOne(uid, COLLECTIONS.skills, name);
  const record = found === null ? null : parseSkillRecord(found);
  if (record === null) throw new AtlasMemoryUnavailable(`There is no skill called ${name}.`, false);
  return record;
}

export async function loadSkill(source: MemorySource, name: string, signal?: AbortSignal): Promise<AtlasSkill> {
  if (source.kind === 'laptop') return fetchSkill(source.baseUrl, name, signal);
  return (await cloudSkill(source.uid, name)).skill;
}

export async function loadSkillFile(
  source: MemorySource,
  skill: string,
  file: string,
  signal?: AbortSignal,
): Promise<{ file: string; text: string }> {
  if (source.kind === 'laptop') return fetchSkillFile(source.baseUrl, skill, file, signal);
  const text = (await cloudSkill(source.uid, skill)).texts[file];
  if (text === undefined) {
    throw new AtlasMemoryUnavailable(`${file} is on the laptop only — open it when the laptop is awake.`, false);
  }
  return { file, text };
}

export async function storeSkill(
  source: MemorySource,
  skill: { name: string; description: string; body: string },
): Promise<AtlasSkill> {
  if (source.kind === 'laptop') return saveSkill(source.baseUrl, skill);
  const found = await readOne(source.uid, COLLECTIONS.skills, skill.name);
  const record = editedSkillRecord(found === null ? null : parseSkillRecord(found), skill, nowIso());
  if ('error' in record) throw new AtlasMemoryUnavailable(record.error, false);
  await writeFromApp(source.uid, COLLECTIONS.skills, {
    id: record.skill.name,
    json: JSON.stringify(record),
    updatedAt: record.skill.updatedAt,
  });
  return record.skill;
}

export async function switchSkill(source: MemorySource, name: string, enabled: boolean): Promise<AtlasSkillHeader> {
  if (source.kind === 'laptop') return setSkillEnabled(source.baseUrl, name, enabled);
  const record = await cloudSkill(source.uid, name);
  const at = nowIso();
  const next = { ...record, skill: { ...record.skill, enabled, updatedAt: at } };
  await writeFromApp(source.uid, COLLECTIONS.skills, { id: name, json: JSON.stringify(next), updatedAt: at });
  const { body: _body, ...header } = next.skill;
  void _body;
  return header;
}

export async function removeSkill(source: MemorySource, name: string): Promise<void> {
  if (source.kind === 'laptop') return deleteSkill(source.baseUrl, name);
  await writeFromApp(source.uid, COLLECTIONS.skills, { id: name, json: '', updatedAt: nowIso(), deleted: true });
}

// ─── The log and the tray: read-only with the lid shut ──────────────────────

export async function loadLog(source: MemorySource, scope: AtlasLogScope, signal?: AbortSignal): Promise<AtlasLogIndex> {
  if (source.kind === 'laptop') return fetchLog(source.baseUrl, scope, signal);
  return logIndexOf(await readAll(source.uid, COLLECTIONS.log), scope, isoDay(new Date()));
}

export async function loadApprovals(source: MemorySource, signal?: AbortSignal): Promise<AtlasApprovalsIndex> {
  if (source.kind === 'laptop') return fetchApprovals(source.baseUrl, signal);
  return approvalsIndexOf(await readAll(source.uid, COLLECTIONS.approvals));
}
