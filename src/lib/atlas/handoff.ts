import { fetchConversation, fetchConversations, type AtlasConversation } from './client';
import { turnsFromHistory } from './transcript';

/**
 * The hand-off prompt (BUILD-12, DESIGN.md §3.2's "escape hatch").
 *
 * *"Atlas can package the problem, its context and what it has tried into a
 * prompt Shreekant can paste into any other AI chat. Atlas is never a dead
 * end."* This is that package, and it is **built, not written**: his call on
 * 2026-09-24, over having the local model summarise the conversation. A
 * summary from the model that just got stuck is the one summary most likely
 * to leave out what mattered, and it costs half a minute; this is instant,
 * costs nothing, and holds everything — every ask, every tool Atlas reached
 * for with its arguments, what each one returned, and every answer.
 *
 * **What it leaves out, on purpose:** the reasoning (long, and it is the
 * stuck model's own account of itself — the calls and results are the
 * evidence), and a tool result's structured `data`, which is for this app's
 * screen. The one-line `summary` is what the model itself read back, so it is
 * the honest record of what Atlas knew.
 *
 * It is built from the laptop's copy of the conversation, not from what this
 * screen is holding: a tablet that slept is behind, and item 10 made the
 * laptop's file the record.
 */

type HandoffSource = Pick<AtlasConversation, 'title' | 'untitled' | 'history'>;

const OPENING = [
  'I want your help with something my own assistant could not finish. Below is a conversation I had with Atlas, the assistant built into my task app, BASE. Atlas runs a small AI model on my laptop and works on my tasks, projects and lists through tools of its own. You cannot use those tools, but what it tried shows what has already been done and what came back.',
  '',
  'Please read it, tell me plainly what Atlas got wrong or missed, and then answer the last thing I asked. If you need something from my tasks that is not here, ask me for it rather than guessing.',
].join('\n');

function formatDate(now: Date): string {
  return now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** The prompt, as text. Pure: the date is an argument so a test can pin it. */
export function handoffPrompt(conversation: HandoffSource, now: Date): string {
  const turns = turnsFromHistory(conversation.history);
  const exchanges = turns.filter((turn) => !turn.compactionMarker).length;

  const lines: string[] = [OPENING, ''];
  const title = conversation.untitled ? 'an untitled chat' : `"${conversation.title}"`;
  lines.push(
    `The conversation: ${title}, ${exchanges} ${exchanges === 1 ? 'exchange' : 'exchanges'}, copied on ${formatDate(now)}.`,
  );

  let n = 0;
  for (const turn of turns) {
    lines.push('');
    /* Compaction replaced the start of a long chat with Atlas's own summary
       of it. Said as what it is, never as something he wrote. */
    if (turn.compactionMarker) {
      lines.push('## Earlier in the conversation (Atlas\'s own summary of it)', '', turn.userText);
      continue;
    }

    n += 1;
    lines.push(`## ${n}`, '', `**Me:** ${turn.userText === '' ? '(nothing)' : turn.userText}`);

    if (turn.toolCalls.length > 0) {
      lines.push('', '**What Atlas tried:**');
      for (const call of turn.toolCalls) {
        const args = Object.keys(call.args).length === 0 ? '' : ` ${JSON.stringify(call.args)}`;
        const outcome = call.ok ? call.summary : `FAILED: ${call.summary}`;
        lines.push(`- \`${call.name}\`${args} → ${outcome === '' ? '(returned nothing)' : outcome}`);
      }
    }

    lines.push(
      '',
      turn.assistantText === ''
        ? '**Atlas answered:** nothing — the turn ended here.'
        : `**Atlas answered:** ${turn.assistantText}`,
    );
  }

  if (turns.length === 0) lines.push('', '(The conversation is empty.)');
  return `${lines.join('\n')}\n`;
}

/**
 * Builds the prompt for one conversation and puts it on the clipboard.
 *
 * `null` means "the most recent", which is what `/atlas-host`'s button copies —
 * that screen has no conversation open, and the one he just gave up on is the
 * one he last touched. Resolves to the title copied, for the toast; rejects
 * with a sentence fit to show him.
 */
export async function copyHandoff(baseUrl: string, conversationId: string | null): Promise<string> {
  let id = conversationId;
  if (id === null) {
    const all = await fetchConversations(baseUrl, '');
    const latest = all.reduce<(typeof all)[number] | null>(
      (best, row) => (best === null || row.updatedAt > best.updatedAt ? row : best),
      null,
    );
    if (latest === null) throw new Error('There is no conversation on the laptop to hand off yet.');
    id = latest.id;
  }

  const conversation = await fetchConversation(baseUrl, id);
  const text = handoffPrompt(conversation, new Date());
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    throw new Error('This browser would not let BASE write to the clipboard.');
  }
  return conversation.untitled ? 'Untitled chat' : conversation.title;
}
