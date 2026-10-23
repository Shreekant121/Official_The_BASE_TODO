import { describe, expect, it } from 'vitest';
import {
  approvalsIndexOf,
  catalogIndexOf,
  conversationListOf,
  editedNoteRecord,
  editedSkillRecord,
  logIndexOf,
  parseConversationBody,
  parseNoteRecord,
  skillsIndexOf,
  slugifySkillName,
  splitNotePath,
  type CloudDoc,
  type NoteRecord,
  type SkillRecord,
} from './cloudMemoryModel';

/**
 * The cloud copy of Atlas's memory, as the screens read it with the lid shut
 * (BIG-4). What is pinned here is that each screen gets the shape it already
 * draws from the laptop — and the three ways that could silently go wrong: a
 * deleted note still listed, a chat list that downloads every transcript to
 * draw five titles, and a skill made here landing in a folder Atlas would name
 * differently.
 */

const NOW = Date.parse('2026-09-29T12:00:00.000Z');

const doc = (id: string, record: unknown, extra: Partial<CloudDoc> = {}): CloudDoc => ({
  id,
  json: JSON.stringify(record),
  updatedAt: '2026-09-29T10:00:00.000Z',
  by: 'laptop',
  deleted: false,
  ...extra,
});

const note = (path: string, body: string, extra: Partial<NoteRecord> = {}): NoteRecord => ({
  path,
  trigger: 'When asked',
  body,
  writtenAt: '2026-09-29T09:00:00.000Z',
  writtenBy: 'atlas',
  opens: 2,
  lastOpenedAt: '2026-09-28T09:00:00.000Z',
  ...extra,
});

describe('notes', () => {
  it('draws the catalog the laptop would: headers only, the four folders, bullets counted', () => {
    const index = catalogIndexOf(
      [
        doc('people/rahul.md', note('people/rahul.md', '- Rahul is the CA\n- Calls on Mondays\n')),
        doc('clients/acme.md', note('clients/acme.md', 'No bullets here', { lastOpenedAt: null })),
        doc('people/gone.md', null, { json: '', deleted: true }),
      ],
      NOW,
    );
    expect(index.notes.map((header) => header.path)).toEqual(['clients/acme.md', 'people/rahul.md']);
    expect(index.folders).toEqual(['clients', 'how-to', 'people', 'preferences', 'projects']);
    expect(index.memories).toBe(2);
    expect(index.notes[0]).toMatchObject({ stale: true, memories: 0 });
    expect(index.notes[1]).toMatchObject({ stale: false, author: 'atlas', opens: 2 });
    expect('body' in index.notes[1]).toBe(false);
  });

  it('refuses a record whose path Atlas would refuse', () => {
    expect(parseNoteRecord(doc('x', note('../../.env', '- secret')))).toBeNull();
    expect(splitNotePath('people/rahul.md')).toEqual({ folder: 'people', name: 'rahul.md' });
    expect(splitNotePath('people/rahul.txt')).toBeNull();
  });

  it('saves an edit as his, dated now, keeping the counters', () => {
    const edited = editedNoteRecord(note('people/rahul.md', '- old'), { path: 'people/rahul.md', body: '- new' }, '2026-09-29T12:00:00.000Z');
    expect(edited).toMatchObject({ body: '- new', trigger: 'When asked', writtenBy: 'you', writtenAt: '2026-09-29T12:00:00.000Z', opens: 2 });
  });
});

describe('chats', () => {
  const summary = (id: string, title: string, updatedAt: string, pinned = false) =>
    doc(id, { id, title, untitled: false, pinned, createdAt: updatedAt, updatedAt, messages: 2, compactions: 0 });
  const body = (id: string, text: string) =>
    doc(id, { id, title: 'x', history: [{ role: 'user', parts: [{ type: 'text', text }] }], activeSkill: null });

  it('orders pinned first then newest, and leaves out a deleted chat', () => {
    const rows = conversationListOf(
      [
        summary('a', 'Older', '2026-09-20T00:00:00.000Z'),
        summary('b', 'Newer', '2026-09-28T00:00:00.000Z'),
        summary('c', 'Pinned', '2026-09-01T00:00:00.000Z', true),
        doc('d', null, { json: '', deleted: true }),
      ],
      '',
      null,
    );
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a']);
  });

  it('searches the transcripts when it has them, as the laptop does', () => {
    const rows = conversationListOf(
      [summary('a', 'Tax', '2026-09-20T00:00:00.000Z'), summary('b', 'Groceries', '2026-09-21T00:00:00.000Z')],
      'lease',
      [body('a', 'what about the lease renewal?'), body('b', 'milk and eggs')],
    );
    expect(rows.map((row) => row.id)).toEqual(['a']);
  });

  it('opens a chat as the laptop hands it over', () => {
    expect(parseConversationBody(body('a', 'hello'))).toMatchObject({ id: 'a', history: [{ role: 'user' }], activeSkill: null });
    expect(parseConversationBody(doc('a', { id: 'a' }))).toBeNull();
  });
});

describe('skills', () => {
  const record = (name: string, enabled: boolean): SkillRecord => ({
    skill: {
      name, declaredName: name, description: 'When testing', body: 'Do it.', files: ['NOTES.md'], bytes: 10,
      enabled, uses: 1, lastUsedAt: null, updatedAt: '2026-09-29T00:00:00.000Z', author: 'outside', valid: true, problem: null,
    },
    texts: { 'NOTES.md': 'supporting' },
    writtenAt: null,
    writtenBy: null,
  });

  it('lists headers without bodies and counts the ones that are on', () => {
    const index = skillsIndexOf([doc('tdd', record('tdd', true)), doc('grill', record('grill', false))]);
    expect(index.skills.map((skill) => skill.name)).toEqual(['grill', 'tdd']);
    expect(index.enabled).toBe(1);
    expect('body' in index.skills[0]).toBe(false);
  });

  it('names a new skill’s folder exactly as Atlas would, and refuses one with no description', () => {
    expect(slugifySkillName('Chase Invoices!')).toBe('chase-invoices');
    const made = editedSkillRecord(null, { name: 'Chase Invoices', description: 'When a client is late', body: 'Be polite.' }, '2026-09-29T12:00:00.000Z');
    expect(made).toMatchObject({ skill: { name: 'chase-invoices', enabled: true, author: 'you' }, writtenBy: 'you' });
    expect(editedSkillRecord(null, { name: 'x', description: ' ', body: 'y' }, '2026-09-29T12:00:00.000Z')).toHaveProperty('error');
  });
});

describe('the log and the tray', () => {
  const turn = (id: string, at: string, undoable: boolean, frontDoor = false) => ({
    id, at, actor: 'atlas', ask: 'Add a task', conversationId: null, conversationTitle: null, model: null, provider: null,
    revertedAt: null,
    entries: [{ id: `${id}-e`, at, tool: 'create_task', drawer: 'tasks', args: {}, ok: true, summary: 'Created.', wrote: true, frontDoor, undoable, undoneAt: null, noUndoReason: null }],
  });

  it('groups turns by day, newest first, and counts today as the laptop does', () => {
    const index = logIndexOf(
      [
        doc('2026-09-29/t1', { day: '2026-09-29', turn: turn('t1', '2026-09-29T08:00:00.000Z', true) }),
        doc('2026-09-29/t2', { day: '2026-09-29', turn: turn('t2', '2026-09-29T09:00:00.000Z', false, true) }),
        doc('2026-09-24/t0', { day: '2026-09-24', turn: turn('t0', '2026-09-24T09:00:00.000Z', true) }),
      ],
      'week',
      '2026-09-29',
    );
    expect(index.days.map((day) => day.day)).toEqual(['2026-09-29', '2026-09-24']);
    expect(index.days[0].turns.map((one) => one.id)).toEqual(['t2', 't1']);
    expect(index.counts).toEqual({ entries: 2, undoable: 1, frontDoor: 1 });
    expect(logIndexOf([], 'today', '2026-09-29').days).toEqual([]);
  });

  it('keeps "7 days" to the calendar week, however sparse the log is (OPT-2)', () => {
    const docs = ['2026-10-06', '2026-09-30', '2026-09-29', '2026-09-12'].map((day) =>
      doc(`${day}/t`, { day, turn: turn(`t-${day}`, `${day}T09:00:00.000Z`, false) }),
    );
    expect(logIndexOf(docs, 'week', '2026-10-06').days.map((day) => day.day)).toEqual(['2026-10-06', '2026-09-30']);
    expect(logIndexOf(docs, 'all', '2026-10-06').days).toHaveLength(4);
  });

  it('draws the tray newest first, counting what is still waiting', () => {
    const approval = (id: string, createdAt: string, state: string) => ({ id, createdAt, state, kind: 'delete', tool: 'delete_project', args: {}, preview: 'x' });
    const index = approvalsIndexOf([
      doc('a1', approval('a1', '2026-09-28T00:00:00.000Z', 'discarded')),
      doc('a2', approval('a2', '2026-09-29T00:00:00.000Z', 'waiting')),
    ]);
    expect(index.approvals.map((one) => one.id)).toEqual(['a2', 'a1']);
    expect(index.waiting).toBe(1);
  });
});
