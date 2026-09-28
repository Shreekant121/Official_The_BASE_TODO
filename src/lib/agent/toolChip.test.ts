import { describe, expect, it } from 'vitest';
import { describeToolCall } from './toolChip';
import type { AgentToolCall } from './types';

/**
 * The seven tools the in-browser agent cannot call (item 9D).
 *
 * `fallbackTools` is eight and `mcpTools` is fifteen, so until Atlas put its
 * tool calls on the wire these seven names had never reached `toolChip.ts` at
 * all. They fell to its `default` branch, which renders a name with its
 * underscores knocked out under a `file-text` glyph — so a `delete_task`
 * arrived in the changes container as the words *"delete task"* beside a
 * document. That is not a chip that failed to be pretty; it is a destructive
 * action drawn as something else.
 *
 * These pin the two claims that matter and cannot be seen from a screenshot:
 * the glyph a chip asks for, and **which half of a turn it lands in** —
 * `wrote` is read from the registry's own `mutates` flag rather than a list
 * kept in that file, and this is what proves the registry actually answers for
 * the MCP-only half.
 */

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-03-12T10:00:00+05:30');

function call(over: Partial<AgentToolCall> & Pick<AgentToolCall, 'name'>): AgentToolCall {
  return { args: {}, ok: true, summary: '', durationMs: 5, ...over };
}

describe('describeToolCall — the MCP-only tools', () => {
  it('draws list_projects as a read with a count, not as its own summary sentence', () => {
    /*
     * Item 14 added the tool; without a case here it falls to `default`, which
     * prints the model-facing `summary` on Shreekant's screen. Reads are not
     * the danger the `delete_task` case was written for, but it is the same
     * omission.
     */
    const chip = describeToolCall(
      call({
        name: 'list_projects',
        args: {},
        summary: "3 projects and 5 lists: Mutineer's Work (6 open), Level Ai (8 open), Skills (26 open). The ids here name…",
        data: {
          projects: [
            { id: 'p1', name: "Mutineer's Work", lists: [{ id: 'l1' }, { id: 'l2' }] },
            { id: 'p2', name: 'Level Ai', lists: [{ id: 'l3' }] },
            { id: 'p3', name: 'Skills', lists: [] },
          ],
          lists: [{ id: 'l9' }, { id: 'l10' }],
        },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('read');
    expect(chip.verb).toBe('Read the projects');
    expect(chip.detail).toBe('3 projects · 5 lists');
    expect(chip.wrote).toBe(false);
  });

  it('draws a deletion as a deletion, on the write side of the turn', () => {
    const chip = describeToolCall(
      call({
        name: 'delete_task',
        args: { taskId: 't-lease-scan' },
        summary: 'Deleted "Scan the signed lease for the file". It is in the Trash for 30 days.',
        data: { trashed: 1 },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('delete');
    expect(chip.icon).not.toBe('read');
    expect(chip.verb).toBe('Deleted');
    expect(chip.subject).toBe('Scan the signed lease for the file');
    // The registry's `mutates` flag, not a list in `toolChip.ts` — this is what
    // puts it in the container that owns the undo rather than beside a read.
    expect(chip.wrote).toBe(true);
  });

  it('counts what a restore had to reroute, because a rebuilt chain is the interesting half', () => {
    const chip = describeToolCall(
      call({
        name: 'restore_from_trash',
        args: { entryId: 'e-1' },
        summary: 'Restored "Countersign the studio lease".',
        // ITEM 13D — the rows are a list now, one per entry restored.
        data: { done: 1, entries: [{ entryId: 'e-1', title: 'x', reroutedTaskIds: ['t-a', 't-b'] }] },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('restore');
    expect(chip.verb).toBe('Restored');
    expect(chip.detail).toBe('2 moved to Action Steps');
    expect(chip.wrote).toBe(true);
  });

  it('says nothing about rerouting when nothing was rerouted', () => {
    const chip = describeToolCall(
      call({
        name: 'restore_from_trash',
        summary: 'Restored "Sign the lease".',
        data: { reroutedTaskIds: [] },
      }),
      TZ,
      NOW,
    );
    expect(chip.detail).toBeUndefined();
  });

  it('reads the Trash without claiming to have changed it', () => {
    const chip = describeToolCall(
      call({ name: 'list_trash', summary: '3 in the Trash.', data: { entries: [{}, {}, {}], total: 3 } }),
      TZ,
      NOW,
    );
    expect(chip.icon).toBe('restore');
    expect(chip.detail).toBe('3 held');
    expect(chip.wrote).toBe(false);
  });

  it('names the step a new step went under', () => {
    const chip = describeToolCall(
      call({
        name: 'add_subtask',
        summary: 'Added "Upload the form" as a step of "File the paperwork".',
        data: { parentTitle: 'File the paperwork' },
      }),
      TZ,
      NOW,
    );
    expect(chip.icon).toBe('step');
    expect(chip.verb).toBe('Added a step');
    expect(chip.detail).toBe('File the paperwork');
    expect(chip.wrote).toBe(true);
  });

  it('spells a step edit as field → value, the way update_task does', () => {
    const chip = describeToolCall(
      call({
        name: 'update_subtask',
        args: { subtaskId: 's-1', deadline: '2026-03-13T18:00' },
        summary: 'Updated the step "Upload the form".',
        data: { changed: ['deadline'] },
      }),
      TZ,
      NOW,
    );
    expect(chip.icon).toBe('step');
    expect(chip.verb).toBe('Updated a step');
    expect(chip.detail).toBe('deadline → Fri 6pm');
  });

  it('says how many a removal took when a step owned steps of its own', () => {
    const one = describeToolCall(
      call({ name: 'remove_subtask', summary: 'Removed the step "Chase it".', data: { done: 1, subtasks: [{ removedCount: 1 }] } }),
      TZ,
      NOW,
    );
    const several = describeToolCall(
      call({ name: 'remove_subtask', summary: 'Removed the step "Chase it".', data: { done: 1, subtasks: [{ removedCount: 3 }] } }),
      TZ,
      NOW,
    );

    expect(one.verb).toBe('Removed a step');
    // "1 in all" beside a row already labelled as one removal is noise.
    expect(one.detail).toBeUndefined();
    expect(several.detail).toBe('3 in all');
  });

  it('counts the steps a read came back with', () => {
    const chip = describeToolCall(
      call({ name: 'list_subtasks', summary: '"File the paperwork" has 2 steps.', data: { done: 1, tasks: [{ subtasks: [{}, {}] }] } }),
      TZ,
      NOW,
    );
    expect(chip.icon).toBe('step');
    expect(chip.detail).toBe('2 steps');
    expect(chip.wrote).toBe(false);
  });

  it('puts a FAILED mutation on the read side, because it changed nothing', () => {
    const chip = describeToolCall(
      call({
        name: 'delete_task',
        ok: false,
        summary: '"Sign the lease" could not be deleted — it is no longer in the backlog. Nothing changed.',
      }),
      TZ,
      NOW,
    );

    // The failure branch has its own icon map; it must know these names too, or
    // a failed deletion reverts to the `read` glyph.
    expect(chip.icon).toBe('delete');
    expect(chip.wrote).toBe(false);
  });
});

/**
 * The web drawer (item 11).
 *
 * These two tools are the first ones this file has ever described that the
 * app's own registry does not contain — they come from Atlas's own MCP server,
 * not BASE. That makes `getTool(name)` return `undefined` for both, so
 * the `wrote` assertions below are load-bearing: they prove the registry lookup
 * degrades to "did not write" rather than to a crash or to the write side of
 * the turn.
 */
describe('describeToolCall — the web drawer', () => {
  it('names the page and its host, which is where the answer came from', () => {
    const chip = describeToolCall(
      call({
        name: 'fetch_url',
        args: { url: 'https://github.com/ollama/ollama', question: 'what is this project' },
        summary: 'GitHub - ollama/ollama — https://github.com/ollama/ollama\nRead on gemma4:e4b.',
        data: { url: 'https://github.com/ollama/ollama', title: 'GitHub - ollama/ollama', words: 1524, truncated: false, suspicious: false, readBy: 'gemma4:e4b' },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('link');
    expect(chip.verb).toBe('Read');
    expect(chip.subject).toBe('GitHub - ollama/ollama');
    expect(chip.detail).toBe('github.com · 1,524 words');
    // Not the app's tool, so the registry cannot answer for it — and "did not
    // write" is the right answer rather than an accident.
    expect(chip.wrote).toBe(false);
  });

  it('falls back to the host when a page has no title', () => {
    const chip = describeToolCall(
      call({
        name: 'fetch_url',
        args: { url: 'https://www.rfc-editor.org/rfc/rfc5545.txt' },
        summary: 'A page — https://www.rfc-editor.org/rfc/rfc5545.txt',
        data: { url: 'https://www.rfc-editor.org/rfc/rfc5545.txt', title: '', words: 42061, truncated: true },
      }),
      TZ,
      NOW,
    );

    // `www.` is never the distinguishing part of a host.
    expect(chip.subject).toBe('rfc-editor.org');
    expect(chip.detail).toBe('42,061 words · part read');
  });

  it('draws a page that tried to give Atlas instructions as a warning, not as a link', () => {
    const chip = describeToolCall(
      call({
        name: 'fetch_url',
        args: { url: 'https://seo.test/tips' },
        summary: '⚠ SUSPICIOUS: This page contains text that appears to be giving instructions to an assistant.',
        data: { url: 'https://seo.test/tips', title: 'Free tips', words: 300, truncated: false, suspicious: true },
      }),
      TZ,
      NOW,
    );

    // `atlas.html` draws exactly this event with `shield-alert`. The fact that
    // it is suspicious matters more at a glance than the fact that it was a read.
    expect(chip.icon).toBe('flag');
    expect(chip.detail).toContain('page tried to give instructions');
  });

  it('counts what a search came back with and names the engine', () => {
    const chip = describeToolCall(
      call({
        name: 'search_web',
        args: { query: 'rrule last friday of month' },
        summary: '2 results for "rrule last friday of month", from brave:',
        data: { query: 'rrule last friday of month', page: 1, provider: 'brave', more: true, suspicious: false, results: [{}, {}] },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('web');
    expect(chip.verb).toBe('Searched the web');
    expect(chip.subject).toBe('rrule last friday of month');
    expect(chip.detail).toBe('2 results · brave');
    expect(chip.wrote).toBe(false);
  });

  it('says which page of results it was, when it was not the first', () => {
    const chip = describeToolCall(
      call({ name: 'search_web', args: { query: 'x' }, data: { page: 2, provider: 'brave', results: [{}] } }),
      TZ,
      NOW,
    );
    expect(chip.detail).toBe('1 result · page 2 · brave');
  });

  it('flags a search RESULT that reads as an instruction, before any page is opened', () => {
    const chip = describeToolCall(
      call({
        name: 'search_web',
        args: { query: 'invoice help' },
        data: { page: 1, provider: 'brave', suspicious: true, results: [{}] },
      }),
      TZ,
      NOW,
    );

    expect(chip.icon).toBe('flag');
    expect(chip.detail).toContain('one looks like an instruction');
  });

  it('keeps the right glyph when a web call fails', () => {
    const search = describeToolCall(
      call({ name: 'search_web', ok: false, args: { query: 'x' }, summary: 'Atlas has no web-search key.' }),
      TZ,
      NOW,
    );
    const fetched = describeToolCall(
      call({ name: 'fetch_url', ok: false, args: { url: 'http://192.168.1.1/' }, summary: 'That is an address on this network.' }),
      TZ,
      NOW,
    );

    expect(search.icon).toBe('web');
    expect(fetched.icon).toBe('link');
    expect(fetched.detail).toContain('this network');
  });
});

/*
 * BUILD-3. Without these cases all six fall to `default`, and the two deletes
 * would be a project and every task in it drawn as a document read.
 */
describe('describeToolCall — projects and lists', () => {
  it('draws a created project with its list count, on the write side', () => {
    const chip = describeToolCall(
      call({
        name: 'create_project',
        summary: 'Created the project "Studio Launch" with 3 lists: "Research", "Design" and "Ship".',
        data: { done: 1, projects: [{ id: 'p1', name: 'Studio Launch', lists: [{}, {}, {}] }] },
      }),
      TZ,
      NOW,
    );
    expect(chip).toMatchObject({ icon: 'create', verb: 'Created the project', subject: 'Studio Launch', detail: '3 lists', wrote: true });
  });

  it('draws a rename with its new name', () => {
    const chip = describeToolCall(
      call({
        name: 'update_list',
        args: { listIds: ['l1'], title: 'Discovery' },
        summary: 'Renamed the list "Research" to "Discovery".',
        data: { done: 1, lists: [{ id: 'l1', name: 'Discovery' }] },
      }),
      TZ,
      NOW,
    );
    expect(chip).toMatchObject({ icon: 'update', verb: 'Renamed the list', subject: 'Research', detail: '→ Discovery' });
  });

  it('draws an approved project delete as a deletion into the Trash', () => {
    const chip = describeToolCall(
      call({
        name: 'delete_project',
        summary: 'Deleted the project "Home" and its 2 lists and 3 tasks. It stays in the Trash for 30 days.',
        data: { done: 1, projects: [{ id: 'p-home', name: 'Home' }] },
      }),
      TZ,
      NOW,
    );
    expect(chip).toMatchObject({ icon: 'delete', verb: 'Deleted the project', subject: 'Home', wrote: true });
    expect(chip.detail).toContain('to the Trash');
  });

  it('keeps the delete glyph on a delete that is waiting for a tap', () => {
    const chip = describeToolCall(
      call({ name: 'delete_list', ok: false, summary: 'Waiting for Shreekant. delete_list has NOT run.' }),
      TZ,
      NOW,
    );
    expect(chip).toMatchObject({ icon: 'delete', wrote: false });
  });
});
