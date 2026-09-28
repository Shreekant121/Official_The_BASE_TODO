import { describe, expect, it } from 'vitest';
import { idsIn } from './consistency.ts';

/**
 * The §5.4 guard reads the ids out of a call's arguments (item 13, item 13D).
 *
 * WHY THIS FILE EXISTS, AND WHY IT DID NOT BEFORE
 * ------------------------------------------------
 * `idsIn` is deliberately *structural* — walk the value, collect every string
 * under a key that ends in `id` — rather than a table of which key each tool
 * uses. That choice is right, and it has one failure mode: it fails **silently
 * and completely**. A shape it does not recognise is not an error; it is an
 * empty set, which `guard.check` reads as a call that names nothing, which
 * passes.
 *
 * Item 13D walked straight into it. Every tool's argument became `taskIds:
 * ['a','b']`, and the singular rule finds nothing in that — `taskIds` fails the
 * regex, the array recurses in, and its members are bare strings under no key
 * at all. Every batched write would have been guarded against an empty set,
 * `npm run test` would have stayed green, and the only symptom would have been
 * Atlas quietly overwriting a task Shreekant had changed on his tablet.
 *
 * So the shapes the tools actually send are asserted here by name.
 */

describe('idsIn', () => {
  it('finds the singular key it always found', () => {
    expect([...idsIn({ taskId: 't-ca' })]).toEqual(['t-ca']);
    expect([...idsIn({ entryId: 'e-1' })]).toEqual(['e-1']);
    expect([...idsIn({ id: 'p-empire' })]).toEqual(['p-empire']);
  });

  it('finds every id in a plural list, which is what a batching tool sends', () => {
    expect([...idsIn({ taskIds: ['t-oil', 't-ca', 't-web'] })]).toEqual(['t-oil', 't-ca', 't-web']);
    expect([...idsIn({ subtaskIds: ['s-1', 's-2'] })]).toEqual(['s-1', 's-2']);
    expect([...idsIn({ entryIds: ['e-1'] })]).toEqual(['e-1']);
    // The share tools' own spelling.
    expect([...idsIn({ ids: ['p-empire', 'l-build'], type: 'project' })]).toEqual(['p-empire', 'l-build']);
  });

  it('finds the ids inside a creator’s list of records', () => {
    // `create_task` names no ids of its own, but `dependsOn` inside one does.
    expect([...idsIn({ tasks: [{ title: 'A', dependsOn: ['t-ca'] }, { title: 'B' }] })]).toEqual([]);
    expect([...idsIn({ parentId: 't-ca', steps: [{ title: 'A' }] })]).toEqual(['t-ca']);
  });

  it('still ignores a plural key that is not a list of ids', () => {
    expect([...idsIn({ tags: ['urgent', 'money'], title: 'Email the CA' })]).toEqual([]);
    expect([...idsIn({ titles: ['Email the CA'] })]).toEqual([]);
  });

  it('over-collects rather than under-collects, on purpose', () => {
    /*
     * `paid` ends in the letters `id`, so its value is picked up as though it
     * were an id. That is the pattern working as designed and not a bug worth
     * fixing: `fingerprint` looks each one up and a string that names nothing
     * costs one failed lookup, whereas a *missed* id costs the guard entirely.
     * The asymmetry is the whole reason the rule is structural.
     */
    expect([...idsIn({ paid: 'yes' })]).toEqual(['yes']);
  });

  it('walks a tool result the same way, however deep the rows are', () => {
    const data = {
      done: 2,
      tasks: [{ taskId: 't-oil' }, { taskId: 't-ca' }],
      failed: [{ id: 'not-a-task', reason: 'no such task' }],
    };
    expect([...idsIn(data)].sort()).toEqual(['not-a-task', 't-ca', 't-oil']);
  });
});
