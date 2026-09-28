/**
 * The app's `<select>` replacement — rebuilt on Aurora Glass (UI-18).
 *
 * Nine of these are on screen across the app: the six task-field editors
 * (list & project, "also shown in", prerequisites, repeat, reminder), the
 * bulk-move bar on the project board, and Capture Idea's list chooser. Until
 * this session every one of them was the last old-design control on an
 * otherwise-migrated screen — a `rounded-2xl` box with a `border-white/10`
 * rim and a hand-mixed `rgba(0,0,0,0.25)` fill, sitting directly beside an
 * `Input` built out of `--glass-well`.
 *
 * IT IS THE SAME OBJECT AS EVERY OTHER PICKER NOW
 * -----------------------------------------------
 * This file no longer draws anything. The trigger is `PickerButton`, the
 * panel's contents are `PickerList` + `PickerOption`, and the popover shell is
 * `PortalDropdown` — the exact three parts New Session's filter and its two
 * add-forms have used since UI-15. That is the whole point of the rebuild:
 * "choose one of these" is one object in this app, and it was three.
 *
 * `components/pickers.tsx` moved up out of `session/` to make that honest;
 * its header carries the reasoning, including why a picker is not a
 * `MorphMenu`.
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * The generic signature, every prop, and the `value`/`onChange` contract —
 * all nine call sites compile untouched and behave identically. Two details
 * worth naming because they look like paint and are not:
 *
 * 1. **`size="md"` is the default here, `sm` everywhere else.** 46px is
 *    `Input`'s own height, and eight of the nine call sites stand this
 *    control next to a real `Input` or inside a form column. New Session's
 *    three pickers stay 38px because they live in a toolbar. Passing
 *    `size="sm"` gets the toolbar height back.
 * 2. **The chosen row is marked with `aria-pressed` and a tick, not with a
 *    bold weight.** `PickerOption`'s doing, and it is the idiom the app
 *    already uses for a group of exclusive choices — see `StatusPills`.
 *
 * One prop is new: `ariaLabel`. A trigger whose only accessible name is the
 * value currently in it announces "1 hour before, collapsed" and never says
 * what it is choosing — the field's visible `FieldLabel` is a sibling, not a
 * label, so nothing associates the two. Every call site passes one now. It is
 * also what lets the screenshot harness open a specific picker on a screen
 * that shows five of them.
 */
import { useRef, useState } from 'react';
import { PickerButton, PickerList, PickerOption, type PickerButtonSize } from './pickers';
import { PortalDropdown } from './PortalDropdown';

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface CustomDropdownProps<T extends string | number> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  width?: number | string;
  upward?: boolean;
  /** See note 1 in the header. `md` (46px) here, unlike the bare `PickerButton`. */
  size?: PickerButtonSize;
  /** What this picker CHOOSES, not what is currently in it. Always pass one. */
  ariaLabel?: string;
}

export default function CustomDropdown<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  className = '',
  width,
  upward = false,
  size = 'md',
  ariaLabel,
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`}>
      <PickerButton
        ref={triggerRef}
        open={isOpen}
        size={size}
        aria-label={ariaLabel}
        muted={!selected}
        glyph={selected?.icon}
        onClick={() => setIsOpen((v) => !v)}
        style={{ width: '100%' }}
      >
        {selected?.label ?? placeholder}
      </PickerButton>

      <PortalDropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        width={width}
        upward={upward}
      >
        {/* `min(…)` rather than a flat 280px: this panel is portalled to the
            viewport, and a fixed pixel cap on a tablet in landscape is either
            most of the window or a sliver of it depending on nothing. Same
            expression the other three pickers use. */}
        <PickerList maxHeight="min(50vh, 320px)">
          {options.map((opt) => (
            <PickerOption
              key={opt.value}
              selected={opt.value === value}
              glyph={opt.icon}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
            >
              {opt.label}
            </PickerOption>
          ))}
        </PickerList>
      </PortalDropdown>
    </div>
  );
}
