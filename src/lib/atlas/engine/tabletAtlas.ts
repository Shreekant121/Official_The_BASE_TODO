import { auth } from '../../firebase';
import { devCloudViaOllama } from '../../devCloudViaOllama';
import type { BrowserAtlas } from './atlasEngine.generated';
import { appToolSource } from './appToolSource';
import { firestoreCloud } from './cloudPort';
import { lookupThroughApp } from './lookupClient';

/**
 * Atlas in this page, for when the laptop is shut (BIG-12).
 *
 * Shreekant's words: *"just don't give the local model but rest everything put
 * it on the software so it is on tablet too and can be used independently."*
 * The laptop's Atlas cannot come to the tablet, but its code can: this loads
 * `atlasEngine.generated.js` — Atlas's own `runChat`, bundled from
 * `../atlas/src/browser/engine.ts` — and hands it the three things the laptop
 * would have:
 *
 * - **the app's tools**, through the same handler the laptop's MCP server runs
 *   (`toolServer/index.ts`), against the store in this page — which is already
 *   the live one, so there is no read before a call and no flush after;
 * - **its memory**, BIG-4's cloud copy under his account (`cloudPort.ts`);
 * - **the models**, which it calls itself, on his keys.
 *
 * **Loaded on first use, never at startup** (Performance rule 7): the bundle is
 * ~740 KB before minification, and a tablet with the laptop awake never needs
 * it. One engine per signed-in account, kept for the life of the page; signing
 * in as someone else builds a new one.
 */

let current: { uid: string; engine: Promise<BrowserAtlas> } | null = null;

export function tabletAtlas(uid: string): Promise<BrowserAtlas> {
  if (current !== null && current.uid === uid) return current.engine;
  if (current !== null) void current.engine.then((engine) => engine.stop());

  const engine = import('./atlasEngine.generated.js').then((mod) =>
    mod.createBrowserAtlas({
      cloud: firestoreCloud(uid),
      tools: [appToolSource()],
      lookup: lookupThroughApp(),
      /* 27A-5, "Retire it, Atlas for all": with no Gemini key of his own, the
         owner's key through the same proxy the basic assistant used. */
      geminiThroughApp: {
        endpoint: '/api/chat',
        getIdToken: async () => (await auth.currentUser?.getIdToken().catch(() => null)) ?? null,
      },
      hosted: import.meta.env.DEV ? devCloudViaOllama() : undefined,
    }),
  );
  current = { uid, engine };
  // A failed load must not be cached, or every later turn would fail the same way.
  engine.catch(() => {
    if (current?.engine === engine) current = null;
  });
  return engine;
}

/** Claude's or ChatGPT's model list, fetched from this device. Loads the engine bundle, which holds the code. */
export async function listHostedModelsHere(provider: 'anthropic' | 'openai', apiKey: string) {
  const mod = await import('./atlasEngine.generated.js');
  return mod.listHostedModelsHere(provider, apiKey);
}
