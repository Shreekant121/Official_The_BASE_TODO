import type { AgentMessage, AgentToolCall } from '../agent/types';
import { ASK_REFUSAL_PREFIX } from '../askCard';

/**
 * A stored conversation, redrawn as a transcript (item 10).
 *
 * WHY THE APP REBUILDS THIS AND ATLAS DOES NOT STORE IT
 * ------------------------------------------------------
 * Atlas keeps `AgentMessage[]` — the conversation as a *model* sees it, which
 * is the same shape every provider round-trips and the only one that can be
 * fed back in. What `/chat` draws is something else: a user turn, the tools
 * that ran, and the reply, grouped into the block that owns Revert. Storing
 * that shape on the laptop would put this app's screen inside Atlas, which
 * serves any client — the tablet, the phone bridge at item 26, whatever comes
 * next. So the message log is the record and the transcript is a rendering of
 * it, rebuilt here.
 *
 * **What a rebuilt turn cannot have, and does not pretend to.** `durationMs`
 * on a tool call is measured while the call happens and is not in the log, so
 * it comes back as 0 and the chip shows no timing. `elapsedMs`, `usage` and
 * the turn's cost (item 12) are the same: measured live, never stored, absent
 * on reload.
 *
 * **ITEM 12: THE REASONING COMES BACK, AND ITS DURATION DOES NOT.** A thinking
 * part is in the message log — that is the whole reason `agent/types.ts` made
 * it a part rather than a field on the turn — so a conversation reopened next
 * week still shows what Atlas was working through. How long it *streamed* for
 * is measured in the browser as the characters arrive and is not written down,
 * so it comes back as `0` and the block prints no duration. Exactly the call
 * `durationMs` makes, for exactly the same reason: no timing beats a made-up
 * one. And
 * `snapshotTurnId` is `null` for every reloaded turn — the snapshot ring is a
 * Zustand store in *this browser* and a conversation reopened tomorrow has
 * nothing in it to undo. That is not a gap this item should paper over: what
 * makes an Atlas write reversible is Atlas's own action log, which is item 13.
 */

export interface RebuiltTurn {
  id: string;
  userText: string;
  assistantText: string;
  toolCalls: AgentToolCall[];
  /**
   * The reasoning, one entry per round trip that produced any (item 12).
   *
   * `ms` is `0` on every rebuilt turn — see the header. `round` is the index
   * of the assistant message it came from rather than Atlas's own round
   * counter, which is not in the log either; it is only ever used to keep the
   * entries in order and to key them, so the two agree about what matters.
   */
  thinking?: { round: number; text: string; ms: number; startedAt: number }[];
  /**
   * True when this "turn" is compaction's summary rather than something
   * Shreekant said. Drawn as a marker in the transcript, never as his words.
   */
  compactionMarker?: boolean;
}

/**
 * How compaction's preamble announces itself (`atlas/src/memory/compaction.ts`).
 *
 * **A string shared across two repositories, and that is a real cost worth
 * naming.** The alternative was a field on the message, which `AgentMessage`
 * does not have and which every provider adapter would then have to carry
 * through untouched — a much larger change to the one type items 5 and 6 kept
 * provider-neutral. If Atlas ever rewords its preamble, this stops matching
 * and the summary is drawn as a user turn: visible and wrong-looking rather
 * than silently lost, which is the failure mode to prefer.
 */
const COMPACTION_PREFIX = '[Earlier in this conversation, summarised';

function textOf(message: AgentMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

/**
 * Group the message log back into turns.
 *
 * A turn starts at a `user` message and runs until the next one, gathering the
 * assistant's words and pairing every `tool_call` with the `tool_result` that
 * answered it. Results are matched **by `id` when the provider sent one and by
 * name otherwise** — Gemini parallel-calls with ids, Ollama's shape does not
 * always, and a name-only match is right whenever a round trip called each
 * tool once, which is every round trip in practice.
 */
export function turnsFromHistory(history: AgentMessage[]): RebuiltTurn[] {
  const turns: RebuiltTurn[] = [];

  /** Every tool result in the log, so a call can find its answer. */
  const resultFor = (id: string | undefined, name: string, from: number): { ok: boolean; summary: string; data?: unknown } | null => {
    for (let i = from; i < history.length; i += 1) {
      const message = history[i];
      if (message.role === 'user') break;
      if (message.role !== 'tool') continue;
      for (const part of message.parts) {
        if (part.type !== 'tool_result') continue;
        const matches = id !== undefined && part.id !== undefined ? part.id === id : part.name === name;
        if (!matches) continue;
        const result = part.result as { ok?: unknown; summary?: unknown; data?: unknown };
        return {
          ok: result.ok !== false,
          summary: typeof result.summary === 'string' ? result.summary : '',
          ...(result.data === undefined ? {} : { data: result.data }),
        };
      }
    }
    return null;
  };

  let current: RebuiltTurn | null = null;

  history.forEach((message, index) => {
    if (message.role === 'user') {
      const text = textOf(message);
      if (current !== null) turns.push(current);
      current = {
        id: `saved-${index}`,
        userText: text,
        assistantText: '',
        toolCalls: [],
        ...(text.startsWith(COMPACTION_PREFIX) ? { compactionMarker: true } : {}),
      };
      return;
    }

    if (current === null) {
      // An assistant message with no user message before it. Not something
      // Atlas writes, but a hand-edited file could, and dropping it silently
      // would lose an answer rather than show an odd one.
      current = { id: `saved-${index}`, userText: '', assistantText: '', toolCalls: [] };
    }

    if (message.role !== 'assistant') return;

    const words = textOf(message);
    if (words !== '') {
      current.assistantText = current.assistantText === '' ? words : `${current.assistantText}\n\n${words}`;
    }

    /* Item 12. Kept out of `assistantText` — `textOf` filters on `text`, so
       the reasoning has never been able to leak into the reply — and carried
       here so a reopened conversation still shows it. */
    for (const part of message.parts) {
      if (part.type !== 'thinking' || part.text.trim() === '') continue;
      current.thinking = [...(current.thinking ?? []), { round: index, text: part.text, ms: 0, startedAt: 0 }];
    }

    for (const part of message.parts) {
      if (part.type !== 'tool_call') continue;
      const answer = resultFor(part.id, part.name, index + 1);
      /* BUILD-16. A write the model reached for in the same breath as a
         question was refused on the laptop and never reached the screen live
         — `core.ts` answers it and reports nothing. It stays out here too,
         or a reopened chat would show a failed write nobody saw happen. */
      if (answer?.summary.startsWith(ASK_REFUSAL_PREFIX)) continue;
      current.toolCalls.push({
        name: part.name,
        args: part.args,
        ok: answer?.ok ?? false,
        summary: answer?.summary ?? 'No result was recorded for this call.',
        ...(answer?.data === undefined ? {} : { data: answer.data }),
        // Measured while the call runs; never stored. The chip shows no time
        // rather than a made-up one.
        durationMs: 0,
      });
    }
  });

  if (current !== null) turns.push(current);
  return turns;
}
