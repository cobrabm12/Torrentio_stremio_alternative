/**
 * Resolve an IMDB id to title/year/aliases using Stremio's public Cinemeta
 * catalog. Results are cached aggressively since they rarely change.
 */

import { remember } from '../cache.js';
import { env } from '../config/env.js';
import { getJson } from '../http.js';
import type { MediaMeta, StreamType } from '../types.js';

interface CinemetaResponse {
  meta?: {
    name?: string;
    year?: string | number;
    releaseInfo?: string;
    genres?: string[];
    /** Some entries carry alternate titles. */
    aliases?: string[];
    cast?: string[];
  };
}

function parseYear(meta: CinemetaResponse['meta']): number | undefined {
  const raw = String(meta?.year ?? meta?.releaseInfo ?? '');
  const m = raw.match(/\d{4}/);
  return m ? Number.parseInt(m[0], 10) : undefined;
}

export async function resolveMeta(
  type: StreamType,
  imdbId: string,
): Promise<MediaMeta> {
  const key = `meta:${type}:${imdbId}`;
  return remember(key, env.metaCacheTtl, async () => {
    const url = `https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`;
    let name = imdbId;
    let year: number | undefined;
    let aliases: string[] = [];
    try {
      const data = await getJson<CinemetaResponse>(url);
      if (data.meta?.name) name = data.meta.name;
      year = parseYear(data.meta);
      aliases = (data.meta?.aliases ?? []).filter(Boolean);
    } catch {
      // Network/lookup failure: fall back to the bare id so scraping can still
      // proceed with whatever the providers can match on.
    }
    return { imdbId, type, title: name, year, aliases } satisfies MediaMeta;
  });
}
