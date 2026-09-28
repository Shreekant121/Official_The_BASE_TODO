/**
 * Estimated time, paired with the shared PERT calculator (UI-13).
 *
 * The box is the design system's `Input` — an etched well that lights emerald
 * on focus, with the unit set in mono beside the digits, which is exactly what
 * `suffix` is for. The calculator is an `IconButton`, so the one control that
 * opens a sheet looks like every other round glass affordance in the app.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import PertEstimationModal from '../PertEstimationModal';
import { Icon, IconButton, Input } from '../../ui';

interface EstimateFieldProps {
  /** Minutes, held as a string so the input can be empty. */
  value: string;
  onChange: (minutes: string) => void;
  /** Task title, shown as the PERT dialog's subtitle. */
  subtitle?: string;
}

export default function EstimateField({ value, onChange, subtitle }: EstimateFieldProps) {
  const [pertOpen, setPertOpen] = useState(false);

  return (
    <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        min={0}
        suffix="min"
        style={{ flex: 1, minWidth: 0 }}
      />
      <IconButton
        label="PERT estimation calculator"
        onClick={() => setPertOpen(true)}
      >
        <Icon name="calculator" size={18} />
      </IconButton>

      {/* Portalled for the same containing-block reason as RecurrencePicker. */}
      {createPortal(
        <PertEstimationModal
          isOpen={pertOpen}
          subtitle={subtitle}
          /* Seeds the three numbers off what is estimated now, so the sheet
             opens already drawing this task's distribution. */
          baseMinutes={Number(value) || undefined}
          onClose={() => setPertOpen(false)}
          onApply={(expectedMinutes) => { onChange(expectedMinutes.toString()); setPertOpen(false); }}
        />,
        document.body,
      )}
    </div>
  );
}
