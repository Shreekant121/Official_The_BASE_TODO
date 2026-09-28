/**
 * Reference links on a task (UI-13).
 *
 * A saved link is the same row Focus Mode's details drawer shows — a `Well`
 * with the title in `--hue-cyan` and the URL under it in the kicker face. That
 * is deliberate: the two are the same object seen from two screens, and UI-11
 * already settled the colour question there ("links keep their blue… dressing
 * a link in the accent would spend emerald on something that is not live").
 *
 * **The delete button is `.ag-card-actions`, not `group-hover`.** The old row
 * hid it behind `opacity-0 group-hover:opacity-100`, which has no hover on a
 * touch screen and no `:focus-within` — so on the tablet, which is half of what
 * this app runs on, a link could not be removed at all, and by keyboard the
 * focus ring landed on an invisible control. The rule in `screens.css` handles
 * both cases and exists for exactly this.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TaskLink } from '../../store/useStore';
import { Icon, IconButton, Input, useMotion } from '../../ui';

interface LinksEditorProps {
  value: TaskLink[];
  onChange: (links: TaskLink[]) => void;
}

export default function LinksEditor({ value, onChange }: LinksEditorProps) {
  const [newUrl, setNewUrl] = useState('');
  /* From the scope, not a copied bezier (V3-3) — see `FieldChip`. */
  const m = useMotion();
  const [newTitle, setNewTitle] = useState('');

  const addLink = () => {
    const url = newUrl.trim();
    if (!url) return;
    const safeUrl = url.startsWith('http') ? url : `https://${url}`;
    onChange([...value, { id: crypto.randomUUID(), title: newTitle.trim() || url, url: safeUrl }]);
    setNewUrl('');
    setNewTitle('');
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {value.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <AnimatePresence>
            {value.map((link) => (
              <motion.div
                key={link.id}
                className="ag-card flex items-center"
                initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: m.dur.base, ease: m.ease.glass }}
                style={{
                  gap: 'var(--sp-4)',
                  padding: 'var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-5)',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--glass-well)',
                  boxShadow: 'var(--glass-well-shadow)',
                }}
              >
                <span style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto' }}>
                  <Icon name="link-2" size={16} />
                </span>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0"
                  style={{ textDecoration: 'none' }}
                >
                  <span
                    className="block truncate"
                    style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--hue-cyan)' }}
                  >
                    {link.title}
                  </span>
                  <span className="block truncate" style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
                    {link.url}
                  </span>
                </a>
                <span className="ag-card-actions" style={{ display: 'flex', flex: '0 0 auto' }}>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Remove link ${link.title}`}
                    onClick={() => onChange(value.filter((l) => l.id !== link.id))}
                  >
                    <Icon name="x" size={14} />
                  </IconButton>
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
        <Input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Label"
          size="sm"
          style={{ flex: '0 1 34%', minWidth: 0 }}
        />
        <Input
          type="url"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addLink(); }}
          placeholder="https://…"
          size="sm"
          style={{ flex: 1, minWidth: 0 }}
        />
        <IconButton size="sm" label="Add link" onClick={addLink}>
          <Icon name="plus" size={16} />
        </IconButton>
      </div>
    </div>
  );
}
