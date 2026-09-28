/* Moved out of `pages/ChatPage.tsx` when it was split (BUILD-7). */
import { useEffect, useState } from 'react';
import { fetchResumable, type AtlasResumableTurn } from '../../lib/atlas/client';

export function useResumable(
  onAtlas: boolean,
  atlasBase: string | null,
  conversationId: string | null,
  busy: boolean,
) {
  /*
   * ITEM 13A: WAS ATLAS IN THE MIDDLE OF SOMETHING (DESIGN.md §5.5)?
   *
   * **Asked when a conversation is opened, and never otherwise.** That is the
   * whole shape Shreekant chose, with the alternatives in front of him:
   * resuming the moment the tab loads, and resuming on Atlas's start-up with
   * nobody present, both had Atlas writing hours later into a situation that
   * may have changed. So nothing here resumes anything — it draws a card with
   * a button, and if he never taps it, nothing ever happens.
   *
   * Cleared while a turn is running, because the card is about a turn that
   * stopped and a live one is not that. It comes back on the next open if the
   * new turn stops too.
   */
  const [resumable, setResumable] = useState<AtlasResumableTurn | null>(null);

  /*
   * Forgotten during render rather than in the effect below, and forgotten
   * rather than hidden: a card only hidden while a turn runs would come back
   * the moment it finished, offering to carry on a stop the conversation has
   * already moved past, for the round trip the re-read takes to say so.
   */
  const asking = onAtlas && atlasBase !== null && !busy;
  if (!asking && resumable !== null) setResumable(null);

  useEffect(() => {
    if (!onAtlas || atlasBase === null || busy) return;
    const controller = new AbortController();
    void fetchResumable(atlasBase, conversationId, controller.signal)
      .then(setResumable)
      .catch(() => {
        /* An Atlas too old to know the question answers 404. No card is
           exactly right for that: a host that cannot record an interrupted
           turn has nothing to offer to carry on. */
        setResumable(null);
      });
    return () => controller.abort();
  }, [atlasBase, onAtlas, conversationId, busy]);

  return [resumable, setResumable] as const;
}
