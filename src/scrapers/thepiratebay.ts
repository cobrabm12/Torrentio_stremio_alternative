/**
 * ThePirateBay scraper via the apibay JSON endpoint. Searches by title (+year
 * for movies, SxxExx for series) and matches results heuristically.
 */

import { getJson } from '../http.js';
import type { MediaRequest, RawTorrent } from '../types.js';
import { detectSeasonPack } from './seasonPack.js';
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

/** Build the search queries: for series we also look for season packs. */
function buildQueries(request: MediaRequest, title: string, year?: number): string[] {
  if (request.type === 'movie') {
    return [year ? `${title} ${year}` : title];
  }
  const queries: string[] = [];
  if (request.season !== undefined && request.episode !== undefined) {
    queries.push(`${title} S${pad2(request.season)}E${pad2(request.episode)}`);
  }
  if (request.season !== undefined) {
    queries.push(`${title} S${pad2(request.season)}`); // season pack
  }
  return queries.length ? queries : [title];
}

async function searchApibay(query: string): Promise<ApibayItem[]> {
  try {
    return await getJson<ApibayItem[]>(`https://apibay.org/q.php?q=${encodeURIComponent(query)}`);
  } catch {
    return [];
  }
}

export const thePirateBayScraper: Scraper = {
  id: 'tpb',
  name: 'ThePirateBay',
  supports: () => true,
  async scrape({ request, meta }: ScrapeContext): Promise<RawTorrent[]> {
    const queries = buildQueries(request, meta.title, meta.year);
    const results = await Promise.all(queries.map(searchApibay));
    const out: RawTorrent[] = [];
    const seen = new Set<string>();
    for (const items of results) {
      for (const item of items) {
        // apibay returns a single placeholder row when nothing matches.
        if (!item.info_hash || item.info_hash === '0'.repeat(40)) continue;
        if (item.name === 'No results returned') continue;
        const hash = item.info_hash.toLowerCase();
        if (seen.has(hash)) continue;
        seen.add(hash);
        out.push({
          title: item.name ?? queries[0],
          infoHash: hash,
          size: item.size ? Number.parseInt(item.size, 10) : undefined,
          seeders: item.seeders ? Number.parseInt(item.seeders, 10) : undefined,
          leechers: item.leechers ? Number.parseInt(item.leechers, 10) : undefined,
          source: 'TPB',
          providerId: 'tpb',
          seasonPack: detectSeasonPack(item.name ?? '', request),
        });
      }
    }
    return out;
  },
};
