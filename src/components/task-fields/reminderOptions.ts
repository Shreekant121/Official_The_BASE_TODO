/**
 * The reminder dropdown has two choices that aren't real minute counts, so
 * they're encoded as negative sentinels while the form is open and translated
 * back to a `Task.reminderMinutes` (or `undefined`) on save. Both the picker
 * and `useTaskDraft` read them from here, so the translation lives in exactly
 * one place.
 */
export const REMINDER_USE_DEFAULT = -1;
export const REMINDER_CUSTOM = -2;

export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: REMINDER_USE_DEFAULT, label: 'Use default' },
  { value: 0,     label: 'No reminder'   },
  { value: 5,     label: '5 min before'  },
  { value: 10,    label: '10 min before' },
  { value: 30,    label: '30 min before' },
  { value: 60,    label: '1 hour before' },
  { value: 120,   label: '2 hours before' },
  { value: 1440,  label: '1 day before'  },
  { value: 10080, label: '1 week before' },
  { value: REMINDER_CUSTOM, label: 'Custom…' },
];

const PRESET_VALUES = REMINDER_OPTIONS.map((o) => o.value).filter((v) => v !== REMINDER_CUSTOM);

/** Stored `reminderMinutes` → the dropdown value plus the custom-minutes text box. */
export function reminderToPicker(reminderMinutes: number | undefined): { value: number; custom: string } {
  if (reminderMinutes === undefined) return { value: REMINDER_USE_DEFAULT, custom: '' };
  if (PRESET_VALUES.includes(reminderMinutes)) return { value: reminderMinutes, custom: '' };
  return { value: REMINDER_CUSTOM, custom: String(reminderMinutes) };
}

/** Dropdown value + custom-minutes text box → the `reminderMinutes` to store. */
export function resolveReminderMinutes(value: number, custom: string): number | undefined {
  if (value === REMINDER_USE_DEFAULT) return undefined;
  if (value === REMINDER_CUSTOM) return Math.max(0, parseInt(custom) || 0);
  return value;
}
