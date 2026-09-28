/* The chat list beside the conversation. Moved out of `pages/ChatPage.tsx`
   when it was split (BUILD-7). */
import { useCallback, useEffect, useState } from 'react';
import {
  AtlasMemoryUnavailable,
  fetchConversations,
  type AtlasConversationSummary,
} from '../../lib/atlas/client';
import type { AtlasStatus } from '../../lib/atlas/atlasStore';
import { devChatFixture } from '../../lib/devChatFixture';

/** One read of the list, with a failure turned into the sentence the sidebar shows. */
async function readList(
  atlasBase: string,
  search: string,
  signal?: AbortSignal,
): Promise<{ conversations: AtlasConversationSummary[]; problem: string | null }> {
  try {
    return { conversations: await fetchConversations(atlasBase, search, signal), problem: null };
  } catch (err) {
    return {
      conversations: [],
      problem:
        err instanceof AtlasMemoryUnavailable && err.tooOld
          ? 'This Atlas is older than the conversations it would keep. Restart it on the laptop.'
          : err instanceof Error
            ? err.message
            : String(err),
    };
  }
}

/* The harness seeds this list; asking the laptop would blank it a beat later.
   Guarded and folded away in a production build like every other read of a
   fixture. */
function listIsSeeded(): boolean {
  return import.meta.env.DEV && Boolean(devChatFixture(window.location.search)?.conversations);
}

export function useConversationList(onAtlas: boolean, atlasBase: string | null, atlasStatus: AtlasStatus) {
  const [conversations, setConversations] = useState<AtlasConversationSummary[]>([]);
  const [chatQuery, setChatQuery] = useState('');
  const [listProblem, setListProblem] = useState<string | null>(null);

  /*
   * ITEM 10 — the chat list, and what its absence means.
   *
   * Only asked for when Atlas is answering: the conversations are on the
   * laptop, so a closed lid has no list rather than an empty one, and the
   * sidebar says which of those it is. A 503 or a 404 from the route is the
   * same to this screen — the message says what happened and the assistant
   * keeps working on the history this browser is holding.
   *
   * **The closed-lid state is worked out here, during render, not stored.**
   * It used to be written into the list and the message whenever a read was
   * attempted with nobody to ask, which is a state change inside an effect.
   * What that moved: when the laptop comes back, the sidebar used to keep
   * saying it was *not answering* for the round trip the re-read takes; it
   * now shows the list it last had until the re-read replaces it. A chat
   * deleted from another device meanwhile is the only row that can be wrong
   * for that beat, and opening it lands in the restore's start-clean path.
   */
  const live = onAtlas && atlasBase !== null;

  /** A re-read after something changed the list: a turn that named its chat, a rename, a delete. */
  const reloadConversations = useCallback(
    async (search: string) => {
      if (listIsSeeded() || !onAtlas || atlasBase === null) return;
      const next = await readList(atlasBase, search);
      setConversations(next.conversations);
      setListProblem(next.problem);
    },
    [atlasBase, onAtlas],
  );

  /* The read on arrival, on every search keystroke, and when the laptop comes
     back. The same request as `reloadConversations`, written out rather than
     called: the lint rule cannot see past an `await` and would read that as a
     state change in the effect's own body. Aborted when superseded, so a slow
     answer to "gro" cannot land on top of the answer to "groceries". */
  useEffect(() => {
    if (listIsSeeded() || !onAtlas || atlasBase === null) return;
    const controller = new AbortController();
    void readList(atlasBase, chatQuery, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setConversations(next.conversations);
      setListProblem(next.problem);
    });
    return () => controller.abort();
  }, [atlasBase, onAtlas, chatQuery]);

  return {
    conversations: live || listIsSeeded() ? conversations : [],
    setConversations,
    chatQuery,
    setChatQuery,
    listProblem:
      live || listIsSeeded()
        ? listProblem
        : atlasStatus === 'awake'
          ? 'Chats are kept on the laptop. This one is answering in the browser, so it has none.'
          : 'Chats are kept on the laptop, and it is not answering.',
    setListProblem,
    reloadConversations,
  };
}
