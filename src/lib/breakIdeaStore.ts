/**
 * His break ideas on this device (29-1P11a, idea 104): what he changed about
 * the seed list, cached in localStorage so a break has an idea offline, and
 * synced to `users/{uid}/settings/breaks` by `breakIdeaSync.ts` — the dark
 * tint's pattern, and for its reason: `data/main` is rewritten whole by `mcp/`
 * and the tablet's page engine, which would wipe a field an older build does
 * not know. The arithmetic is `lib/breaks.ts`.
 */
import { useSyncExternalStore } from 'react';
import { BREAK_IDEA_SEED } from './breakIdeaSeed';
import {
  addIdea, ideasOf, NO_EDITS, readEdits, removeIdea, restoreSeed, type BreakIdea, type BreakIdeaEdits,
} from './breaks';

const KEY = 'base.breakIdeas';

type Listener = (edits: BreakIdeaEdits, fromHere: boolean) => void;
const listeners = new Set<Listener>();

function load(): BreakIdeaEdits {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? readEdits(JSON.parse(raw)) : NO_EDITS;
  } catch {
    return NO_EDITS;
  }
}

let edits: BreakIdeaEdits = typeof window === 'undefined' ? NO_EDITS : load();
let ideas: BreakIdea[] = ideasOf(BREAK_IDEA_SEED, edits);

function put(next: BreakIdeaEdits, fromHere: boolean): void {
  if (next === edits) return;
  edits = next;
  ideas = ideasOf(BREAK_IDEA_SEED, edits);
  try {
    localStorage.setItem(KEY, JSON.stringify(edits));
  } catch {
    /* A private window: the edit holds for this visit. */
  }
  for (const fn of listeners) fn(edits, fromHere);
}

export function subscribeBreakIdeas(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getBreakIdeaEdits(): BreakIdeaEdits {
  return edits;
}

/** His list as it shows: his own first, then the seed less what he removed. */
export function getBreakIdeas(): BreakIdea[] {
  return ideas;
}

/** The other device's copy, arriving from the cloud. Not written back. */
export function adoptBreakIdeaEdits(raw: unknown): void {
  const next = readEdits(raw);
  if (JSON.stringify(next) === JSON.stringify(edits)) return;
  put(next, false);
}

export function addBreakIdea(text: string): void {
  put(addIdea(BREAK_IDEA_SEED, edits, text, `u${Date.now().toString(36)}`), true);
}

export function removeBreakIdea(id: string): void {
  put(removeIdea(BREAK_IDEA_SEED, edits, id), true);
}

export function restoreBreakIdeas(): void {
  put(restoreSeed(edits), true);
}

const subscribe = (fn: () => void) => subscribeBreakIdeas(fn);

/** His list, live. */
export function useBreakIdeas(): BreakIdea[] {
  return useSyncExternalStore(subscribe, getBreakIdeas, getBreakIdeas);
}

/** What he changed, live (Settings' "Put back" needs the count). */
export function useBreakIdeaEdits(): BreakIdeaEdits {
  return useSyncExternalStore(subscribe, getBreakIdeaEdits, getBreakIdeaEdits);
}
