/**
 * What each model actually cost when it was measured on the laptop.
 *
 * WHY THIS IS A TABLE OF LITERALS AND NOT A FETCH
 * -----------------------------------------------
 * Atlas reports what is *installed* and what is *resident* — that is live, and
 * `/atlas-host` reads it from `/health`. It cannot report how fast a model runs
 * or how much of it sits on the GPU, because nothing measures that at runtime:
 * these numbers came out of a benchmark run by hand on 2026-09-02, recorded in
 * `../../../atlas/DESIGN.md` §2, and they are the reason several of the
 * project's decisions went the way they did.
 *
 * `atlas-host.html` makes the same call and says so in its own source: *"These
 * are readings, not specifications — the picker's whole value is that it does
 * not guess."* So the screen prints the date beside them. A reading with a date
 * on it is a fact; the same number with no date is a claim about right now,
 * which is what this must never become.
 *
 * **Matched by name against Ollama's own list, and absent is a normal answer.**
 * `readingFor` returns `null` for a model pulled since the benchmark, and the
 * screen shows that model with no readings rather than inventing some. That is
 * the whole point of keeping this separate from the model list instead of
 * hardcoding three rows: the list is Atlas's, the readings are this file's, and
 * only the overlap is drawn.
 *
 * If the benchmark is re-run — item 14 is the session that does it — replace
 * these rows and move the date. Do not edit one number in place.
 */

export interface HostReading {
  /** Ollama's own model name. The join key against `/models/local`. */
  model: string;
  /** Bytes on disk, as a human string. **Not** the memory footprint. */
  onDisk: string;
  /** What it actually loads into. gemma4:e4b is 9.61 GB on disk and 3.23 in VRAM. */
  inVram: string;
  /** Percent of the model on the GPU. Under 100 means it spilled to the CPU. */
  onGpu: number;
  /** Tokens per second on battery — the pessimistic case (DESIGN.md §2.3). */
  batteryTps: number;
  /** Tokens per second on charger. All three are 20–40% faster here. */
  chargerTps: number;
  /** How long a cold load takes. This is what a swap costs. */
  coldLoad: string;
  /** The declared context maximum. Asking for more is silently clamped. */
  maxContext: number;
  /** `/api/show`'s list, which `/api/tags` under-reports — see `atlas/src/ollama/client.ts`. */
  capabilities: string[];
  /** Capabilities the model declares that nobody has confirmed work. DESIGN.md §12. */
  unverified?: string[];
  /** The one sentence about this model that changes a decision. */
  note: string;
}

/** When the numbers below were taken. Printed beside them, never dropped. */
export const READINGS_TAKEN_ON = '2 September 2026';

/** The machine they were taken on, as DESIGN.md §2 records it. */
export const BENCHMARK_MACHINE = 'ASUS TUF Gaming A16 · RTX 5050 Laptop, 8151 MiB VRAM · Ollama 0.33.2';

export const HOST_READINGS: HostReading[] = [
  {
    model: 'gemma4:e4b',
    onDisk: '9.61 GB',
    inVram: '3.23 GB',
    onGpu: 100,
    batteryTps: 55.2,
    chargerTps: 71.5,
    coldLoad: '13–16 s',
    maxContext: 131072,
    capabilities: ['tools', 'thinking', 'vision', 'audio'],
    unverified: ['audio'],
    note: 'The default. An E4B model — 8B stored, about 4B active per token — so its 9.61 GB on disk loads into 3.23 GB and stays on the card. Reading the file size and concluding it will not fit is the mistake this row exists to stop.',
  },
  {
    model: 'qwen3.5:4b',
    onDisk: '3.39 GB',
    inVram: '3.34 GB',
    onGpu: 100,
    batteryTps: 58.4,
    chargerTps: 82.0,
    coldLoad: '5–7 s',
    maxContext: 262144,
    capabilities: ['tools', 'thinking'],
    note: 'Fastest here and the longest window. Scales 3.34 → 5.34 GB across 8K–64K with no speed change at all, which makes it the cheap one to hand a long conversation.',
  },
  {
    model: 'qwen3.5:9b',
    onDisk: '6.59 GB',
    inVram: '5.51 of 6.28 GB',
    onGpu: 88,
    batteryTps: 31.8,
    chargerTps: 38.0,
    coldLoad: '9–13 s',
    maxContext: 131072,
    capabilities: ['tools', 'thinking'],
    note: 'Spills 12% onto the CPU and pays about half its throughput for it — the slowest of the three on this machine, not the smartest per second. A manual choice only; Atlas never selects it on its own.',
  },
];

export function readingFor(model: string): HostReading | null {
  return HOST_READINGS.find((reading) => reading.model === model) ?? null;
}

/**
 * The open questions §12 says must be answered before the items that rest on
 * them, printed on the screen rather than left in a document.
 *
 * `atlas-host.html` argues for this directly and it is right: a list of
 * unproven assumptions that lives only in a design file gets quietly promoted
 * to fact by the third session that reads past it. On the host screen it is
 * beside the machine it is a claim about.
 */
export const UNVERIFIED: { icon: 'circle-alert' | 'triangle-alert' | 'stethoscope'; question: string; why: string }[] = [
  {
    icon: 'stethoscope',
    question: 'Does gemma4:e4b actually transcribe through Ollama?',
    why: 'It declares the capability. Declared and working are different things, and this metadata has been wrong once already in this project.',
  },
  {
    icon: 'circle-alert',
    question: 'How much VRAM does Chatterbox need beside gemma at 64K?',
    why: '5.3 GB plus Chatterbox against 8 GB is tight. Measure it before the voice item is designed, not while it is being built.',
  },
  {
    icon: 'triangle-alert',
    question: 'Does num_ctx above the maximum ever error rather than clamp?',
    why: 'Everything observed so far clamps silently and reports success — which is why Atlas asks /api/show for each model’s real ceiling instead of trusting the number back.',
  },
];
