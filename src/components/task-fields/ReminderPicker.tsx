/**
 * How long before the deadline the reminder fires (UI-13).
 *
 * The custom-minutes box is the design system's `Input`, with "min before"
 * as its mono `suffix` — the trailing word used to be a separate grey span
 * beside the field, which is the same thing said with an extra element.
 *
 * The dropdown above it is `CustomDropdown`, rebuilt by UI-18 — 46px, the
 * same height as this `Input`, which is what stopped the two disagreeing when
 * "Custom…" reveals the second field.
 */
import CustomDropdown from '../CustomDropdown';
import { Input } from '../../ui';
import { REMINDER_CUSTOM, REMINDER_OPTIONS } from './reminderOptions';

interface ReminderPickerProps {
  /** May be one of the `REMINDER_*` sentinels; `resolveReminderMinutes` translates on save. */
  value: number;
  customMinutes: string;
  onChange: (value: number) => void;
  onCustomMinutesChange: (minutes: string) => void;
}

export default function ReminderPicker({
  value, customMinutes, onChange, onCustomMinutesChange,
}: ReminderPickerProps) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <CustomDropdown
        ariaLabel="Reminder"
        value={value}
        onChange={(v) => onChange(Number(v))}
        options={REMINDER_OPTIONS}
      />
      {value === REMINDER_CUSTOM && (
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={customMinutes}
          onChange={(e) => onCustomMinutesChange(e.target.value)}
          placeholder="0"
          suffix="min before"
        />
      )}
    </div>
  );
}
