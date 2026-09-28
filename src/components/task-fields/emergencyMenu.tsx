/**
 * **The Emergency flag's two non-component pieces** (item 17): the `⋯` menu
 * section, and the sentence the task sheet prints under the trough.
 *
 * They share a file because neither is a component and `EmergencyPicker.tsx`
 * cannot hold them — eslint's `react-refresh/only-export-components` forbids a
 * component file exporting anything else, which is a real rule and not a
 * formality: a hot reload of a module that exports both re-mounts the tree.
 * Keeping the copy here also keeps the two surfaces' wording in one place,
 * which is the point of the count agreeing between them.
 *
 * THE MENU SECTION
 * ----------------
 * Item 17 puts the flag in two places — *"on the task panel and the row
 * menu"* — and a row menu cannot hold a trough: `MorphMenu`'s vocabulary is
 * rows, and its own `.prompt.md` is emphatic that the panel is items grouped
 * by intent rather than a place to hang custom controls. So the 0–5 scale is
 * expressed the way a menu can express it: **one row that raises it a step and
 * one that clears it outright**, with the level itself in the section label and
 * in the raise row's `meta`.
 *
 * That shape is not a compromise on the clear. *"One-click clear"* is item
 * 17's phrase and it is exactly what "Clear emergency" is — a single press
 * from anywhere the row appears, without opening the task. Getting *to* five
 * takes five presses, which is the correct asymmetry for a flag whose whole
 * problem is that it gets used too freely.
 *
 * **Raising uses `flash`, so the menu stays open.** That is what `flash` is for
 * — *"Label swapped in for 1.4s on select; the menu stays open"* — and it is
 * what makes five presses one gesture instead of five. The flash word carries
 * no number on purpose: `items` is rebuilt with the new level the instant the
 * write lands, so a flash label built from `level + 1` would be re-rendered
 * from the *new* array and read one too high. The live number is in `meta`,
 * which is the row's own readout.
 *
 * **The warning past `EMERGENCY_CROWD` is the section label going rose.** It is
 * the only channel a menu section has — `tone: 'danger'` — and it lands
 * directly above the row that would add a seventh flag, which is where the
 * sentence is worth reading. The count is live, from the same scoring pass the
 * task sheet's note reads, so the two cannot disagree.
 */
import { Icon, type MorphMenuItem } from '../../ui';
import { EMERGENCY_CROWD, EMERGENCY_MAX } from '../../store/useStore';

export interface EmergencyMenuOptions {
  /** The task's stored level, live. */
  level: number;
  /** How many tasks in the whole backlog are carrying a live emergency. */
  count: number;
  /** The engine has stopped counting this one — its anchor date has gone by. */
  lapsed?: boolean;
  /** `setEmergencyBoost(taskId, …)`, already bound to this row's task. */
  onSet: (level: number) => void;
}

/**
 * The section header plus one or two rows, ready to spread into an `items`
 * array. Always returns at least two entries, so a task with no emergency
 * still offers the flag.
 */
export function emergencyMenuItems({ level, count, lapsed = false, onSet }: EmergencyMenuOptions): MorphMenuItem[] {
  const crowded = count > EMERGENCY_CROWD;
  const atMax = level >= EMERGENCY_MAX;

  const heading = lapsed
    ? `Emergency ${level} · lapsed`
    : level > 0
      ? `Emergency ${level} of ${EMERGENCY_MAX}`
      : 'Emergency';

  return [
    {
      section: crowded ? `${heading} · ${count} flagged, too many` : heading,
      tone: crowded ? 'danger' : 'default',
    },
    {
      value: 'emergency-raise',
      /* All three fit `MorphMenu`'s 244px beside a glyph and a `n/5` meta.
         "Flag as an emergency" and "Already at the maximum" did not — both
         ellipsised in the browser, which is a menu row that cannot be read. */
      label: atMax ? 'At the maximum' : level > 0 ? 'Raise emergency' : 'Flag as emergency',
      icon: <Icon name="zap" size={18} />,
      meta: `${level}/${EMERGENCY_MAX}`,
      /* No flash at the top of the scale: nothing changes, so nothing should
         report that it did. The row still reads, which is what says why. */
      flash: atMax ? undefined : 'Raised',
      flashIcon: atMax ? undefined : <Icon name="zap" size={18} />,
      onSelect: atMax ? undefined : () => onSet(level + 1),
    },
    ...(level > 0
      ? [{
        value: 'emergency-clear',
        label: 'Clear emergency',
        icon: <Icon name="eraser" size={18} />,
        onSelect: () => onSet(0),
      } satisfies MorphMenuItem]
      : []),
  ];
}

/**
 * What the task sheet says under the trough: how many emergencies are live,
 * and — past `EMERGENCY_CROWD` — that they have stopped distinguishing
 * anything.
 *
 * This is the whole of item 17's *"a warning past 3 — if six things are
 * emergencies, the button has stopped meaning anything"*, and it is a warning
 * and never a limit. The sixth flag is still set; the app only says what it
 * cost. Refusing it would be the app overruling the one judgement in the score
 * that is deliberately Shreekant's.
 *
 * `lapsed` takes the whole sentence over, because on a task whose anchor date
 * has gone by the crowd is not the interesting fact — the flag not counting
 * is.
 */
export function emergencyCrowdNote(count: number, lapsed = false): { text: string; warn: boolean } {
  if (lapsed) {
    return {
      text: 'The deadline this was anchored to has passed, so the flag has stopped counting. "You are late" is the useful thing to say now, and the Overdue factor is already saying it.',
      warn: false,
    };
  }
  if (count === 0) return { text: 'Nothing is flagged as an emergency right now.', warn: false };
  if (count > EMERGENCY_CROWD) {
    return {
      text: `${count} tasks are flagged. Past ${EMERGENCY_CROWD} the flag stops meaning anything — clear the ones that are merely late.`,
      warn: true,
    };
  }
  return {
    text: count === 1 ? '1 task is flagged as an emergency.' : `${count} tasks are flagged as emergencies.`,
    warn: false,
  };
}
