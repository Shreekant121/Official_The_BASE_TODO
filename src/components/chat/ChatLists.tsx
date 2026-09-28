/* The chat list, docked beside the conversation or in a drawer over it.
   Moved out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import ModelPicker from '../ModelPicker';
import type { AtlasConversationSummary } from '../../lib/atlas/client';
import { ChatDrawer } from './ChatDrawer';
import { ChatList } from './ChatList';

/** The mockup's list column. */
const LIST_PX = 264;

export function ChatLists({
  listed,
  showList,
  listOpen,
  setListOpen,
  conversations,
  conversationId,
  chatQuery,
  setChatQuery,
  listProblem,
  openConversation,
  newConversation,
  renameConversation,
  removeConversation,
}: {
  /** Whether the window is wide enough to dock the list. */
  listed: boolean;
  /** Docked and not put away. */
  showList: boolean;
  /** The drawer's own flag, for a window too narrow to dock. */
  listOpen: boolean;
  setListOpen: (open: boolean) => void;
  conversations: AtlasConversationSummary[];
  conversationId: string | null;
  chatQuery: string;
  setChatQuery: (query: string) => void;
  listProblem: string | null;
  openConversation: (id: string) => void;
  newConversation: () => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
}) {
  return (
    <>
      {/* ── The conversation list (item 10) ─────────────────────────────
          Docked beside the rail at 1180 and up, a drawer over the
          conversation below that. The mockup's own split, and its 264.

          **IT SLIDES NOW, AND IT DID NOT BEFORE.** This was `{showList && …}`,
          so hiding the list ripped a 264px column out of the DOM in one frame
          and the whole transcript jumped sideways to fill it — Shreekant's
          *"the smooth transition of the side bar"*. The mockup mounts and
          unmounts it the same way, which is the mockup being a sketch: it
          never has to sit beside a re-flowing 820px column.

          So the column stays mounted and its **width** animates instead, on
          `--dur-sheet`/`--ease-glass` — the drawer's own duration, because
          this is the same object doing the same thing at a different width.
          Two details make it work rather than squash:
            - `overflow: hidden` on the outer box and a **fixed-width inner
              box**, so the list slides out behind the edge instead of the
              search field and every row re-wrapping on the way;
            - `pointerEvents` and `aria-hidden` follow `showList`, so a
              collapsed column is neither clickable nor readable, which a
              zero-width box with content still inside it otherwise is. */}
      <div
        aria-hidden={!showList}
        style={{
          flex: '0 0 auto',
          width: showList ? LIST_PX : 0,
          minHeight: 0,
          boxSizing: 'border-box',
          overflow: 'hidden',
          opacity: showList ? 1 : 0,
          pointerEvents: showList ? 'auto' : 'none',
          transition:
            'width var(--dur-sheet) var(--ease-glass),' +
            ' opacity var(--dur-base) var(--ease-glass)',
        }}
      >
        <div
          style={{
            width: LIST_PX, height: '100%', minHeight: 0, boxSizing: 'border-box',
            padding: 'var(--sp-9) 0 var(--sp-8) var(--sp-9)',
          }}
        >
          <ChatList
            conversations={conversations}
            currentId={conversationId}
            query={chatQuery}
            setQuery={setChatQuery}
            unavailable={listProblem}
            onPick={openConversation}
            onNew={newConversation}
            onRename={(id, title) => void renameConversation(id, title)}
            onDelete={(id) => void removeConversation(id)}
            /* ITEM 13G, second pass - exactly ONE model picker exists at a
               time, and this is why it is gated rather than just passed.
               Both lists are mounted at all widths now: the docked column
               collapses to zero width so it can slide, and the drawer is kept
               off-screen so it can slide too. Two mounted `ChatList`s each
               rendering a footer is two controls with the same accessible
               name driving the same store - which the screenshot harness
               caught first, as a strict-mode violation on `getByTitle`. */
            footer={listed ? <ModelPicker row /> : undefined}
          />
        </div>
      </div>

      {/* ── The same list as a drawer, on a window too narrow to dock it ──
          ITEM 13G — motion 2 of 4. It was mounted on demand and therefore had
          no closed state to slide out of: it simply appeared, which is the one
          thing `tokens/motion.css` opens by forbidding. `ChatDrawer` is
          mounted always and moved off-screen instead, so it slides on
          `--dur-sheet` and its scrim fades on `--dur-fast`. `listed` gates the
          `open` prop rather than the mount, so widening the window past 1180
          closes it rather than stranding it over the docked copy. */}
      <ChatDrawer open={!listed && listOpen} onClose={() => setListOpen(false)}>
        <ChatList
          conversations={conversations}
          currentId={conversationId}
          query={chatQuery}
          setQuery={setChatQuery}
          unavailable={listProblem}
          onPick={openConversation}
          onNew={newConversation}
          onRename={(id, title) => void renameConversation(id, title)}
          onDelete={(id) => void removeConversation(id)}
          /* The other half of the pair above: the drawer owns the picker
             only on a window too narrow to dock the list. */
          footer={!listed ? <ModelPicker row /> : undefined}
        />
      </ChatDrawer>
    </>
  );
}
