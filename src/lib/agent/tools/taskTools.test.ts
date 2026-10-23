/**
 * `search_tasks`, and the two faults item 13C was opened for.
 *
 * **This is the first test `taskTools.ts` has ever had.** Item 14's note said
 * `fuzzyScore` "has tests and they all pass"; it had none at all — `grep -rn
 * fuzzyScore src/` returned exactly two hits, both inside the file itself.
 * That is how a search tool shipped returning five results with zero real
 * matches and nobody noticed: nothing measured it, and a person watching a
 * transcript found it by accident.
 *
 * So the fixture below is **Shreekant's own board**, not invented data —
 * the three projects (Mutineer Work, Level Ai, Skills) and the exact titles
 * that were measured live against the old code on 2026-09-05. An answer of
 * "not found" here means a failure rather than a fixture gap, which is the
 * same rule item 14's forty tasks are written under.
 */
import { describe, expect, it } from 'vitest';
import { completeTask, fuzzyScore, listAllTasks, listProjects, searchTasks, SEARCH_SCORE_FLOOR, singleOutTwin, type CompactTaskRow } from './taskTools';
import { drawerOf, DRAWERS, mcpTools } from './index';
import { publishShareLink } from './shareTools';
import type { AgentStore, AgentStoreState, ToolContext, ToolResult } from '../types';
import type { Project, Task, TaskList } from '../../../store/useStore';

const NOW = new Date('2026-09-05T11:00:00+05:30');

/*
 * The five titles that scored 35 on "Level Ai", plus the four that actually
 * came back from his live board, plus "Books to read" for the second measured
 * pair ("ad creatives" scoring 35 on the `ad` in re-ad).
 *
 * Two tasks are called "Send 30 emails" on purpose: they are why the ids
 * cannot be removed from a tool result. One is in Level Ai and one is not,
 * which is also the sharpest test in the file — see the assertion that names
 * them.
 */
const TASKS: Array<[id: string, title: string, listId: string, deadline?: string]> = [
  ['t-oil', 'Oil Hair', 'l-selfcare'],
  ['t-bodyhair', 'Remove Body hair', 'l-selfcare'],
  ['t-repair', 'Repair the chair', 'l-selfcare'],
  ['t-ca', 'Email the CA', 'l-admin', '2026-09-04T18:00'],
  ['t-website', 'Maintain the website', 'l-content'],
  ['t-plan', 'Detail the plan', 'l-content'],
  ['t-waitlist', 'Get waitlist', 'l-marketing-level'],
  ['t-emails-level', 'Send 30 emails', 'l-marketing-level', '2026-09-09T18:00'],
  ['t-emails-mutineer', 'Send 30 emails', 'l-outreach'],
  ['t-ads', 'Ad creatives', 'l-marketing-level'],
  ['t-books', 'Books to read', 'l-skills'],
  ['t-ae', 'After Effects practice', 'l-skills'],
  ['t-done', 'Ship the lead magnet', 'l-outreach'],
];

function harness() {
  const state: AgentStoreState = {
    projects: [
      { id: 'p-mutineer', name: 'Mutineer Work', createdAt: 1, order: 0 } as Project,
      { id: 'p-level', name: 'Level Ai', createdAt: 2, order: 1 } as Project,
      { id: 'p-skills', name: 'Skills', createdAt: 3, order: 2 } as Project,
    ],
    taskLists: [
      { id: 'l-selfcare', title: 'Self Care', order: 0 } as TaskList,
      { id: 'l-admin', title: 'Admin', order: 1 } as TaskList,
      { id: 'l-content', title: 'Website Content', projectId: 'p-mutineer', order: 2 } as TaskList,
      { id: 'l-outreach', title: 'Outreach', projectId: 'p-mutineer', order: 3 } as TaskList,
      { id: 'l-marketing-level', title: 'Marketing', projectId: 'p-level', order: 4 } as TaskList,
      { id: 'l-skills', title: 'Learning', projectId: 'p-skills', order: 5 } as TaskList,
    ],
    backlogTasks: TASKS.map(([id, title, listId, deadline], order) => ({
      id,
      title,
      status: id === 't-done' ? 'completed' : 'needsAction',
      listId,
      deadline,
      order,
      subtasks: [],
    }) as Task),
    tasks: [],
  };

  const store: AgentStore = {
    getState: () => state,
    addBacklogTask: () => {},
    updateBacklogTask: () => {},
    updateFocusTask: () => {},
    setFocusQueue: () => {},
    updateTaskList: () => {},
    updateProject: () => {},
    deleteBacklogTask: () => {},
    trashEntries: () => [],
    restoreFromTrash: () => null,
    addProject: () => {},
    addTaskList: () => {},
    renameTaskList: () => {},
    deleteProject: () => {},
    deleteTaskList: () => {},
  };

  const ctx: ToolContext = {
    snapshotHandle: { id: 'turn', label: 'test', startedAt: NOW.getTime() },
    now: NOW,
    timezone: 'Asia/Kolkata',
    store,
    snapshots: { captureTask: () => {}, captureList: () => {}, captureProject: () => {}, captureEvent: () => {} },
  };

  return { state, ctx };
}

interface SearchRow {
  id: string;
  title: string;
  deadline?: string;
  listName: string;
  projectName?: string;
}

function rowsOf(result: ToolResult): SearchRow[] {
  const data = result.data as { results?: SearchRow[]; tasks?: SearchRow[] } | undefined;
  return data?.results ?? data?.tasks ?? [];
}

function idsOf(result: ToolResult): string[] {
  return rowsOf(result).map((row) => row.id);
}

// ── Fault 1 ─────────────────────────────────────────────────────────────────

describe('fuzzyScore — a word fragment is not a match (fault 1)', () => {
  /*
   * The measured symptom, exactly as recorded: query "Level Ai" scored 35 on
   * all five of these, on the `ai` buried inside another word. If the tiers
   * are ever put back, every one of these flips from null to 35 and this
   * block fails loudly.
   */
  it.each([
    ['Remove body hair', 'h-ai-r'],
    ['Email the CA', 'em-ai-l'],
    ['Maintain the website', 'm-ai-ntain'],
    ['Repair the chair', 'rep-ai-r'],
    ['Detail the plan', 'det-ai-l'],
    ['Oil Hair', 'H-ai-r'],
    ['Get waitlist', 'w-ai-tlist'],
    ['Send 30 emails', 'em-ai-ls'],
  ])('scores "%s" as no match for "Level Ai" (%s)', (title) => {
    expect(fuzzyScore(title, 'Level Ai')).toBeNull();
  });

  it('scores "Books to read" as no match for "ad creatives" (re-ad)', () => {
    // Same fault, different words, and both are item 14 vocabulary.
    expect(fuzzyScore('Books to read', 'ad creatives')).toBeNull();
  });

  it('leaves the one-word query with nothing to match either', () => {
    // The 35s were multi-word-only; `{query: "Level"}` returned 0 live and
    // still must, because none of his 48 titles contain the word.
    expect(fuzzyScore('Remove body hair', 'Level')).toBeNull();
    expect(fuzzyScore('Send 30 emails', 'Level')).toBeNull();
  });
});

describe('fuzzyScore — the subsequence tier is gone, not softened', () => {
  /*
   * The second, independent noise source. "CA" correctly hit "Email the CA" at
   * 70 and then dragged in these two at 15 on a `c`…`a` scattered across the
   * string — which is why deleting the partial-hit tier on its own would have
   * fixed multi-word queries and left one-word queries exactly as noisy.
   */
  it('no longer matches letters scattered across a title', () => {
    expect(fuzzyScore('Repair the chair', 'CA')).toBeNull();
    expect(fuzzyScore('After Effects practice', 'CA')).toBeNull();
  });

  it('still finds the task the query is actually about', () => {
    expect(fuzzyScore('Email the CA', 'CA')).toBe(70);
  });
});

describe('fuzzyScore — what still has to be found', () => {
  it('matches a whole title, a prefix and a word inside it', () => {
    expect(fuzzyScore('Email the CA', 'email the ca')).toBe(100);
    expect(fuzzyScore('Maintain the website', 'maintain')).toBe(85);
    expect(fuzzyScore('Maintain the website', 'website')).toBe(70);
  });

  it('matches a word given as a prefix, which is how people type', () => {
    // The boundary is a word *start*, not a whole word: "web" finds
    // "website" while "ai" does not find "hair".
    expect(fuzzyScore('Maintain the website', 'web')).toBe(70);
  });

  it('matches out-of-order words, and "the CA thing" still lands above the floor', () => {
    expect(fuzzyScore('Send 30 emails', 'emails send')).toBe(55);
    const score = fuzzyScore('Email the CA', 'the CA thing');
    expect(score).not.toBeNull();
    expect(score as number).toBeGreaterThanOrEqual(SEARCH_SCORE_FLOOR);
  });

  it('does not credit a query for the stop words every title contains', () => {
    // "the" matching is not half a match. Without dropping it, "the plan"
    // would score 35 against "Email the CA" and clear the floor.
    expect(fuzzyScore('Email the CA', 'the plan')).toBeNull();
    expect(fuzzyScore('Detail the plan', 'the plan')).toBe(70);
  });

  it('puts the floor exactly at half the words, and not by taste', () => {
    // Two words, one hit: 35, kept. Three words, one hit: 31.67, dropped.
    expect(fuzzyScore('Maintain the website', 'website redesign')).toBe(SEARCH_SCORE_FLOOR);
    expect(fuzzyScore('Maintain the website', 'website redesign brief')).toBeLessThan(SEARCH_SCORE_FLOOR);
  });
});

// ── search_tasks, against the live measurement ──────────────────────────────

describe('search_tasks — the query that returned five wrong answers', () => {
  it('returns none of the four titles that matched on a buried "ai"', async () => {
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Level Ai' }, ctx);
    const ids = idsOf(result);

    expect(ids).not.toContain('t-oil'); // Oil Hair
    expect(ids).not.toContain('t-bodyhair'); // Remove Body hair
    expect(ids).not.toContain('t-repair'); // Repair the chair
    expect(ids).not.toContain('t-emails-mutineer'); // the "Send 30 emails" that is not in Level Ai
  });

  it('returns the Level Ai tasks, and for the right reason', async () => {
    /*
     * THE SHARPEST ASSERTION IN THIS FILE.
     *
     * One of his two "Send 30 emails" tasks genuinely lives in Level Ai
     * Marketing, and the old code did find it — because "emails" contains
     * "ai", not because of the list. Rename it "Send 30 messages" and it
     * vanished with the rest. Now it is found through its project and its
     * twin in Mutineer Work is not, which is the difference between a right
     * answer and a lucky one.
     */
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Level Ai' }, ctx);
    const ids = idsOf(result);

    expect(ids).toContain('t-emails-level');
    expect(ids).toContain('t-waitlist');
    expect(ids).toContain('t-ads');
    expect(result.summary).toContain('project');
  });

  it('survives the rename that killed the old answer', async () => {
    const { state, ctx } = harness();
    const task = state.backlogTasks.find((t) => t.id === 't-emails-level');
    if (task) task.title = 'Send 30 messages';

    const result = await searchTasks.execute({ query: 'Level Ai' }, ctx);
    expect(idsOf(result)).toContain('t-emails-level');
  });
});

describe('search_tasks — a bare project or list name finds what is in it (fault 2)', () => {
  it('finds the Mutineer Work tasks from the word "Mutineer"', async () => {
    // `{query: "Mutineer"}` returned 0 live, against a whole project of that
    // name, because the loop scored `task.title` and nothing else.
    const { ctx } = harness();
    const ids = idsOf(await searchTasks.execute({ query: 'Mutineer' }, ctx));

    expect(ids).toEqual(expect.arrayContaining(['t-website', 't-plan', 't-emails-mutineer']));
    expect(ids).not.toContain('t-oil');
  });

  it('finds them from a list name too', async () => {
    const { ctx } = harness();
    expect(idsOf(await searchTasks.execute({ query: 'Self Care' }, ctx))).toEqual(
      expect.arrayContaining(['t-oil', 't-bodyhair', 't-repair']),
    );
  });

  it('never lets a container outrank a task actually called that', async () => {
    const { state, ctx } = harness();
    state.backlogTasks.push({
      id: 't-costume',
      title: 'Mutineer costume',
      status: 'needsAction',
      listId: 'l-selfcare',
      order: 99,
      subtasks: [],
    } as Task);

    const ids = idsOf(await searchTasks.execute({ query: 'Mutineer' }, ctx));
    expect(ids[0]).toBe('t-costume');
  });
});

describe('search_tasks — the rows say which project', () => {
  it('carries the project beside the list, so both reach the answer', async () => {
    // His results read "Self Care" and "Marketing" — list names — so the
    // project a task belongs to never got to him at all.
    const { ctx } = harness();
    const rows = rowsOf(await searchTasks.execute({ query: 'waitlist' }, ctx));

    expect(rows[0].listName).toBe('Marketing');
    expect(rows[0].projectName).toBe('Level Ai');
  });

  it('leaves the project off a list that is in none, rather than inventing one', async () => {
    const { ctx } = harness();
    const rows = rowsOf(await searchTasks.execute({ query: 'Oil Hair' }, ctx));
    expect(rows[0].projectName).toBeUndefined();
  });
});

// ── The whole board in one call ─────────────────────────────────────────────

describe('list_all_tasks — the read-everything companion', () => {
  it('returns every open task in one call, with no query and no cap in the way', async () => {
    /*
     * "Read all the tasks and connect them with a timeline" was not a search
     * and could not be done at any price: search_tasks caps at 20 and wants a
     * query. 48 tasks as rows is ~1,250 tokens, about 2% of the window.
     */
    const { ctx } = harness();
    const result = await listAllTasks.execute({}, ctx);
    const rows = rowsOf(result);

    expect(rows).toHaveLength(TASKS.length - 1); // everything but the completed one
    expect(idsOf(result)).not.toContain('t-done');
    expect(result.summary).toContain('whole board');
  });

  it('includes finished work only when asked', async () => {
    const { ctx } = harness();
    expect(idsOf(await listAllTasks.execute({ status: 'any' }, ctx))).toContain('t-done');
  });

  it('orders by deadline, soonest first, with the undated last', async () => {
    // Every question this tool exists for is a question about time.
    const { ctx } = harness();
    const rows = rowsOf(await listAllTasks.execute({}, ctx));

    expect(rows[0].id).toBe('t-ca'); // overdue, 4 Sep
    expect(rows[1].id).toBe('t-emails-level'); // 9 Sep
    expect(rows[rows.length - 1].deadline).toBeUndefined(); // the tail is everything undated
  });

  it('counts the overdue work, which is the thing being asked about', async () => {
    const { ctx } = harness();
    const result = await listAllTasks.execute({}, ctx);
    expect((result.data as { overdue: number }).overdue).toBe(1);
    expect(result.summary).toContain('1 overdue');
  });

  it('names the project on every row', async () => {
    const { ctx } = harness();
    const rows = rowsOf(await listAllTasks.execute({}, ctx));
    expect(rows.find((row) => row.id === 't-ads')?.projectName).toBe('Level Ai');
  });

  it('is served to Atlas and to the in-browser fallback alike', async () => {
    // The fallback is the labelled basic assistant answering when the laptop
    // is asleep; a whole-board read is the cheapest tool on that path, not
    // the most expensive.
    expect(mcpTools.map((tool) => tool.name)).toContain('list_all_tasks');
  });
});

// ── The ids stay in the result and off his screen ───────────────────────────

describe('ids are for the model, not for the transcript', () => {
  it('keeps every id in the data, because two tasks share a title', async () => {
    // "mark Send 30 emails as done" has no answer without one.
    const { ctx } = harness();
    const ids = idsOf(await searchTasks.execute({ query: 'Send 30 emails' }, ctx));
    expect(ids).toEqual(expect.arrayContaining(['t-emails-level', 't-emails-mutineer']));
  });

  it('keeps every id out of the sentence the transcript renders', async () => {
    /*
     * A tool's `summary` is the chip's detail line in `ChatPage.tsx`, so an
     * id quoted there is an id on his screen. The rows are `data`, which the
     * model reads and the transcript does not.
     */
    const { ctx } = harness();
    for (const result of [
      await searchTasks.execute({ query: 'Level Ai' }, ctx),
      await searchTasks.execute({ query: 'nothing at all like this' }, ctx),
      await listAllTasks.execute({}, ctx),
    ]) {
      for (const [id] of TASKS) expect(result.summary).not.toContain(id);
    }
  });

  it('says so in the tool descriptions, which is the half that reaches Atlas', async () => {
    // Atlas's own prompt is its repo's; the descriptions are this one's, and
    // they are what a model on either host actually reads.
    expect(searchTasks.description).toContain('never print one in your reply');
    expect(listAllTasks.description).toContain('never print one in your reply');
  });
});

// ── Item 14, trap t2: identical titles are said in the summary ──────────────

/**
 * The fixture's two "Send 30 emails" tasks stand in for his four "Solve
 * Question Bank" ones. The rule these guard is the one `gemma4:e4b` broke
 * three runs out of three: told to mark one of four identically-titled tasks
 * done, it proposed completing all four. The prompt had said not to since item
 * 9; the search result under its nose had said nothing.
 */
describe('search_tasks says out loud when two results have the same title', () => {
  it('names the count, the title and where they are filed', async () => {
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Send 30 emails' }, ctx);
    expect(result.summary).toContain('IDENTICAL title "Send 30 emails"');
    expect(result.summary).toContain('2 of them');
    // Where they differ is the whole content of the question he has to answer.
    expect(result.summary).toContain('Marketing');
    expect(result.summary).toContain('Outreach');
  });

  it('names the move, because a fact alone does not tell a 4B model what to do', async () => {
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Send 30 emails' }, ctx);
    expect(result.summary).toContain('ask_questions');
    expect(result.summary).toContain('never the answer');
  });

  it('names the one his own words point at, instead of asking him again', async () => {
    /*
     * *"mark the question bank for maths as done"* is not ambiguous — he said
     * which one — and the first version of this note sent the model to
     * `ask_choice` anyway, three runs of three, with `APPLIED ENGINEERING
     * MATHEMATICS – II` on the screen in front of it. Telling it in prose to
     * "pick using whatever else he said" did not help, so the tool does the
     * matching itself.
     */
    const { ctx } = harness();
    const summary = (await searchTasks.execute({ query: 'send 30 emails for marketing' }, ctx)).summary;
    expect(summary).toContain('points at "Marketing"');
    expect(summary).toContain('do not ask');
    // The other twin must not be the one named.
    expect(summary).not.toContain('points at "Outreach"');
  });

  it('falls back to asking when his words point at more than one, or at none', async () => {
    const { ctx } = harness();
    // Nothing beyond the shared title: this is the `t2` case the note exists for.
    const bare = (await searchTasks.execute({ query: 'Send 30 emails' }, ctx)).summary;
    expect(bare).toContain('ask_questions');
    expect(bare).not.toContain('points at');
  });

  it('matches the way he types, not the way the list is spelled', () => {
    /*
     * "maths" is not a prefix of "mathematics" and "mathematics" is not a
     * prefix of "maths" — they share "math", which is the whole reason the
     * comparison is a four-character common prefix rather than a prefix test.
     */
    const twin = (listName: string): CompactTaskRow => ({
      id: `t-${listName}`,
      title: 'Solve Question Bank',
      status: 'needsAction',
      listName,
    });
    const twins = [
      twin('APPLIED ENGINEERING MATHEMATICS – II'),
      twin('BASIC ELECTRICAL & ELECTRONICS ENGINEERING'),
      twin('DYNAMICS OF COMMUNICATION'),
      twin('LOGIC DEVELOPMENT WITH PROGRAMMING – II'),
    ];

    expect(singleOutTwin(twins, 'question bank for maths')?.row.listName).toContain('MATHEMATICS');
    expect(singleOutTwin(twins, 'the logic question bank')?.row.listName).toContain('LOGIC');
    expect(singleOutTwin(twins, 'question bank for electronics')?.row.listName).toContain('ELECTRICAL');
    // Words from the shared title distinguish nothing and must be ignored.
    expect(singleOutTwin(twins, 'Solve Question Bank')).toBeNull();
    // And a word that lands on two of them is a real ambiguity.
    expect(singleOutTwin(twins, 'the engineering one')).toBeNull();
  });

  it('tells it to use what else he said BEFORE it tells it to ask', async () => {
    /*
     * The measured correction. The first wording went straight to "nothing
     * here tells you which — ask him", which is right for *"mark Solve
     * Question Bank as done"* and flatly wrong for *"mark the question bank
     * for maths as done"*, where the subject is in what he typed. That ask
     * went from passing to 0/3: the model asked anyway, and rendered the four
     * options as invented links carrying their uuids. This tool cannot see how
     * he phrased the request, so the sentence hands the judgement back.
     */
    const { ctx } = harness();
    const summary = (await searchTasks.execute({ query: 'Send 30 emails' }, ctx)).summary;
    expect(summary).toContain('pick using whatever else he said');
    expect(summary.indexOf('pick using whatever else he said')).toBeLessThan(summary.indexOf('ask_questions'));
  });

  it('still keeps the ids off the sentence and in the data', async () => {
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Send 30 emails' }, ctx);
    for (const [id] of TASKS) expect(result.summary).not.toContain(id);
    expect((result.data as { identicalTitles: string[] }).identicalTitles).toEqual(
      expect.arrayContaining(['t-emails-level', 't-emails-mutineer']),
    );
  });

  it('says nothing at all on an ordinary search, which is nearly every one', async () => {
    const { ctx } = harness();
    for (const query of ['Oil Hair', 'Level Ai', 'Books to read']) {
      expect((await searchTasks.execute({ query }, ctx)).summary).not.toContain('IDENTICAL');
    }
  });
});

// ── Item 14, trap t6: a container match is a guess, not a result ────────────

/**
 * *"Delete everything in Personal Tasks"* names a project he has. One run in
 * three searched `{query: "Personal Tasks"}`, got eleven rows that had **all**
 * matched on the name of the thing containing them rather than on their own
 * titles, and proposed deleting all eleven. Every row was real and 13C's
 * container scoring was working as designed — but "tasks that live somewhere
 * whose name resembles what you typed" is a guess about which container was
 * meant, and the old sentence ("11 of them matched on their list or project")
 * did not say that loudly enough to stop a bulk delete.
 */
describe('search_tasks says when every hit came from a container name', () => {
  it('names it as a guess and points at list_projects', async () => {
    // Nothing on this board is titled "Marketing"; three tasks live in a list
    // and a project by that name.
    const { ctx } = harness();
    const result = await searchTasks.execute({ query: 'Marketing' }, ctx);
    expect(rowsOf(result).length).toBeGreaterThan(1);
    expect(result.summary).toContain('in its own title');
    expect(result.summary).toContain('list_projects');
    expect(result.summary).toContain('never delete or complete a whole set found this way');
  });

  it('still says a read from these rows is fine, so an answer costs no extra round trip', async () => {
    /*
     * The first wording of this note told the model to confirm with
     * `list_projects` "before acting on these" full stop, which reads to a 4B
     * model as a second call before answering a question. `prompt.ts` has said
     * since item 9 that ambiguity is only a problem when you are about to
     * write; the note now says the same thing in the same place as the fact.
     */
    const { ctx } = harness();
    expect((await searchTasks.execute({ query: 'Marketing' }, ctx)).summary).toContain('Fine to answer a question from');
  });

  it('keeps the plain count when only some of them matched that way', async () => {
    /*
     * "Level Ai" matches the project for most rows and nothing by title, so
     * the sharper wording is right there too; "Oil Hair" matches a title and
     * gets neither sentence. What must not happen is the strong wording on a
     * search that did find the thing by name.
     */
    const { ctx } = harness();
    const byTitle = await searchTasks.execute({ query: 'Oil Hair' }, ctx);
    expect(byTitle.summary).not.toContain('in its own title');
    expect(byTitle.summary).not.toContain('list_projects');
  });
});

// ── Item 14, everyday e1: the filter the model invented ─────────────────────

/**
 * *"what's overdue?"* is the most-typed question on this board. `gemma4:e4b`
 * answered it correctly all three measured runs — after calling
 * `list_all_tasks({overdue: true})` first and being told there is no such
 * parameter. `search_tasks` takes that flag, so the model had every reason to
 * think its sibling did too, and the wasted round trip was the tool surface
 * being inconsistent rather than the model being wrong.
 *
 * The fixture's one overdue task is "Email the CA", due 2026-09-04 against a
 * frozen now of the 5th.
 */
describe('list_all_tasks takes the overdue filter its sibling always had', () => {
  it('returns only what is actually late', async () => {
    const { ctx } = harness();
    expect(idsOf(await listAllTasks.execute({ overdue: true }, ctx))).toEqual(['t-ca']);
  });

  it('returns everything else when the flag is false', async () => {
    const { ctx } = harness();
    const ids = idsOf(await listAllTasks.execute({ overdue: false }, ctx));
    expect(ids).not.toContain('t-ca');
    // Undated tasks are not overdue, so they belong on this side of the line.
    expect(ids).toContain('t-oil');
  });

  it('reads the whole board when the flag is left out, exactly as before', async () => {
    const { ctx } = harness();
    const ids = idsOf(await listAllTasks.execute({}, ctx));
    expect(ids).toContain('t-ca');
    expect(ids).toContain('t-oil');
    expect(ids).not.toContain('t-done');
  });

  it('does not call a filtered read "the whole board"', async () => {
    /*
     * The model reads this sentence and repeats its shape back to Shreekant.
     * Telling it that eight overdue tasks are the whole of a 57-task board is
     * the kind of small lie that makes the rest of a summary untrustworthy.
     */
    const { ctx } = harness();
    const filtered = await listAllTasks.execute({ overdue: true }, ctx);
    expect(filtered.summary).not.toContain('The whole board');
    expect(filtered.summary).toContain('overdue');
    expect((await listAllTasks.execute({}, ctx)).summary).toContain('The whole board');
  });
});

// ── Item 14, trap t4: the ids a share link needs ────────────────────────────

/**
 * `publish_share_link` takes the id of the task, list or project being shared,
 * and until this tool existed **no read on the board handed back a list id or
 * a project id at all** — so "publish a share link for Level Ai" could not be
 * carried out at any price. The model searched, found the project's tasks, and
 * sent eight task ids with `type: "project"`.
 */
describe('list_projects — the only ids no other tool gives you', () => {
  it('returns every project with its id and its open-task count', async () => {
    const { ctx } = harness();
    const data = (await listProjects.execute({}, ctx)).data as {
      projects: { id: string; name: string; openTasks: number; lists: { id: string; name: string; openTasks: number }[] }[];
    };
    const level = data.projects.find((project) => project.name === 'Level Ai');
    expect(level?.id).toBe('p-level');
    // Get waitlist, Send 30 emails, Ad creatives.
    expect(level?.openTasks).toBe(3);
    expect(level?.lists.map((list) => list.id)).toEqual(['l-marketing-level']);
  });

  it('does not count a completed task as open', async () => {
    const { ctx } = harness();
    const data = (await listProjects.execute({}, ctx)).data as { projects: { name: string; openTasks: number }[] };
    // Outreach holds "Send 30 emails" and the completed "Ship the lead magnet";
    // Website Content holds two.
    expect(data.projects.find((project) => project.name === 'Mutineer Work')?.openTasks).toBe(3);
  });

  it('reports the lists filed under no project rather than dropping them', async () => {
    const { ctx } = harness();
    const data = (await listProjects.execute({}, ctx)).data as { lists: { id: string }[] };
    expect(data.lists.map((list) => list.id)).toEqual(expect.arrayContaining(['l-selfcare', 'l-admin']));
  });

  it('carries no tasks, so it stays a cheap first call', async () => {
    const { ctx } = harness();
    const result = await listProjects.execute({}, ctx);
    for (const [id, title] of TASKS) {
      expect(JSON.stringify(result.data)).not.toContain(id);
      expect(result.summary).not.toContain(title);
    }
  });

  it('lives in exactly one drawer, and the share tool says where to find it', () => {
    /*
     * It was briefly listed in the sharing drawer too, which does nothing: a
     * tool carries ONE drawer to Atlas, `_meta.drawer` from `drawerOf` in
     * `mcp/index.ts`, so the second membership reads as though it worked and
     * does not. Measured — `open_drawer("sharing")` still answered "you can
     * now use: publish_share_link, revoke_share_link", and three `t4` runs in
     * five guessed at parameter names and gave up.
     *
     * What replaces it is a sentence in the parameter the model is trying to
     * fill, and the same sentence in the error it gets for sending a name.
     */
    expect(DRAWERS.tasks.tools).toContain('list_projects');
    expect(DRAWERS.sharing.tools).not.toContain('list_projects');
    expect(drawerOf('list_projects')).toBe('tasks');

    const ids = publishShareLink.parametersSchema.properties?.ids;
    expect(ids?.description).toContain('list_projects');
    expect(ids?.description).toContain('Tasks drawer');
  });

  it('is on the MCP surface and deliberately not on the in-browser fallback', () => {
    // The fallback has no share tools at all, so an id it can never use is a
    // declaration it should not be paying for.
    expect(mcpTools.map((tool) => tool.name)).toContain('list_projects');
  });
});

// ── complete_task and the blocked-task lock (item 19) ───────────────────────

/**
 * **Atlas is inside the lock, and this is the only thing that says so.**
 *
 * Item 19's rule is that a task waiting on unfinished work cannot be completed.
 * Five screens enforce it with a disabled control, which a person can see; the
 * agent enforces it by refusing in `execute`, which nobody can see — so if this
 * block goes, the rule quietly acquires a door and the only symptom is that
 * asking the chat works where pressing the button does not.
 *
 * It is deliberately NOT enforced in the tool's description or its schema. The
 * text the local model reads is unchanged, so no tier of item 14's benchmark
 * moved; the model finds out from the result, the same way it finds out about
 * an id that does not resolve.
 *
 * A dedicated harness, because the file's main one stubs `updateBacklogTask`
 * to a no-op — which is fine for reading tools and useless for a test whose
 * whole subject is a write that must not happen.
 */
function lockHarness() {
  const written: Array<{ id: string; updates: Partial<Task> }> = [];

  const state: AgentStoreState = {
    projects: [],
    taskLists: [{ id: 'l-space', title: 'The Space', order: 0 } as TaskList],
    backlogTasks: [
      { id: 't-lease', title: 'Sign the lease', status: 'needsAction', listId: 'l-space', subtasks: [] } as Task,
      { id: 't-acoustics', title: 'Get the acoustic treatment quoted', status: 'needsAction', listId: 'l-space', dependsOn: ['t-lease'], subtasks: [] } as Task,
      { id: 't-invites', title: 'Draft the launch-week invite list', status: 'needsAction', listId: 'l-space', subtasks: [] } as Task,
    ],
    tasks: [],
  };

  const store: AgentStore = {
    getState: () => state,
    addBacklogTask: () => {},
    updateBacklogTask: (id, updates) => {
      written.push({ id, updates });
      state.backlogTasks = state.backlogTasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    },
    updateFocusTask: (id, updates) => {
      written.push({ id, updates });
      state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
    },
    setFocusQueue: () => {},
    updateTaskList: () => {},
    updateProject: () => {},
    deleteBacklogTask: () => {},
    trashEntries: () => [],
    restoreFromTrash: () => null,
    addProject: () => {},
    addTaskList: () => {},
    renameTaskList: () => {},
    deleteProject: () => {},
    deleteTaskList: () => {},
  };

  const ctx: ToolContext = {
    snapshotHandle: { id: 'turn', label: 'test', startedAt: NOW.getTime() },
    now: NOW,
    timezone: 'Asia/Kolkata',
    store,
    snapshots: { captureTask: () => {}, captureList: () => {}, captureProject: () => {}, captureEvent: () => {} },
  };

  return { state, ctx, written };
}

describe('complete_task — the blocked-task lock (item 19)', () => {
  it('refuses a task whose prerequisite is unfinished, and writes nothing', async () => {
    const { ctx, written } = lockHarness();

    const result = await completeTask.execute({ taskIds: ['t-acoustics'] }, ctx);

    expect(result.ok).toBe(false);
    expect(written).toEqual([]);
  });

  it('names the blocker, so the model can tell the user what to do about it', async () => {
    const { ctx } = lockHarness();

    const result = await completeTask.execute({ taskIds: ['t-acoustics'] }, ctx);

    // The title, not the id: the user has never seen `t-lease`.
    expect(result.summary).toContain('Sign the lease');
  });

  it('still completes the rest of the batch', async () => {
    // `runBatch`'s contract, and the reason "I finished these five things" is
    // one call. One locked id must not take the other four down with it.
    const { ctx, written } = lockHarness();

    const result = await completeTask.execute({ taskIds: ['t-acoustics', 't-invites'] }, ctx);

    expect(result.ok).toBe(true);
    expect(written.map((w) => w.id)).toEqual(['t-invites']);
  });

  it('completes it once the prerequisite is done', async () => {
    const { state, ctx, written } = lockHarness();
    state.backlogTasks = state.backlogTasks.map((t) => (t.id === 't-lease' ? { ...t, status: 'completed' } : t));

    const result = await completeTask.execute({ taskIds: ['t-acoustics'] }, ctx);

    expect(result.ok).toBe(true);
    expect(written.map((w) => w.id)).toEqual(['t-acoustics']);
  });

  it('completes a task you put into today with "Schedule anyway"', async () => {
    // The override lives on the queue copy, and the agent honours it for the
    // same reason Focus Mode does: it is a decision the user already took, and
    // re-imposing it here would make the button mean nothing in the one place
    // the user is most likely to ask for the task to be closed out.
    const { state, ctx, written } = lockHarness();
    const blocked = state.backlogTasks.find((t) => t.id === 't-acoustics')!;
    state.tasks = [{ ...blocked, scheduledAnyway: true }];
    state.backlogTasks = state.backlogTasks.filter((t) => t.id !== 't-acoustics');

    const result = await completeTask.execute({ taskIds: ['t-acoustics'] }, ctx);

    expect(result.ok).toBe(true);
    expect(written.map((w) => w.id)).toEqual(['t-acoustics']);
  });
});
