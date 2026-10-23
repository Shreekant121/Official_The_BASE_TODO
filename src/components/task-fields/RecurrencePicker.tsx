/**
 * How often the task repeats (UI-13).
 *
 * The custom-rule button is a `Well` you press: a saved rule is a value you
 * read back, not an empty box, which is exactly the Card/Well inversion the
 * design system draws — and it is the same trough `Input` uses, so a rule and
 * a dropdown in the same column sit at the same depth.
 *
 * The series note keeps its two voices, and both are now the system's:
 * a grey warning with its triangle (`--status-warn`, 29-1P2c2) on the last occurrence, because that is the one that needs
 * a decision, and `--fg-3` for everything else.
 *
 * **UI-18 rebuilt both controls this field opens** — `CustomDropdown` is the
 * app's shared picker now and `RecurrenceModal` composes `Dialog`. The manual
 * `createPortal` that used to wrap the modal went with them: it existed
 * because an ancestor animating `scale`/`y` (or the task sheet's
 * `container-type: inline-size`) becomes the containing block for a `fixed`
 * descendant, which confined the old dialog to the card's box instead of
 * centring it over the viewport. `Dialog` portals itself into `<body>`, so
 * the hazard is answered one rung down and a second portal here would only
 * hide where the answer lives.
 */
import { useState } from 'react';
import { type Task, type TaskRecurrence } from '../../store/useStore';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { describeRecurrenceRule, describeSeriesStatus, parseRRule, seriesStatus } from '../../lib/recurrence';
import { Icon } from '../../ui';
import CustomDropdown from '../CustomDropdown';
import RecurrenceModal from '../RecurrenceModal';

const RECURRENCE_OPTIONS: { value: TaskRecurrence; label: string }[] = [
  { value: 'none',    label: 'No repeat' },
  { value: 'daily',   label: 'Daily'     },
  { value: 'weekly',  label: 'Weekly'    },
  { value: 'monthly', label: 'Monthly'   },
  { value: 'yearly',  label: 'Yearly'    },
  { value: 'custom',  label: 'Custom…'   },
];

interface RecurrencePickerProps {
  value: TaskRecurrence;
  /** The custom pattern as an RRULE string; see `lib/recurrence.ts`. */
  customRule?: string;
  onChange: (recurrence: TaskRecurrence, customRule?: string) => void;
  /**
   * The saved task, when there is one. Only used to say where this occurrence
   * sits in its series and whether anything follows it — the rule itself comes
   * from the draft above, so the note reacts to an edit before it is saved.
   */
  task?: Task;
}

export default function RecurrencePicker({ value, customRule, onChange, task }: RecurrencePickerProps) {
  const [modalOpen, setModalOpen] = useState(false);

  // The series counters and the dates are the saved task's; the rule is the
  // draft's. Changing "5 times" to "8 times" therefore re-reads as "3 of 8"
  // straight away, without pretending the task has been through occurrences
  // it has not.
  const status = task
    ? seriesStatus(
        { ...task, recurrence: value, recurrenceRule: customRule, customRecurrence: undefined },
        new Date(),
        resolveUserTimeZone(),
      )
    : { kind: 'none' as const };
  const note = describeSeriesStatus(status);
  const parsed = customRule ? parseRRule(customRule) : null;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      {value === 'custom' && parsed ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center text-left"
          style={{
            gap: 'var(--sp-4)',
            width: '100%',
            height: 46,
            padding: '0 var(--sp-6)',
            border: 0,
            borderRadius: 'var(--r-control)',
            backgroundImage: 'var(--glass-well)',
            boxShadow: 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
            font: 'var(--type-body)',
            fontSize: 'var(--text-md)',
            letterSpacing: 'var(--tracking-ui)',
            color: 'var(--fg-1)',
            cursor: 'pointer',
          }}
        >
          <span className="flex-1 min-w-0 truncate">{describeRecurrenceRule(parsed)}</span>
          <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
            <Icon name="pencil" size={14} />
          </span>
        </button>
      ) : (
        <CustomDropdown
          ariaLabel="Repeat"
          value={value}
          onChange={(v) => {
            if (v === 'custom') setModalOpen(true);
            else onChange(v as TaskRecurrence, undefined);
          }}
          options={RECURRENCE_OPTIONS}
        />
      )}

      {note && (
        <p
          style={{
            font: 'var(--type-kicker)',
            letterSpacing: 'var(--tracking-kicker)',
            color: status.kind === 'last' ? 'var(--status-warn)' : 'var(--fg-3)',
            /* The last occurrence is a warning: grey with its icon (29-1P2c2). */
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          }}
        >
          {status.kind === 'last' && <Icon name="triangle-alert" size={12} style={{ flex: '0 0 auto' }} />}
          {note}
        </p>
      )}

      <RecurrenceModal
        isOpen={modalOpen}
        initialRule={customRule}
        onClose={() => setModalOpen(false)}
        onSave={(rule) => onChange('custom', rule)}
      />
    </div>
  );
}
