/** EZTV scraper — TV episodes via the official JSON API (keyed by IMDB id). */

import { getJson } from '../http.js';
import type { RawTorrent } from '../types.js';
import type { Scraper, ScrapeContext } from './types.js';

interface EztvResponse {
  torrents?: Array<{
    title?: string;
    hash?: string;
    magnet_url?: string;
    season?: string;
    episode?: string;
    size_bytes?: string;
    seeds?: number;
    peers?: number;
  }>;
}

export const eztvScraper: Scraper = {
  id: 'eztv',
  name: 'EZTV',
  supports: (type) => type === 'series',
  async scrape({ request }: ScrapeContext): Promise<RawTorrent[]> {
    if (request.season === undefined || request.episode === undefined) return [];
    try {
      // EZTV's API takes the numeric portion of the IMDB id.
      const imdb = request.imdbId.replace(/^tt/, '');
      const url = `https://eztvx.to/api/get-torrents?imdb_id=${imdb}&limit=100`;
      const data = await getJson<EztvResponse>(url);
      const out: RawTorrent[] = [];
      for (const t of data.torrents ?? []) {
        const season = Number.parseInt(t.season ?? '', 10);
        const episode = Number.parseInt(t.episode ?? '', 10);
        if (season !== request.season || episode !== request.episode) continue;
        if (!t.hash && !t.magnet_url) continue;
        out.push({
          title: t.title ?? `${request.imdbId} S${season}E${episode}`,
          infoHash: t.hash?.toLowerCase(),
          magnet: t.magnet_url,
          size: t.size_bytes ? Number.parseInt(t.size_bytes, 10) : undefined,
          seeders: t.seeds,
          leechers: t.peers,
          source: 'EZTV',
          providerId: 'eztv',
        });
      }
      return out;
    } catch {
      return [];
    }
  },
};
