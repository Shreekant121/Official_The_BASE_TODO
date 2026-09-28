import { describe, expect, it } from 'vitest';
import { handoffPrompt } from './handoff';
import type { AgentMessage } from '../agent/types';

/**
 * The hand-off prompt (BUILD-12). The claims: it holds every ask, every tool
 * call with its arguments and what came back, and every answer; a failure is
 * marked as one; the reasoning stays out; and compaction's summary is never
 * passed off as something he said.
 */

const NOW = new Date('2026-09-24T10:00:00+05:30');

const HISTORY: AgentMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'Add a task to call the CA' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'thinking', text: 'He wants a task. I should look for a CA project first.' },
      { type: 'tool_call', id: 'c1', name: 'search_tasks', args: { query: 'CA' } },
    ],
  },
  {
    role: 'tool',
    parts: [{ type: 'tool_result', id: 'c1', name: 'search_tasks', result: { ok: true, summary: 'No tasks match "CA".' } }],
  },
  {
    role: 'assistant',
    parts: [{ type: 'tool_call', id: 'c2', name: 'create_task', args: { title: 'Call the CA', listId: 'nope' } }],
  },
  {
    role: 'tool',
    parts: [
      { type: 'tool_result', id: 'c2', name: 'create_task', result: { ok: false, summary: 'There is no list "nope".' } },
    ],
  },
  { role: 'assistant', parts: [{ type: 'text', text: 'I could not add it.' }] },
  { role: 'user', parts: [{ type: 'text', text: 'Why not?' }] },
];

describe('handoffPrompt', () => {
  const text = handoffPrompt({ title: 'Call the CA', untitled: false, history: HISTORY }, NOW);

  it('holds every ask, every call with its arguments, and every answer', () => {
    expect(text).toContain('**Me:** Add a task to call the CA');
    expect(text).toContain('`search_tasks` {"query":"CA"} → No tasks match "CA".');
    expect(text).toContain('**Atlas answered:** I could not add it.');
    expect(text).toContain('**Me:** Why not?');
  });

  it('marks a failed call as failed', () => {
    expect(text).toContain('`create_task` {"title":"Call the CA","listId":"nope"} → FAILED: There is no list "nope".');
  });

  it('says so when a turn ended without an answer', () => {
    expect(text).toContain('**Atlas answered:** nothing — the turn ended here.');
  });

  it('leaves the reasoning out', () => {
    expect(text).not.toContain('I should look for a CA project');
  });

  it('names the chat, counts the exchanges and dates the copy', () => {
    expect(text).toContain('"Call the CA", 2 exchanges, copied on Thursday, 24 September 2026.');
  });

  it('tells the other AI what it is reading and what to do', () => {
    expect(text.startsWith('I want your help with something my own assistant could not finish.')).toBe(true);
    expect(text).toContain('answer the last thing I asked');
  });

  it('draws compaction as Atlas\'s summary, never as his words', () => {
    const compacted = handoffPrompt(
      {
        title: 'Long one',
        untitled: false,
        history: [
          { role: 'user', parts: [{ type: 'text', text: '[Earlier in this conversation, summarised: he planned the week.]' }] },
          { role: 'user', parts: [{ type: 'text', text: 'And Friday?' }] },
        ],
      },
      NOW,
    );
    expect(compacted).toContain("## Earlier in the conversation (Atlas's own summary of it)");
    expect(compacted).not.toContain('**Me:** [Earlier');
    expect(compacted).toContain('1 exchange,');
  });

  it('does not invent a name for an untitled chat', () => {
    expect(handoffPrompt({ title: 'New chat', untitled: true, history: [] }, NOW)).toContain(
      'an untitled chat, 0 exchanges',
    );
  });
});
