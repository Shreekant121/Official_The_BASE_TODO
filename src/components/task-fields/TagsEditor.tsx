/**
 * Free-form tags (UI-13). A row of `FieldChip`s over the design system's
 * `Input` and a round add button — the pill-shaped input this used to build by
 * hand out of `fieldStyles.pillInputCls` is just `Input`, whose control radius
 * is already `--r-pill`.
 */
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Icon, IconButton, Input } from '../../ui';
import FieldChip from './FieldChip';

interface TagsEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

export default function TagsEditor({ value, onChange }: TagsEditorProps) {
  const [newTag, setNewTag] = useState('');

  const addTag = () => {
    const tag = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setNewTag('');
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {value.length > 0 && (
        <div className="flex flex-wrap" style={{ gap: 'var(--sp-3)' }}>
          <AnimatePresence>
            {value.map((tag) => (
              <FieldChip
                key={tag}
                onRemove={() => onChange(value.filter((t) => t !== tag))}
                removeLabel={`Remove tag ${tag}`}
              >
                #{tag}
              </FieldChip>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
        <Input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          placeholder="Add tag…"
          size="sm"
          style={{ flex: 1, minWidth: 0 }}
        />
        <IconButton size="sm" label="Add tag" onClick={addTag}>
          <Icon name="plus" size={16} />
        </IconButton>
      </div>
    </div>
  );
}
