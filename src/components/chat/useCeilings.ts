/* Moved out of `pages/ChatPage.tsx` when it was split (BUILD-7). */
import { useCallback, useEffect, useState } from 'react';
import { fetchCeilings, saveCeilings, type AtlasCeilings } from '../../lib/atlas/client';

export function useCeilings(onAtlas: boolean, atlasBase: string | null) {
  /*
   * The two spending ceilings (§3.4), and what this month has cost.
   *
   * Held here rather than read off `/health` even though `/health` carries
   * them, because this screen **writes** them too — the slider in the tuning
   * popover is the same setting `/atlas-host` draws — and a value that came
   * from a poll would snap back to the old number between the drag and the
   * next poll landing.
   */
  const [ceilings, setCeilings] = useState<AtlasCeilings | null>(null);

  /*
   * Forgotten while the laptop is away, during render rather than in the
   * effect below. Not merely hidden: a figure kept until Atlas comes back
   * would sit on the cost line for the round trip it takes to re-read it, and
   * a spend nobody has vouched for since is an invented value.
   */
  if ((!onAtlas || atlasBase === null) && ceilings !== null) setCeilings(null);

  useEffect(() => {
    if (!onAtlas || atlasBase === null) return;
    const controller = new AbortController();
    void fetchCeilings(atlasBase, controller.signal)
      .then(setCeilings)
      .catch(() => {
        /* An Atlas too old to have ceilings answers 404, and one that could
           not open its data directory answers 503. Both mean the same thing to
           this screen — there is no ceiling to draw — and neither is worth a
           line of its own on a chat page. */
        setCeilings(null);
      });
    return () => controller.abort();
  }, [atlasBase, onAtlas]);

  const chooseCeiling = useCallback(
    (rupees: number) => {
      if (atlasBase === null) return;
      /* Moved here first so the slider tracks the thumb, then written through.
         A control that waited for the laptop to answer before it moved would
         feel broken over a tailnet. */
      setCeilings((current) =>
        current === null ? current : { ...current, ceilings: { ...current.ceilings, perTurnRupees: rupees } },
      );
      void saveCeilings(atlasBase, { perTurnRupees: rupees })
        .then(setCeilings)
        .catch(() => {
          /* The write failed, so put back whatever Atlas actually holds rather
             than leaving the slider showing a number nothing agreed to. */
          void fetchCeilings(atlasBase).then(setCeilings).catch(() => setCeilings(null));
        });
    },
    [atlasBase],
  );

  return { ceilings, chooseCeiling };
}
