import { describe, expect, it } from 'vitest';
import { atlasModelId, cloudRoutingOf, routesToAtlas } from './routing';
import type { AtlasHealth } from './client';

/**
 * Which machine answers (BIG-1). The rule the chat and the side panel share;
 * a wrong answer here is either Gemini losing Atlas's tools for no reason, or
 * a turn sent to a laptop that cannot run it.
 */

const BASE = 'https://laptop.tailnet.ts.net';
const NEW_ATLAS = { atlasProviders: ['gemini', 'anthropic', 'openai'], geminiKeyForAtlas: true };

const gemini = { provider: 'gemini' as const };
const claude = { provider: 'anthropic' as const };
const gemma = { provider: 'ollama' as const };

describe('routesToAtlas', () => {
  it('sends a Gemini pick to the laptop when it takes cloud turns and has a key', () => {
    expect(routesToAtlas(gemini, 'awake', BASE, NEW_ATLAS)).toBe(true);
  });

  it('keeps Gemini in the browser when there is no key for the laptop to spend', () => {
    expect(routesToAtlas(gemini, 'awake', BASE, { ...NEW_ATLAS, geminiKeyForAtlas: false })).toBe(false);
  });

  it('keeps Gemini in the browser on an Atlas built before BIG-1', () => {
    expect(routesToAtlas(gemini, 'awake', BASE, { atlasProviders: [], geminiKeyForAtlas: true })).toBe(false);
  });

  it('sends Claude to the laptop, which needs no Gemini key for it', () => {
    expect(routesToAtlas(claude, 'awake', BASE, { ...NEW_ATLAS, geminiKeyForAtlas: false })).toBe(true);
  });

  it('never routes to a sleeping laptop — the browser fallback answers', () => {
    expect(routesToAtlas(claude, 'asleep', BASE, NEW_ATLAS)).toBe(false);
    expect(routesToAtlas(gemma, 'asleep', BASE, NEW_ATLAS)).toBe(false);
  });

  it('keeps the old two-argument behaviour for a local pick', () => {
    expect(routesToAtlas(gemma, 'awake', BASE)).toBe(true);
  });
});

describe('cloudRoutingOf', () => {
  const health = (fields: Partial<AtlasHealth>) => fields as AtlasHealth;

  it('counts a Gemini key in Atlas’s own .env as a key', () => {
    const cloud = cloudRoutingOf(
      health({ gemini: { configured: true }, hosted: { providers: ['gemini'], keysFromRequest: true } }),
      false,
    );
    expect(cloud).toEqual({ atlasProviders: ['gemini'], geminiKeyForAtlas: true });
  });

  it('reads no providers from an Atlas that does not say it takes keys', () => {
    expect(cloudRoutingOf(health({ gemini: { configured: false } }), true).atlasProviders).toEqual([]);
    expect(cloudRoutingOf(null, false)).toEqual({ atlasProviders: [], geminiKeyForAtlas: false });
  });
});

describe('atlasModelId', () => {
  it('names a cloud model by its provider and a local one bare', () => {
    expect(atlasModelId({ provider: 'anthropic', id: 'claude-sonnet-5', key: 'anthropic:claude-sonnet-5' })).toBe(
      'anthropic:claude-sonnet-5',
    );
    expect(atlasModelId({ provider: 'ollama', id: 'gemma4:e4b', key: 'ollama:gemma4:e4b' })).toBe('gemma4:e4b');
  });
});
