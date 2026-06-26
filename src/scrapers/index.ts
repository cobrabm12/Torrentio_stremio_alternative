/**
 * Scraper registry + aggregator. Runs all enabled scrapers concurrently with
 * per-scraper isolation (one failing provider never blocks the rest) and
 * deduplicates results by infoHash, keeping the richest record.
 *
 * Scraping is intentionally config-independent: we fetch from every available
 * provider and store the union, so the persistent cache can be shared across
 * users with different option sets. Per-user provider filtering happens later,
 * at ranking time.
 */

import { env } from '../config/env.js';
import type { RawTorrent } from '../types.js';
import { eztvScraper } from './eztv.js';
import { nyaaScraper } from './nyaa.js';
import { thePirateBayScraper } from './thepiratebay.js';
import type { ScrapeContext, Scraper } from './types.js';
import { x1337Scraper } from './x1337.js';
import { ytsScraper } from './yts.js';

export const ALL_SCRAPERS: Scraper[] = [
  ytsScraper,
  eztvScraper,
  thePirateBayScraper,
  x1337Scraper,
  nyaaScraper,
];

export function listScrapers(): Array<{ id: string; name: string }> {
  return ALL_SCRAPERS.map((s) => ({ id: s.id, name: s.name }));
}

/** Merge two records for the same infoHash, preferring populated fields. */
function mergeTorrent(a: RawTorrent, b: RawTorrent): RawTorrent {
  return {
    ...a,
    magnet: a.magnet ?? b.magnet,
    size: a.size ?? b.size,
    seeders: Math.max(a.seeders ?? 0, b.seeders ?? 0) || a.seeders || b.seeders,
    leechers: a.leechers ?? b.leechers,
    files: a.files ?? b.files,
    seasonPack: a.seasonPack || b.seasonPack,
    // Keep the longer (more descriptive) title.
    title: (a.title?.length ?? 0) >= (b.title?.length ?? 0) ? a.title : b.title,
  };
}

/** Run every supported, globally-enabled provider and return the merged union. */
export async function aggregate(ctx: ScrapeContext): Promise<RawTorrent[]> {
  const scrapers = ALL_SCRAPERS.filter(
    (s) => !env.disabledProviders.includes(s.id) && s.supports(ctx.request.type),
  );
  const settled = await Promise.allSettled(scrapers.map((s) => s.scrape(ctx)));

  const byHash = new Map<string, RawTorrent>();
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const torrent of result.value) {
      const hash = torrent.infoHash;
      if (!hash) continue;
      const existing = byHash.get(hash);
      byHash.set(hash, existing ? mergeTorrent(existing, torrent) : torrent);
    }
  }
  return [...byHash.values()];
}
