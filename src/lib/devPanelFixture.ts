/**
 * Dev-only fixture for the AI panel (BUILD-4), used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Everything inside the panel comes from a model on the laptop, over a tailnet
 * the harness blocks. Without this the panel has one photographable state —
 * empty, with openers — and the four things `screens/ai-panel.html` exists to
 * show (a tool result with its Undo, the amber approval, a field the answer
 * filled, a question card) would have no baseline at all.
 *
 * `?__dev-panel-fixture__=task|list|project|score` opens the panel on that
 * surface, already holding an exchange. The subjects are `scripts/fixture.ts`'s
 * own objects, so the host marks a real card.
 *
 * The **tenth** of its kind, and kept out of the shipped bundle the same way as
 * the other nine: every branch behind a bare `import.meta.env.DEV`, which Vite
 * folds to `false` in a production build, and `scripts/check-shots-bypass.mjs`
 * greps `dist/` for the marker. **Do not read that flag into a variable
 * first**, and **do not lift anything below to module scope** — a module-level
 * `const` is initialised whether or not the guarded function is reachable.
 *
 * Every word below is invented, like the mockup's. The Undo is "ready" but
 * points at a log turn that does not exist: pressing it in a hand check says
 * so, which is the honest outcome.
 */
import type { PanelSubjectRef, ScoreDraftPatch } from './aiPanel';
import { seedSession, type PanelSession } from './aiPanelRun';
import { subjectKey } from './aiPanel';

export interface PanelFixture {
  ref: PanelSubjectRef;
  /** `/scoring` only: what the fills put in the draft, so the page agrees with the panel. */
  patch?: ScoreDraftPatch;
}

export function devPanelFixture(): PanelFixture | null {
  if (!import.meta.env.DEV) return null;
  const match = /__dev-panel-fixture__=([a-z]+)/.exec(window.location.search);
  if (match === null) return null;

  const which = match[1];
  let fixture: PanelFixture;
  let session: Partial<PanelSession>;

  if (which === 'project') {
    fixture = { ref: { kind: 'project', id: 'p-empire' } };
    session = {
      items: [
        { kind: 'you', id: 'fx-1', text: 'The bank account slipped. Push its deadline a week and tidy up what is finished.' },
        {
          kind: 'did', id: 'fx-2', turn: 'fx-turn',
          did: {
            tool: 'update_task', icon: 'pencil', ok: true,
            rows: [{ label: 'Open the current account', meta: 'deadline → Fri 27 Mar 5pm' }],
          },
        },
        { kind: 'ai', id: 'fx-3', text: 'Moved it a week. The Money list has nothing else due before then.' },
        {
          kind: 'approve', id: 'fx-4', approvalId: 'fx-approval', hard: false, state: 'waiting',
          title: 'Delete the list "Old marketing ideas" and the 2 tasks in it',
          note: 'Goes to the Trash with everything in it. Revert on the Log screen brings it back.',
        },
      ],
      undos: { 'fx-turn': { status: 'ready', via: 'atlas', logTurnId: 'fx-log-turn' } },
    };
  } else if (which === 'list') {
    fixture = { ref: { kind: 'list', id: 'l-empire-ops' } };
    session = {
      items: [
        { kind: 'you', id: 'fx-1', text: 'What should I do first in here?' },
        {
          kind: 'ai', id: 'fx-2',
          text: 'The incorporation paperwork. It is already running, it is overdue, and the bank account waits on it.',
        },
        {
          kind: 'ask', id: 'fx-3',
          card: {
            questions: [
              {
                id: 'q1', question: 'Start it now, or finish the compliance review first?', kind: 'one',
                options: ['Start the paperwork', 'Review first'], suggested: ['Start the paperwork'],
                why: 'It is overdue, and the bank account waits on it.', optional: false,
              },
            ],
          },
        },
      ],
    };
  } else if (which === 'score') {
    fixture = {
      ref: { kind: 'score', id: 't-audit' },
      patch: { description: 'Check the registers and minutes are current before the quarter closes.' },
    };
    /* BUILD-16: everything still missing on one card, answered top to
       bottom — the Score screen's questions moved onto it, his call. */
    session = {
      items: [
        {
          kind: 'filled', id: 'fx-1', field: 'Description',
          value: 'Check the registers and minutes are current before the quarter closes.',
        },
        { kind: 'ai', id: 'fx-2', text: 'The description is in. Three more and it can be scored.' },
        {
          kind: 'ask', id: 'fx-3',
          card: {
            title: 'Three things before this is scored',
            questions: [
              {
                id: 'q1', question: 'When is it due?', kind: 'one',
                options: ['Fri 20 Mar', 'Mon 23 Mar', 'Fri 27 Mar', 'Tue 31 Mar'], suggested: ['Fri 27 Mar'],
                why: 'The quarter closes on the 31st; this leaves two working days.', optional: false,
              },
              {
                id: 'q2', question: 'How long will it take?', kind: 'one',
                options: ['30 min', '1 h', '2 h', '3 h'], suggested: ['2 h'], optional: false,
              },
              {
                id: 'q3', question: 'How important, out of 9?', kind: 'scale', options: [], suggested: ['7'],
                why: 'Compliance work scores 7 across your lists.', optional: false,
              },
            ],
          },
        },
      ],
    };
  } else {
    fixture = { ref: { kind: 'task', id: 't-bank' } };
    session = {
      items: [
        { kind: 'you', id: 'fx-1', text: 'Break this into steps' },
        {
          kind: 'did', id: 'fx-2', turn: 'fx-turn',
          did: { tool: 'add_subtask', icon: 'list-tree', ok: true, rows: [{ label: 'Collect the certificate of incorporation' }] },
        },
        {
          kind: 'did', id: 'fx-3', turn: 'fx-turn',
          did: { tool: 'add_subtask', icon: 'list-tree', ok: true, rows: [{ label: 'Book the branch appointment' }] },
        },
        { kind: 'ai', id: 'fx-4', text: 'Two steps added. The appointment cannot be booked until the certificate arrives.' },
      ],
      undos: { 'fx-turn': { status: 'ready', via: 'atlas', logTurnId: 'fx-log-turn' } },
    };
  }

  /* `titled` so a hand check that sends a message does not try to rename a
     conversation that was never on the laptop. */
  seedSession(subjectKey(fixture.ref), { ...session, titled: true });
  return fixture;
}
