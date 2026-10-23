import { looksLikeQuestion } from '../../lib/paletteSearch';

/**
 * OPT-9 — what a search with no match asks Atlas. *"The search function is
 * improved so Ai can help search things too if something is not there"* (his
 * BASE list), and his call was this box, on the AI page. A question is sent as
 * he typed it; a bare word or name is a thing he is looking for, so Atlas is
 * told where else it might be — his tasks and projects, and its own notes.
 * Pure, so the test can hold both halves.
 */
export function askAtlasText(query: string): string {
  const typed = query.trim().replace(/\s+/g, ' ');
  if (looksLikeQuestion(typed)) return typed;
  return `Find "${typed}" for me. No chat matches it, so look in my tasks, my projects and your notes.`;
}
