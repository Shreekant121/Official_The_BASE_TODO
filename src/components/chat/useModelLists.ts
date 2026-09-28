/* Asking the laptop, then listing the models, when the screen opens. Moved
   out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import { useEffect } from 'react';
import { useModelStore } from '../../lib/agent/modelStore';
import { useAtlasStore } from '../../lib/atlas/atlasStore';
import { devHostFixture } from '../../lib/devHostFixture';
import { devModelFixture } from '../../lib/devModelFixture';

/** `activeKeyId` is read only as a moment to list again. */
export function useModelLists(activeKeyId: string | null) {
  const refreshModels = useModelStore((s) => s.refresh);
  const setCatalogue = useModelStore((s) => s.setCatalogue);
  const probeAtlasHost = useAtlasStore((s) => s.probe);
  const setAtlasSnapshot = useAtlasStore((s) => s.setSnapshot);

  /*
   * The two model lists. Re-read when the active key changes, because a
   * different Gemini key can see a different set of models — and the local
   * list is cheap enough that splitting the two fetches apart would cost more
   * in machinery than it saves in requests.
   *
   * `devModelFixture` is the harness's way in, guarded and proved out of
   * `dist/` exactly like the transcript fixture on the page: both of these lists are
   * fetched, so neither can be photographed, and the local one would otherwise
   * make a baseline depend on whether Ollama happened to be running.
   */
  useEffect(() => {
    if (import.meta.env.DEV) {
      /* **The host fixture matters here for the first time (item 9D).** Before
         it, `/chat` could photograph the model list but never the *machine*:
         `onAtlas` needs a landed probe, the harness blocks the tailnet, so
         every `/chat` baseline was the in-browser path and the Atlas path —
         the default, and the one this session is about — had no shot at all.
         Seeded exactly as `/atlas-host` seeds it, from the same module. */
      const host = devHostFixture(window.location.search);
      const fixture = devModelFixture(window.location.search);
      if (host || fixture) {
        if (host) setAtlasSnapshot(host);
        if (fixture) setCatalogue(fixture);
        return;
      }
    }
    // Ask the laptop first, then list the models. The order is load-bearing
    // rather than tidy: the local list *comes from* Atlas, so a probe that has
    // not landed yet would have the picker announce "the laptop is not
    // answering" a beat before finding out that it is.
    void probeAtlasHost().then(() => refreshModels());
  }, [refreshModels, setCatalogue, setAtlasSnapshot, probeAtlasHost, activeKeyId]);
}
