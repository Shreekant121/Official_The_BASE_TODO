/**
 * Live INR→USD exchange rate, for the public Share view's ₹/$ toggle only
 * (see the plan's "₹ value field + rollups + live $ conversion" item) —
 * task cards inside the authenticated app always show ₹, this module has
 * no callers there.
 *
 * Fetches from a free, keyless endpoint (open.er-api.com), caches the last
 * rate + fetch time in `localStorage`, and only re-fetches when that cache
 * is stale (>12h) so the public Share page never blocks on a network round
 * trip before it can render. Falls back to the stale cache, and finally to
 * a hardcoded default, if the network call fails — a public read-only page
 * should never show nothing just because the rate API is down.
 */

const CACHE_KEY = 'mutineer_inr_usd_rate_v1';
const STALE_MS = 12 * 60 * 60 * 1000; // 12h
/** Rough INR->USD as of writing — last-resort only, used if both the live fetch and any cached rate are unavailable. */
const FALLBACK_RATE = 0.012;

interface CachedRate {
  rate: number;
  fetchedAt: number;
}

function readCache(): CachedRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedRate>;
    if (typeof parsed.rate !== 'number' || typeof parsed.fetchedAt !== 'number') return null;
    return { rate: parsed.rate, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeCache(rate: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, fetchedAt: Date.now() } satisfies CachedRate));
  } catch {
    // Non-critical — worst case we just refetch next time
  }
}

async function fetchLiveRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/INR');
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    const rate = data.rates?.USD;
    return typeof rate === 'number' && rate > 0 ? rate : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the current INR→USD rate: returns the cached rate immediately
 * if it's under 12h old, otherwise attempts a live refresh and falls back
 * to whatever's available (stale cache, then the hardcoded default) if
 * that fails. Always resolves — never throws.
 */
export async function getInrToUsdRate(): Promise<number> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < STALE_MS) return cached.rate;

  const live = await fetchLiveRate();
  if (live !== null) {
    writeCache(live);
    return live;
  }

  return cached?.rate ?? FALLBACK_RATE;
}

export function convertInrToUsd(valueINR: number, rate: number): number {
  return valueINR * rate;
}

/** `$` formatting for converted rollups — no decimals once the amount is large enough that cents are noise. */
export function formatUSD(value: number): string {
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: value >= 1000 ? 0 : 2 })}`;
}
