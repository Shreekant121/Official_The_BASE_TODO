import { describe, expect, it } from 'vitest';
import {
  EMPTY_CATALOGUE,
  FALLBACK_MODEL,
  parseGeminiModels,
  parseOllamaModels,
  resolveSelection,
  type ModelCatalogue,
} from './models';

/**
 * How the picker's two lists are read, and which model a turn runs on (item 6).
 *
 * The Ollama payload below is **verbatim** from `curl localhost:11434/api/tags`
 * on Shreekant's machine — Ollama 0.33.2, the three models he has — because
 * the point of fetching a list rather than writing one down is that the code
 * reads what the daemon actually says, and a payload someone made up cannot
 * hold that claim.
 *
 * `resolveSelection` gets the most tests because it is the only place the app
 * decides anything about models, and every one of its answers is a behaviour
 * Shreekant would notice: which model the desktop picks on its own, that the
 * tablet is not dragged along with it, and that a model he removed does not
 * keep failing every turn afterwards.
 */

const TAGS = {
  models: [
    {
      name: 'qwen3.5:4b',
      size: 3389983735,
      details: { family: 'qwen35', parameter_size: '4.7B', quantization_level: 'Q4_K_M' },
      capabilities: ['vision', 'completion', 'tools', 'thinking'],
    },
    {
      name: 'qwen3.5:9b',
      size: 6594474711,
      details: { family: 'qwen35', parameter_size: '9.7B', quantization_level: 'Q4_K_M' },
      capabilities: ['vision', 'completion', 'tools', 'thinking'],
    },
    {
      name: 'gemma4:e4b',
      size: 9608350718,
      details: { family: 'gemma4', parameter_size: '8.0B', quantization_level: 'Q4_K_M' },
      capabilities: ['completion', 'tools', 'thinking'],
    },
  ],
};

/**
 * Google's `models.list`, cut down to the fields `api/models.ts` forwards.
 *
 * **The first row is the bug this file now guards.** A model that advertises
 * `generateContent` but *not* the streaming spelling is the ordinary case, not
 * an edge one — and the original filter looked only for `streamGenerateContent`,
 * so against a perfectly good key the hosted group came back empty.
 */
const GOOGLE = {
  models: [
    {
      name: 'models/gemini-flash-latest',
      displayName: 'Gemini Flash Latest',
      supportedGenerationMethods: ['generateContent', 'countTokens', 'createCachedContent'],
    },
    {
      name: 'models/gemini-2.0-flash-exp',
      displayName: 'Gemini 2.0 Flash Experimental',
      supportedGenerationMethods: ['generateContent', 'streamGenerateContent'],
    },
    {
      name: 'models/text-embedding-004',
      displayName: 'Text Embedding 004',
      supportedGenerationMethods: ['embedContent'],
    },
    {
      name: 'models/imagen-4.0-generate-001',
      displayName: 'Imagen 4',
      supportedGenerationMethods: ['predict'],
    },
  ],
};

describe('Google’s list', () => {
  it('keeps a model that advertises generateContent without the streaming spelling', () => {
    // The regression that emptied the picker. Google names the base method;
    // `:streamGenerateContent` is the same method with a suffix and is not
    // always listed, so a filter on the streaming name alone fails closed.
    const { models } = parseGeminiModels(GOOGLE);
    expect(models.map((m) => m.id)).toStrictEqual(['gemini-flash-latest', 'gemini-2.0-flash-exp']);
  });

  it('drops what cannot hold a conversation, and counts it', () => {
    // Not on the name: an embedding model and Imagen come back from the same
    // endpoint, and filtering by name would be naming models by the back door.
    // The count is what lets an empty group say WHICH empty it is.
    expect(parseGeminiModels(GOOGLE).withoutChat).toBe(2);
  });

  it('shows the id only when it is not just the display name slugified', () => {
    const { models } = parseGeminiModels(GOOGLE);
    // "Gemini Flash Latest" / "gemini-flash-latest" is the same string twice.
    expect(models[0]).toStrictEqual({
      key: 'gemini:gemini-flash-latest',
      provider: 'gemini',
      id: 'gemini-flash-latest',
      label: 'Gemini Flash Latest',
      detail: '',
    });
    // "…Experimental" / "…-exp" is not, and that one is worth seeing.
    expect(models[1].detail).toBe('gemini-2.0-flash-exp');
  });

  it('falls back to the id when Google sends no display name', () => {
    const { models } = parseGeminiModels({
      models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }],
    });
    expect(models[0].label).toBe('gemini-x');
    expect(models[0].detail).toBe('');
  });

  it('reads a failed or empty response as an empty list, not a throw', () => {
    // Zero models AND zero skipped — which is the picker's cue to say the
    // reply carried nothing, rather than "none of them chat".
    expect(parseGeminiModels(null)).toStrictEqual({ models: [], withoutChat: 0 });
    expect(parseGeminiModels({ error: { code: 403 } })).toStrictEqual({ models: [], withoutChat: 0 });
  });
});

describe('Ollama’s list', () => {
  it('reads the real /api/tags payload', () => {
    expect(parseOllamaModels(TAGS)).toStrictEqual({
      withoutTools: 0,
      models: [
        { key: 'ollama:qwen3.5:4b', provider: 'ollama', id: 'qwen3.5:4b', label: 'qwen3.5:4b', detail: '4.7B · 3.4 GB' },
        { key: 'ollama:qwen3.5:9b', provider: 'ollama', id: 'qwen3.5:9b', label: 'qwen3.5:9b', detail: '9.7B · 6.6 GB' },
        { key: 'ollama:gemma4:e4b', provider: 'ollama', id: 'gemma4:e4b', label: 'gemma4:e4b', detail: '8.0B · 9.6 GB' },
      ],
    });
  });

  it('leaves out a model that says it cannot call tools, and counts it', () => {
    const { models, withoutTools } = parseOllamaModels({
      models: [
        ...TAGS.models,
        { name: 'llava:7b', size: 4700000000, details: { parameter_size: '7B' }, capabilities: ['completion', 'vision'] },
      ],
    });
    expect(models).toHaveLength(3);
    expect(withoutTools).toBe(1);
  });

  it('keeps a model whose build reports no capabilities at all', () => {
    // "This version of Ollama does not say" is not "this model cannot".
    const { models, withoutTools } = parseOllamaModels({ models: [{ name: 'mistral:7b', size: 4100000000 }] });
    expect(models.map((m) => m.id)).toStrictEqual(['mistral:7b']);
    expect(withoutTools).toBe(0);
  });
});

describe('which model answers', () => {
  const catalogue: ModelCatalogue = {
    ...EMPTY_CATALOGUE,
    hosted: parseGeminiModels(GOOGLE).models,
    local: parseOllamaModels(TAGS).models,
  };

  it('runs on the local default when nothing has been chosen', () => {
    // Free, private, and nobody configured it. Item 8 changed WHICH local
    // model that is: gemma4:e4b, not qwen3.5:4b. The old choice was made from
    // a 9.61 GB file size; the model loads into 3.23 GB entirely on the GPU
    // (../../../../atlas/DESIGN.md, section 2), so it costs what the 4.7B
    // cost and knows more.
    expect(resolveSelection(catalogue, null).id).toBe('gemma4:e4b');
  });

  it('runs on Gemini when there is no local list — which is now a sleeping laptop', () => {
    // THIS TEST IS THE FALLBACK, AND ITEM 8 DID NOT TOUCH IT.
    //
    // It used to describe the tablet, where `localhost` was the tablet and
    // there was never an Ollama. Atlas ends that — the tablet reaches the
    // laptop's models over Tailscale — and the same empty list now means the
    // laptop is asleep. Same code, same stored choice-of-none, same answer,
    // and still no setting to get wrong: the conversation lands on Gemini in
    // this browser, with all eight tools, and ChatPage says so.
    const laptopAsleep: ModelCatalogue = { ...catalogue, local: [] };
    expect(resolveSelection(laptopAsleep, null).id).toBe('gemini-flash-latest');
  });

  it('honours a stored choice over the default', () => {
    expect(resolveSelection(catalogue, 'ollama:qwen3.5:9b').id).toBe('qwen3.5:9b');
    expect(resolveSelection(catalogue, 'gemini:gemini-flash-latest').provider).toBe('gemini');
  });

  it('falls back when the stored choice has been removed from the machine', () => {
    // `ollama rm` on a model the picker still remembers. Without this every
    // turn would 404 against an id nothing can explain.
    expect(resolveSelection(catalogue, 'ollama:qwen3.5:70b').id).toBe('gemma4:e4b');
  });

  it('answers with the hosted default when neither list arrived', () => {
    // Offline, or the first turn of a cold load. This is the behaviour the app
    // had before the picker existed.
    expect(resolveSelection(EMPTY_CATALOGUE, null)).toStrictEqual(FALLBACK_MODEL);
    expect(resolveSelection(EMPTY_CATALOGUE, 'ollama:qwen3.5:4b')).toStrictEqual(FALLBACK_MODEL);
  });
});
