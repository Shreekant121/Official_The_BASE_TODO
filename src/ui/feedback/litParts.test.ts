import { describe, expect, it } from 'vitest';
import { litParts, litPlain, litSafe } from './litParts';

describe('litParts', () => {
  it('splits grey and lit words', () => {
    expect(litParts('Nothing **left to do** here.')).toEqual([
      { text: 'Nothing ', lit: false },
      { text: 'left to do', lit: true },
      { text: ' here.', lit: false },
    ]);
  });

  it('lights a sentence that starts and ends lit', () => {
    expect(litParts('**No tasks** here and **there**')).toEqual([
      { text: 'No tasks', lit: true },
      { text: ' here and ', lit: false },
      { text: 'there', lit: true },
    ]);
  });

  it('keeps an unclosed marker grey, asterisks and all', () => {
    expect(litParts('a **b** c **d')).toEqual([
      { text: 'a ', lit: false },
      { text: 'b', lit: true },
      { text: ' c ', lit: false },
      { text: '**d', lit: false },
    ]);
  });

  it('reads plain without markers', () => {
    expect(litPlain('Nothing matches **“x”**.')).toBe('Nothing matches “x”.');
  });

  it('takes the asterisks out of typed text', () => {
    const typed = litSafe('a**b*');
    expect(typed).toBe('ab');
    expect(litParts(`No match for **“${typed}”**.`).filter((p) => p.lit)).toEqual([{ text: '“ab”', lit: true }]);
  });
});
