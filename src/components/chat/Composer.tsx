/**
 * The composer, redrawn (item 13G, piece 2 of the agreed four).
 *
 * *"The place where I write text is shit"* — Shreekant, which is the whole
 * brief. What was here was a `Textarea` capped at 132px with Send tucked into
 * its trailing slot and a sentence of explanation under it, and every control
 * that decides how a turn runs sitting in a bar at the *top* of the screen,
 * two hundred pixels from the words they apply to.
 *
 * `atlas.html` answers it in three moves and this file is those three:
 *   1. the field is **its own quiet glass pill**, and it grows to 260px
 *      (168 narrow) rather than 132 — five lines was not enough for the
 *      paragraph he actually types;
 *   2. the dials move **out** of it onto a bare row beneath, where they read
 *      as a caption rather than as chrome (see `Dial.tsx`);
 *   3. the field is **masked** top and bottom, so a draft longer than the box
 *      fades at the edges instead of being cut through the middle of a line.
 *
 * THE RAISED PILL, AND WHY IT IS NOT THE THING `Input.prompt.md` FORBIDS
 * ----------------------------------------------------------------------
 * Two earlier sessions read the mockup's raised composer and kept a `Well`
 * instead, citing the rule — *"do not put a raised `--glass-fill-*` background
 * on an input. Wells go in, controls come out"* — and `readme.md`'s
 * wells-vs-panes law behind it. That was right about the rule and wrong about
 * what the mockup draws. **The raised fill is on the container, and the field
 * inside it has no background at all** (`background: transparent`, below). A
 * control surface that comes out, with a bare field sitting on it, is what the
 * law describes rather than what it forbids — and it is the reading that
 * survives the 2026-09-08 re-export, which draws exactly this again.
 *
 * MOTION 3 OF 4 IS HERE, IN THREE STEPS RATHER THAN TWO
 * -----------------------------------------------------
 * The shadow lift: `box-shadow` on `--dur-base`/`--ease-glass`, **alone** —
 * nothing scales, nothing moves. Rest is `--glass-cast-1`, hover
 * `--glass-cast-2`, focus `--glass-cast-3` with the rim coming up a step. The
 * third step is the one that matters: it is how the composer says it has the
 * caret without drawing a focus ring around a pill, which at `--r-xl` would
 * read as a browser outline resting on the glass.
 *
 * MOTION 14 IS THE SEND BUTTON, on `var(--t-hover)`, and it morphs
 * `arrow-up` → `square` when a turn is running rather than swapping to a
 * different control. Same button, same place, different job.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../../ui';
import { DialOption, DialPill, DialPopover } from './Dial';
import { useDismiss } from './useDismiss';
import type { AtlasEffort, AtlasMode } from '../../lib/atlas/client';

/** How tall the field grows before it starts scrolling instead. */
const CAP_WIDE = 260;
const CAP_NARROW = 168;

/**
 * How tall the `/` menu grows before it scrolls instead.
 *
 * **Every match is in the list and the menu scrolls** — Shreekant's call, over
 * an earlier cap of six. A cap is the wrong shape for the thirty-six folders
 * on this laptop: it hides matches seven and eight with nothing on screen
 * saying they exist, so a skill he knows he has simply is not there and the
 * only cure is guessing more letters.
 *
 * The scrollbar is suppressed (`.ag-scroll`, the app's own class) because a
 * track drawn down the side of a glass popover reads as chrome bolted onto it.
 * Nothing is lost: arrowing past the bottom scrolls the highlight into view,
 * which is how the list is driven anyway.
 *
 * 300px is about five rows at two lines each — enough that the list reads as
 * a list, short enough to clear the composer on a tablet in landscape.
 */
const SKILL_MENU_MAX_PX = 300;

/** Below this the counter stays hidden — motion 7, opacity on `--dur-fast`. */
const COUNTER_FROM = 220;

/**
 * The three modes with the sentence each one is owed, in `atlas.html`'s order.
 *
 * The descriptions are the app's own `MODE_HINT` lines rather than the
 * mockup's shorter ones: they were written against what the modes actually do
 * in `atlas/src/agent/modes.ts` (item 12), and a popover has room for the
 * true sentence where a hint line under the composer had room for the short
 * one.
 */
const MODES: { value: AtlasMode; label: string; description: string }[] = [
  { value: 'auto', label: 'Auto', description: 'Acts without asking. Everything it writes is undoable from the Trash.' },
  { value: 'ask', label: 'Ask', description: 'Asks before every write. Slower, and nothing surprises you.' },
  { value: 'plan', label: 'Plan', description: 'Plans and shows the steps. Nothing is written until you say go.' },
];

/**
 * TWO POSITIONS, NOT THE MOCKUP'S THREE. This is a knowing divergence.
 *
 * The re-exported `atlas.html` draws Off / Some / Max on the rail. Item 12
 * measured Off out of existence on this hardware — `think: false` does not
 * stop the model reasoning, it stops Ollama *separating* the reasoning, so the
 * answers came back longer and messier at the setting labelled cheapest
 * (`TuningPopover.tsx`'s header holds the three runs and the numbers). **A
 * redraw is not a new measurement**, so the third stop stays gone.
 *
 * The rename is taken: "Hard" becomes "Max", which is the mockup's word for
 * the same position and a better one — it says this is the top of the dial
 * rather than that the question is difficult.
 */
const EFFORT: { value: AtlasEffort; label: string }[] = [
  { value: 'some', label: 'Some' },
  { value: 'hard', label: 'Max' },
];

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  mode: AtlasMode;
  onMode: (mode: AtlasMode) => void;
  effort: AtlasEffort;
  onEffort: (effort: AtlasEffort) => void;
  /** Under 900: a shorter field, because the keyboard takes half the screen. */
  narrow: boolean;
  /**
   * Whether the dials mean anything for the next turn.
   *
   * Mode and thinking effort are Atlas's, and the in-browser fallback has
   * neither. Rather than draw two controls that quietly do nothing, the row
   * says which assistant is answering and stops there.
   */
  dials: boolean;
  /** What the row says instead when `dials` is false. */
  fallbackNote?: string;
  /** The composer's own textarea, so the page can put the caret back in it. */
  fieldRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * Every skill on the laptop, for the `/` picker.
   *
   * **All of them, automatic ones included**, which was a decision rather than
   * laziness: an automatic skill can still be forced, and forcing it is the
   * only lever there is on the turn item 14 measured — gemma ignoring
   * `task-naming` six runs out of six. Hiding the automatic ones would have
   * removed the one workaround for the known bug.
   *
   * Empty when Atlas is unreachable, which quietly disables `/` — the right
   * behaviour, since nothing could be summoned anyway.
   */
  skills?: { name: string; description: string; enabled: boolean }[];
  /** The skill in force for this conversation, or `null` for none. */
  activeSkill?: string | null;
  /** Summon a skill, or `null` to turn the current one off. */
  onSkill?: (name: string | null) => void;
  /** Anything the page wants on the dial row — the toast anchor's siblings. */
  children?: ReactNode;
  /**
   * The microphone, beside Send (item 24).
   *
   * A slot rather than the button itself, so that everything voice knows —
   * whether the browser can hear, what it is hearing, what went wrong — stays
   * on the page that owns it and none of it arrives here as five more props.
   * `components/chat/MicButton.tsx` is what goes in it, and it is drawn to
   * match Send exactly because they are the two ways to put a sentence in.
   *
   * Absent on a browser that cannot listen, which is the whole of this
   * component's opinion on the matter.
   */
  mic?: ReactNode;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  mode,
  onMode,
  effort,
  onEffort,
  narrow,
  dials,
  fallbackNote,
  fieldRef,
  skills,
  activeSkill,
  onSkill,
  children,
  mic,
}: ComposerProps) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const [open, setOpen] = useState<'mode' | 'effort' | null>(null);
  const ownField = useRef<HTMLTextAreaElement>(null);
  const field = fieldRef ?? ownField;
  const row = useDismiss(open !== null, () => setOpen(null));

  const cap = narrow ? CAP_NARROW : CAP_WIDE;

  /*
   * THE `/` PICKER.
   *
   * Open only when the draft *starts* with a slash and has no space in it yet.
   * Both halves matter. Anchoring to the start keeps a slash inside an ordinary
   * sentence — a date, a path, "either/or" — from opening a menu over what he
   * is writing. Closing at the first space is what lets him give up on the
   * idea by typing on: `/gst return receipts` is a message, not a failed
   * summon, and it must not sit under a popover offering skills.
   */
  const skillQuery = /^\/[^\s]*$/.test(value) ? value.slice(1).toLowerCase() : null;
  const matches =
    skillQuery === null || skills === undefined || skills.length === 0
      ? []
      : skills
          .filter((one) => one.name.toLowerCase().includes(skillQuery) || one.description.toLowerCase().includes(skillQuery))
          /* Name matches first, then description matches — he is typing a name,
             and a skill whose *description* happens to contain the letters is a
             worse guess than one whose folder does. */
          .sort((a, b) => {
            const an = a.name.toLowerCase().startsWith(skillQuery) ? 0 : 1;
            const bn = b.name.toLowerCase().startsWith(skillQuery) ? 0 : 1;
            return an !== bn ? an - bn : a.name.localeCompare(b.name);
          });

  const picking = matches.length > 0;

  /*
   * The highlighted row, stored *with the query it belongs to*.
   *
   * The obvious version — a number, reset in an effect when the query changes
   * — is a cascading render, and the linter is right to refuse it. Keeping the
   * query beside the index means a changed query resets the highlight by
   * simply no longer matching, which is a derivation rather than a second
   * render. The `Math.min` is the same guard for a list that shrank under a
   * highlight already sitting near its end.
   */
  const [pick, setPick] = useState<{ query: string | null; at: number }>({ query: null, at: 0 });
  const at = pick.query === skillQuery && matches.length > 0 ? Math.min(pick.at, matches.length - 1) : 0;
  const moveTo = (next: number) => setPick({ query: skillQuery, at: next });

  /*
   * Keeps the highlighted row on screen once the list is long enough to
   * scroll. Attached only to the active row, so it runs when the highlight
   * moves and not on every row of every render.
   *
   * `block: 'nearest'` is doing real work rather than being a default: a row
   * that is already visible is left exactly where it is, so moving the mouse
   * across the list cannot jerk it around, and only an arrow key that walks
   * off the edge actually scrolls anything.
   */
  const keepInView = (node: HTMLButtonElement | null) => {
    node?.scrollIntoView({ block: 'nearest' });
  };

  function summon(name: string) {
    onSkill?.(name);
    /* The draft was only ever the command. Clearing it means the next thing he
       types is his actual message, with the skill already on. */
    onChange('');
    field.current?.focus();
  }

  /* A `/` that is still being typed is not a message. Enter would otherwise
     send the literal text "/grill" to Atlas. */
  const ready = value.trim() !== '' && !busy && !picking;

  /* Grow with what is typed. A textarea has no CSS-only way to do this — its
     height has to be measured after the change, which is why the height is
     reset to `auto` first: `scrollHeight` on an element already sized to its
     content reports that size and never shrinks back. */
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
    /* Past the cap the field scrolls, and what has to stay visible is the line
       being typed — not the top of a draft written ten minutes ago. */
    if (el.scrollHeight > cap) el.scrollTop = el.scrollHeight;
  }, [value, cap, field]);

  const lift = focused
    ? 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)'
    : hover
      ? 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)'
      : 'var(--glass-rim-1), var(--glass-inner-1), var(--glass-cast-1)';

  const modeNow = MODES.find((m) => m.value === mode) ?? MODES[0];
  const effortNow = EFFORT.find((e) => e.value === effort) ?? EFFORT[0];
  const effortAt = EFFORT.findIndex((e) => e.value === effortNow.value);

  return (
    <div ref={row} style={{ display: 'grid', gap: 'var(--sp-3)', minWidth: 0, position: 'relative' }}>
      {/* The `/` menu.
          **Above the composer**, because it sits at the foot of the screen and
          a menu hanging under it opens into the edge, or under a tablet's
          keyboard.
          **Outside the field**, and that is not a style choice: the field
          wrapper carries `.ag-composer-field`, whose `mask-image` fades a long
          draft at the top and bottom edges — and a mask erases everything its
          gradient does not cover, including an absolutely-positioned child
          hanging outside the box. The menu was in the DOM, correct, focusable
          and completely invisible. It anchors to this grid instead. */}
        {picking && (
          <div
            role="listbox"
            aria-label="Skills"
            /* The app's own "scrolls, draws no scrollbar" class. */
            className="ag-scroll"
            style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 'var(--sp-4)',
              display: 'grid', gap: 2, padding: 'var(--sp-3)', zIndex: 40,
              maxHeight: SKILL_MENU_MAX_PX, overflowY: 'auto',
              /* `gap` leaves the last row flush against the padding edge while
                 scrolled; this keeps the same breathing room top and bottom.
                 `overscroll-behavior` stops a flick at the end of the list
                 scrolling the transcript behind it. */
              overscrollBehavior: 'contain',
              borderRadius: 'var(--r-lg)',
              backgroundImage: 'var(--glass-fill-3)',
              backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
              boxShadow: 'var(--glass-rim-2), var(--glass-cast-3)',
            }}
          >
            {matches.map((one, i) => (
              <button
                key={one.name}
                type="button"
                role="option"
                aria-selected={i === at}
                ref={i === at ? keepInView : null}
                /* `onPointerDown` rather than `onClick`: a click lands after
                   the textarea has blurred, and the blur closes the menu out
                   from under the finger. Pointer rather than mouse because the
                   device he actually uses this on is an Android tablet —
                   `mousedown` is a compatibility event there, fired late and
                   only sometimes, while `pointerdown` is the real one.
                   `preventDefault` is what stops the field losing the caret. */
                onPointerDown={(e) => {
                  e.preventDefault();
                  summon(one.name);
                }}
                /* Mouse only. On a touch screen `pointerenter` fires with the
                   tap itself, which would move the highlight onto the row a
                   finger is already committing to — harmless but pointless. */
                onMouseEnter={() => moveTo(i)}
                style={{
                  display: 'grid', gap: 1, width: '100%', textAlign: 'left',
                  padding: 'var(--sp-3) var(--sp-4)', border: 0, cursor: 'pointer',
                  borderRadius: 'var(--r-md)',
                  backgroundImage: i === at ? 'var(--glass-fill-2)' : 'none',
                  transition: 'var(--t-hover)',
                }}
              >
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
                    color: i === at ? 'var(--fg-1)' : 'var(--fg-2)',
                  }}
                >
                  /{one.name}
                  {/* An automatic skill is already running; summoning it
                      forces it. Saying so stops the menu reading as though
                      nothing were on until you pick something. */}
                  {one.enabled && (
                    <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', marginLeft: 'var(--sp-3)' }}>
                      automatic
                    </span>
                  )}
                </span>
                <span
                  style={{
                    font: 'var(--type-caption)', color: 'var(--fg-4)',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {one.description}
                </span>
              </button>
            ))}
          </div>
        )}
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => field.current?.focus()}
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-3)', minWidth: 0,
          padding: 'var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-6)',
          borderRadius: 'var(--r-xl)', cursor: 'text',
          backgroundImage: 'var(--glass-fill-2)',
          backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
          boxShadow: lift,
          transition: 'box-shadow var(--dur-base) var(--ease-glass)',
        }}
      >
        {/* The mask is on this wrapper and not on the textarea. A mask applied
            to a focused form control takes the caret with it wherever the
            gradient fades, so the last line of a long draft would be typed
            into a caret nobody can see. */}
        <div className="ag-composer-field" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <textarea
            ref={field}
            className="ag-field ag-scroll"
            data-ag-field=""
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              /* The picker takes the keys it needs and hands the rest back, so
                 Shift+Enter still makes a newline while `/gr` is on screen. */
              if (picking) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  moveTo((at + 1) % matches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  moveTo((at - 1 + matches.length) % matches.length);
                  return;
                }
                /* Tab as well as Enter: this is a completion, and Tab is what
                   the hand reaches for when a list of names is on screen. */
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  summon(matches[at].name);
                  return;
                }
                if (e.key === 'Escape') {
                  /* Clears the command, not the skill already in force. Escape
                     abandons what is being typed; the chip below is what turns
                     a running skill off. */
                  e.preventDefault();
                  onChange('');
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder={
              busy
                ? 'Atlas is replying — type the next one'
                : mode === 'plan' && dials
                  ? 'Describe the job. Atlas plans it first.'
                  : 'Message Atlas'
            }
            aria-label="Message Atlas"
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box', border: 0,
              background: 'transparent', resize: 'none', outline: 'none',
              color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-md)',
              letterSpacing: 'var(--tracking-ui)', lineHeight: 1.6,
              padding: 'var(--sp-2) 0', maxHeight: cap, overflowY: 'auto',
            }}
          />

        </div>

        {/* Item 24 — the microphone, immediately before Send. Same size, same
            rim, same 34px circle: two ways to say one thing, drawn as one
            pair. See `mic` in `ComposerProps`. */}
        {mic}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (busy) onStop();
            else onSend();
          }}
          disabled={!busy && !ready}
          aria-label={busy ? 'Stop' : 'Send'}
          title={busy ? 'Stop' : 'Send'}
          style={{
            flex: '0 0 auto', display: 'grid', placeItems: 'center', width: 34, height: 34,
            border: 0, borderRadius: '50%', cursor: busy || ready ? 'pointer' : 'default',
            /* V3-8: ready to send, it is the screen's one primary, so it is
               V3's emerald gel (`Button`'s gel table). The gel tokens exist
               only inside a scope; the fallbacks are what it drew before. */
            backgroundImage: busy
              ? 'var(--glass-fill-solid)'
              : ready
                ? 'var(--gel-emerald, var(--glass-tint-accent))'
                : 'var(--glass-fill-1)',
            boxShadow: busy
              ? 'var(--glass-rim-3)'
              : ready
                ? 'var(--gel-rim, var(--glass-rim-2)), var(--cast-emerald, var(--glow-accent-sm))'
                : 'var(--glass-rim-1)',
            color: busy ? 'var(--fg-on-light)' : ready ? 'var(--fg-on-accent, oklch(0.95 0.07 162))' : 'var(--fg-4)',
            transition: 'var(--t-hover)',
          }}
        >
          <Icon name={busy ? 'square' : 'arrow-up'} size={busy ? 12 : 16} />
        </button>
      </div>

      {/* The bare dial row — a line of type under the field. `flexWrap` is the
          one departure from the mockup's own flex: this row carries the page's
          own controls too (see `children`), and at 820 they do not all fit on
          one line. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap',
          padding: '0 var(--sp-3)', minWidth: 0,
        }}
      >
        {/* The running skill, and the only way to stop it.
            On the dial row rather than inside the field, because that is what
            it is: a dial he set that stays set, sitting with Mode and Thinking
            rather than with the words he is typing. Without something here a
            skill summoned ten turns ago would be invisible and unstoppable —
            he would have no way of knowing why Atlas kept behaving oddly. */}
        {activeSkill !== null && activeSkill !== undefined && (
          <button
            type="button"
            onClick={() => onSkill?.(null)}
            title={`Turn off the ${activeSkill} skill`}
            aria-label={`Turn off the ${activeSkill} skill`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
              padding: 'var(--sp-2) var(--sp-3)', border: 0, cursor: 'pointer',
              borderRadius: 'var(--r-pill)',
              font: 'var(--type-caption)', color: 'oklch(0.93 0.07 162)',
              backgroundImage: 'var(--glass-tint-accent)',
              boxShadow: 'var(--glass-rim-2)',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon name="wrench" size={12} />
            {activeSkill}
            <Icon name="x" size={12} />
          </button>
        )}
        {dials ? (
          <>
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <DialPill
                label="Mode"
                open={open === 'mode'}
                onClick={() => setOpen(open === 'mode' ? null : 'mode')}
              >
                {modeNow.label}
                <Icon name="chevron-down" size={12} />
              </DialPill>
              <DialPopover open={open === 'mode'} width={272} label="Mode">
                <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                  <span className="ag-kicker" style={{ color: 'var(--fg-4)', padding: '0 var(--sp-3) var(--sp-2)' }}>
                    Mode
                  </span>
                  {MODES.map((m) => (
                    <DialOption
                      key={m.value}
                      label={m.label}
                      description={m.description}
                      selected={m.value === mode}
                      onPick={() => {
                        onMode(m.value);
                        setOpen(null);
                      }}
                    />
                  ))}
                </div>
              </DialPopover>
            </div>

            <span aria-hidden="true" style={{ color: 'var(--fg-4)', opacity: 0.5 }}>·</span>

            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <DialPill
                label="Thinking effort"
                open={open === 'effort'}
                onClick={() => setOpen(open === 'effort' ? null : 'effort')}
              >
                <Icon name="brain" size={12} />
                {effortNow.label}
              </DialPill>
              <DialPopover open={open === 'effort'} width={248} label="Thinking effort">
                <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', padding: '0 var(--sp-2)' }}>
                    <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>Thinking</span>
                    <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
                      {effortNow.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 var(--sp-2)' }}>
                    <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>Faster</span>
                    <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>Smarter</span>
                  </div>

                  {/* MOTION 13 — the knob slides, it does not jump. `width` and
                      `height` 6px → 18px on `--dur-morph`/`--ease-morph`, with
                      the glow settling behind it on `--dur-base`. The stops are
                      buttons on one rail rather than a range input: two
                      positions with names is a choice, not a quantity. */}
                  <div style={{ position: 'relative', height: 26, padding: '0 var(--sp-2)' }}>
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute', left: 'var(--sp-2)', right: 'var(--sp-2)', top: 9, height: 8,
                        borderRadius: 'var(--r-pill)',
                        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                      }}
                    />
                    <div style={{ position: 'absolute', inset: '0 var(--sp-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {EFFORT.map((e, i) => {
                        const on = i === effortAt;
                        return (
                          <button
                            key={e.value}
                            type="button"
                            onClick={() => onEffort(e.value)}
                            aria-label={e.label}
                            aria-pressed={on}
                            title={e.label}
                            style={{
                              width: 26, height: 26, border: 0, background: 'transparent', cursor: 'pointer',
                              display: 'grid', placeItems: 'center', borderRadius: '50%',
                            }}
                          >
                            {/* `backgroundColor` beside `backgroundImage`, never
                                the `background` shorthand the mockup uses.
                                React writes a style that has gone from a value
                                to `undefined` as `''`, and clearing the
                                shorthand clears `background-image` with it —
                                so the knob grew to 18px on the stop you picked
                                and arrived there grey, every time, while a
                                fresh page load looked perfect. */}
                            <span
                              style={{
                                width: on ? 18 : 6, height: on ? 18 : 6, borderRadius: '50%',
                                backgroundImage: on ? 'var(--glass-tint-accent)' : 'none',
                                backgroundColor: on ? 'transparent' : 'var(--line-strong)',
                                boxShadow: on ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'none',
                                transition:
                                  'width var(--dur-morph) var(--ease-morph),' +
                                  ' height var(--dur-morph) var(--ease-morph),' +
                                  ' box-shadow var(--dur-base) var(--ease-glass)',
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </DialPopover>
            </div>
          </>
        ) : (
          fallbackNote !== undefined && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              {fallbackNote}
            </span>
          )
        )}

        {children}

        <span style={{ flex: 1, minWidth: 'var(--sp-3)' }} />

        {/* MOTION 7 — opacity on `--dur-fast`, alone. It is in the tree at all
            times so the row's height cannot change as it arrives; a counter
            that pushed the composer down by a line as the draft grew would be
            the opposite of what this screen is for. */}
        <span
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-4)', whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            opacity: busy || value.length > COUNTER_FROM ? 1 : 0,
            transition: 'opacity var(--dur-fast) var(--ease-glass)',
          }}
        >
          {busy ? 'Enter queues the next one' : `${value.length} chars`}
        </span>
      </div>
    </div>
  );
}
