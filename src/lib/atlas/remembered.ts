/**
 * Which notes a turn saved (29-1P15b, idea 94): the "Remembered" chip under a
 * reply. Pure; the chat and the side panel both ask it.
 *
 * Atlas saves a note with one of two tools from its catalog drawer
 * (`atlas/src/memory/catalogTools.ts`): `write_note` writes a whole note,
 * `append_note` adds a line to one. Only a call that landed counts — a failed
 * one saved nothing, and a write Ask-first or Planning held back (`data.held`)
 * has not happened yet.
 */
import type { AgentToolCall } from '../agent/types';

const SAVES_A_NOTE = new Set(['write_note', 'append_note']);

/** The notes these calls saved, each once, in the order first saved. */
export function rememberedNotes(calls: ReadonlyArray<Pick<AgentToolCall, 'name' | 'ok' | 'args' | 'data'>>): string[] {
  const out: string[] = [];
  for (const call of calls) {
    if (!SAVES_A_NOTE.has(call.name) || !call.ok) continue;
    const data = isRecord(call.data) ? call.data : undefined;
    if (data?.held === true) continue;
    /* The path Atlas wrote to, which it may have tidied (a folder added, `.md`
       added); the one the model asked for only when it says nothing. */
    const path = stringOf(data?.path) ?? stringOf(call.args?.path);
    if (path !== undefined && !out.includes(path)) out.push(path);
  }
  return out;
}

/** `people/rahul-mehta.md` -> `Rahul mehta`: the note as he would say it. */
export function noteName(path: string): string {
  const file = path.split('/').pop() ?? path;
  const words = file.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim();
  if (words === '') return path;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Where the chip goes: the Catalog, open on that note. */
export function catalogLink(path: string): string {
  return `/catalog?note=${encodeURIComponent(path)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
