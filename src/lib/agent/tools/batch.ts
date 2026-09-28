import type { ToolResult } from '../types';

/**
 * One call, many things (item 13D).
 *
 * WHY THIS IS A ROUND-TRIP PROBLEM AND NOT A SPEED ONE
 * -----------------------------------------------------
 * Every tool body here is an in-memory store read and already takes single-digit
 * milliseconds. What twelve calls cost is not twelve tool bodies — it is twelve
 * **model round trips**, and a round trip re-sends the whole tool menu (~4,669
 * tokens), the orientation block and the entire conversation so far, then thinks
 * again on the far side. *"Why does it think again and again"* and *"can we do
 * fewer round trips"* are the same question, and this file is the answer:
 * a think and a round trip are the same event, and the only way to have fewer of
 * them is to ask for more per call.
 *
 * THE FOUR RULES, SETTLED WITH SHREEKANT
 * ---------------------------------------
 * 1. **Uniformly.** Every tool takes a list — not only the ones where it
 *    obviously pays. A surface where some tools batch and some do not is one the
 *    model has to remember correctly, and it will not. This does not break the
 *    one-tool-one-job rule: `complete_task` with five ids is one job done five
 *    times, while a `complete_and_delete_task` would be two and is still
 *    forbidden.
 * 2. **Partial success reports; it does not abort.** Ten good ids and two bad
 *    ones completes the ten and names the two. All-or-nothing spends the whole
 *    request on one bad id, which is the worst possible use of the round trip
 *    that was just saved.
 * 3. **One undo for the whole batch.** One instruction, one undo. That falls out
 *    of the machinery rather than being built here — a batch is one tool call,
 *    one call opens one capture (`mcp/undo.ts`), and every item's snapshot lands
 *    in it — and `batch.test.ts` proves it rather than assuming it.
 * 4. **A failure is diagnosed, not blindly retried.** A wrong id retried ten
 *    times fails ten times; the fix for that is another search, and the reason
 *    strings below say so in as many words. There is deliberately no retry loop
 *    in any tool — a genuine glitch is something the model can see and try
 *    again, and a missing task is something it must not.
 *
 * IDS GO IN `data`, COUNTS GO IN THE SENTENCE
 * ---------------------------------------------
 * `summary` is what the transcript renders as a chip, so an id quoted there is
 * an id on Shreekant's screen — item 13C settled that it never is one. But the
 * model needs to know *which* of the ids it sent came back empty, or it cannot
 * do anything useful about it. So the two halves are split: `data.failed`
 * carries `{ id, reason }` for the model, and the sentence carries titles where
 * they are known and counts where they are not.
 */

/** One id that could not be acted on, and why. Read by the model, never printed. */
export interface BatchFailure {
  id: string;
  /** Written to be actionable: what went wrong, and what to do instead of retrying. */
  reason: string;
  /** The thing's title, when it was found and refused rather than not found at all. */
  title?: string;
}

export type ItemOutcome<T> = { ok: true; value: T; title: string } | { ok: false; reason: string; title?: string };

export interface BatchOutcome<T> {
  done: { id: string; value: T; title: string }[];
  failed: BatchFailure[];
}

/**
 * Runs one function per id, in the order they were given, collecting both sides.
 *
 * **Sequential on purpose.** The store is read-modify-write through Zustand
 * actions, and two items in the same batch can touch the same task — completing
 * a subtask and its parent, deleting two tasks that depend on each other. Racing
 * them would make the outcome depend on scheduling, and a batch that is
 * sometimes right is worse than one that is slow. There is nothing to gain
 * anyway: these are memory reads.
 */
export async function runBatch<T>(
  ids: string[],
  run: (id: string, index: number) => Promise<ItemOutcome<T>>,
): Promise<BatchOutcome<T>> {
  const done: BatchOutcome<T>['done'] = [];
  const failed: BatchFailure[] = [];

  for (const [index, id] of ids.entries()) {
    const outcome = await run(id, index);
    if (outcome.ok) done.push({ id, value: outcome.value, title: outcome.title });
    else failed.push({ id, reason: outcome.reason, ...(outcome.title === undefined ? {} : { title: outcome.title }) });
  }

  return { done, failed };
}

/** How many titles a sentence names before it starts counting instead. */
const NAMED_LIMIT = 4;

/**
 * `“A”, “B” and “C”`, or `“A”, “B”, “C”, “D” and 8 others`.
 *
 * The cut-off is not tidiness. A chip is one line on a phone, and a summary
 * naming thirty tasks is a summary nobody reads — including the model, which
 * gets the full list in `data` regardless.
 */
export function titleList(titles: string[]): string {
  const quoted = titles.map((title) => `"${title}"`);
  if (quoted.length <= NAMED_LIMIT + 1) return joinWords(quoted);
  const shown = quoted.slice(0, NAMED_LIMIT);
  return `${shown.join(', ')} and ${quoted.length - NAMED_LIMIT} others`;
}

function joinWords(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * The half of the sentence that says what did not happen.
 *
 * Reasons are grouped rather than listed one per id: twelve ids that were all
 * missing is one fact, and repeating it twelve times buries the one that was
 * different. Empty string when nothing failed, so a caller can concatenate
 * without a conditional.
 */
export function failureSentence(failed: BatchFailure[]): string {
  if (failed.length === 0) return '';

  const byReason = new Map<string, BatchFailure[]>();
  for (const failure of failed) {
    const bucket = byReason.get(failure.reason);
    if (bucket) bucket.push(failure);
    else byReason.set(failure.reason, [failure]);
  }

  const parts = [...byReason.entries()].map(([reason, group]) => {
    const named = group.filter((failure) => failure.title !== undefined).map((failure) => failure.title as string);
    const subject =
      named.length === group.length ? titleList(named) : `${group.length} of them`;
    // The reason writes itself as a sentence so it reads alone in `data`; here
    // it is a clause, and its own full stop would double up with the one below.
    return `${subject}: ${unpunctuated(reason)}`;
  });

  return ` ${failed.length} did not happen — ${parts.join('; ')}.`;
}

/** A reason with its trailing full stop taken off, for use as a clause. */
function unpunctuated(reason: string): string {
  return reason.replace(/\.\s*$/, '');
}

/**
 * First letter up, for a reason used as a whole sentence.
 *
 * Deliberately only the first character: a reason can open with a quoted field
 * name (`"deadline": could not be read…`) or a tool name, and neither should be
 * touched.
 */
function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The shape every batching tool returns.
 *
 * `ok` is **true when anything at all landed**, which is rule 2 expressed as a
 * boolean: a call that completed ten of twelve tasks did not fail, and marking
 * it failed would put it on the read side of the transcript with the ten writes
 * invisible (`toolChip.ts` reads `ok` to decide that). A batch where nothing
 * worked is a failure, and the reasons are the whole of what it has to say.
 */
export function batchResult<T>(
  outcome: BatchOutcome<T>,
  says: (done: BatchOutcome<T>['done']) => string,
  data?: Record<string, unknown>,
): ToolResult {
  const { done, failed } = outcome;
  return {
    ok: done.length > 0,
    summary: done.length === 0 ? nothingLanded(failed) : `${says(done)}${failureSentence(failed)}`,
    data: {
      done: done.length,
      ...(data ?? {}),
      ...(failed.length === 0 ? {} : { failed }),
    },
  };
}

/**
 * Every one of them failed.
 *
 * Written as its own sentence rather than an empty success with a tail, because
 * *"Completed 0 tasks — 3 did not happen"* is a sentence that reads as a
 * success at a glance and is not one.
 */
function nothingLanded(failed: BatchFailure[]): string {
  /*
   * Each reason stands as its own sentence here, so it gets the capital and the
   * full stop that the clause form above takes away. Reasons are written
   * lower-case and unpunctuated-in-the-middle precisely so they can be used
   * both ways without a second string being written for each.
   */
  const reasons = [...new Set(failed.map((failure) => `${capitalised(unpunctuated(failure.reason))}.`))];
  return failed.length === 1
    ? `Nothing changed. ${reasons[0]}`
    : `Nothing changed — none of the ${failed.length} could be done. ${reasons.join(' ')}`;
}

/**
 * What a missing id means, said the same way everywhere.
 *
 * Rule 4 lives in this string. *"Search for it"* rather than *"try again"* is
 * the difference between one more round trip and ten: an id that is not there
 * will not be there on the second call either, and a model told plainly what to
 * do instead does it.
 */
export function missingIdReason(what: string): string {
  return `no such ${what}, so search by name rather than sending that id again.`;
}
