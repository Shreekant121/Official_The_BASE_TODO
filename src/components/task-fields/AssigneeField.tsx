/**
 * Who owns this task (UI-13).
 *
 * Assigned, it is a `Well` — a trough you read a value out of, which is what
 * the design system's own pairing says this is. Unassigned, it is a plain
 * glass `Button`.
 *
 * **The dashed placeholder is gone**, here and on `CoverImageField`, which were
 * the app's only two. Aurora Glass has no dashed anything: an "add the thing
 * that is not there yet" affordance is a `Button` with a leading glyph, and
 * inventing a second, dimmer kind of button for it made the two of them look
 * like disabled controls rather than the one thing on the field you can press.
 *
 * **A typed name, since 29-1P13** (his call, 2026-10-06): "Someone else…" takes
 * a person's name — Priya, "Rahul (CA)" — which is what Atlas already wrote
 * here, and which the Dashboard's "Waiting on" block lists with the days since.
 * The value is that name; his own account id still means him. Until Contacts
 * (step 34) a name is only a name, with no face or number behind it.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, IconButton, Input, SoftButton, SoftIconButton, Well } from '../../ui';
import { useAuth } from '../../contexts/AuthContext';

interface AssigneeFieldProps {
  /** His Firebase uid, a person's name, or `''` when unassigned. */
  value: string;
  onChange: (assignee: string) => void;
}

/** The same test the share snapshot makes: an account id is 20+ letters and digits, a name is not. */
const ACCOUNT_ID = /^[A-Za-z0-9]{20,}$/;

export default function AssigneeField({ value, onChange }: AssigneeFieldProps) {
  const { user } = useAuth();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const isMe = value === user?.uid;
  const name = isMe ? (user?.displayName ?? 'Me') : ACCOUNT_ID.test(value) ? 'Another account' : value;
  const initial = !isMe && !ACCOUNT_ID.test(value) ? value.trim().charAt(0).toUpperCase() : '';

  const commit = () => {
    const who = draft.trim().slice(0, 60);
    if (who) onChange(who);
    setTyping(false);
    setDraft('');
  };

  return (
    <AnimatePresence mode="wait">
      {value ? (
        <motion.div
          key="assigned"
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
        >
          <Well pad="var(--sp-4) var(--sp-5)">
            <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
              {isMe && user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  style={{
                    width: 28, height: 28, flex: '0 0 auto',
                    borderRadius: 'var(--r-circle)', objectFit: 'cover',
                    boxShadow: 'var(--glass-rim-2)',
                  }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    display: 'grid', placeItems: 'center', width: 28, height: 28, flex: '0 0 auto',
                    borderRadius: 'var(--r-circle)', backgroundImage: 'var(--glass-fill-2)',
                    boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-2)',
                    font: 'var(--type-label)', fontSize: 'var(--text-sm)',
                  }}
                >
                  {initial || <Icon name="user-circle" size={16} />}
                </span>
              )}
              <span
                className="flex-1 min-w-0 truncate"
                style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}
              >
                {name}
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                label="Unassign"
                onClick={() => onChange('')}
              >
                <Icon name="x" size={14} />
              </IconButton>
            </div>
          </Well>
        </motion.div>
      ) : typing ? (
        <motion.form
          key="typing"
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          onSubmit={(e) => { e.preventDefault(); commit(); }}
          className="flex items-center"
          style={{ gap: 'var(--sp-3)' }}
        >
          <div className="flex-1 min-w-0">
            <Input
              autoFocus
              size="sm"
              value={draft}
              maxLength={60}
              placeholder="Their name"
              aria-label="Who is doing it"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                /* Escape closes the box, not the sheet around it. */
                if (e.key === 'Escape') { e.stopPropagation(); setTyping(false); setDraft(''); }
              }}
            />
          </div>
          <SoftIconButton size="sm" label="Assign" type="submit" disabled={!draft.trim()}>
            <Icon name="check" size={14} />
          </SoftIconButton>
          <IconButton size="sm" variant="ghost" label="Cancel" onClick={() => { setTyping(false); setDraft(''); }}>
            <Icon name="x" size={14} />
          </IconButton>
        </motion.form>
      ) : (
        <motion.div
          key="unassigned"
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          className="flex"
          style={{ gap: 'var(--sp-3)' }}
        >
          <SoftButton
            disabled={!user}
            onClick={() => user && onChange(user.uid)}
            icon={<Icon name="user-circle" size={16} />}
            style={{ flex: 1 }}
          >
            Assign to me
          </SoftButton>
          <SoftButton onClick={() => setTyping(true)} icon={<Icon name="users" size={16} />} style={{ flex: 1 }}>
            Someone else…
          </SoftButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
