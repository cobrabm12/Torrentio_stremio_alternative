/**
 * Scraper registry + aggregator. Runs all enabled scrapers concurrently with
 * per-scraper isolation (one failing provider never blocks the rest) and
 * deduplicates results by infoHash, keeping the richest record.
 */

import { env } from '../config/env.js';
import type { UserConfig } from '../config/userConfig.js';
import type { RawTorrent } from '../types.js';
import { eztvScraper } from './eztv.js';
import { nyaaScraper } from './nyaa.js';
import { thePirateBayScraper } from './thepiratebay.js';
import type { ScrapeContext, Scraper } from './types.js';
import { ytsScraper } from './yts.js';

export const ALL_SCRAPERS: Scraper[] = [
  ytsScraper,
  eztvScraper,
  thePirateBayScraper,
  nyaaScraper,
];

export function listScrapers(): Array<{ id: string; name: string }> {
  return ALL_SCRAPERS.map((s) => ({ id: s.id, name: s.name }));
}

function selectScrapers(config: UserConfig, type: ScrapeContext['request']['type']): Scraper[] {
  return ALL_SCRAPERS.filter((s) => {
    if (env.disabledProviders.includes(s.id)) return false;
    if (config.providers.length && !config.providers.includes(s.id)) return false;
    return s.supports(type);
  });
}

/** Merge two records for the same infoHash, preferring populated fields. */
function mergeTorrent(a: RawTorrent, b: RawTorrent): RawTorrent {
  return {
    ...a,
    magnet: a.magnet ?? b.magnet,
    size: a.size ?? b.size,
    seeders: Math.max(a.seeders ?? 0, b.seeders ?? 0) || a.seeders || b.seeders,
    leechers: a.leechers ?? b.leechers,
    // Keep the longer (more descriptive) title.
    title: (a.title?.length ?? 0) >= (b.title?.length ?? 0) ? a.title : b.title,
  };
}

export async function aggregate(
  ctx: ScrapeContext,
  config: UserConfig,
): Promise<RawTorrent[]> {
  const scrapers = selectScrapers(config, ctx.request.type);
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
