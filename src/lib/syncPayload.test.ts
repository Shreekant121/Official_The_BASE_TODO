import { describe, expect, it } from 'vitest';
import { buildSyncPayload, hydrateFromPayload, type SyncPayload } from './syncPayload';
import { DEFAULT_LISTS } from '../store/useStore';

/**
 * The cloud document's defaults, pinned.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ----------------------------
 * These look like ordinary `??` fallbacks and they are not, because **two
 * programs read this document and both write the whole thing back**: the
 * browser over `onSnapshot`, and `mcp/` on the laptop with the Admin SDK
 * (item 9). A default that disagrees between them does not read oddly — the
 * next save overwrites the real value with the wrong one.
 *
 * That is not hypothetical. An early draft of the MCP server defaulted
 * `sessionDuration` to `0` where the app defaults it to four hours, which
 * would have set Shreekant's focus session to nothing on the first thing Atlas
 * saved. The number below is what stops that recurring.
 */

const EMPTY: SyncPayload = {
  taskLists: [],
  backlogTasks: [],
  tasks: [],
  sessionDuration: 0,
  taskTimeMemory: {},
  projects: [],
};

/** A document holding only what an old client would have written. */
function sparse(): SyncPayload {
  return { taskLists: [{ id: 'action', title: 'Action Steps' }], backlogTasks: [], tasks: [] } as unknown as SyncPayload;
}

describe('hydrateFromPayload', () => {
  it('defaults a missing session length to four hours, not to zero', () => {
    // The one that overwrites real data if it drifts. See the note above.
    expect(hydrateFromPayload(sparse()).sessionDuration).toBe(14400);
  });

  it('keeps a real session length rather than defaulting over it', () => {
    expect(hydrateFromPayload({ ...sparse(), sessionDuration: 3600 }).sessionDuration).toBe(3600);
  });

  it('falls back to the three built-in lists only when there are none', () => {
    expect(hydrateFromPayload({ ...EMPTY, taskLists: [] }).taskLists).toEqual(DEFAULT_LISTS);
    expect(hydrateFromPayload(sparse()).taskLists).toHaveLength(1);
  });

  it('supplies the optional slices rather than leaving them undefined', () => {
    const state = hydrateFromPayload(sparse());
    // `buildSyncPayload` writes every one of these straight back out, and
    // Firestore rejects an `undefined` value — one of these missing would take
    // the whole document push down with it.
    expect(state.projects).toEqual([]);
    expect(state.taskTimeMemory).toEqual({});
    expect(state.focusLog).toEqual([]);
    expect(state.tasks).toEqual([]);
  });

  it('upgrades a pre-merge scoring shape instead of reading it as a zero', () => {
    /*
     * This document carries no schema version, so the persist migration never
     * sees it. A task scored under the old two-field shape must come back with
     * `humanOverride` set — reading it as an unset field would be one thing,
     * but reading it as *scored zero* empties Needs Attention.
     */
    const old = {
      ...sparse(),
      backlogTasks: [
        { id: 't1', title: 'Old', status: 'needsAction', eisenhowerQuadrant: 4, personalScore: 5 },
      ],
    } as unknown as SyncPayload;

    const [task] = hydrateFromPayload(old).backlogTasks;
    expect(task.humanOverride).toBe(9);
    expect((task as unknown as Record<string, unknown>).eisenhowerQuadrant).toBeUndefined();
  });

  it('round-trips: what it hydrates is what buildSyncPayload writes back', () => {
    // The property the two readers actually depend on. If hydrate invented a
    // value that build then wrote out, the document would change on every read
    // by a client that touched nothing.
    const document: SyncPayload = {
      taskLists: [{ id: 'action', title: 'Action Steps' }],
      backlogTasks: [],
      tasks: [],
      sessionDuration: 7200,
      taskTimeMemory: { t1: 30 },
      projects: [{ id: 'p1', name: 'Empire', color: '#7c3aed', createdAt: 0, order: 0 }],
      focusLog: [],
    };

    expect(buildSyncPayload(hydrateFromPayload(document))).toEqual(document);
  });
});
