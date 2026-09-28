import type { AgentStoreState } from '../src/lib/agent/types';

/**
 * Shreekant always wins (item 13, DESIGN.md §5.4).
 *
 * THE PROBLEM, WHICH IS NOT THE ONE `withFreshState` ALREADY SOLVES
 * ------------------------------------------------------------------
 * `store.ts` re-reads the document before every tool call, so Atlas never
 * *writes* against a stale copy of the store. That is necessary and it is not
 * what §5.4 asks for. The section is about the gap between Atlas **deciding**
 * and Atlas **writing**:
 *
 * > *"Atlas re-reads before it writes: if the thing changed since Atlas decided
 * > to change it, Atlas stops and says so rather than overwriting."*
 *
 * A turn reads a task, the model spends nine seconds on a 4B laptop working
 * out what to change, Shreekant edits that same task on his tablet in the
 * meantime, and the write lands on top of him. Re-reading first does not help
 * — it makes the overwrite *tidier*, because Atlas now has his new value and
 * replaces it anyway. The only thing that helps is noticing.
 *
 * SO: WHAT ATLAS SAW, AND WHAT IS THERE NOW
 * -------------------------------------------
 * Every read records a fingerprint of each entity it returned. Every write
 * checks the entities it is about to touch against those fingerprints. A
 * mismatch is a refusal, in a sentence written for the model to pass on, and
 * the fingerprint is dropped — so asking again works, from what is there now.
 *
 * **Scoped to one turn**, which is why `turnId` travels in MCP's `_meta`. A
 * fingerprint from three turns ago would refuse a write Shreekant asked for
 * *because of* the change he made, which is the opposite of helpful. Within a
 * turn, "since Atlas decided" and "since Atlas read" are the same window.
 *
 * LOCKING WAS REJECTED, AND THIS IS WHY IT COULD BE
 * ---------------------------------------------------
 * §5.4 rejects locking as *"tidier on paper, maddening in a day"*. The cost of
 * this instead is a false refusal: he edits a task Atlas happened to read
 * earlier in the same turn, and Atlas asks him to say it again. One extra
 * sentence, once, against never losing work to his own assistant — and the
 * refusal names the task, so the second ask is a tap rather than a puzzle.
 */

/** Fingerprints for one turn. Cleared the moment a different turn calls. */
export class ConsistencyGuard {
  private turnId: string | null = null;
  private readonly seen = new Map<string, string>();
  private readonly labels = new Map<string, string>();

  /**
   * Starts, or continues, a turn.
   *
   * A call with no turn id at all — an approval tapped days later, a test —
   * gets a clean slate and records nothing, which is the honest behaviour:
   * there is no "since Atlas read it" window to police when Atlas did not read
   * anything.
   */
  enterTurn(turnId: string | null): void {
    if (turnId === this.turnId) return;
    this.turnId = turnId;
    this.seen.clear();
    this.labels.clear();
  }

  /**
   * Records what a read returned.
   *
   * The ids come out of the result's own payload rather than out of the
   * arguments, because that is what the *model* saw: a `search_tasks` that
   * returned eight rows means Atlas has eight tasks in front of it, any of
   * which it may go on to write.
   */
  observe(state: AgentStoreState, ids: Iterable<string>): void {
    if (this.turnId === null) return;
    for (const id of ids) {
      const found = fingerprint(state, id);
      if (found === null) continue;
      this.seen.set(id, found.hash);
      this.labels.set(id, found.label);
    }
  }

  /**
   * Checks a write. Returns the sentence to refuse with, or `null` to proceed.
   *
   * The fingerprint is dropped on a mismatch, deliberately: the refusal is
   * "you changed this, look again", and a second attempt in the same turn is
   * Atlas having looked again. Keeping it would turn one refusal into a loop
   * the model cannot escape, which on a 4B model is four wasted round trips
   * and an apology.
   */
  check(state: AgentStoreState, ids: Iterable<string>): string | null {
    if (this.turnId === null) return null;

    for (const id of ids) {
      const before = this.seen.get(id);
      if (before === undefined) continue;

      const now = fingerprint(state, id);
      // Gone since Atlas read it. The tools already report a missing target
      // clearly, and a second sentence about concurrency would obscure that.
      if (now === null) {
        this.seen.delete(id);
        continue;
      }
      if (now.hash === before) continue;

      const label = this.labels.get(id) ?? now.label;
      this.seen.delete(id);
      this.labels.delete(id);
      return (
        `Shreekant changed "${label}" himself since you read it, so nothing was written — his edit stands. ` +
        'Read it again and, if the change you were about to make still makes sense on top of his, make it. ' +
        'Tell him plainly that you stopped because he had just edited it.'
      );
    }

    return null;
  }

  /** Re-reads fingerprints after Atlas's own successful write, so it may write again. */
  refresh(state: AgentStoreState, ids: Iterable<string>): void {
    this.observe(state, ids);
  }
}

/**
 * A stable hash of one entity, whatever kind it is.
 *
 * `JSON.stringify` over sorted keys: the task graph is plain JSON end to end,
 * and key order is the only thing that varies without the value varying. It is
 * a *change detector*, not a checksum — a collision would mean missing one
 * refusal, and the cost of that is the behaviour this app had yesterday.
 */
function fingerprint(state: AgentStoreState, id: string): { hash: string; label: string } | null {
  const task = state.backlogTasks.find((candidate) => candidate.id === id);
  if (task) return { hash: hashOf(task), label: task.title };

  const nested = findSubtask(state, id);
  if (nested) return { hash: hashOf(nested), label: nested.title };

  const queued = state.tasks.find((candidate) => candidate.id === id);
  if (queued) return { hash: hashOf(queued), label: queued.title };

  const list = state.taskLists.find((candidate) => candidate.id === id);
  if (list) return { hash: hashOf(list), label: list.title };

  const project = state.projects.find((candidate) => candidate.id === id);
  if (project) return { hash: hashOf(project), label: project.name };

  return null;
}

function findSubtask(state: AgentStoreState, id: string): { id: string; title: string } | null {
  const walk = (nodes: { id: string; title: string; subtasks?: unknown[] }[]): { id: string; title: string } | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = walk((node.subtasks ?? []) as { id: string; title: string; subtasks?: unknown[] }[]);
      if (found) return found;
    }
    return null;
  };
  return walk(state.backlogTasks as unknown as { id: string; title: string; subtasks?: unknown[] }[]);
}

function hashOf(value: unknown): string {
  return stableStringify(value);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/**
 * Every entity id mentioned anywhere in a value.
 *
 * Deliberately structural rather than a list of field names per tool. A read's
 * payload is whatever that tool decided to return — `compactRow`s, a whole
 * task, a Trash entry with a task list inside it — and a table of "which key
 * holds an id" would be a second thing to keep in step with sixteen tools, one
 * that fails silently by simply not guarding a write.
 *
 * So: walk the value, collect every string under a key that ends in `id` or
 * `Id`, and let `fingerprint` decide which of them name something real. A
 * string that is not an entity id costs one failed lookup.
 *
 * ITEM 13D — AND UNDER A KEY THAT ENDS IN `ids`, WHICH IS NOW MOST OF THEM
 * -------------------------------------------------------------------------
 * Every tool takes a list, so the argument a write is guarded on is `taskIds:
 * ['a', 'b']` rather than `taskId: 'a'`. The singular rule above finds nothing
 * in that: `taskIds` fails the regex, the value recurses in as an array, and
 * its members are bare strings under no key at all — so they fell out the
 * bottom and **every batched write would have been guarded against an empty
 * set**, which is to say not guarded. §5.4 would have gone quietly missing the
 * moment the tools batched, and nothing would have failed to say so.
 *
 * Hence the second clause, and hence `consistency.test.ts` asserting the exact
 * shape a batching tool sends. The plural is checked before the recursion so a
 * `['a','b']` under `taskIds` is read as two ids rather than walked into.
 */
export function idsIn(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) idsIn(item, found);
    return found;
  }
  if (value === null || typeof value !== 'object') return found;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' && /(^|[a-z])[iI]d$/.test(key)) found.add(item);
    else if (Array.isArray(item) && /(^|[a-z])[iI]ds$/.test(key)) {
      for (const entry of item) if (typeof entry === 'string') found.add(entry);
    } else if (typeof item === 'object') idsIn(item, found);
  }
  return found;
}
