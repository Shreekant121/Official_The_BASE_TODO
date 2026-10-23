import { describe, expect, it } from 'vitest';
import type { Project, Task, TaskList } from '../store/useStore';
import {
  buildSubject,
  didFromToolCall,
  fieldsInPatch,
  fillsFromHeldCall,
  missingScoreFields,
  plainText,
  scoreKickoff,
  subjectKey,
  withPreface,
  type SubjectState,
} from './aiPanel';

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-09-16T06:30:00Z'); // 12:00 in Kolkata

const state: SubjectState = {
  projects: [{ id: 'p-empire', name: 'Shreekant Empire', createdAt: 0, order: 0 } as Project],
  taskLists: [
    { id: 'l-ops', title: 'Operations', projectId: 'p-empire', order: 0 } as TaskList,
    { id: 'l-loose', title: 'Self Care', order: 1 } as TaskList,
  ],
  backlogTasks: [
    {
      id: 't-inc', title: 'File the "INC-32" paperwork', listId: 'l-ops', status: 'needsAction',
      estimatedTime: 90, deadline: '2026-09-17T18:00',
    } as Task,
    { id: 't-done', title: 'Old thing', listId: 'l-ops', status: 'completed', estimatedTime: 30 } as Task,
    { id: 't-walk', title: 'Walk', listId: 'l-loose', status: 'needsAction' } as Task,
  ],
};

describe('buildSubject', () => {
  it('names a task by its title, its address and its id', () => {
    const subject = buildSubject({ kind: 'task', id: 't-inc' }, state, TZ);
    expect(subject?.kicker).toBe('Task · Operations · Shreekant Empire');
    expect(subject?.title).toBe('File the "INC-32" paperwork');
    // ICU spells September "Sep" or "Sept" depending on the Node build; a short date, so the title keeps the room.
    expect(subject?.meta).toMatch(/^90 min · 17 Sept?$/);
    // The quote inside the title must not end the quoted name early.
    expect(subject?.preface).toBe(
      `[About the task "File the 'INC-32' paperwork" — id t-inc in the list "Operations" of the project "Shreekant Empire". "This task" means that one.]`,
    );
    expect(subject?.prompts).toEqual(['Break this into steps', 'Is 90 min realistic?', 'What is blocking it?']);
    expect(subject?.chatTitle).toBe('Task · File the "INC-32" paperwork');
  });

  it('asks how long a task will take when it has no estimate', () => {
    const subject = buildSubject({ kind: 'task', id: 't-walk' }, state, TZ);
    expect(subject?.kicker).toBe('Task · Self Care');
    expect(subject?.meta).toBeUndefined();
    expect(subject?.prompts[1]).toBe('How long will this take?');
    expect(subject?.preface).toContain('in the list "Self Care".');
  });

  it('counts only the open tasks of a list', () => {
    const subject = buildSubject({ kind: 'list', id: 'l-ops' }, state, TZ);
    expect(subject?.kicker).toBe('List · Shreekant Empire');
    expect(subject?.meta).toBe('1 open task · 90 min');
    expect(subject?.preface).toContain('id l-ops, in the project "Shreekant Empire", with 1 open task.');
  });

  it('lists a project’s lists in its preface', () => {
    const subject = buildSubject({ kind: 'project', id: 'p-empire' }, state, TZ);
    expect(subject?.kicker).toBe('Project · 1 list');
    expect(subject?.meta).toBe('1 open task');
    expect(subject?.preface).toContain('with the lists "Operations".');
  });

  it('is null when the object is gone', () => {
    expect(buildSubject({ kind: 'task', id: 'nope' }, state, TZ)).toBeNull();
    expect(buildSubject({ kind: 'list', id: 'nope' }, state, TZ)).toBeNull();
    expect(buildSubject({ kind: 'project', id: 'nope' }, state, TZ)).toBeNull();
  });

  it('keys a task and its score panel apart', () => {
    expect(subjectKey({ kind: 'task', id: 't-inc' })).not.toBe(subjectKey({ kind: 'score', id: 't-inc' }));
  });

  it('puts the subject line in front of what he typed', () => {
    const subject = buildSubject({ kind: 'list', id: 'l-ops' }, state, TZ);
    expect(subject && withPreface(subject, 'What first?')).toMatch(/^\[About the list .*\]\n\nWhat first\?$/);
  });
});

describe('scoring', () => {
  const subject = buildSubject({ kind: 'score', id: 't-walk' }, state, TZ);

  it('asks only for what is missing, in the tool’s own argument names', () => {
    const missing = missingScoreFields({ score: true, estimate: false, deadline: true, description: false });
    expect(missing).toEqual(['score', 'deadline']);
    const text = subject ? scoreKickoff(subject, missing) : '';
    expect(text).toContain('Still missing: importance, deadline.');
    // BUILD-16: both on one card, importance on the 1-9 scale, and nothing asked that is not missing.
    expect(text).toContain('in one ask_questions call: importance as kind scale; the deadline as kind one');
    expect(text).not.toContain('estimate as kind');
    expect(text).toContain('update_task on taskIds ["t-walk"]');
    expect(text).toContain('humanOverride');
  });

  it('reads a held update into a draft patch', () => {
    const { patch, filled } = fillsFromHeldCall(
      {
        name: 'update_task',
        args: { taskIds: ['t-walk'], humanOverride: 7, estimatedTime: '40', deadline: '2026-09-20', description: '  Around the lake. ' },
      },
      't-walk',
      NOW,
      TZ,
    );
    expect(patch).toEqual({
      humanOverride: 7,
      estimatedTime: '40',
      deadline: '2026-09-20T18:00',
      description: 'Around the lake.',
    });
    expect(filled.map((row) => row.field)).toEqual(['Importance', 'Estimate', 'Deadline', 'Description']);
    expect(filled[0].value).toBe('7 · High');
    expect(fieldsInPatch(patch)).toEqual(['score', 'estimate', 'deadline', 'description']);
  });

  it('resolves "tomorrow" in his zone, as the tool would', () => {
    const { patch } = fillsFromHeldCall({ name: 'update_task', args: { deadline: 'tomorrow' } }, 't-walk', NOW, TZ);
    expect(patch.deadline).toBe('2026-09-17T18:00');
  });

  it('fills nothing the tool would have refused', () => {
    const { patch, filled } = fillsFromHeldCall(
      { name: 'update_task', args: { humanOverride: 12, estimatedTime: 0, deadline: 'someday', description: '   ' } },
      't-walk',
      NOW,
      TZ,
    );
    expect(patch).toEqual({});
    expect(filled).toEqual([]);
  });

  it('fills nothing from a call about another task, or another tool', () => {
    expect(fillsFromHeldCall({ name: 'update_task', args: { taskIds: ['t-inc'], humanOverride: 3 } }, 't-walk', NOW, TZ).filled).toEqual([]);
    expect(fillsFromHeldCall({ name: 'complete_task', args: { taskIds: ['t-walk'] } }, 't-walk', NOW, TZ).filled).toEqual([]);
  });

  it('takes a zero importance as an answer, not as nothing', () => {
    const { patch } = fillsFromHeldCall({ name: 'update_task', args: { humanOverride: 0 } }, 't-walk', NOW, TZ);
    expect(patch.humanOverride).toBe(0);
  });
});

describe('didFromToolCall', () => {
  it('is null for a read', () => {
    expect(didFromToolCall({ name: 'search_tasks', args: {}, ok: true, summary: 'Found 2', durationMs: 1 }, TZ, NOW)).toBeNull();
  });

  it('states a write with its tool name', () => {
    const did = didFromToolCall(
      { name: 'update_task', args: { taskIds: ['t-inc'], estimatedTime: 60 }, ok: true, summary: 'Updated "File": estimatedTime.', durationMs: 3 },
      TZ,
      NOW,
    );
    expect(did?.tool).toBe('update_task');
    expect(did?.ok).toBe(true);
    expect(did?.rows).toHaveLength(1);
  });

  it('says a failed write did not happen', () => {
    const did = didFromToolCall(
      { name: 'create_task', args: {}, ok: false, summary: 'No list called X.', durationMs: 3 },
      TZ,
      NOW,
    );
    expect(did).toMatchObject({ ok: false, count: 'not done', rows: [{ label: 'No list called X.' }] });
  });
});

describe('plainText', () => {
  it('takes the marks off and keeps the words', () => {
    expect(plainText('## Plan\n\n**First**, call `the CA`.\n\n\n- one\n* two')).toBe('Plan\n\nFirst, call the CA.\n\n• one\n• two');
  });
});
