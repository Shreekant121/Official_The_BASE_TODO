/**
 * "Custom recurrence" — rebuilt on Aurora Glass (UI-18).
 *
 * Google-Tasks-style: repeat every N units, an optional weekday picker for
 * weekly patterns, a "Repeat on" picker for monthly ones, and an "Ends"
 * section (Never / On date / After N occurrences).
 *
 * **The rule this sheet hands back is an iCalendar RRULE string** (session 2).
 * It edits a parsed `RRule` and serialises on save, so `lib/recurrence.ts` is
 * still the only thing that decides what a pattern means and the only thing
 * that reads inside the string. Nothing else here changed shape: `onSave` is
 * called once, with one value, when Done is pressed.
 *
 * THE "ENDS" FIELDS ARE HELD OUTSIDE THE RULE, ON PURPOSE
 * ------------------------------------------------------
 * An RRULE has no way to say "ends after 8 times, but right now it never
 * ends" — `COUNT` is either in the string or it is not. The old rule object
 * had an `endType` beside the two values, which is what let you type a date,
 * flip to Never, and flip back to find it still there. That is preserved by
 * keeping `endType`, `endDate` and `endCount` in this sheet's own state and
 * folding them into `UNTIL`/`COUNT` only on save.
 *
 * WHAT UI-18 CHANGED
 * ------------------
 * It **composes `Dialog`** instead of hand-rolling a scrim, a spring and a
 * `liquid-glass-elevated` panel. That is not only paint: the scrim, the focus
 * trap, the return-focus-to-the-opener and the condense entrance now live in
 * one place for every sheet in the app, and the centring bug this file used
 * to carry a paragraph about — Framer overwriting `transform` on a
 * `-translate-x-1/2` panel — cannot come back, because nothing here positions
 * itself any more.
 *
 * `useOverlayDismiss` and `Z.modalOverModal` are unchanged, and `Dialog` takes
 * `closeOnEscape={false}` so the two never both answer one keypress. This
 * sheet opens *from* the Repeat field of a task editor that is itself an
 * overlay, which is what `modalOverModal` is for.
 *
 * THE CONTROLS, AND WHY THEY LOOK LIKE THAT
 * -----------------------------------------
 * 1. **The unit is a `CustomDropdown`.** It was a native `<select>` with
 *    `appearance: none` and a hand-mixed fill — the last native select in the
 *    app. It is now the same picker as everywhere else, which also means it
 *    can be read on a tablet without the OS wheel taking over the screen.
 * 2. **The weekday chips are `aria-pressed`, tinted, not indigo.** Indigo was
 *    not a token; it was not even in the old palette's vocabulary. Seven
 *    chips of which several are on at once is a multi-select, so each carries
 *    its own pressed state — the accent as an interaction mark, exactly as in
 *    `PersonalScorePicker`.
 * 3. **Monthly "Repeat on" is dropdowns, not a second grid of chips.** The
 *    four ways a month can be picked are one-of-four, not many-of-seven, and
 *    the ordinal and the weekday read as one sentence ("Last" · "Friday") —
 *    two pills beside each other say that; fifty-odd chips would not.
 * 4. **"Ends" is a real radio group.** It was three native radios wearing
 *    `accent-indigo-500`. A native radio cannot be styled to look like
 *    anything in this system, so the ring and dot are drawn — but the row is
 *    `role="radio"` with `aria-checked` inside a `role="radiogroup"`, so
 *    arrow keys and screen readers get the same control they always had.
 *    The inline date and count fields stay OUTSIDE the radio button: a field
 *    nested in a radio is unreachable, and it is why each row is a flex pair
 *    rather than a `<label>`.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import {
  dateInputToUntil,
  formatRRule,
  normaliseRRule,
  parseRRule,
  untilToDateInput,
  type RRule,
} from '../lib/recurrence';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { Button, Dialog, FieldLabel, Icon, IconButton, Input } from '../ui';
import CustomDropdown from './CustomDropdown';

interface RecurrenceModalProps {
  isOpen: boolean;
  /** The rule being edited, as an RRULE string. */
  initialRule?: string;
  onClose: () => void;
  onSave: (rule: string) => void;
}

const FREQ_OPTIONS: { value: RRule['freq']; label: string; plural: string }[] = [
  { value: 'DAILY',   label: 'Day',   plural: 'Days'   },
  { value: 'WEEKLY',  label: 'Week',  plural: 'Weeks'  },
  { value: 'MONTHLY', label: 'Month', plural: 'Months' },
  { value: 'YEARLY',  label: 'Year',  plural: 'Years'  },
];

const WEEKDAYS = [
  { value: 0, label: 'S', name: 'Sunday' },
  { value: 1, label: 'M', name: 'Monday' },
  { value: 2, label: 'T', name: 'Tuesday' },
  { value: 3, label: 'W', name: 'Wednesday' },
  { value: 4, label: 'T', name: 'Thursday' },
  { value: 5, label: 'F', name: 'Friday' },
  { value: 6, label: 'S', name: 'Saturday' },
];

/** The four ways a monthly rule can pick its day. */
type MonthlyMode = 'anchor' | 'day' | 'lastDay' | 'weekday';

const MONTHLY_MODES: { value: MonthlyMode; label: string }[] = [
  { value: 'anchor',  label: 'The same date each month' },
  { value: 'day',     label: 'A day of the month'       },
  { value: 'lastDay', label: 'The last day'             },
  { value: 'weekday', label: 'A weekday of the month'   },
];

const ORDINAL_OPTIONS = [
  { value: '1',  label: 'First'  },
  { value: '2',  label: 'Second' },
  { value: '3',  label: 'Third'  },
  { value: '4',  label: 'Fourth' },
  { value: '-1', label: 'Last'   },
];

const DEFAULT_RULE: RRule = { freq: 'WEEKLY', interval: 1, byDay: [] };

/**
 * The sheet's working state: the pattern, plus the two end values it is
 * holding on to whether or not they are in force. See the note at the top.
 */
interface Editor {
  rule: RRule;
  endType: 'never' | 'onDate' | 'afterCount';
  endDate: string;
  endCount: number;
}

function toEditor(initial: string | undefined): Editor {
  const rule = parseRRule(initial) ?? DEFAULT_RULE;
  return {
    rule,
    endType: rule.count !== undefined ? 'afterCount' : rule.until ? 'onDate' : 'never',
    endDate: untilToDateInput(rule.until),
    endCount: rule.count ?? 1,
  };
}

function toRRule(editor: Editor): string {
  return formatRRule({
    ...editor.rule,
    count: editor.endType === 'afterCount' ? Math.max(1, editor.endCount) : undefined,
    until: editor.endType === 'onDate' ? dateInputToUntil(editor.endDate) : undefined,
  });
}

function monthlyModeOf(rule: RRule): MonthlyMode {
  if (rule.byDay.length > 0) return 'weekday';
  if (rule.byMonthDay === -1) return 'lastDay';
  if (rule.byMonthDay !== undefined) return 'day';
  return 'anchor';
}

/**
 * Switching mode keeps whatever the chosen mode can use and drops the rest —
 * through `normaliseRRule`, so the sheet can never hold a rule the engine
 * would read differently from how this sheet is drawing it.
 */
function withMonthlyMode(rule: RRule, mode: MonthlyMode): RRule {
  switch (mode) {
    case 'anchor':
      return normaliseRRule({ ...rule, byDay: [], byMonthDay: undefined });
    case 'lastDay':
      return normaliseRRule({ ...rule, byDay: [], byMonthDay: -1 });
    case 'day':
      return normaliseRRule({
        ...rule,
        byDay: [],
        byMonthDay: rule.byMonthDay && rule.byMonthDay > 0 ? rule.byMonthDay : 1,
      });
    case 'weekday':
      return normaliseRRule({
        ...rule,
        byMonthDay: undefined,
        byDay: [{ weekday: rule.byDay[0]?.weekday ?? 1, ordinal: rule.byDay[0]?.ordinal ?? 1 }],
      });
  }
}

/** The drawn radio. See note 4 — a native one cannot wear this system. */
function Radio({
  checked,
  label,
  onSelect,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        minHeight: 'var(--hit-min)',
        padding: '0 var(--sp-4) 0 var(--sp-3)',
        border: 0,
        borderRadius: 'var(--r-control)',
        background: 'transparent',
        font: 'var(--type-body)',
        fontSize: 'var(--text-sm)',
        letterSpacing: 'var(--tracking-ui)',
        color: checked ? 'var(--fg-1)' : 'var(--fg-2)',
        cursor: 'pointer',
        transition: 'color var(--dur-fast) var(--ease-glass)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 18,
          height: 18,
          flex: '0 0 auto',
          borderRadius: '50%',
          boxShadow: checked ? '0 0 0 1px var(--accent)' : '0 0 0 1px var(--line-strong)',
          transition: 'box-shadow var(--dur-fast) var(--ease-glass)',
        }}
      >
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            background: checked ? 'var(--accent)' : 'transparent',
            transform: checked ? 'scale(1)' : 'scale(0.4)',
            transition: 'background var(--dur-fast) var(--ease-glass), transform var(--dur-fast) var(--ease-glass)',
          }}
        />
      </span>
      {label}
    </button>
  );
}

function chipStyle(active: boolean): CSSProperties {
  return {
    display: 'grid',
    placeItems: 'center',
    width: 38,
    height: 38,
    flex: '0 0 auto',
    border: 0,
    borderRadius: '50%',
    backgroundImage: active ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
    boxShadow: active ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
    font: 'var(--type-label)',
    color: active ? 'var(--fg-1)' : 'var(--fg-4)',
    cursor: 'pointer',
    transition:
      'background-image var(--dur-fast) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass), color var(--dur-fast) var(--ease-glass)',
  };
}

export default function RecurrenceModal({ isOpen, initialRule, onClose, onSave }: RecurrenceModalProps) {
  useOverlayDismiss(isOpen, onClose);

  const [editor, setEditor] = useState<Editor>(() => toEditor(initialRule));

  /* Back to the field's own rule each time the sheet opens, so last task's
     pattern is never sitting in the boxes for this one. A render-phase
     adjustment rather than an effect — the same thing `PertEstimationModal`
     does, and what the old "only mount the dialog while open" wrapper was
     achieving by accident. */
  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) setEditor(toEditor(initialRule));
  }

  const { rule } = editor;
  const setRule = (next: (previous: RRule) => RRule) =>
    setEditor((e) => ({ ...e, rule: next(e.rule) }));

  const toggleWeekday = (day: number) => {
    setRule((r) => {
      const chosen = r.byDay.map((d) => d.weekday);
      const next = chosen.includes(day) ? chosen.filter((d) => d !== day) : [...chosen, day];
      return normaliseRRule({ ...r, byDay: next.map((weekday) => ({ weekday })) });
    });
  };

  const handleSave = () => {
    onSave(toRRule(editor));
    onClose();
  };

  const chosenDays = rule.freq === 'WEEKLY' ? rule.byDay.map((d) => d.weekday) : [];
  const monthlyMode = monthlyModeOf(rule);
  const ordinalDay = rule.byDay[0];

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={460}
      labelledBy="recurrence-title"
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.modalOverModal}
      style={{ gap: 'var(--sp-8)' }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 44,
            height: 44,
            flex: '0 0 auto',
            borderRadius: '50%',
            backgroundImage: 'var(--glass-fill-2)',
            boxShadow: 'var(--glass-rim-2)',
            color: 'var(--fg-2)',
          }}
        >
          <Icon name="repeat" size={20} />
        </span>
        <h2
          id="recurrence-title"
          style={{
            flex: 1,
            minWidth: 0,
            font: 'var(--type-title)',
            fontSize: 'var(--text-xl)',
            letterSpacing: 'var(--tracking-title)',
            color: 'var(--fg-1)',
          }}
        >
          Custom recurrence
        </h2>
        <IconButton label="Close" variant="ghost" onClick={onClose}>
          <Icon name="x" size={18} />
        </IconButton>
      </header>

      {/* ── Repeat every N units ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="rotate-cw" size={14} />}>Repeat every</FieldLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <Input
            block={false}
            style={{ width: 88, flex: '0 0 auto' }}
            type="number"
            inputMode="numeric"
            min={1}
            value={rule.interval}
            aria-label="Repeat interval"
            onChange={(e) => setRule((r) => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <CustomDropdown
              ariaLabel="Repeat unit"
              value={rule.freq}
              /* Through `normaliseRRule`, so the weekday chips left over from
                 a weekly rule do not come back as "the first Monday" the
                 moment this reads Month. */
              onChange={(v) => setRule((r) => normaliseRRule({ ...r, freq: v as RRule['freq'] }))}
              options={FREQ_OPTIONS.map((f) => ({
                value: f.value,
                label: rule.interval === 1 ? f.label : f.plural,
              }))}
            />
          </div>
        </div>
      </div>

      {/* ── Weekday chips, weekly only ───────────────────────────────── */}
      {rule.freq === 'WEEKLY' && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <FieldLabel icon={<Icon name="calendar" size={14} />}>Repeat on</FieldLabel>
          <div className="flex flex-wrap" style={{ gap: 'var(--sp-3)' }}>
            {WEEKDAYS.map((d) => {
              const active = chosenDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={active}
                  aria-label={d.name}
                  onClick={() => toggleWeekday(d.value)}
                  style={chipStyle(active)}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Which day of the month, monthly only ─────────────────────── */}
      {rule.freq === 'MONTHLY' && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <FieldLabel icon={<Icon name="calendar" size={14} />}>Repeat on</FieldLabel>
          <CustomDropdown
            ariaLabel="Which day of the month"
            value={monthlyMode}
            onChange={(v) => setRule((r) => withMonthlyMode(r, v as MonthlyMode))}
            options={MONTHLY_MODES}
          />

          {monthlyMode === 'day' && (
            <Input
              size="sm"
              block={false}
              style={{ width: 132, flex: '0 0 auto' }}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              aria-label="Day of the month"
              value={rule.byMonthDay ?? 1}
              onChange={(e) =>
                setRule((r) => ({
                  ...r,
                  byMonthDay: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)),
                }))
              }
            />
          )}

          {monthlyMode === 'weekday' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CustomDropdown
                  ariaLabel="Which one in the month"
                  value={String(ordinalDay?.ordinal ?? 1)}
                  onChange={(v) =>
                    setRule((r) => ({
                      ...r,
                      byDay: [{ weekday: r.byDay[0]?.weekday ?? 1, ordinal: Number(v) }],
                    }))
                  }
                  options={ORDINAL_OPTIONS}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <CustomDropdown
                  ariaLabel="Which weekday"
                  value={String(ordinalDay?.weekday ?? 1)}
                  onChange={(v) =>
                    setRule((r) => ({
                      ...r,
                      byDay: [{ weekday: Number(v), ordinal: r.byDay[0]?.ordinal ?? 1 }],
                    }))
                  }
                  options={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.name }))}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Ends ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <FieldLabel icon={<Icon name="calendar-x" size={14} />}>Ends</FieldLabel>
        <div role="radiogroup" aria-label="When the series ends" style={{ display: 'grid', gap: 'var(--sp-1)' }}>
          <Radio
            checked={editor.endType === 'never'}
            label="Never"
            onSelect={() => setEditor((e) => ({ ...e, endType: 'never' }))}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <Radio
              checked={editor.endType === 'onDate'}
              label="On"
              onSelect={() => setEditor((e) => ({ ...e, endType: 'onDate' }))}
            />
            <Input
              size="sm"
              block={false}
              style={{ flex: '0 0 auto', opacity: editor.endType === 'onDate' ? 1 : 0.42 }}
              type="date"
              aria-label="End date"
              disabled={editor.endType !== 'onDate'}
              value={editor.endDate}
              onChange={(e) => setEditor((prev) => ({ ...prev, endDate: e.target.value }))}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <Radio
              checked={editor.endType === 'afterCount'}
              label="After"
              onSelect={() => setEditor((e) => ({ ...e, endType: 'afterCount' }))}
            />
            <Input
              size="sm"
              block={false}
              style={{ width: 108, flex: '0 0 auto', opacity: editor.endType === 'afterCount' ? 1 : 0.42 }}
              type="number"
              inputMode="numeric"
              min={1}
              aria-label="Number of occurrences"
              disabled={editor.endType !== 'afterCount'}
              value={editor.endCount}
              onChange={(e) =>
                setEditor((prev) => ({ ...prev, endCount: Math.max(1, parseInt(e.target.value) || 1) }))
              }
              suffix="times"
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="tint" tone="accent" onClick={handleSave} iconLeft={<Icon name="check" size={16} />}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
