/** Server-level configuration read from the environment. */

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  port: int('PORT', 7000),
  host: process.env.HOST ?? '0.0.0.0',
  /** Public base URL, used in the configure page install links. */
  baseUrl: process.env.BASE_URL ?? '',
  /** Per-request scraper timeout (ms). */
  scrapeTimeoutMs: int('SCRAPE_TIMEOUT_MS', 8000),
  /** TTL for cached stream results (seconds). */
  streamCacheTtl: int('STREAM_CACHE_TTL', 12 * 60 * 60),
  /** TTL for cached metadata lookups (seconds). */
  metaCacheTtl: int('META_CACHE_TTL', 24 * 60 * 60),
  /** Max cached entries before LRU eviction. */
  cacheMax: int('CACHE_MAX', 5000),
  /** Comma-separated scraper ids to disable globally. */
  disabledProviders: (process.env.DISABLED_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  userAgent:
    process.env.USER_AGENT ??
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
};
