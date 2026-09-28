/**
 * The context slider, in the popover `atlas.html` puts it in (item 10, DESIGN.md §4.1).
 *
 * WHAT THIS CONTROL IS FOR, WHICH IS NOT WHAT A SETTING IS USUALLY FOR
 * ---------------------------------------------------------------------
 * §4.1: *"Default 64K. The slider goes to each model's declared maximum and
 * refuses to exceed it, since Ollama would otherwise clamp and lie. As it
 * moves, it shows the truth: '3.3 GB, all on the graphics card' versus '9.7
 * GB, two-thirds in system memory.' **Not a nagging warning — an honest
 * number**, because Shreekant enjoys pushing this machine and the design's job
 * is to stop Ollama misreporting, not to protect him from a setting."*
 *
 * So nothing here blocks anything. The clamp is not a guard rail either: it is
 * there because Ollama accepts an impossible `num_ctx` and **reports success**
 * (§2.4) — a request for 262144 on gemma came back running at 131072 with no
 * error — so a slider that trusted the daemon would print a number the model
 * was not honouring. Atlas asks `/api/show` and clamps, and the value on
 * `start` is what actually ran.
 *
 * WHY MOST STOPS SHOW NO NUMBER, AND WHY THAT IS THE HONEST ANSWER
 * -----------------------------------------------------------------
 * `atlas.html` carries a cost for every model at every stop — twenty-two
 * readings, commented as *"read off /api/ps at each step"*. DESIGN.md records
 * **eight**. The other fourteen are the mockup filling in a shape, and they
 * are plausible, which is exactly the problem: a number nobody measured,
 * printed in the same type as one somebody did, is indistinguishable from a
 * fact. `hostReadings.ts` already states the rule — *"a reading with a date on
 * it is a fact; the same number with no date is a claim about right now"* —
 * and 9B's screen already applies it by showing an unbenchmarked model with no
 * readings rather than borrowed ones.
 *
 * So the slider stops wherever the model allows and the readout speaks only
 * where a measurement exists. Between 64K and 131K on gemma is precisely where
 * the KV cache stops fitting on the card; a line drawn through that gap would
 * be wrong in the one place the number matters.
 *
 * ITEM 13G — THINKING EFFORT LEFT THIS PANEL, AND THE MEASUREMENT WENT WITH IT
 * ----------------------------------------------------------------------------
 * Item 12 built the effort dial here, two positions rather than the mockup's
 * three, and the re-exported `atlas.html` moves it out: it is a **bare pill
 * under the composer** now, beside Mode, opening a popover with the knob on
 * its own rail. `components/chat/Composer.tsx` holds it, and the paragraph
 * above `EFFORT` there carries the measurement that removed the third
 * position — a redraw is not a new measurement, and Off still cannot be built
 * as drawn. Nothing else on this panel moved: the context slider and the
 * per-turn ceiling stay, which was **Shreekant's call on 2026-09-08** when the
 * new design deleted both.
 *
 */
import { useEffect, useRef, useState } from 'react';
import { Icon, MetaKicker, Slider } from '../../ui';
import { DialPill } from './Dial';
import {
  CONTEXT_READINGS_TAKEN_ON,
  contextStepsFor,
  describeContextCost,
} from '../../lib/atlas/contextReadings';

export interface TuningPopoverProps {
  /** The local model the slider is describing, or `null` on the Gemini path. */
  model: string | null;
  /** Thousands of tokens. */
  contextK: number;
  onContextK: (k: number) => void;
  /**
   * The per-turn spending ceiling, in rupees (item 13A, §3.4).
   *
   * `null` when Atlas is too old to have one, or could not open the data
   * directory it keeps it in — and then the whole block is left out rather
   * than drawn at an invented number, which is the rule the readouts above
   * already run on.
   */
  ceilingRupees: number | null;
  onCeilingRupees: (rupees: number) => void;
  /** The slider's own bounds, read from Atlas rather than repeated here. */
  ceilingBounds: { min: number; max: number };
}

export function TuningPopover({
  model,
  contextK,
  onContextK,
  ceilingRupees,
  onCeilingRupees,
  ceilingBounds,
}: TuningPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const steps = model === null ? [] : contextStepsFor(model);
  const at = Math.max(0, steps.indexOf(contextK));
  const chosen = steps[at] ?? contextK;
  const cost = model === null ? null : describeContextCost(model, chosen);

  return (
    <div ref={wrapper} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
      {/* A `DialPill`, not an `IconButton`: it is on the composer's dial row
          now and has to read as one of that row's items rather than as a
          control someone left there. Same component Mode and Thinking use. */}
      <DialPill
        label="Customize"
        open={open}
        onClick={() => setOpen((cur) => !cur)}
      >
        <Icon name="sliders-horizontal" size={12} />
        Customize
      </DialPill>

      <div
        className="ag-scroll"
        style={{
          /* ITEM 13G — IT OPENS UPWARD, because it moved (Shreekant's call,
             2026-09-08). This panel used to hang off an instrument bar at the
             top of the screen and dropped down from it; it now sits on the
             composer's dial row at the very bottom, where "down" is off the
             window. Anchored to `bottom` and grown from `bottom right`, which
             is the same rule `Dial.tsx`'s popovers already follow and for the
             same reason. */
          position: 'absolute', bottom: 'calc(100% + var(--sp-4))', right: 0, width: 340, zIndex: 80,
          padding: 'var(--sp-7)', display: 'grid', gap: 'var(--sp-7)',
          maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', overscrollBehavior: 'contain',
          borderRadius: open ? 'var(--r-lg)' : 'var(--r-pill)',
          backgroundColor: 'oklch(0.145 0.004 260 / 0.97)', backgroundImage: 'var(--glass-fill-1)',
          border: '1px solid oklch(1 0 0 / 0.10)',
          backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
          boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
          transformOrigin: 'bottom right',
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(10px)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          filter: open ? 'blur(0)' : 'blur(6px)',
          pointerEvents: open ? 'auto' : 'none',
          /* ITEM 13G, audited pass — `--dur-fast` on opacity and filter, not
             `--dur-base`. This panel was written at item 10 against a header
             bar and kept its own timing; it now opens on the composer's dial
             row between the Mode and Thinking popovers, and those two settle
             their fade in 160ms while this one took 260. Three popovers on one
             row disagreeing by 100ms is the kind of thing nobody can name and
             everybody feels. The morph stays on `--dur-morph`, which all three
             already shared. */
          transition:
            'transform var(--dur-morph) var(--ease-morph), opacity var(--dur-fast) var(--ease-glass), ' +
            'filter var(--dur-fast) var(--ease-glass), border-radius var(--dur-morph) var(--ease-morph), ' +
            `visibility 0s linear ${open ? '0s' : 'var(--dur-fast)'}`,
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
            <MetaKicker>Context</MetaKicker>
            <span style={{ flex: 1 }} />
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
              {model === null ? 'managed' : `${chosen}K`}
            </span>
          </div>

          {model === null ? (
            /* Gemini manages its own window and there is no number to set. The
               mockup says the same, and adds the line that matters more than
               the setting does. */
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              Gemini manages its own window. This slider is for the models on your laptop.
            </span>
          ) : (
            <>
              <Slider
                min={0}
                max={Math.max(0, steps.length - 1)}
                step={1}
                value={at}
                onValueChange={(n) => onContextK(steps[n] ?? chosen)}
                showValue={false}
                label="Context length"
                valueText={`${chosen} thousand tokens`}
              />
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between',
                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)',
                }}
              >
                <span>{steps[0] ?? 8}K</span>
                <span>{steps[steps.length - 1] ?? 64}K max</span>
              </div>

              {cost !== null && (
                <div
                  style={{
                    display: 'grid', gap: 'var(--sp-2)', padding: 'var(--sp-5)',
                    borderRadius: 'var(--r-sm)',
                    backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                  }}
                >
                  <span
                    style={{
                      font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
                      color: !cost.measured
                        ? 'var(--fg-3)'
                        : cost.onGpu === 100
                          ? 'var(--accent)'
                          : 'var(--status-review)',
                    }}
                  >
                    {cost.headline}
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                    {cost.detail}
                  </span>
                  {cost.measured && (
                    <MetaKicker>measured {CONTEXT_READINGS_TAKEN_ON}</MetaKicker>
                  )}
                </div>
              )}

              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                The maximum is what this model declares. Atlas holds you to it — asking Ollama for more
                is silently ignored and reported as success.
              </span>
            </>
          )}
        </div>

        {/* ── The per-turn spending ceiling (item 13A, DESIGN.md §3.4) ──────
            `atlas.html` puts it here, third in this panel, under the kicker
            "Stop a turn at" — the same control the Money panel on
            `/atlas-host` draws, because it is **one setting on two screens**
            rather than two settings. A value per screen would be two ceilings
            that disagree, with whichever he happened to be looking at winning
            by accident.

            Left out entirely rather than drawn inert when Atlas has no
            ceilings to set. A slider parked on a number nothing reads is the
            thing 9B's "not built" treatment existed to avoid, and it is worse
            here than there: this one *looks* live because everything beside it
            now is. */}
        {ceilingRupees !== null && (
          <>
            <div style={{ height: 1, background: 'var(--line-faint)' }} />

            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
                <MetaKicker>Stop a turn at</MetaKicker>
                <span style={{ flex: 1 }} />
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
                  ₹{ceilingRupees}
                </span>
              </div>

              <Slider
                min={ceilingBounds.min}
                max={ceilingBounds.max}
                step={1}
                value={ceilingRupees}
                onValueChange={onCeilingRupees}
                showValue={false}
                label="Per-turn ceiling in rupees"
                valueText={`${ceilingRupees} rupees`}
              />

              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                At the ceiling Atlas stops, says what it was doing, and offers to continue. Each tap
                buys another ₹{ceilingRupees}.
              </span>

              {model !== null && (
                /* The honest footnote this panel always writes. §3.4: "Local
                   turns are ₹0.00, so it only ever bites Gemini." A ceiling
                   that can never fire on the model in front of him should say
                   so, rather than looking like a setting that is not working. */
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                  This model runs on your laptop and costs nothing, so the ceiling never applies to it.
                  It is here for the turns that go to Gemini.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
