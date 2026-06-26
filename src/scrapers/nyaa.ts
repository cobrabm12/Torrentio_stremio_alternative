/**
 * Nyaa scraper for anime — parses the public RSS feed. Useful for series with
 * fan-subbed / multi-audio releases that mainstream trackers miss.
 */

import * as cheerio from 'cheerio';
import { getText } from '../http.js';
import type { RawTorrent } from '../types.js';
import type { Scraper, ScrapeContext } from './types.js';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function infoHashFromMagnet(magnet: string): string | undefined {
  const m = magnet.match(/btih:([a-fA-F0-9]{40})/);
  return m ? m[1].toLowerCase() : undefined;
}

export const nyaaScraper: Scraper = {
  id: 'nyaa',
  name: 'Nyaa (anime)',
  supports: (type) => type === 'series' || type === 'movie',
  async scrape({ request, meta }: ScrapeContext): Promise<RawTorrent[]> {
    let query = meta.title;
    if (request.type === 'series' && request.episode !== undefined) {
      query += ` ${pad2(request.episode)}`;
    }
    try {
      const url = `https://nyaa.si/?page=rss&q=${encodeURIComponent(query)}&c=1_2&f=0`;
      const xml = await getText(url);
      const $ = cheerio.load(xml, { xmlMode: true });
      const out: RawTorrent[] = [];
      $('item').each((_, el) => {
        const item = $(el);
        const title = item.find('title').text();
        const link = item.find('link').text();
        const seeders = Number.parseInt(item.find('nyaa\\:seeders').text() || '0', 10);
        const sizeText = item.find('nyaa\\:size').text();
        const infoHash = item.find('nyaa\\:infoHash').text()?.toLowerCase() || infoHashFromMagnet(link);
        if (!infoHash) return;
        out.push({
          title,
          infoHash,
          magnet: link.startsWith('magnet:') ? link : undefined,
          seeders: Number.isFinite(seeders) ? seeders : undefined,
          size: parseSize(sizeText),
          source: 'Nyaa',
          providerId: 'nyaa',
        });
      });
      return out.slice(0, 50);
    } catch {
      return [];
    }
  },
};

function parseSize(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*(GiB|MiB|GB|MB)/i);
  if (!m) return undefined;
  const value = Number.parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith('g') ? 1024 ** 3 : 1024 ** 2;
  return Math.round(value * mult);
}
