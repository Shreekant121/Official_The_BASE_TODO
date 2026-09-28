/**
 * The question card's data (BUILD-16) — what Atlas asked, what he answered,
 * and the one message that carries the answers back.
 *
 * Pure: no store, no React, no clock. The chat, the side panel and a reopened
 * conversation all read a card through here, so all three agree on what a
 * card is and on what an answer looks like once it has been sent.
 *
 * WHERE A CARD COMES FROM
 * ------------------------
 * Atlas's `ask_questions` tool (`atlas/src/agent/questionCard.ts`). The model's
 * arguments are normalised there and sent on the `ask` event; the chat reads
 * the same arguments off the tool call instead, because a tool call is in the
 * message log and survives a reload, and the event is not. **So this file
 * normalises too, with the same rules** — the wire card passes through
 * unchanged (normalising a normalised card is a no-op), and a reopened
 * conversation's raw arguments come out as the card that was drawn live.
 *
 * THE ANSWERS ARE ONE ORDINARY MESSAGE
 * -------------------------------------
 * §7.3's rule, kept: answering sends text and nothing else, so there is no
 * path from a tap to an action. The message opens with `ANSWERS_HEADER` and
 * has one `- question → answer` line per question, which the model reads
 * easily and which `parseAnswerMessage` reads back — that is how the chat
 * draws the message as a receipt rather than a speech bubble, live and after a
 * reload alike, with nothing stored beside it.
 */

export type AskKind = 'one' | 'many' | 'scale' | 'text';

export interface AskQuestion {
  id: string;
  question: string;
  kind: AskKind;
  options: string[];
  suggested: string[];
  why?: string;
  optional: boolean;
}

export interface AskCard {
  title?: string;
  questions: AskQuestion[];
}

/**
 * One question's answer as the card holds it.
 *
 * `values` is the picked options and anything typed, in order; for a scale it
 * is the number as a string. `suggested` is true when "Decide for me" filled
 * it — and an empty `values` with `suggested` is a question Atlas gave no
 * suggestion for, which goes back as "you decide".
 */
export interface AskAnswer {
  values: string[];
  suggested?: boolean;
}

export type AskAnswers = Record<string, AskAnswer>;

/** The tool's name on Atlas. The chat hides its chip: the card is the thing. */
export const ASK_TOOL = 'ask_questions';

/**
 * The question card under either of its names. `ask_choice` is item 12's,
 * before BUILD-16 renamed it, and it is still in every chat saved before
 * then — and on an Atlas not yet restarted onto the new build. Its
 * `{prompt, options}` arguments read as a one-question card, so it is drawn
 * as the card too, never as a chip carrying its "STOP HERE" instruction.
 */
export function isAskTool(name: string): boolean {
  return name === ASK_TOOL || name === 'ask_choice';
}

export const ANSWERS_HEADER = 'Answers to your questions:';

/**
 * What `core.ts` on Atlas answers a write with when it arrived in the same
 * round as a question. A string shared across two repositories, for the reason
 * `transcript.ts`'s compaction prefix is: a reopened conversation drops those
 * calls rather than drawing a failed write nobody saw live.
 */
export const ASK_REFUSAL_PREFIX = 'Not run: you asked Shreekant a question';

const SUGGESTION_MARK = ' (your suggestion)';
const YOU_DECIDE = 'you decide';
const SKIPPED = 'skipped';
const NONE = 'none';

/** Atlas's own cap, `MAX_OPTIONS` in `questionCard.ts`. */
export const MAX_OPTIONS = 8;

const KINDS: readonly AskKind[] = ['one', 'many', 'scale', 'text'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter((entry) => entry !== '');
  const single = text(value);
  return single === '' ? [] : [single];
}

function optionNamed(options: string[], wanted: string): string | undefined {
  const key = wanted.toLowerCase();
  return options.find((option) => option.toLowerCase() === key);
}

/**
 * A card from the `ask` event or from `ask_questions`' raw arguments, or
 * `null` when there is nothing drawable. Atlas's `normaliseAskCard`, less the
 * refusals: a call Atlas refused never reached a card, and anything that did
 * is drawn as well as it can be.
 */
export function readAskCard(raw: unknown): AskCard | null {
  if (raw === null || typeof raw !== 'object') return null;
  const args = raw as Record<string, unknown>;
  const rawQuestions: unknown[] = Array.isArray(args.questions)
    ? args.questions
    : text(args.prompt) !== ''
      ? [{ question: args.prompt, options: args.options }]
      : [];

  const questions: AskQuestion[] = [];
  const seen = new Set<string>();
  for (const item of rawQuestions) {
    const entry: Record<string, unknown> =
      typeof item === 'string' ? { question: item } : item !== null && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const question = text(entry.question ?? entry.prompt);
    if (question === '' || seen.has(question.toLowerCase())) continue;
    seen.add(question.toLowerCase());

    let options: string[] = [];
    for (const option of strings(entry.options)) if (!optionNamed(options, option)) options.push(option);
    options = options.slice(0, MAX_OPTIONS);

    const asked = text(entry.kind).toLowerCase() as AskKind;
    let kind: AskKind = KINDS.includes(asked) ? asked : options.length > 0 ? 'one' : 'text';
    if ((kind === 'one' || kind === 'many') && options.length === 0) kind = 'text';
    if (kind === 'scale' || kind === 'text') options = [];

    let suggested: string[] = [];
    const wanted = strings(entry.suggested ?? entry.suggestion);
    if (kind === 'scale') {
      const n = Math.round(Number(wanted[0]));
      if (Number.isFinite(n) && n >= 1 && n <= 9) suggested = [String(n)];
    } else if (kind === 'text') {
      suggested = wanted.slice(0, 1);
    } else {
      for (const want of kind === 'one' ? wanted.slice(0, 1) : wanted) {
        let named = optionNamed(options, want);
        if (named === undefined && options.length < MAX_OPTIONS) {
          options.push(want);
          named = want;
        }
        if (named !== undefined && !suggested.includes(named)) suggested.push(named);
      }
    }

    const why = text(entry.why);
    questions.push({
      id: `q${questions.length + 1}`,
      question,
      kind,
      options,
      suggested,
      ...(why === '' ? {} : { why }),
      optional: entry.optional === true,
    });
  }

  if (questions.length === 0) return null;
  const title = text(args.title);
  return { ...(title === '' ? {} : { title }), questions };
}

/**
 * Every question he must answer has an answer. Optional ones may stay open.
 * An answer with no values is still an answer: "none" to a tick-several, or
 * "you decide". The card never stores an empty pick for anything else.
 */
export function canSubmit(card: AskCard, answers: AskAnswers): boolean {
  return card.questions.every((q) => q.optional || answers[q.id] !== undefined);
}

/**
 * "Decide for me" — every unanswered question takes Atlas's own suggestion,
 * or goes back as "you decide" when it had none. What he already answered is
 * never touched. His call over "Skip" (2026-09-24).
 */
export function decideRest(card: AskCard, answers: AskAnswers): AskAnswers {
  const out: AskAnswers = { ...answers };
  for (const q of card.questions) {
    if (out[q.id] !== undefined) continue;
    out[q.id] = { values: [...q.suggested], suggested: true };
  }
  return out;
}

/** How an answer reads, on the receipt and in the message. */
export function answerLabel(q: AskQuestion, answer: AskAnswer | undefined): string {
  if (answer === undefined) return q.optional ? SKIPPED : '';
  if (answer.values.length === 0) return answer.suggested ? YOU_DECIDE : q.kind === 'many' ? NONE : SKIPPED;
  if (q.kind === 'scale') return `${answer.values[0]} / 9`;
  return answer.values.join(', ');
}

/** The one message the answers go back in. See the header. */
export function formatAnswers(card: AskCard, answers: AskAnswers): string {
  const lines = card.questions.map((q) => {
    const answer = answers[q.id];
    const label = answerLabel(q, answer) || SKIPPED;
    const mark = answer?.suggested && answer.values.length > 0 ? SUGGESTION_MARK : '';
    return `- ${q.question} → ${label}${mark}`;
  });
  return [ANSWERS_HEADER, ...lines].join('\n');
}

export interface AnswerReceipt {
  rows: { question: string; answer: string; suggested: boolean }[];
}

/** The answers back out of a message, or `null` when it is not one. */
export function parseAnswerMessage(message: string): AnswerReceipt | null {
  const lines = message.split(/\r?\n/);
  if (lines[0]?.trim() !== ANSWERS_HEADER) return null;
  const rows: AnswerReceipt['rows'] = [];
  for (const line of lines.slice(1)) {
    const body = line.trim().replace(/^- /, '');
    const at = body.indexOf(' → ');
    if (at < 0) continue;
    let answer = body.slice(at + 3).trim();
    let suggested = answer === YOU_DECIDE;
    if (answer.endsWith(SUGGESTION_MARK)) {
      answer = answer.slice(0, -SUGGESTION_MARK.length);
      suggested = true;
    }
    rows.push({ question: body.slice(0, at).trim(), answer, suggested });
  }
  return rows.length === 0 ? null : { rows };
}

/** The receipt's lead: who answered. */
export function receiptLabel(receipt: AnswerReceipt): string {
  const decided = receipt.rows.filter((row) => row.suggested).length;
  if (decided === 0) return 'Answered';
  if (decided === receipt.rows.length) return 'Atlas decided';
  return 'Answered · Atlas decided the rest';
}

/** The chips on a receipt: what was answered, skipped ones left out. */
export function receiptChips(receipt: AnswerReceipt): string[] {
  return receipt.rows.map((row) => row.answer).filter((answer) => answer !== SKIPPED && answer !== NONE);
}

/**
 * The words the importance scale puts under a number — the design's, which
 * read the app's 0–9 `humanOverride` in the order the Score screen does.
 */
export function scaleWord(n: number | undefined): string {
  if (n === undefined || n <= 0) return '';
  if (n <= 2) return 'Can slip';
  if (n <= 4) return 'Worth doing';
  if (n <= 6) return 'Matters this week';
  if (n <= 8) return 'High — protect the slot';
  return 'Drop everything';
}
