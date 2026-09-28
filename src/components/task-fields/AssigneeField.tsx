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
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Button, Icon, IconButton, Well } from '../../ui';
import { useAuth } from '../../contexts/AuthContext';

interface AssigneeFieldProps {
  /** A Firebase uid, or `''` when unassigned. */
  value: string;
  onChange: (assignee: string) => void;
}

export default function AssigneeField({ value, onChange }: AssigneeFieldProps) {
  const { user } = useAuth();
  const isMe = value === user?.uid;
  const name = isMe ? (user?.displayName ?? 'Me') : value ? `User …${value.slice(-6)}` : '';

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
                    boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-3)',
                  }}
                >
                  <Icon name="user-circle" size={16} />
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
      ) : (
        <motion.div
          key="unassigned"
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
        >
          <Button
            block
            disabled={!user}
            onClick={() => user && onChange(user.uid)}
            iconLeft={<Icon name="user-circle" size={16} />}
          >
            Assign to me
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
