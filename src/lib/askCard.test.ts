import { describe, expect, it } from 'vitest';
import {
  ANSWERS_HEADER,
  answerLabel,
  canSubmit,
  decideRest,
  formatAnswers,
  isAskTool,
  parseAnswerMessage,
  readAskCard,
  receiptChips,
  receiptLabel,
  type AskCard,
} from './askCard';

/**
 * The question card's data (BUILD-16). The claims that matter: a card reads
 * the same from the wire and from a reopened conversation's raw arguments,
 * "Decide for me" never overwrites what he answered, and the answers message
 * reads back into exactly the receipt it was written from.
 */

const CA: AskCard = readAskCard({
  title: 'Four things before I add Call the CA',
  questions: [
    { question: 'When is it due?', options: ['Today', 'Tomorrow', 'Friday 26 Sep', 'Next week'], suggested: ['Friday 26 Sep'] },
    { question: 'How long will it take?', options: ['15 min', '30 min', '45 min', '1 h'], suggested: ['30 min'] },
    { question: 'How important, out of 9?', kind: 'scale', suggested: ['7'] },
    { question: 'Prepare anything first?', kind: 'many', options: ['Gather Form 16', 'Pull bank statements'], optional: true },
  ],
})!;

describe('readAskCard', () => {
  it('reads raw arguments into the card Atlas drew', () => {
    expect(CA.questions.map((q) => [q.id, q.kind, q.optional])).toStrictEqual([
      ['q1', 'one', false],
      ['q2', 'one', false],
      ['q3', 'scale', false],
      ['q4', 'many', true],
    ]);
  });

  it('is a no-op on a card that is already read — the wire card passes through', () => {
    expect(readAskCard(CA)).toStrictEqual(CA);
  });

  it('still reads item 12\'s one-question shape, from conversations saved before this', () => {
    const old = readAskCard({ prompt: 'Which one?', options: ['Maths', 'Logic'] });
    expect(old?.questions[0]).toMatchObject({ question: 'Which one?', kind: 'one', options: ['Maths', 'Logic'] });
  });

  it('knows the tool under its old name too', () => {
    expect(isAskTool('ask_questions')).toBe(true);
    expect(isAskTool('ask_choice')).toBe(true);
    expect(isAskTool('create_task')).toBe(false);
  });

  it('draws nothing for nothing', () => {
    expect(readAskCard({})).toBeNull();
    expect(readAskCard(null)).toBeNull();
  });
});

describe('answering', () => {
  it('can submit once every required question has an answer, optional ones open', () => {
    const three = { q1: { values: ['Today'] }, q2: { values: ['30 min'] }, q3: { values: ['7'] } };
    expect(canSubmit(CA, { q1: { values: ['Today'] } })).toBe(false);
    expect(canSubmit(CA, three)).toBe(true);
  });

  it('decides only what he left open, and never overwrites an answer', () => {
    const decided = decideRest(CA, { q1: { values: ['Today'] } });
    expect(decided.q1).toStrictEqual({ values: ['Today'] });
    expect(decided.q2).toStrictEqual({ values: ['30 min'], suggested: true });
    expect(decided.q3).toStrictEqual({ values: ['7'], suggested: true });
    // No suggestion on the optional prep question: it goes back as "you decide".
    expect(answerLabel(CA.questions[3], decided.q4)).toBe('you decide');
  });

  it('labels a scale out of 9, and an empty tick-several as none', () => {
    expect(answerLabel(CA.questions[2], { values: ['7'] })).toBe('7 / 9');
    expect(answerLabel(CA.questions[3], { values: [] })).toBe('none');
    expect(answerLabel(CA.questions[3], undefined)).toBe('skipped');
  });
});

describe('the answers message', () => {
  const answers = decideRest(CA, {
    q1: { values: ['Friday 26 Sep'] },
    q3: { values: ['8'] },
    q4: { values: ['Gather Form 16', 'Call ahead'] },
  });

  it('is one plain message, a line per question', () => {
    expect(formatAnswers(CA, answers)).toBe(
      [
        ANSWERS_HEADER,
        '- When is it due? → Friday 26 Sep',
        '- How long will it take? → 30 min (your suggestion)',
        '- How important, out of 9? → 8 / 9',
        '- Prepare anything first? → Gather Form 16, Call ahead',
      ].join('\n'),
    );
  });

  it('reads back into the receipt it was written from', () => {
    const receipt = parseAnswerMessage(formatAnswers(CA, answers))!;
    expect(receipt.rows.map((row) => [row.answer, row.suggested])).toStrictEqual([
      ['Friday 26 Sep', false],
      ['30 min', true],
      ['8 / 9', false],
      ['Gather Form 16, Call ahead', false],
    ]);
    expect(receiptLabel(receipt)).toBe('Answered · Atlas decided the rest');
    expect(receiptChips(receipt)).toStrictEqual(['Friday 26 Sep', '30 min', '8 / 9', 'Gather Form 16, Call ahead']);
  });

  it('says Atlas decided when every answer was its own', () => {
    const receipt = parseAnswerMessage(formatAnswers(CA, decideRest(CA, {})))!;
    expect(receiptLabel(receipt)).toBe('Atlas decided');
  });

  it('keeps an option that has an arrow-free dash in it whole', () => {
    // Item 12's options were written like this, and the split is on the arrow.
    const card = readAskCard({ questions: [{ question: 'Which pair?', options: ['Filing only — 45 min', 'Both — 1 h 15'] }] })!;
    const receipt = parseAnswerMessage(formatAnswers(card, { q1: { values: ['Filing only — 45 min'] } }))!;
    expect(receipt.rows[0].answer).toBe('Filing only — 45 min');
  });

  it('is not a receipt when it is anything else he typed', () => {
    expect(parseAnswerMessage('add a task to call the CA')).toBeNull();
    expect(parseAnswerMessage(ANSWERS_HEADER)).toBeNull();
  });
});
