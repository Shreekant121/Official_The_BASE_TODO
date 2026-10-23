/**
 * His break ideas, edited (29-1P11a, idea 104): Settings → Brown noise →
 * Break ideas. His words: "we can add a huge list of 100's of things inside
 * it". Add one at the top, find one, take one out; "Put back" brings back
 * every seed idea he removed. What is stored is only what he changed
 * (`lib/breaks.ts`), synced by `breakIdeaSync.ts`.
 *
 * Built on first open, and the list draws what is near the screen
 * (`useRevealOnScroll`, CLAUDE.md "Performance" rule 3): two hundred rows are
 * not built for a sheet he opens once a month.
 */
import { useMemo, useRef, useState } from 'react';
import { Dialog, Icon, IconButton, Input, LitLine, litSafe, SoftButton, WhiteButton } from '../ui';
import {
  addBreakIdea, removeBreakIdea, restoreBreakIdeas, useBreakIdeaEdits, useBreakIdeas,
} from '../lib/breakIdeaStore';
import { cleanIdea, IDEA_MAX } from '../lib/breaks';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { useRevealOnScroll } from '../lib/useRevealOnScroll';
import { Z } from '../lib/zLayers';

export default function BreakIdeasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useOverlayDismiss(open, onClose);
  const ideas = useBreakIdeas();
  const edits = useBreakIdeaEdits();
  const [draft, setDraft] = useState('');
  const [find, setFind] = useState('');
  const scroller = useRef<HTMLDivElement | null>(null);

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? ideas.filter((i) => i.text.toLowerCase().includes(q)) : ideas;
  }, [ideas, find]);
  const { count, sentinelRef } = useRevealOnScroll(shown.length, scroller, 40, 40);

  const add = () => {
    if (!cleanIdea(draft)) return;
    addBreakIdea(draft);
    setDraft('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={520}
      label="Break ideas"
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-5)', padding: 'var(--pad-sheet)', paddingBottom: 'var(--sp-4)', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
              Break ideas
            </h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              {ideas.length} small things a break can offer. One shows each break.
            </p>
          </div>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>
        <form
          onSubmit={(e) => { e.preventDefault(); add(); }}
          style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}
        >
          <Input
            block
            value={draft}
            maxLength={IDEA_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add your own: Stretch your back"
            aria-label="New break idea"
          />
          <WhiteButton size="sm" type="submit" disabled={!cleanIdea(draft)}>Add</WhiteButton>
        </form>
        <Input
          block
          size="sm"
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder="Find an idea"
          aria-label="Find a break idea"
          iconLeft={<Icon name="search" size={15} />}
        />
      </div>
      <div
        ref={scroller}
        className="ag-scroll ag-fade"
        style={{ maxHeight: 'min(52vh, 460px)', overflowY: 'auto', padding: '0 var(--pad-sheet)' }}
      >
        {shown.length === 0 ? (
          <LitLine
            as="p"
            text={ideas.length === 0
              ? 'No ideas left. **Add one** above, or **put the removed ones back**.'
              : find.trim() === '' ? 'No idea matches that.' : `No idea matches **“${litSafe(find.trim())}”**.`}
            style={{ padding: 'var(--sp-5) 0', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}
          />
        ) : (
          <ul style={{ display: 'grid', gap: 'var(--sp-1)', margin: 0, padding: 0, listStyle: 'none' }}>
            {shown.slice(0, count).map((idea) => (
              <li
                key={idea.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 40,
                  padding: '0 var(--sp-2) 0 var(--sp-4)', borderRadius: 'var(--r-sm)',
                  backgroundImage: 'var(--glass-fill-1)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
                  {idea.text}
                </span>
                <IconButton label={`Remove “${idea.text}”`} variant="ghost" size="sm" onClick={() => removeBreakIdea(idea.id)}>
                  <Icon name="x" size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        <div ref={sentinelRef} style={{ height: 1 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 'var(--sp-4) var(--pad-sheet) var(--pad-sheet)' }}>
        {edits.hidden.length > 0 && (
          <SoftButton size="sm" icon={<Icon name="undo-2" size={15} />} onClick={restoreBreakIdeas}>
            Put back {edits.hidden.length} removed
          </SoftButton>
        )}
      </div>
    </Dialog>
  );
}
