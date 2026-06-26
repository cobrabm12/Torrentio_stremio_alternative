/**
 * ThePirateBay scraper via the apibay JSON endpoint. Searches by title (+year
 * for movies, SxxExx for series) and matches results heuristically.
 */

import { getJson } from '../http.js';
import type { RawTorrent } from '../types.js';
import type { Scraper, ScrapeContext } from './types.js';

interface ApibayItem {
  name?: string;
  info_hash?: string;
  seeders?: string;
  leechers?: string;
  size?: string;
  status?: string;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export const thePirateBayScraper: Scraper = {
  id: 'tpb',
  name: 'ThePirateBay',
  supports: () => true,
  async scrape({ request, meta }: ScrapeContext): Promise<RawTorrent[]> {
    let query = meta.title;
    if (request.type === 'movie' && meta.year) query += ` ${meta.year}`;
    if (request.type === 'series' && request.season !== undefined && request.episode !== undefined) {
      query += ` S${pad2(request.season)}E${pad2(request.episode)}`;
    }
    try {
      const url = `https://apibay.org/q.php?q=${encodeURIComponent(query)}`;
      const items = await getJson<ApibayItem[]>(url);
      const out: RawTorrent[] = [];
      for (const item of items) {
        // apibay returns a single placeholder row when nothing matches.
        if (!item.info_hash || item.info_hash === '0'.repeat(40)) continue;
        if (item.name === 'No results returned') continue;
        out.push({
          title: item.name ?? query,
          infoHash: item.info_hash.toLowerCase(),
          size: item.size ? Number.parseInt(item.size, 10) : undefined,
          seeders: item.seeders ? Number.parseInt(item.seeders, 10) : undefined,
          leechers: item.leechers ? Number.parseInt(item.leechers, 10) : undefined,
          source: 'TPB',
        });
      }
      return out;
    } catch {
      return [];
    }
  },
};
