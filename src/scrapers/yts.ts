/** YTS scraper — high quality movie releases via the official JSON API. */

import { getJson } from '../http.js';
import type { RawTorrent } from '../types.js';
import type { Scraper, ScrapeContext } from './types.js';

interface YtsResponse {
  data?: {
    movies?: Array<{
      title_long?: string;
      torrents?: Array<{
        hash?: string;
        quality?: string;
        type?: string;
        video_codec?: string;
        seeds?: number;
        peers?: number;
        size_bytes?: number;
      }>;
    }>;
  };
}

const TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:80',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://glotorrents.pw:6969/announce',
];

function buildMagnet(hash: string, name: string): string {
  const trackers = TRACKERS.map((t) => `&tr=${encodeURIComponent(t)}`).join('');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${trackers}`;
}

export const ytsScraper: Scraper = {
  id: 'yts',
  name: 'YTS',
  supports: (type) => type === 'movie',
  async scrape({ meta }: ScrapeContext): Promise<RawTorrent[]> {
    try {
      const url = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(
        meta.imdbId,
      )}&limit=5`;
      const data = await getJson<YtsResponse>(url);
      const out: RawTorrent[] = [];
      for (const movie of data.data?.movies ?? []) {
        for (const t of movie.torrents ?? []) {
          if (!t.hash) continue;
          const title = [
            movie.title_long ?? meta.title,
            t.quality,
            t.type ? t.type.toUpperCase() : undefined,
            t.video_codec,
            'YTS',
          ]
            .filter(Boolean)
            .join(' ');
          out.push({
            title,
            infoHash: t.hash.toLowerCase(),
            magnet: buildMagnet(t.hash, title),
            size: t.size_bytes,
            seeders: t.seeds,
            leechers: t.peers,
            source: 'YTS',
            providerId: 'yts',
          });
        }
      }
      return out;
    } catch {
      return [];
    }
  },
};
