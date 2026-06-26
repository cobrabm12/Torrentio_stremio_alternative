/**
 * 1337x scraper. Search returns a listing without magnets, so we fetch a
 * bounded number of detail pages concurrently to extract the magnet/infoHash.
 * Best-effort: any failure (Cloudflare, mirror down) degrades to fewer/zero
 * results without throwing.
 */

import * as cheerio from 'cheerio';
import { getText } from '../http.js';
import type { RawTorrent } from '../types.js';
import { detectSeasonPack } from './seasonPack.js';
import type { Scraper, ScrapeContext } from './types.js';

const MIRRORS = ['https://1337x.to', 'https://1337x.st', 'https://x1337x.ws'];
const MAX_DETAIL = 6;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function parseSize(text: string): number | undefined {
  const m = text.match(/([\d.]+)\s*(GB|MB|KB|TB)/i);
  if (!m) return undefined;
  const value = Number.parseFloat(m[1]);
  const unit = m[2].toUpperCase();
  const mult = unit === 'TB' ? 1024 ** 4 : unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024;
  return Math.round(value * mult);
}

interface Row {
  title: string;
  detailPath: string;
  seeders?: number;
  leechers?: number;
  size?: number;
}

function parseListing(html: string): Row[] {
  const $ = cheerio.load(html);
  const rows: Row[] = [];
  $('table.table-list tbody tr').each((_, tr) => {
    const row = $(tr);
    const links = row.find('td.coll-1.name a');
    const detail = links.eq(links.length - 1);
    const detailPath = detail.attr('href');
    const title = detail.text().trim();
    if (!detailPath || !title) return;
    rows.push({
      title,
      detailPath,
      seeders: Number.parseInt(row.find('td.coll-2').text().trim(), 10) || undefined,
      leechers: Number.parseInt(row.find('td.coll-3').text().trim(), 10) || undefined,
      size: parseSize(row.find('td.coll-4').text()),
    });
  });
  return rows;
}

function magnetFromDetail(html: string): string | undefined {
  const $ = cheerio.load(html);
  const href = $('a[href^="magnet:"]').first().attr('href');
  return href ?? undefined;
}

function infoHashFromMagnet(magnet: string): string | undefined {
  const m = magnet.match(/btih:([a-fA-F0-9]{40})/i);
  return m ? m[1].toLowerCase() : undefined;
}

export const x1337Scraper: Scraper = {
  id: 'x1337',
  name: '1337x',
  supports: () => true,
  async scrape({ request, meta }: ScrapeContext): Promise<RawTorrent[]> {
    let query = meta.title;
    if (request.type === 'movie' && meta.year) query += ` ${meta.year}`;
    if (request.type === 'series' && request.season !== undefined && request.episode !== undefined) {
      query += ` S${pad2(request.season)}E${pad2(request.episode)}`;
    }

    // Try mirrors until one returns a usable listing.
    let rows: Row[] = [];
    let base = MIRRORS[0];
    for (const mirror of MIRRORS) {
      try {
        const html = await getText(`${mirror}/search/${encodeURIComponent(query)}/1/`);
        rows = parseListing(html);
        if (rows.length) {
          base = mirror;
          break;
        }
      } catch {
        /* try next mirror */
      }
    }
    if (!rows.length) return [];

    const top = rows.slice(0, MAX_DETAIL);
    const settled = await Promise.allSettled(
      top.map(async (row): Promise<RawTorrent | undefined> => {
        const html = await getText(`${base}${row.detailPath}`);
        const magnet = magnetFromDetail(html);
        const infoHash = magnet ? infoHashFromMagnet(magnet) : undefined;
        if (!infoHash) return undefined;
        return {
          title: row.title,
          infoHash,
          magnet,
          size: row.size,
          seeders: row.seeders,
          leechers: row.leechers,
          source: '1337x',
          providerId: 'x1337',
          seasonPack: detectSeasonPack(row.title, request),
        };
      }),
    );

    const out: RawTorrent[] = [];
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) out.push(r.value);
    }
    return out;
  },
};
