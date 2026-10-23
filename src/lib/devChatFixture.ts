/**
 * Dev-only fixture for the Assistant transcript, used by the screenshot
 * harness (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * A conversation cannot be photographed. Every turn needs a live Gemini call,
 * the harness aborts every request off localhost, and seeding localStorage —
 * which is how every other screen is fed — reaches nothing here, because the
 * transcript is deliberately session-only and lives in module scope (D11). So
 * before UI-33 the three `/chat` baselines covered the header, the empty state
 * and the composer, and **nothing at all** of the part of the screen UI-33
 * rebuilt: the assistant's reply, the task rows a read comes back with, and
 * the changes container that owns Revert.
 *
 * So the harness navigates to `/chat?__dev-chat-fixture__=1` and this module
 * hands back a literal transcript instead. It is a *rendering* fixture and
 * nothing more: it calls no tool, contacts no model, and writes nothing
 * anywhere by itself.
 *
 * Every turn here is Atlas's since BIG-12 (27A-5): the basic assistant and the
 * snapshot-ring Revert it carried are retired, so the ring this fixture used to
 * seed — and `chat-turns-reverted`, which pressed its Revert — are gone, and a
 * turn's changes are reverted from the Log.
 *
 * HOW IT IS KEPT OUT OF THE SHIPPED BUNDLE
 * ----------------------------------------
 * Same mechanism as `devAuth.ts` and `devShareFixture.ts`, guarded the same
 * way. The whole body sits behind a bare `import.meta.env.DEV`, which Vite
 * replaces with the literal `false` for a production build; the guard folds to
 * a constant, the bundler drops everything after it, and
 * `scripts/check-shots-bypass.mjs` greps `dist/` for the marker and fails the
 * build if it survives. **Do not read that flag into a variable first** —
 * constant folding is the whole guarantee — and **do not lift anything below
 * out to module scope**: a module-level `const` is initialised whether or not
 * the guarded function is reachable, which is exactly how `devShareFixture`'s
 * marker survived into `dist/` the first time and failed this check.
 *
 * A baseline is only worth diffing if the data behind it never moves, so
 * everything here is literal — fixed ids, fixed dates, fixed token counts, and
 * no call to `Date.now()`.
 */
import type { AgentToolCall, TokenUsage } from './agent/types';
import type { AtlasConversationSummary } from './atlas/client';

/** One turn, shaped exactly like `ChatPage`'s own `ChatTurn`. */
export interface DevChatTurn {
  id: string;
  userText: string;
  assistantText: string;
  toolCalls: AgentToolCall[];
  status: 'running' | 'done' | 'error';
  /** When a running turn was sent; `long-job` sets it twelve seconds back (29-1P15d). */
  startedAt?: number;
  /**
   * The reasoning Atlas kept (item 12), which no fixture carried until the
   * animation audit went looking for it.
   *
   * `ChatPage` casts these turns to its own `ChatTurn`, so the shape is that
   * one's: a round number, the text, and how long the reasoning *streamed*
   * for. `startedAt` is the only field left out — nothing renders it.
   */
  thinking?: { round: number; text: string; ms: number; startedAt: number }[];
  usage?: TokenUsage;
  /**
   * The three fields item 9D put on a turn's meta line and its changes
   * container, all literal for the same reason everything else here is.
   *
   * `elapsedMs` is measured from a clock in the real page, so it must be
   * stated rather than left out — an absent one prints nothing and the
   * baseline would never photograph the field. `ranOnAtlas` is `true`: since
   * 27A-5 every turn is Atlas's, and its changes say to revert from the Log.
   */
  model?: string;
  elapsedMs?: number;
  ranOnAtlas?: boolean;
}

export interface DevChatFixture {
  turns: DevChatTurn[];
  /**
   * The conversation list (item 10).
   *
   * A third blocked fetch, for the same reason as the other two: the chats
   * live on the laptop and the harness cannot reach it, so without these the
   * sidebar's only photographable state is *"Could not reach the laptop."* —
   * which is honest and is not the state worth having a baseline of.
   *
   * Only on the Atlas path. The in-browser fallback genuinely has no
   * conversation list, and drawing it one would be a lie about where its
   * transcript goes when the tab closes.
   */
  conversations?: AtlasConversationSummary[];
  /** Which of them is open, so the list has a selected row to draw. */
  currentConversationId?: string;
}

/**
 * The fixture, or `null` for every ordinary visit to `/chat`.
 *
 * Takes `location.search` rather than reading it itself, so the caller's bare
 * `import.meta.env.DEV` is the only branch that decides anything.
 */
export function devChatFixture(search: string): DevChatFixture | null {
  if (!import.meta.env.DEV) return null;
  if (!search.includes('__dev-chat-fixture__')) return null;

  /*
   * ── ITEM 9D: THE SAME SCREEN WITH THE OTHER MACHINE BEHIND IT ──
   *
   * `?__dev-chat-fixture__=atlas` is the Atlas path, and it is a second
   * fixture rather than a flag on the first because almost nothing about a
   * turn is the same on it.
   *
   * Item 9 gave Atlas hands over MCP and 9D put its calls on the wire, so this
   * is the first build in which an Atlas turn can show what it did. Three
   * things only appear here and none of them can be photographed any other
   * way — the harness blocks the tailnet, so a real Atlas turn is unreachable:
   *
   *  - **a tool `describeToolCall` has no case for.** `remove_subtask` is one
   *    of the seven MCP-only tools that fall to its `default` branch, and the
   *    branch is only correct if a chip built that way still reads. It does:
   *    the verb is the tool's name unslugged and the detail is its summary.
   *  - **`delete_task` in the changes container.** The registry's own
   *    `mutates` flag puts it on the write side with nothing here mapping
   *    names to sides, which is the claim `toolChip.ts` makes in prose.
   *  - **the container with no Revert.** The snapshot ring is in this browser
   *    and Atlas never touched it, so this turn carries `ranOnAtlas: true` and
   *    `snapshotTurnId: null` — and the footer says where the undo actually is
   *    rather than offering a button that cannot reach the laptop.
   *
   * The model name is a local one and there is no snapshot to seed, both of
   * which are the point.
   */
  if (search.includes('__dev-chat-fixture__=atlas')) return atlasFixture();

  /* ── ITEM 13B: the type specimen ── */
  if (search.includes('__dev-chat-fixture__=markdown')) return markdownFixture();

  /* ── ITEM 13G: the whole backlog, so the expander has something to expand ── */
  if (search.includes('__dev-chat-fixture__=backlog')) return backlogFixture();

  /* ── ITEM 13G: the two motions nothing else could photograph ── */
  if (search.includes('__dev-chat-fixture__=working')) return workingFixture();

  /* ── 29-1P15d: the same running turn, twelve seconds in, so its pill is a
     long job (colours drifting, "12s"). Started relative to now because the
     pill counts from `startedAt`; the harness's held clock reads it once. ── */
  if (search.includes('__dev-chat-fixture__=long-job')) return workingFixture(Date.now() - 12_400);

  /* ── BUILD-16: the question card, waiting, and then answered ── */
  if (search.includes('__dev-chat-fixture__=ask-answered')) return askFixture(true);
  if (search.includes('__dev-chat-fixture__=ask')) return askFixture(false);

  /*
   * Turn one: a read. `list_today` returns whole rows, so the screen draws
   * them — this is what UI-33 ported `TaskRow` for. The three tasks and their
   * allocations are `scripts/fixture.ts`'s `FOCUS_QUEUE`, exactly.
   */
  const listToday: AgentToolCall = {
    name: 'list_today',
    args: {},
    ok: true,
    summary:
      '3 tasks queued for today, 270 minutes allocated. ' +
      'First up: "File the incorporation paperwork" (due Friday 13 March at 6:00 pm).',
    durationMs: 6,
    data: {
      totalAllocatedMinutes: 270,
      queue: [
        {
          position: 1,
          id: 't-incorporate',
          title: 'File the incorporation paperwork',
          status: 'in-progress',
          deadline: '2026-03-13T18:00',
          listName: 'Operations',
          allocatedMinutes: 90,
          isSubtask: false,
        },
        {
          position: 2,
          id: 't-landing',
          title: 'Rewrite the landing page copy',
          status: 'needsAction',
          deadline: '2026-03-16T18:00',
          listName: 'Build',
          allocatedMinutes: 150,
          isSubtask: false,
        },
        {
          position: 3,
          id: 's-inc-upload',
          title: 'Upload to the MCA portal',
          status: 'needsAction',
          listName: 'Operations',
          allocatedMinutes: 30,
          isSubtask: true,
        },
      ],
    },
  };

  /*
   * Turn two: two writes on two tasks, which is what the changes container and
   * its divider are for. Each `deadline` here is the value the seeded store
   * actually holds, and each captured `prior` below holds the one it had
   * before — so the revert has something real to put back.
   */
  /* ITEM 13D: every tool takes a list, so an `update_task` names `taskIds`
     and reports a row per task. Two tasks moved to two different dates is
     genuinely two calls — one call applies one change to a list — which is
     also why the changes container still has two rows to draw a divider
     between. */
  const moveAudit: AgentToolCall = {
    name: 'update_task',
    args: { taskIds: ['t-audit'], deadline: '2026-03-14T11:00' },
    ok: true,
    summary: 'Updated "Quarterly compliance review": deadline.',
    durationMs: 11,
    data: { done: 1, tasks: [{ taskId: 't-audit', changed: ['deadline'], unwritable: [] }] },
  };

  const moveLease: AgentToolCall = {
    name: 'update_task',
    args: { taskIds: ['t-lease'], deadline: '2026-03-17T16:00' },
    ok: true,
    summary: 'Updated "Countersign the studio lease": deadline.',
    durationMs: 9,
    data: { done: 1, tasks: [{ taskId: 't-lease', changed: ['deadline'], unwritable: [] }] },
  };

  return {
    turns: [
      {
        id: 'dev-turn-read',
        userText: 'What am I doing today?',
        /* ITEM 13B: the marks a reply to *this* question actually carries. A
           question that asks what is on today is answered with a list, which
           is the case the item's "done when" names. Nothing here is written
           to exercise the renderer — the specimen below is for that; this is
           what the house format asks Atlas for and what it will send back. */
        assistantText: [
          'Three tasks are on today — **4h 30m** of work, and the incorporation filing is already running.',
          '',
          '1. **File the incorporation paperwork** — Friday at 6:00 pm, in progress',
          '2. **Rewrite the landing page copy** — Monday at 6:00 pm',
          '3. Upload to the MCA portal — a step inside the filing',
          '',
          'The MCA upload is a subtask of that filing, so closing the filing closes both.',
        ].join('\n'),
        toolCalls: [listToday],
        status: 'done',
        usage: { promptTokens: 3_140, responseTokens: 208, thoughtsTokens: 0, totalTokens: 3_348, requests: 2 },
        model: 'Gemini 2.5 Flash',
        elapsedMs: 2_400,
        ranOnAtlas: true,
      },
      {
        id: 'dev-turn-write',
        userText: 'Push the compliance review to Saturday and pull the lease in to Tuesday',
        assistantText:
          'Both moved. The **compliance review** now lands Saturday at 11:00 and the **lease ' +
          'countersigning** Tuesday at 4:00 pm, which puts them either side of the filing deadline ' +
          'rather than on top of it.',
        toolCalls: [moveAudit, moveLease],
        status: 'done',
        usage: { promptTokens: 4_022, responseTokens: 191, thoughtsTokens: 0, totalTokens: 4_213, requests: 3 },
        model: 'Gemini 2.5 Flash',
        elapsedMs: 5_100,
        ranOnAtlas: true,
      },
    ],

  };
}

/**
 * The type specimen for a reply (item 13B).
 *
 * WHY THIS IS A FIXTURE OF ITS OWN AND NOT MORE MARKS ON THE OTHER TWO
 * --------------------------------------------------------------------
 * The two transcripts above are conversations, and they carry the marks a
 * conversation carries — a list where the question asked for one, bold on the
 * two task names that moved, code and a citation on the turn that went to the
 * web. Loading them up with a heading, a quote and a scrolling code block to
 * reach full coverage would stop them reading as things Atlas would say, and
 * they are the baselines anybody checking the *screen* looks at.
 *
 * So the coverage lives here instead, and this one does not pretend to be a
 * conversation. It is one reply holding every mark in item 13B's spec table,
 * which is the same job `design-system/screens/atlas.html`'s own `.md-*`
 * block does for the design. `chat-markdown` is its baseline, so a change to
 * any rule in the markdown block of `ui/screens.css` moves one shot that is
 * about exactly that, instead of hiding inside a transcript.
 *
 * Three things in it are there to catch a specific regression rather than to
 * show off a mark:
 *  - **the long line in the fenced block**, which must scroll INSIDE the well.
 *    If `.md-pre`'s `overflow-x` is ever lost, this widens the transcript and
 *    pushes the composer and the chat list sideways with it — which the shot
 *    records as a screen that no longer fits.
 *  - **the tool name in prose**, `search_tasks`, deliberately unbackticked. It
 *    fails loudly if underscore emphasis is ever added to the parser: the name
 *    would come back as "searchtasks" with the middle of it in italics.
 *  - **a bare URL beside a Markdown link**, because the two take different
 *    paths through the parser and only one of them was ever in a mockup.
 *
 * IT RUNS ON THE LOCAL MODEL, AND THAT IS NOT COSMETIC
 * -----------------------------------------------------
 * `gemma4:e4b` with `ranOnAtlas: true`, against an awake host. This screen's
 * subject is *what Atlas writes*, and Atlas is the laptop — a specimen
 * captioned with a hosted model would be a picture of the labelled fallback
 * making a claim about the thing it falls back from. It costs nothing here
 * because this fixture seeds no snapshot ring and offers no Revert.
 *
 * The two transcripts above were in-browser turns until BIG-12 (27A-5) retired
 * the basic assistant, kept so because `chat-turns-reverted` pressed their
 * ring's Revert; that shot went with it, and they are Atlas turns now too.
 *
 * Literal throughout, like everything else in this file — a baseline is only
 * worth diffing if the data behind it never moves.
 */
function markdownFixture(): DevChatFixture {
  return {
    turns: [
      {
        id: 'dev-md',
        userText: 'Show me every mark you know how to write.',
        assistantText: [
          '## What the marks look like',
          '',
          'Body copy sits directly on the page — no card and no well, and *italic* is a shade of the',
          'same colour rather than a second one.',
          '',
          '> A quoted line, which is how a stranger’s text is shown when it has to be repeated back.',
          '',
          '### A kicker, not a heading',
          '',
          '1. A numbered step, whose **number is a counter** rather than a character',
          '2. A second one, to prove the counter advances',
          '3. A third that runs long enough to wrap onto a second line and hang under the first',
          '',
          '- A bullet is a 4px dot, not a glyph',
          '- Wrapped text hangs under the words, never under the dot',
          '',
          'Inline code is a hairline well: `update_task`, `t-lease`. A tool name in plain prose keeps',
          'its underscores — search_tasks, whole.',
          '',
          '```sql',
          'select * from tasks join lists on lists.id = tasks.list_id where lists.name = :name and tasks.deadline is not null;',
          '```',
          '',
          'A link reads as [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.txt), and a bare one',
          'https://dateutil.readthedocs.io/ becomes the same thing.',
        ].join('\n'),
        toolCalls: [],
        status: 'done',
        usage: { promptTokens: 1_020, responseTokens: 312, thoughtsTokens: 0, totalTokens: 1_332, requests: 1 },
        model: 'gemma4:e4b',
        elapsedMs: 1_900,
        ranOnAtlas: true,
      },
    ],
  };
}

/**
 * THE QUESTION CARD (BUILD-16), `Atlas Questions.dc.html`'s 1a.
 *
 * "add a task to call the CA", and Atlas stops on the design's four questions.
 * The card is read off the `ask_questions` call's own arguments — exactly how a
 * reopened conversation draws it — so this is also the proof that the reload
 * path draws the card the live one did. `answered` adds the next turn: his
 * answers, drawn as the receipt, and the task Atlas made from them.
 *
 * Dated against `FROZEN_NOW` (Thursday 12 March 2026): Friday is the 13th.
 */
function askFixture(answered: boolean): DevChatFixture {
  const ask: AgentToolCall = {
    name: 'ask_questions',
    args: {
      title: 'Four things before I add “Call the CA”',
      questions: [
        {
          question: 'When is it due?', kind: 'one',
          options: ['Today · Thu 12', 'Tomorrow · Fri 13', 'Mon 16 Mar', 'Fri 20 Mar'], suggested: ['Mon 16 Mar'],
          why: 'Four days before the 20 Mar filing date.',
        },
        {
          question: 'How long will it take?', kind: 'one',
          options: ['15 min', '30 min', '45 min', '1 h'], suggested: ['30 min'],
          why: 'Your last two CA calls ran 24 and 31 min.',
        },
        { question: 'How important, out of 9?', kind: 'scale', suggested: ['7'], why: 'Filing deadlines score 7 across your lists.' },
        {
          question: 'Prepare anything first?', kind: 'many', optional: true,
          options: ['Gather Form 16', 'Pull bank statements', 'List questions for the CA'],
          suggested: ['Gather Form 16', 'Pull bank statements'], why: 'Optional. Each one becomes a subtask.',
        },
      ],
    },
    ok: true,
    summary: 'Asked. All 4 questions are in front of him now.',
    durationMs: 3,
  };

  const asked: DevChatTurn = {
    id: 'dev-ask',
    userText: 'add a task to call the CA',
    assistantText: 'Nothing like it is open, so it will be new. It needs four answers first — the date, the time and the score change where it lands in your week.',
    toolCalls: [ask],
    status: 'done',
    model: 'gemma4:e4b',
    elapsedMs: 9_400,
    ranOnAtlas: true,
  };

  if (!answered) return { turns: [asked] };

  const create: AgentToolCall = {
    name: 'create_task',
    args: { tasks: [{ title: 'Call the CA', deadline: '2026-03-16', estimatedTime: 30, humanOverride: 8, list: 'Admin' }] },
    ok: true,
    summary: 'Created "Call the CA" in Admin, due Mon 16 Mar.',
    durationMs: 31,
    data: { done: 1, tasks: [{ taskId: 't-ca', title: 'Call the CA', listName: 'Admin', deadline: '2026-03-16T18:00' }] },
  };

  return {
    turns: [
      asked,
      {
        id: 'dev-answers',
        userText: [
          'Answers to your questions:',
          '- When is it due? → Mon 16 Mar',
          '- How long will it take? → 30 min (your suggestion)',
          '- How important, out of 9? → 8 / 9',
          '- Prepare anything first? → Gather Form 16, Pull bank statements',
        ].join('\n'),
        assistantText: 'In Admin, due Monday 16 March — 30 min, 8 / 9. The two prep steps sit under it as subtasks.',
        toolCalls: [create],
        status: 'done',
        model: 'gemma4:e4b',
        elapsedMs: 11_200,
        ranOnAtlas: true,
      },
    ],
  };
}

/**
 * A TURN THAT IS STILL RUNNING, AND ONE THAT KEPT ITS THINKING.
 *
 * **Added by the animation audit, because two of the fourteen had no way to be
 * seen at all.** Every other fixture here is finished turns with no reasoning
 * attached, so the thinking indicator (motion 4 of the four this item numbers)
 * and the kept-thinking expander (motion 8) existed in the code, were correct,
 * and could not be reached from the app or photographed by the harness. A
 * motion nobody can get to is indistinguishable from one that was never built —
 * which is exactly the hole Shreekant found in the nav pill.
 *
 * Two turns, one for each:
 *
 *  - **The first is done and carries `thinking`**, so it draws the `Thought for
 *    4.2s` kicker that opens onto its reasoning. It opens closed, which is the
 *    design: on `gemma4:e4b` the reasoning routinely runs longer than the
 *    answer.
 *  - **The second is `running` with no text and no tools**, which is the state
 *    that draws the pill on its own — "Thinking on the laptop", with the accent
 *    dot pulsing inside it and the ellipsis counting one, two, three.
 *
 * **One honest gap in this fixture**: the composer still shows Send rather than
 * Stop, because `busy` is page state set by a real send and not something a
 * seeded transcript can reach. The pill is what this is a baseline of; the
 * button beside it is the ordinary resting one, and that is worth knowing
 * before anybody reads the shot as a bug.
 */
function workingFixture(runningSince?: number): DevChatFixture {
  return {
    turns: [
      {
        id: 'dev-thought',
        userText: 'Should I move the lease countersigning before the filing deadline?',
        assistantText: [
          'Yes — put it **before** the filing, not after.',
          '',
          'The filing needs the countersigned copy attached, so scheduling it afterwards means the',
          'deadline depends on somebody else answering their email.',
        ].join('\n'),
        toolCalls: [],
        status: 'done',
        thinking: [
          {
            round: 1,
            text: [
              'The filing is the fixed date — it is statutory, so it cannot move.',
              'The countersigning is not: it depends on the landlord, which makes it the risky one.',
              'So the question is really which of the two has slack, and only one of them does.',
            ].join(' '),
            ms: 4_200,
            startedAt: 0,
          },
        ],
        usage: { promptTokens: 980, responseTokens: 214, thoughtsTokens: 320, totalTokens: 1_514, requests: 1 },
        model: 'gemma4:e4b',
        elapsedMs: 4_200,
        ranOnAtlas: true,
      },
      {
        id: 'dev-running',
        userText: 'Move it to Tuesday then, and tell me what else that pushes.',
        assistantText: '',
        toolCalls: [],
        status: 'running',
        ranOnAtlas: true,
        startedAt: runningSince,
      },
    ],
  };
}

/**
 * FORTY-EIGHT ROWS, WHICH IS THE ONLY WAY TO PHOTOGRAPH THE EXPANDER (item 13G).
 *
 * The other three fixtures answer questions with two or three tasks, which is
 * honest about a normal turn and useless here: `ToolResult` draws six rows and
 * then a "Show all N" that morphs the rest open — **motion 1 of 4** — and
 * nothing under seven rows draws that control at all. So this is the mockup's
 * own backlog, at the size `atlas.html` designs against, and it is the fixture
 * `chat-backlog` and `chat-backlog-open` are taken from.
 *
 * **Every row carries a project**, which the other fixtures do not. The redrawn
 * row is four facts — title, status, deadline, project — and the fourth was
 * added to `describeTaskRows` this session; a fixture with no projects would
 * photograph the column empty and prove nothing about it. Nine rows have none
 * on purpose (Self Care and Skills are loose lists), because a cell that is
 * simply absent is the case most likely to break a grid.
 *
 * The dates are around `FROZEN_NOW` — 12 March 2026 — so three read as late,
 * six as today, and five carry no deadline and draw the em dash. Against a real
 * clock they all read as months overdue, which is the fixture working: the
 * harness pins the clock, a hand check does not.
 */
function backlogFixture(): DevChatFixture {
  const searchTasks: AgentToolCall = {
    name: 'search_tasks',
    args: { status: 'open' },
    ok: true,
    summary: '48 open tasks across 3 projects.',
    durationMs: 31,
    data: {
      totalMatches: 48,
      truncated: false,
      results: [
        { id: 't-open-01', title: 'Send 30 emails', status: 'in-progress', deadline: '2026-03-12T18:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-02', title: 'Get the waitlist live', status: 'needsAction', deadline: '2026-03-12T21:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-03', title: 'Write the marketing plan', status: 'needsAction', deadline: '2026-03-19T18:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-04', title: 'Oil hair', status: 'needsAction', deadline: '2026-03-14T20:00', listName: 'Self Care' },
        { id: 't-open-05', title: 'Record ten test videos', status: 'needsAction', deadline: '2026-03-21T18:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-06', title: 'After Effects practice', status: 'needsAction', deadline: null, listName: 'Skills' },
        { id: 't-open-07', title: 'Write the launch email', status: 'needsAction', deadline: '2026-03-09T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-08', title: 'Pick the waitlist copy', status: 'needsAction', deadline: '2026-03-12T17:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-09', title: 'Set up the landing page form', status: 'needsAction', deadline: '2026-03-13T18:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-10', title: 'Reply to the two demo asks', status: 'needsAction', deadline: '2026-03-11T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-11', title: 'Cut the reel from Tuesday', status: 'needsAction', deadline: '2026-03-13T15:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-12', title: 'Script the next three shorts', status: 'needsAction', deadline: '2026-03-23T18:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-13', title: 'Thumbnail pass on the backlog', status: 'needsAction', deadline: null, listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-14', title: 'Storyboard the explainer', status: 'needsAction', deadline: '2026-03-25T18:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-15', title: 'Book the dentist', status: 'needsAction', deadline: '2026-03-16T11:00', listName: 'Self Care' },
        { id: 't-open-16', title: 'Sleep by 1am for a week', status: 'needsAction', deadline: '2026-03-12T23:00', listName: 'Self Care' },
        { id: 't-open-17', title: 'Stretch for twenty minutes', status: 'needsAction', deadline: '2026-03-12T20:00', listName: 'Self Care' },
        { id: 't-open-18', title: 'Grocery run', status: 'needsAction', deadline: '2026-03-18T19:00', listName: 'Self Care' },
        { id: 't-open-19', title: 'Finish the colour grading LUT', status: 'needsAction', deadline: null, listName: 'Skills' },
        { id: 't-open-20', title: 'Rig the lower-third template', status: 'needsAction', deadline: '2026-03-27T18:00', listName: 'Skills' },
        { id: 't-open-21', title: 'Learn the graph editor', status: 'needsAction', deadline: null, listName: 'Skills' },
        { id: 't-open-22', title: 'Rewrite the pricing page', status: 'needsAction', deadline: '2026-03-19T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-23', title: 'Draft the cold outreach list', status: 'needsAction', deadline: '2026-03-13T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-24', title: 'Send the follow-up batch', status: 'needsAction', deadline: '2026-03-16T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-25', title: 'Set the ad budget for the week', status: 'needsAction', deadline: '2026-03-10T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-26', title: 'Audit the analytics events', status: 'needsAction', deadline: '2026-03-28T18:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-27', title: 'Write three tweet threads', status: 'needsAction', deadline: '2026-03-14T18:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-28', title: 'Refresh the case study', status: 'needsAction', deadline: '2026-03-31T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-29', title: 'Pitch the podcast slot', status: 'needsAction', deadline: '2026-03-18T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-30', title: 'Clean the raw footage drive', status: 'needsAction', deadline: null, listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-31', title: 'Update the media kit', status: 'needsAction', deadline: '2026-04-02T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-32', title: 'Waitlist welcome sequence', status: 'needsAction', deadline: '2026-03-13T18:00', listName: 'Level Ai Marketing', projectName: 'Level Ai' },
        { id: 't-open-33', title: 'Test the onboarding flow', status: 'needsAction', deadline: '2026-03-16T18:00', listName: 'Level Ai', projectName: 'Level Ai' },
        { id: 't-open-34', title: 'Write the changelog entry', status: 'needsAction', deadline: '2026-03-19T18:00', listName: 'Level Ai', projectName: 'Level Ai' },
        { id: 't-open-35', title: 'Fix the signup error copy', status: 'needsAction', deadline: '2026-03-12T16:00', listName: 'Level Ai', projectName: 'Level Ai' },
        { id: 't-open-36', title: 'Second pass on the demo video', status: 'needsAction', deadline: '2026-04-04T18:00', listName: 'Content', projectName: 'Mutineer Work' },
        { id: 't-open-37', title: 'Face care routine, restarted', status: 'needsAction', deadline: '2026-03-12T22:00', listName: 'Self Care' },
        { id: 't-open-38', title: 'Walk 6k a day', status: 'in-progress', deadline: '2026-03-12T19:00', listName: 'Self Care' },
        { id: 't-open-39', title: 'Read for thirty minutes', status: 'needsAction', deadline: null, listName: 'Self Care' },
        { id: 't-open-40', title: 'Practice keyframe easing', status: 'needsAction', deadline: null, listName: 'Skills' },
        { id: 't-open-41', title: 'Rebuild the intro animation', status: 'needsAction', deadline: '2026-04-06T18:00', listName: 'Skills' },
        { id: 't-open-42', title: 'Export the brand pack', status: 'needsAction', deadline: '2026-03-13T18:00', listName: 'Skills' },
        { id: 't-open-43', title: 'Plan the October calendar', status: 'needsAction', deadline: '2026-04-08T18:00', listName: 'Marketing', projectName: 'Mutineer Work' },
        { id: 't-open-44', title: 'Draft the investor update', status: 'needsAction', deadline: '2026-03-16T18:00', listName: 'Operations', projectName: 'Mutineer Work' },
        { id: 't-open-45', title: 'Reconcile the invoices', status: 'needsAction', deadline: '2026-03-08T18:00', listName: 'Operations', projectName: 'Mutineer Work' },
        { id: 't-open-46', title: 'File the quarterly returns', status: 'needsAction', deadline: '2026-04-10T18:00', listName: 'Operations', projectName: 'Mutineer Work' },
        { id: 't-open-47', title: 'Back up the project archive', status: 'needsAction', deadline: null, listName: 'Operations', projectName: 'Mutineer Work' },
        { id: 't-open-48', title: 'Renew the studio insurance', status: 'needsAction', deadline: '2026-03-30T18:00', listName: 'Operations', projectName: 'Mutineer Work' },
      ],
    },
  };

  return {
    turns: [
      {
        id: 'dev-backlog',
        userText: 'What is still open across everything?',
        assistantText: [
          '**48 open**, and three of them are late. The shape of it:',
          '',
          '- **Mutineer Work** — 21, mostly Content and Marketing',
          '- **Level Ai** — 19, and the waitlist work is the live part',
          '- **Skills and Self Care** — 8, all of it optional this week',
          '',
          'The three late ones are the launch email, the demo replies and the ad budget.',
          'Everything else can wait until Thursday without hurting.',
        ].join('\n'),
        toolCalls: [searchTasks],
        status: 'done',
        usage: { promptTokens: 2_140, responseTokens: 268, thoughtsTokens: 0, totalTokens: 2_408, requests: 1 },
        model: 'gemma4:e4b',
        elapsedMs: 3_400,
        ranOnAtlas: true,
      },
    ],
  };
}

/**
 * The Atlas transcript (item 9D). One read that comes back with rows, and one
 * turn that wrote — including a deletion, which is the whole reason `/trash`
 * is where an Atlas undo goes until item 13.
 *
 * Everything is literal for the same reason the transcript above is: a
 * baseline is only worth diffing if the data behind it never moves. The
 * summaries are the real tools' own wording, copied from
 * `agent/tools/taskTools.ts` and `trashTools.ts`, so the chips read exactly as
 * they will against a live laptop.
 */
function atlasFixture(): DevChatFixture {
  const searchTasks: AgentToolCall = {
    name: 'search_tasks',
    args: { query: 'lease' },
    ok: true,
    summary: '2 tasks matching "lease".',
    durationMs: 14,
    data: {
      totalMatches: 2,
      truncated: false,
      results: [
        {
          id: 't-lease',
          title: 'Countersign the studio lease',
          status: 'needsAction',
          deadline: '2026-03-17T16:00',
          listName: 'The Space',
          allocatedMinutes: 45,
        },
        {
          id: 't-lease-scan',
          title: 'Scan the signed lease for the file',
          status: 'needsAction',
          deadline: '2026-03-18T10:00',
          listName: 'The Space',
          allocatedMinutes: 15,
        },
      ],
    },
  };

  /* One of the seven MCP-only tools `describeToolCall` has no case for. It
     lands on the `default` branch: verb from the name, detail from summary. */
  const removeSubtask: AgentToolCall = {
    name: 'remove_subtask',
    args: { subtaskIds: ['s-lease-chase'] },
    ok: true,
    summary:
      'Removed the step "Chase the landlord for a countersigned copy" from "Countersign the studio lease". ' +
      'This does not go to the Trash.',
    durationMs: 8,
    data: {
      done: 1,
      subtasks: [{ subtaskId: 's-lease-chase', taskId: 't-lease', removedCount: 1, ownerTitle: 'Countersign the studio lease' }],
    },
  };

  const deleteTask: AgentToolCall = {
    name: 'delete_task',
    args: { taskIds: ['t-lease-scan'] },
    ok: true,
    summary:
      'Deleted "Scan the signed lease for the file". It is in the Trash for 30 days — restore_from_trash puts it back.',
    durationMs: 22,
    data: {
      done: 1,
      entryIds: ['e-lease-scan'],
      tasks: [{ taskId: 't-lease-scan', entryId: 'e-lease-scan', title: 'Scan the signed lease for the file', subtaskCount: 0 }],
    },
  };

  /*
   * ── ITEM 11: THE WEB DRAWER ──
   *
   * The first two tools in this fixture that BASE does not declare.
   * They come from Atlas's own MCP server, so `getTool` cannot answer for
   * either — which is precisely why they are photographed: the chip has to
   * land on the READ side of the turn, with a glyph of its own, on the
   * strength of a registry lookup that comes back `undefined`.
   *
   * The `data` on both is exactly the shape `atlas/src/lookup/tools.ts`
   * returns, copied from a live run against the real page, so the numbers in
   * the shot are numbers that happened rather than numbers that were typed.
   */
  const searchWeb: AgentToolCall = {
    name: 'search_web',
    args: { query: 'iCalendar RRULE last friday of month' },
    ok: true,
    summary: [
      '2 results for "iCalendar RRULE last friday of month", from brave:',
      '',
      '1. RFC 5545 — Internet Calendaring',
      '   https://www.rfc-editor.org/rfc/rfc5545.txt',
      '   The iCalendar core object specification.',
      '2. dateutil rrule',
      '   https://dateutil.readthedocs.io/',
      '   A Python implementation of the rule set.',
      '',
      'None of these have been read. Call fetch_url on the one that looks right.',
    ].join('\n'),
    durationMs: 640,
    data: {
      query: 'iCalendar RRULE last friday of month',
      page: 1,
      provider: 'brave',
      more: true,
      suspicious: false,
      results: [
        { rank: 1, title: 'RFC 5545 — Internet Calendaring', url: 'https://www.rfc-editor.org/rfc/rfc5545.txt', snippet: 'The iCalendar core object specification.' },
        { rank: 2, title: 'dateutil rrule', url: 'https://dateutil.readthedocs.io/', snippet: 'A Python implementation of the rule set.' },
      ],
    },
  };

  const fetchUrl: AgentToolCall = {
    name: 'fetch_url',
    args: { url: 'https://www.rfc-editor.org/rfc/rfc5545.txt', question: 'how do I express the last Friday of every month' },
    ok: true,
    summary: [
      'A page — https://www.rfc-editor.org/rfc/rfc5545.txt',
      'Read on gemma4:e4b. 42,061 words — too long to read whole, so about 9% of it was picked out as the part '
        + 'answering this. Say so if it matters.',
      '',
      'The BYDAY rule part takes a COMMA-separated list of days, each of which may carry an ordinal. For a MONTHLY '
        + 'rule, -1FR is the last Friday of the month.',
      '',
      'Source: https://www.rfc-editor.org/rfc/rfc5545.txt — say where this came from when you use it.',
    ].join('\n'),
    durationMs: 5_300,
    data: {
      url: 'https://www.rfc-editor.org/rfc/rfc5545.txt',
      title: '',
      words: 42_061,
      truncated: true,
      suspicious: false,
      suspiciousLines: [],
      readBy: 'gemma4:e4b',
    },
  };

  return {
    turns: [
      {
        id: 'dev-atlas-read',
        userText: 'What is still open on the studio lease?',
        assistantText: [
          'Two things:',
          '',
          '- **Countersigning** — Tuesday at 4:00 pm',
          '- **Scan the signed lease** — Wednesday morning',
          '',
          'The scan is a step you will only need if the landlord posts it back rather than emailing it.',
        ].join('\n'),
        toolCalls: [searchTasks],
        status: 'done',
        usage: { promptTokens: 2_180, responseTokens: 96, thoughtsTokens: 0, totalTokens: 2_276, requests: 2 },
        model: 'gemma4:e4b',
        elapsedMs: 3_800,
        ranOnAtlas: true,
      },
      {
        id: 'dev-atlas-write',
        userText: 'They are emailing it. Drop the scan task and the chase step.',
        assistantText:
          'Done. The scan is in the Trash and the chase step is off the countersigning task.',
        toolCalls: [removeSubtask, deleteTask],
        status: 'done',
        // Atlas wrote these and this browser's ring never saw them.
        usage: { promptTokens: 2_910, responseTokens: 74, thoughtsTokens: 0, totalTokens: 2_984, requests: 3 },
        model: 'gemma4:e4b',
        elapsedMs: 6_200,
        ranOnAtlas: true,
      },
      {
        id: 'dev-atlas-web',
        userText: 'How do I say "last Friday of every month" in an RRULE?',
        /* The turn that carries code and a citation, because this is the one
           that went to the web. `<outside_text>` tells Atlas to name the
           source and give the link, so a bare URL in the last line is the
           format a real answer arrives in — and it is now a link you can
           tap rather than a string you have to retype. */
        assistantText: [
          '`BYDAY=-1FR` with `FREQ=MONTHLY` — the `-1` is the ordinal, counted from the end of the month.',
          '',
          '```text',
          'FREQ=MONTHLY;INTERVAL=1;BYDAY=-1FR',
          '```',
          '',
          '### Where this came from',
          '',
          'RFC 5545 itself: https://www.rfc-editor.org/rfc/rfc5545.txt',
        ].join('\n'),
        toolCalls: [searchWeb, fetchUrl],
        status: 'done',
        // Nothing was written, so there is nothing to revert — and both of
        // these came from a server the app does not own.
        usage: { promptTokens: 1_640, responseTokens: 88, thoughtsTokens: 0, totalTokens: 1_728, requests: 3 },
        model: 'gemma4:e4b',
        elapsedMs: 7_100,
        ranOnAtlas: true,
      },
    ],
    // Nothing to seed. That absence is the fixture's whole second claim.

    /*
     * ── ITEM 10: THE CONVERSATION LIST ──
     *
     * **Timestamps measured back from `FROZEN_NOW`**, which
     * `scripts/fixture.ts` pins to **12 March 2026, 09:30 +05:30** — a
     * Thursday. The "when" column is relative, so a literal date picked
     * without reference to that clock reads as "now" for every row (a future
     * timestamp gives negative minutes) and the column says nothing.
     *
     * These land on now / 2h / Mon / Sat / 27 Feb, which is `atlas.html`'s own
     * spread across all four of `relativeWhen`'s scales. Change one and check
     * it against `FROZEN_NOW`, not against today.
     *
     * `atlas.html`'s five titles, kept: the baseline can then be diffed
     * against the mockup by eye. The open one is the lease conversation the
     * transcript above is actually about — a list whose selected row named
     * something else would be a screen contradicting itself.
     */
    conversations: [
      { id: 'c-lease', title: 'Studio lease — what is left', untitled: false, pinned: true,
        createdAt: '2026-03-12T03:30:00.000Z', updatedAt: '2026-03-12T03:59:00.000Z', messages: 6, compactions: 0 },
      { id: 'c-today', title: 'Today, and a session', untitled: false, pinned: false,
        createdAt: '2026-03-12T01:40:00.000Z', updatedAt: '2026-03-12T02:00:00.000Z', messages: 4, compactions: 0 },
      { id: 'c-ca', title: 'CA shortlist', untitled: false, pinned: false,
        createdAt: '2026-03-09T03:20:00.000Z', updatedAt: '2026-03-09T04:00:00.000Z', messages: 12, compactions: 0 },
      { id: 'c-invoices', title: 'Empire invoices — Rahul', untitled: false, pinned: false,
        createdAt: '2026-03-07T03:10:00.000Z', updatedAt: '2026-03-07T04:00:00.000Z', messages: 18, compactions: 1 },
      { id: 'c-scoring', title: 'Rewrite the scoring dial', untitled: false, pinned: false,
        createdAt: '2026-02-27T03:30:00.000Z', updatedAt: '2026-02-27T04:00:00.000Z', messages: 9, compactions: 0 },
    ],
    currentConversationId: 'c-lease',
  };
}
