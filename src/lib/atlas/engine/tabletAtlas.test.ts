import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Task, type TaskList } from '../../../store/useStore';
import { useTrashStore } from '../../../store/useTrashStore';
import { useSnapshotStore } from '../../../store/useSnapshotStore';
import { createBrowserAtlas, type CloudChange, type CloudCollection, type CloudPort, type CloudRecord } from './atlasEngine.generated.js';
import { appToolSource } from './appToolSource';
import { splitUtf8 } from './cloudPort';

/**
 * BIG-12, the app's half, run for real: the committed engine bundle — Atlas's
 * own `runChat` — driving this app's actual store through the actual tool
 * handler the laptop's MCP server uses, with an undo token that survives a
 * "reload" through the cloud copy. The model is a script and the cloud is a
 * map; no network, no Firebase, no cloud call (the session protocol, rule 6).
 */

const LISTS: TaskList[] = [
  { id: 'l-marketing', title: 'Marketing', order: 0 },
  { id: 'action', title: 'Action Steps', order: 1 },
];
const BOARD: Task[] = [
  { id: 't-oil', title: 'Oil Hair', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 0, subtasks: [], createdAt: 1 },
];

beforeEach(() => {
  useStore.setState({ projects: [], taskLists: structuredClone(LISTS), backlogTasks: structuredClone(BOARD), tasks: [], focusLog: [] });
  useTrashStore.setState({ entries: [] });
  useSnapshotStore.getState().clearTurns();
});

/** Firestore, as the engine sees it, in a map. */
function memoryCloud(): CloudPort & { dump(name: string): CloudRecord[] } {
  const tables = new Map<string, Map<string, CloudRecord>>();
  const table = (name: string) => {
    let rows = tables.get(name);
    if (!rows) tables.set(name, (rows = new Map()));
    return rows;
  };
  return {
    dump: (name) => [...table(name).values()],
    collection: (name): CloudCollection => ({
      name,
      list: async () => [...table(name).values()],
      get: async (id) => table(name).get(id) ?? null,
      put: async (record) => {
        table(name).set(record.id, { ...record });
        return 'written';
      },
      remove: async (id) => {
        table(name).delete(id);
      },
      watch: (onChange: (change: CloudChange) => void) => {
        onChange({ records: [...table(name).values()], removed: [] });
        return () => undefined;
      },
    }),
    close: async () => undefined,
  };
}

const USAGE = { promptTokens: 1, responseTokens: 1, thoughtsTokens: 0, totalTokens: 2, requests: 1 };

/** A model that adds one task, then says so. */
function addsATask(title: string) {
  let round = 0;
  return () => ({
    name: 'script',
    async send() {
      round += 1;
      if (round === 1) {
        const call = { id: 'c1', name: 'create_task', args: { tasks: [{ title, list: 'Marketing' }] } };
        return { text: '', toolCalls: [call], message: { role: 'assistant', parts: [{ type: 'tool_call', ...call }] }, usage: USAGE };
      }
      return { text: 'Added.', toolCalls: [], message: { role: 'assistant', parts: [{ type: 'text', text: 'Added.' }] }, usage: USAGE };
    },
  });
}

const titles = () => useStore.getState().backlogTasks.map((task) => task.title);

describe('Atlas in the page, lid shut (BIG-12)', () => {
  it('adds a task through the real tool handler, logs it with its undo, and reverts it after a reload', async () => {
    const cloud = memoryCloud();
    // The basic assistant's own Revert history, which Atlas here must never touch.
    const ring = useSnapshotStore.getState();
    const own = ring.beginTurn('basic assistant turn');
    ring.captureTask(own, 't-oil');
    ring.commitTurn(own);

    const first = createBrowserAtlas({
      cloud,
      tools: [appToolSource()],
      onLine: () => undefined,
      transportFor: addsATask('Call the CA'),
    });
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    await first.chat(
      { message: 'add call the CA', model: 'anthropic:claude-sonnet-5', apiKey: 'k', timezone: 'Asia/Kolkata' },
      (event) => events.push(event as { type: string }),
      new AbortController().signal,
    );
    await first.flush();
    first.stop();

    expect(events.find((event) => event.type === 'error')).toBeUndefined();
    expect(titles()).toContain('Call the CA');
    expect(useSnapshotStore.getState().turns).toHaveLength(1);

    const [logged] = cloud.dump('atlasLog');
    const stored = JSON.parse(logged.json) as { day: string; turn: { id: string }; undo: Record<string, { server: string }> };
    expect(logged.by).toBe('app');
    expect(Object.values(stored.undo)[0].server).toBe('mutineer-os');

    // A reload: a new engine, an empty disk, the same cloud and the same store.
    const second = createBrowserAtlas({ cloud, tools: [appToolSource()], onLine: () => undefined });
    const result = await second.revert(stored.turn.id, stored.day);
    await second.flush();
    second.stop();

    expect(result.ok).toBe(true);
    expect(titles()).not.toContain('Call the CA');
    // Undoing a creation soft-deletes it: it is in the Trash, as on the laptop.
    expect(JSON.stringify(useTrashStore.getState().entries)).toContain('Call the CA');
    expect(useSnapshotStore.getState().turns).toHaveLength(1);
  });

  it('splits a record over the cap without cutting a character in half', () => {
    const text = 'ab₹'.repeat(10);
    const parts = splitUtf8(text, 7);
    expect(parts.join('')).toBe(text);
    for (const part of parts) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(7);
  });
});
