/**
 * The voice logic that can be tested without a browser (items 24 and 25).
 *
 * **What is deliberately not here**: `startDictation` and `speak` themselves.
 * Both are thin wrappers over browser engines that do not exist in Node, and a
 * test of them would be a test of a mock — the same trap `zustand`'s persist
 * middleware set in this project, where the middleware no-ops under vitest and
 * a green test proved nothing. The behaviour that matters in those two is
 * timing and device behaviour, and it was established by measuring his tablet.
 *
 * What *is* here is everything the measurement turned into a rule: the
 * mishearings it produced, the cumulative-final quirk's consequences, and the
 * markdown that must never reach a synthesiser.
 */
import { describe, expect, it } from 'vitest';
import { findWake, repairTranscript } from './recognition';
import { englishFirst, speakable, trimForSpeech, type VoiceChoice } from './synthesis';

describe('repairTranscript', () => {
  it('fixes the way this engine hears his name', () => {
    // Measured on his tablet, 2026-09-14: "hello I am Srikanth and you are..."
    expect(repairTranscript('hello I am Srikanth')).toBe('hello I am Shreekant');
    expect(repairTranscript('shrikant here')).toBe('Shreekant here');
  });

  it('leaves real words alone even when they are a known mishearing', () => {
    /* The same measurement heard "AI" as "eye". It is NOT repaired, and this
       test is the guard on that decision: rewriting every "eye" would break
       ordinary sentences to fix an occasional one, invisibly. */
    expect(repairTranscript('keep an eye on the deadline')).toBe('keep an eye on the deadline');
  });

  it('passes through text with nothing to fix', () => {
    expect(repairTranscript('add a task for Friday')).toBe('add a task for Friday');
  });
});

describe('findWake', () => {
  it('finds the wake word and returns what follows', () => {
    expect(findWake('Atlas what is urgent today')).toEqual({
      matched: 'atlas',
      rest: 'what is urgent today',
    });
  });

  it('accepts the mishearing this engine actually produces', () => {
    /* "Atlas" is not a common English word and the engine reaches for one that
       is. A dock that missed this would fail roughly one wake in five. */
    expect(findWake('at last add a task for Rahul')?.rest).toBe('add a task for Rahul');
  });

  it('finds the wake word mid-sentence, because speech has filler in front', () => {
    expect(findWake('umm, Atlas, what is urgent')?.rest).toBe('what is urgent');
  });

  it('strips the punctuation the engine puts after the wake word', () => {
    expect(findWake('Atlas: add milk')?.rest).toBe('add milk');
    expect(findWake('Atlas — add milk')?.rest).toBe('add milk');
  });

  it('returns an empty rest when he says only the wake word', () => {
    /* Dock mode relies on this to stay waiting rather than sending an empty
       turn — saying "Atlas" and then thinking is a normal thing to do. */
    expect(findWake('Atlas')?.rest).toBe('');
  });

  it('is null when the wake word is not there', () => {
    expect(findWake('what is urgent today')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(findWake('ATLAS add milk')?.rest).toBe('add milk');
  });
});

describe('speakable', () => {
  it('drops the markdown a synthesiser would read out literally', () => {
    expect(speakable('The **Empire invoice** is *eleven* days old.')).toBe(
      'The Empire invoice is eleven days old.',
    );
  });

  it('drops code fences whole', () => {
    // A tool argument read aloud is thirty seconds nobody listens to.
    expect(speakable('Here:\n```json\n{"a":1}\n```\nDone.')).toBe('Here: Done.');
  });

  it('reads a link as its words, never its URL', () => {
    expect(speakable('See [the invoice](https://example.com/x?y=1) today')).toBe(
      'See the invoice today',
    );
  });

  it('turns a table into clauses rather than pipes', () => {
    const table = '| task | age |\n| --- | --- |\n| invoice | 11 |';
    const spoken = speakable(table);
    expect(spoken).not.toContain('|');
    expect(spoken).not.toContain('---');
    expect(spoken).toContain('invoice');
  });

  it('strips list markers and headings', () => {
    expect(speakable('## Today\n- invoice\n- call Rahul')).toBe('Today invoice call Rahul');
    expect(speakable('1. first\n2. second')).toBe('first second');
  });

  it('strips block quotes', () => {
    expect(speakable('> he said this')).toBe('he said this');
  });
});

describe('trimForSpeech', () => {
  it('leaves a short answer alone', () => {
    expect(trimForSpeech('Three tasks are overdue.')).toEqual({
      text: 'Three tasks are overdue.',
      truncated: false,
    });
  });

  it('cuts a long answer at a sentence and says there is more', () => {
    const long = `${'This is a sentence about a task. '.repeat(40)}`;
    const { text, truncated } = trimForSpeech(long);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(long.length);
    expect(text).toMatch(/There is more on screen\.$/);
    /* Cut at a sentence boundary, not mid-word: the whole point is that the
       tablet is across the room and cannot be re-read. */
    expect(text).toContain('task. ');
  });

  it('still cuts when there is no sentence boundary to cut at', () => {
    const runOn = 'word '.repeat(400);
    const { text, truncated } = trimForSpeech(runOn);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThan(runOn.length);
  });
});

describe('englishFirst', () => {
  const voice = (name: string, lang: string): VoiceChoice => ({
    uri: `${name}-${lang}`,
    name,
    lang,
    local: true,
  });

  it('puts Indian English at the top, then other English, then the rest', () => {
    /* His tablet's first six alphabetically are Assamese, Bulgarian, Haryanvi,
       Bhojpuri and two Bengalis — so an unsorted picker opens on six voices
       that cannot read his backlog. */
    const { english, rest } = englishFirst([
      voice('Assamese India', 'as_IN'),
      voice('US voice', 'en-US'),
      voice('Indian voice', 'en-IN'),
      voice('Bengali India', 'bn_IN'),
      voice('British voice', 'en-GB'),
    ]);

    expect(english.map((v) => v.lang)).toEqual(['en-IN', 'en-GB', 'en-US']);
    expect(rest).toHaveLength(2);
    expect(rest.every((v) => !v.lang.startsWith('en'))).toBe(true);
  });

  it('copes with a device that has no English voice at all', () => {
    const { english, rest } = englishFirst([voice('Bengali India', 'bn_IN')]);
    expect(english).toEqual([]);
    expect(rest).toHaveLength(1);
  });
});
