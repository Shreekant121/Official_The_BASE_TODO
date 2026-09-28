import { HOST_READINGS, READINGS_TAKEN_ON } from './hostReadings';

/**
 * What a context window actually costs, per model, where anybody measured it.
 *
 * THE MOCKUP HAS A FULL TABLE AND MOST OF IT WAS NEVER MEASURED
 * --------------------------------------------------------------
 * `atlas.html` carries a `CTX` map with a row for every model at 8/16/32/64/96/
 * 131/262K — twenty-two readings — and comments that they were *"read off
 * /api/ps at each step"*. `../../../atlas/DESIGN.md` §2 and §5 record **eight**:
 *
 *   gemma4:e4b  8K, 64K, 131K
 *   qwen3.5:4b  8K, 32K, 64K
 *   qwen3.5:9b  8K
 *
 * The other fourteen are the mockup filling in a shape. They are plausible and
 * some are probably close, and that is exactly the problem: a number with no
 * measurement behind it, printed in the same type as one that has, is
 * indistinguishable from a fact. `hostReadings.ts` states the rule this file
 * follows — *"a reading with a date on it is a fact; the same number with no
 * date is a claim about right now"* — and 9B's screen already applies it by
 * showing a model pulled since the benchmark with no readings rather than
 * borrowed ones.
 *
 * **So the slider stops wherever the model allows, and the readout only speaks
 * where a reading exists.** Between measured points it says how much is known
 * rather than interpolating: the gap between 64K and 131K on gemma is where
 * the KV cache stops fitting on the card, and a straight line drawn through it
 * would be wrong in the one place the number matters.
 *
 * Re-running the benchmark is item 14. Add rows here and move the date in
 * `hostReadings.ts`; do not edit one number in place, and do not add a row
 * that was not measured.
 */

export interface ContextReading {
  /** Thousands of tokens: 8, 64, 131. */
  k: number;
  /** Total memory the model plus its cache occupies, in GB. */
  totalGb: number;
  /** Percent of that on the GPU. Under 100 means the rest is in system RAM. */
  onGpu: number;
  /** Tokens per second on charger, which is the number DESIGN.md §2 quotes. */
  tps: number;
}

/**
 * The eight measurements, exactly as DESIGN.md §2 and §2.5 record them.
 *
 * `qwen3.5:4b` at 16K and 32K: §2.5 gives "3.34 → 4.20 → 5.34 GB across
 * 8K/32K/64K" — three points, not four — and *"no speed change at all"*, which
 * is why all three carry 82 tok/s. There is no 16K reading and none is
 * invented.
 */
const MEASURED: Record<string, ContextReading[]> = {
  'gemma4:e4b': [
    { k: 8, totalGb: 3.23, onGpu: 100, tps: 71.5 },
    { k: 64, totalGb: 3.29, onGpu: 100, tps: 57 },
    { k: 131, totalGb: 9.71, onGpu: 34, tps: 47 },
  ],
  'qwen3.5:4b': [
    { k: 8, totalGb: 3.34, onGpu: 100, tps: 82 },
    { k: 32, totalGb: 4.2, onGpu: 100, tps: 82 },
    { k: 64, totalGb: 5.34, onGpu: 100, tps: 82 },
  ],
  'qwen3.5:9b': [{ k: 8, totalGb: 6.28, onGpu: 88, tps: 38 }],
};

/**
 * The stops the slider offers.
 *
 * `atlas.html`'s own labels, kept — 8, 16, 32, 64, 96, 131, 262 — because they
 * are what Shreekant will recognise from the design. **They are not the
 * measured points**: those are three, three and one, and a slider with one
 * stop would not be a slider. The stops are what a person would want to
 * choose; the readings are what is known about some of them.
 *
 * **The label and the number sent to Ollama are not the same thing, and
 * assuming they were is a bug this file already had.** The mockup's labels mix
 * two conventions: 8/16/32/64 are binary (8192, 65536) while 131 and 262 are
 * the two declared maxima named by their thousands — 131072 is 128×1024, not
 * 131×1024. Converting a label back with either multiplier gets one half of
 * the list wrong, and getting 131 wrong is the expensive one: one token over
 * the declared maximum and Ollama clamps the whole request and reports success
 * (DESIGN.md §2.4), which is exactly the lie §4.1 exists to stop. So the exact
 * count travels beside the label and nothing recomputes it.
 */
export interface ContextStep {
  /** What the slider prints. The mockup's own number. */
  label: number;
  /** What Atlas asks Ollama for. Exact. */
  tokens: number;
}

export const CONTEXT_STEPS: ContextStep[] = [
  { label: 8, tokens: 8_192 },
  { label: 16, tokens: 16_384 },
  { label: 32, tokens: 32_768 },
  { label: 64, tokens: 65_536 },
  { label: 96, tokens: 98_304 },
  { label: 131, tokens: 131_072 },
  { label: 262, tokens: 262_144 },
];

/** Just the labels, for the places that only draw. */
export const CONTEXT_STEPS_K = CONTEXT_STEPS.map((step) => step.label);

/** The exact count for a label, or `null` for one that is not a stop. */
export function tokensForStep(label: number): number | null {
  return CONTEXT_STEPS.find((step) => step.label === label)?.tokens ?? null;
}

/** DESIGN.md §4.1's default. 64K, and the reason is §2.5's 6.4 GB of system RAM at 131K. */
export const DEFAULT_CONTEXT_K = 64;

/** The system RAM this machine has, from §2. The denominator in "6.4 of 15.3 GB". */
export const SYSTEM_RAM_GB = 15.3;

/** When every number here was taken. Printed beside them, never dropped. */
export const CONTEXT_READINGS_TAKEN_ON = READINGS_TAKEN_ON;

/** The stops this model can offer — its declared ceiling, in the steps above. */
export function contextStepsFor(model: string): number[] {
  const declared = HOST_READINGS.find((reading) => reading.model === model)?.maxContext ?? null;
  // A model nobody has benchmarked has no declared ceiling here either, so it
  // gets the steps up to 64K — the default, and the one size §2.5 shows is
  // free on everything measured. Atlas clamps whatever is asked for anyway.
  const ceiling = declared ?? (tokensForStep(DEFAULT_CONTEXT_K) as number);
  return CONTEXT_STEPS.filter((step) => step.tokens <= ceiling).map((step) => step.label);
}

/** The measurement at exactly this size, or `null` — which is the common answer. */
export function contextReadingFor(model: string, k: number): ContextReading | null {
  return MEASURED[model]?.find((reading) => reading.k === k) ?? null;
}

/** Which sizes were measured for this model, for the "known at" line. */
export function measuredStepsFor(model: string): number[] {
  return (MEASURED[model] ?? []).map((reading) => reading.k);
}

/** How much of a reading sits in system RAM rather than on the card. */
export function offCardGb(reading: ContextReading): number {
  return (reading.totalGb * (100 - reading.onGpu)) / 100;
}

/**
 * The honest line under the slider (DESIGN.md §4.1).
 *
 * *"It shows the honest cost as it moves — '3.3 GB, all on the graphics card'
 * versus '9.7 GB, two-thirds in system memory'."* Both of those are measured
 * points on gemma, which is where that sentence came from. At an unmeasured
 * stop it says so and names the nearest sizes that are known, because §4.1's
 * whole argument is that the design's job is *"to stop Ollama misreporting"* —
 * and a number this app made up would be the same failure with a friendlier
 * face.
 */
export function describeContextCost(
  model: string,
  k: number,
): { headline: string; detail: string; measured: boolean; onGpu: number | null } {
  const reading = contextReadingFor(model, k);

  if (reading !== null) {
    return {
      headline: `${reading.totalGb.toFixed(2)} GB · ${reading.onGpu}% on the card`,
      detail:
        reading.onGpu === 100
          ? `All of it on the graphics card. ${reading.tps} tok/s on charger.`
          : `${offCardGb(reading).toFixed(1)} GB sits in system memory, out of ${SYSTEM_RAM_GB} GB. ${reading.tps} tok/s.`,
      measured: true,
      onGpu: reading.onGpu,
    };
  }

  const known = measuredStepsFor(model);
  return {
    headline: 'Not measured at this size',
    detail:
      known.length === 0
        ? `Nothing has been measured for ${model} on this laptop. Atlas still clamps it to what the model declares.`
        : `Measured at ${known.map((step) => `${step}K`).join(', ')} on ${CONTEXT_READINGS_TAKEN_ON}. This stop was not, so no number is shown for it.`,
    measured: false,
    onGpu: null,
  };
}
