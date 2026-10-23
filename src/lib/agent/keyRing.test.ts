import { describe, expect, it } from 'vitest';
import {
  atlasKeyOf,
  chosenKey,
  detectProvider,
  keyProblem,
  parseRing,
  withChosen,
  type KeyRing,
  type StoredApiKey,
} from './keyRing';

const GEMINI_A: StoredApiKey = { id: 'g1', label: 'personal', key: 'AIzaSyA-personal-000000000', addedAt: 1 };
const GEMINI_B: StoredApiKey = { id: 'g2', label: 'paid', key: 'AIzaSyB-paid-00000000000000', addedAt: 2, provider: 'gemini' };
const CLAUDE: StoredApiKey = { id: 'c1', label: 'claude', key: 'sk-ant-api03-0000000000000000', addedAt: 3, provider: 'anthropic' };
const GPT: StoredApiKey = { id: 'o1', label: 'gpt', key: 'sk-proj-00000000000000000000', addedAt: 4, provider: 'openai' };

const RING: KeyRing = { keys: [GEMINI_A, GEMINI_B, CLAUDE, GPT], activeId: null };

describe('parseRing', () => {
  it('reads a ring written before BIG-1: every key is Gemini’s and nothing moves', () => {
    const old = { keys: [{ id: 'g1', label: 'personal', key: 'AIzaSyA-personal-000000000', addedAt: 1 }], activeId: 'g1' };
    const ring = parseRing(old);
    expect(chosenKey(ring, 'gemini')?.id).toBe('g1');
    expect(chosenKey(ring, 'anthropic')).toBeNull();
  });

  it('drops a chosen id that points at another provider’s key, or at nothing', () => {
    const ring = parseRing({ ...RING, activeId: 'c1', activeByProvider: { anthropic: 'g1', openai: 'gone' } });
    expect(ring.activeId).toBeNull();
    expect(ring.activeByProvider).toEqual({});
  });

  it('forgets a provider it has never heard of rather than trusting it', () => {
    const ring = parseRing({ keys: [{ ...GPT, provider: 'mistral' }], activeId: null });
    expect(ring.keys[0].provider).toBeUndefined();
  });
});

describe('choosing', () => {
  it('keeps each provider’s choice separate', () => {
    let ring = withChosen(RING, 'g2', 'gemini');
    ring = withChosen(ring, 'c1', 'anthropic');
    expect(chosenKey(ring, 'gemini')?.id).toBe('g2');
    expect(chosenKey(ring, 'anthropic')?.id).toBe('c1');
    expect(chosenKey(ring, 'openai')).toBeNull();
  });

  it('refuses to choose a key under the wrong provider', () => {
    expect(withChosen(RING, 'c1', 'gemini').activeId).toBeNull();
  });
});

describe('atlasKeyOf', () => {
  it('sends Atlas the chosen key, else the first of that provider', () => {
    expect(atlasKeyOf(RING, 'anthropic')).toBe(CLAUDE.key);
    expect(atlasKeyOf(withChosen(RING, 'g2', 'gemini'), 'gemini')).toBe(GEMINI_B.key);
  });

  it('hands Atlas his first Gemini key when the proxy is chosen — the proxy’s key never reaches the laptop', () => {
    expect(RING.activeId).toBeNull();
    expect(atlasKeyOf(RING, 'gemini')).toBe(GEMINI_A.key);
  });

  it('has nothing to send for a provider with no key', () => {
    expect(atlasKeyOf({ keys: [GEMINI_A], activeId: null }, 'openai')).toBeNull();
  });
});

describe('keyProblem', () => {
  it('catches a key pasted under the wrong provider, and says which it is', () => {
    expect(keyProblem(RING, 'sk-ant-api03-somethingsomething', 'openai')).toBe(
      'That looks like a Claude key, not a ChatGPT one. Pick Claude above.',
    );
    expect(keyProblem(RING, 'AIzaSyC-something-long-enough', 'anthropic')).toContain('Gemini key');
  });

  it('names the provider in the too-short sentence', () => {
    expect(keyProblem(RING, 'short', 'anthropic')).toBe('That is too short to be a Claude API key.');
  });

  it('accepts a key whose spelling it does not recognise, since prefixes change', () => {
    expect(keyProblem(RING, 'xyz-some-future-key-format-1234', 'openai')).toBeNull();
  });

  it('refuses a duplicate', () => {
    expect(keyProblem(RING, CLAUDE.key, 'anthropic')).toBe('That key is already here.');
  });
});

describe('detectProvider', () => {
  it('reads each vendor’s own prefix, Claude’s before ChatGPT’s', () => {
    expect(detectProvider('sk-ant-api03-x')).toBe('anthropic');
    expect(detectProvider('sk-proj-x')).toBe('openai');
    expect(detectProvider('AIzaSy')).toBe('gemini');
    expect(detectProvider('what')).toBeNull();
  });
});
