/**
 * The conversation list on `/chat` (item 10, `design-system/screens/atlas.html`).
 *
 * WHAT IT IS LISTING
 * ------------------
 * Files on Shreekant's laptop, not anything in this browser. D11 made the
 * transcript ephemeral on purpose and that was right *for where it was
 * stored*: `users/{uid}/data/main` is rewritten whole on every task edit and
 * Firestore caps it at 1 MB, so an unbounded transcript in there would
 * eventually cost him his backlog. Atlas holds it instead, uncapped, and any
 * device that can reach the laptop sees the same conversations.
 *
 * **The list never carries histories** — `ConversationSummary` is titles and
 * counts, and the transcript arrives only when a chat is opened. On a tablet
 * over Tailscale that is the difference between a sidebar that paints and one
 * that ships a month of conversation to draw five lines of text.
 *
 * **Search runs on the laptop, not here.** Atlas matches the title *and the
 * text of the conversation*, which is how anybody actually looks for a chat —
 * "the one about the lease" — and a title taken from the first line rarely
 * holds the word that comes to mind later. Doing it here would mean fetching
 * every transcript to filter five rows.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, IconButton, Input, MetaKicker } from '../../ui';
import type { AtlasConversationSummary } from '../../lib/atlas/client';
import { relativeWhen } from '../../lib/atlas/relativeWhen';

export interface ChatListProps {
  conversations: AtlasConversationSummary[];
  currentId: string | null;
  query: string;
  setQuery: (value: string) => void;
  /** Null while the laptop has not answered — drawn as a line, never as an error. */
  unavailable: string | null;
  onPick: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  /**
   * What sits under the list (item 13G, second pass).
   *
   * The model picker, as a row — Shreekant's call, 2026-09-08: *"put the model
   * picker below the chats with a small icon and text just like others"*. It is
   * a slot rather than the picker itself so this component keeps knowing
   * nothing about models; it lists conversations, and the page decides what
   * belongs under them.
   */
  footer?: ReactNode;
}

export function ChatList({
  conversations,
  currentId,
  query,
  setQuery,
  unavailable,
  onPick,
  onNew,
  onRename,
  onDelete,
  footer,
}: ChatListProps) {
  return (
    <div
      style={{
        display: 'grid',
        /* A fourth row only when there is something to put in it, so a list
           with no footer is laid out exactly as it was. */
        gridTemplateRows: footer ? 'auto auto minmax(0,1fr) auto' : 'auto auto minmax(0,1fr)',
        /* The column, not just the list's row, has to be allowed to shrink.
           An `<input>` has a natural width of its own (about twenty
           characters), and with no column declared the grid made its one
           column at least that wide — so the search box measured 273px in a
           232px column and was cut off at the docked panel's edge, which
           Shreekant reported (2026-09-24). Same `min-width: auto` trap as the
           rows below, answered once, here. */
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 'var(--sp-5)',
        height: '100%', minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <MetaKicker tone="var(--fg-3)">Chats</MetaKicker>
        <span style={{ flex: 1 }} />
        <IconButton label="New chat" title="New chat" variant="ghost" onClick={onNew}>
          <Icon name="message-square-plus" size={18} />
        </IconButton>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search chats"
        aria-label="Search chats"
        iconLeft={<Icon name="search" size={16} />}
      />

      {/* `minmax(0, 1fr)` is not tidiness, it is the fix for a row that was
          30px wider than the column holding it.

          A grid item's default `min-width: auto` refuses to shrink below its
          content's minimum, and a chat row's minimum is a long title plus its
          two hover buttons — so every row overflowed this box and hung out to
          the right, where nothing clipped it and nobody noticed. **Item 13G
          made it visible rather than causing it**: the docked column gained
          `overflow: hidden` so it could slide shut, which turned a silent
          overhang into a rename button sliced down the middle. Shreekant
          reported it as *"the edit and the delete button get out of view"*.
          Measured at 1440: the column's content box is 232px and the row
          measured 262, leaving 2px of the timestamp on screen.

          This is the same `min-width: auto` trap item 1 hit inside the task
          sheet, answered the same way — at the container, once. */}
      <div
        className="ag-scroll"
        style={{
          overflowY: 'auto', overscrollBehavior: 'contain',
          display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--sp-2)', alignContent: 'start',
        }}
      >
        {unavailable !== null ? (
          <span
            style={{
              font: 'var(--type-caption)', color: 'var(--fg-4)',
              padding: 'var(--sp-5)', textWrap: 'pretty',
            }}
          >
            {unavailable}
          </span>
        ) : conversations.length === 0 ? (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: 'var(--sp-5)' }}>
            {query.trim() === '' ? 'No conversations yet.' : 'No chat matches that.'}
          </span>
        ) : (
          conversations.map((conversation) => (
            <ChatRow
              key={conversation.id}
              conversation={conversation}
              on={conversation.id === currentId}
              onPick={() => onPick(conversation.id)}
              onRename={(title) => onRename(conversation.id, title)}
              onDelete={() => onDelete(conversation.id)}
            />
          ))
        )}
      </div>

      {footer && (
        <div
          style={{
            display: 'grid', minWidth: 0,
            paddingTop: 'var(--sp-4)',
            borderTop: '1px solid var(--line-faint)',
          }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * One row. Double-click or the pencil renames in place; the mockup's own
 * gesture, and the reason there is no rename dialog.
 *
 * **Delete asks once, in the row.** Two presses of the same button rather than
 * a dialog — the same law `MorphMenu` states for a destructive item, applied
 * to a control too small to hold a menu. A conversation is the one thing on
 * this screen with no Trash behind it, so the confirm is not ceremony.
 */
function ChatRow({
  conversation,
  on,
  onPick,
  onRename,
  onDelete,
}: {
  conversation: AtlasConversationSummary;
  on: boolean;
  onPick: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [editing, setEditing] = useState(false);
  const [armed, setArmed] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) field.current?.select();
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next !== '' && next !== conversation.title) onRename(next);
    else setDraft(conversation.title);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        /* A delete armed and then abandoned must not still be armed when he
           comes back to the row for something else. Done here rather than in
           an effect on `hover`: the pointer leaving is the event. */
        setArmed(false);
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 46,
        /* See the grid above. `minWidth: 0` on the item as well as
           `minmax(0, 1fr)` on the track: the first lets this row shrink, the
           second lets the track it sits in shrink, and a row overflows if
           either is missing. */
        minWidth: 0,
        padding: '0 var(--sp-3) 0 var(--sp-5)', borderRadius: 'var(--r-pill)',
        backgroundImage: on ? 'var(--glass-fill-2)' : hover ? 'var(--glass-fill-1)' : 'none',
        boxShadow: on ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        /* ITEM 13G — motion 10, and it is narrower than what was here.
           `var(--t-hover)` animates transform and background-*colour* as well,
           neither of which this row changes; what it does change —
           `background-image` — is not in that shorthand at all, so the fill
           was snapping on while an unused transform waited for it. The mockup
           names the two properties that actually move and gives them different
           durations: the fill lands on `--dur-fast`, the shadow settles after
           it on `--dur-base`, which is what makes a row read as lifting rather
           than switching. */
        transition:
          'box-shadow var(--dur-base) var(--ease-glass),' +
          ' background-image var(--dur-fast) var(--ease-glass)',
      }}
    >
      {conversation.pinned && (
        <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
          <Icon name="pin" size={13} />
        </span>
      )}

      {editing ? (
        <input
          ref={field}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setDraft(conversation.title);
              setEditing(false);
            }
          }}
          aria-label="Rename this chat"
          style={{
            flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none',
            color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)', padding: 0,
          }}
        />
      ) : (
        <button
          type="button"
          onClick={onPick}
          onDoubleClick={() => setEditing(true)}
          style={{
            flex: 1, minWidth: 0, border: 0, background: 'transparent', padding: 0,
            cursor: 'pointer', textAlign: 'left',
            font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: on ? 'var(--fg-1)' : 'var(--fg-2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {conversation.title}
        </button>
      )}

      {armed ? (
        <button
          type="button"
          onClick={onDelete}
          style={{
            flex: '0 0 auto', border: 0, cursor: 'pointer', padding: '0 var(--sp-4)', height: 28,
            borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-tint-rose)',
            boxShadow: 'var(--glass-rim-2)', color: 'var(--status-overrun)',
            font: 'var(--type-label)', fontSize: 'var(--text-xs)',
          }}
        >
          Delete?
        </button>
      ) : hover && !editing ? (
        <span style={{ display: 'flex', flex: '0 0 auto' }}>
          <IconButton label="Rename this chat" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={13} />
          </IconButton>
          <IconButton label="Delete this chat" variant="ghost" size="sm" onClick={() => setArmed(true)}>
            <Icon name="trash-2" size={13} />
          </IconButton>
        </span>
      ) : (
        <MetaKicker>{relativeWhen(conversation.updatedAt)}</MetaKicker>
      )}
    </div>
  );
}
