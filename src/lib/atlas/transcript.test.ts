import { describe, expect, it } from 'vitest';
import { turnsFromHistory } from './transcript';
import type { AgentMessage } from '../agent/types';

/**
 * Redrawing a stored conversation (item 10).
 *
 * This is what "closing the tab and coming back shows the conversation still
 * there" actually rests on. Atlas keeps the message log — the shape a model
 * round-trips — and this turns it back into the blocks `/chat` draws, so every
 * way the two shapes disagree is a way a reopened conversation looks wrong.
 *
 * The three worth pinning: a tool call finds the result that answered it, a
 * turn keeps everything the assistant said across several round trips, and
 * **compaction's summary is not drawn as something Shreekant said** — which is
 * the one that would be actively misleading rather than merely untidy.
 */

const user = (text: string): AgentMessage => ({ role: 'user', parts: [{ type: 'text', text }] });

describe('turnsFromHistory', () => {
  it('groups a plain exchange into one turn each', () => {
    const turns = turnsFromHistory([
      user('What is on today?'),
      { role: 'assistant', parts: [{ type: 'text', text: 'Three tasks.' }] },
      user('Queue two of them.'),
      { role: 'assistant', parts: [{ type: 'text', text: 'Done.' }] },
    ]);

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ userText: 'What is on today?', assistantText: 'Three tasks.' });
    expect(turns[1]).toMatchObject({ userText: 'Queue two of them.', assistantText: 'Done.' });
  });

  it('pairs a tool call with the result that answered it', () => {
    const turns = turnsFromHistory([
      user('Find my tax task'),
      {
        role: 'assistant',
        parts: [{ type: 'tool_call', id: 'c1', name: 'search_tasks', args: { query: 'tax' } }],
      },
      {
        role: 'tool',
        parts: [
          {
            type: 'tool_result',
            id: 'c1',
            name: 'search_tasks',
            result: { ok: true, summary: '2 matches of 34 scanned', data: { rows: 2 } },
          },
        ],
      },
      { role: 'assistant', parts: [{ type: 'text', text: 'Two of them.' }] },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].toolCalls).toHaveLength(1);
    expect(turns[0].toolCalls[0]).toMatchObject({
      name: 'search_tasks',
      args: { query: 'tax' },
      ok: true,
      summary: '2 matches of 34 scanned',
      data: { rows: 2 },
    });
    // Measured while the call runs, never stored. No made-up number.
    expect(turns[0].toolCalls[0].durationMs).toBe(0);
    expect(turns[0].assistantText).toBe('Two of them.');
  });

  it('matches by name when the provider sent no id', () => {
    // Ollama's shape does not always carry one, and a name-only match is right
    // for every round trip that called each tool once — which is all of them.
    const turns = turnsFromHistory([
      user('Add a task'),
      { role: 'assistant', parts: [{ type: 'tool_call', name: 'create_task', args: { title: 'Call the CA' } }] },
      {
        role: 'tool',
        parts: [{ type: 'tool_result', name: 'create_task', result: { ok: true, summary: 'Created it.' } }],
      },
    ]);

    expect(turns[0].toolCalls[0].summary).toBe('Created it.');
    expect(turns[0].toolCalls[0].ok).toBe(true);
  });

  it('keeps the words from every round trip of one turn', () => {
    const turns = turnsFromHistory([
      user('Do both'),
      { role: 'assistant', parts: [{ type: 'text', text: 'Looking first.' }, { type: 'tool_call', name: 'search_tasks', args: {} }] },
      { role: 'tool', parts: [{ type: 'tool_result', name: 'search_tasks', result: { ok: true, summary: 'one' } }] },
      { role: 'assistant', parts: [{ type: 'text', text: 'Both done.' }] },
    ]);

    expect(turns).toHaveLength(1);
    expect(turns[0].assistantText).toBe('Looking first.\n\nBoth done.');
  });

  it('carries a failed call through as failed', () => {
    const turns = turnsFromHistory([
      user('Delete it'),
      { role: 'assistant', parts: [{ type: 'tool_call', name: 'delete_task', args: { id: 'nope' } }] },
      {
        role: 'tool',
        parts: [{ type: 'tool_result', name: 'delete_task', result: { ok: false, summary: 'No task with that id.' } }],
      },
    ]);

    expect(turns[0].toolCalls[0].ok).toBe(false);
    expect(turns[0].toolCalls[0].summary).toBe('No task with that id.');
  });

  it('keeps the question and drops the write refused beside it (BUILD-16)', () => {
    // Atlas answers a write made in the same breath as a question with a
    // refusal and never shows it live; a reopened chat must not show it either.
    const turns = turnsFromHistory([
      user('add a task to call the CA'),
      {
        role: 'assistant',
        parts: [
          { type: 'tool_call', id: 'a', name: 'ask_questions', args: { questions: [{ question: 'When is it due?' }] } },
          { type: 'tool_call', id: 'b', name: 'create_task', args: { tasks: [{ title: 'Call the CA' }] } },
        ],
      },
      {
        role: 'tool',
        parts: [
          { type: 'tool_result', id: 'a', name: 'ask_questions', result: { ok: true, summary: 'Asked.' } },
          {
            type: 'tool_result', id: 'b', name: 'create_task',
            result: { ok: false, summary: 'Not run: you asked Shreekant a question in the same step. Nothing was changed.' },
          },
        ],
      },
    ]);

    expect(turns[0].toolCalls.map((call) => call.name)).toEqual(['ask_questions']);
  });

  it('says so when a call has no recorded result', () => {
    // What a conversation cut off mid-turn leaves behind. Drawing it as a
    // successful call would be the worst of the three options.
    const turns = turnsFromHistory([
      user('Delete it'),
      { role: 'assistant', parts: [{ type: 'tool_call', name: 'delete_task', args: {} }] },
    ]);

    expect(turns[0].toolCalls[0].ok).toBe(false);
    expect(turns[0].toolCalls[0].summary).toContain('No result was recorded');
  });

  it('marks compaction’s summary rather than drawing it as his words', () => {
    const turns = turnsFromHistory([
      user('[Earlier in this conversation, summarised because it grew too long to keep in full.]\n\nHe asked about invoices.'),
      { role: 'assistant', parts: [{ type: 'text', text: 'Carrying on.' }] },
    ]);

    expect(turns[0].compactionMarker).toBe(true);
  });

  it('leaves an ordinary message unmarked', () => {
    const turns = turnsFromHistory([user('Summarise the lease conversation')]);
    expect(turns[0].compactionMarker).toBeUndefined();
  });

  it('returns nothing for an empty conversation', () => {
    expect(turnsFromHistory([])).toEqual([]);
  });
});
