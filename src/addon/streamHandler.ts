/**
 * Core stream resolution: parse the Stremio stream id, gather + rank torrents,
 * optionally enrich with debrid cached-state, and emit Stremio streams.
 */

import { remember } from '../cache.js';
import { env } from '../config/env.js';
import { createDebrid } from '../debrid/index.js';
import { encodeConfig, type UserConfig } from '../config/userConfig.js';
import { resolveMeta } from '../meta/cinemeta.js';
import { process as rank } from '../process/rank.js';
import { aggregate } from '../scrapers/index.js';
import type { MediaRequest, ProcessedTorrent, StreamType } from '../types.js';
import { ADDON_NAME } from './manifest.js';
import { toStream, type StremioStream } from './streamFormat.js';

/** Parse a Stremio stream id, e.g. "tt0903747:1:5" or "tt0111161". */
export function parseStreamId(type: StreamType, id: string): MediaRequest | undefined {
  const parts = id.split(':');
  const imdbId = parts[0];
  if (!/^tt\d+$/.test(imdbId)) return undefined;
  if (type === 'series') {
    const season = Number.parseInt(parts[1] ?? '', 10);
    const episode = Number.parseInt(parts[2] ?? '', 10);
    if (!Number.isFinite(season) || !Number.isFinite(episode)) return undefined;
    return { type, imdbId, season, episode };
  }
  return { type, imdbId };
}

function cacheKey(request: MediaRequest, config: UserConfig): string {
  const id =
    request.type === 'series'
      ? `${request.imdbId}:${request.season}:${request.episode}`
      : request.imdbId;
  // Only the parts of config that change scraping/ranking affect the cache key.
  const cfg = JSON.stringify({
    p: config.providers,
    q: config.qualities,
    a: config.audioCodecs,
    c: config.audioChannels,
    v: config.videoCodecs,
    h: config.hdrOnly,
    l: config.languages,
    sl: config.strictLanguage,
    ms: config.minSeeders,
    mn: config.minSizeGb,
    mx: config.maxSizeGb,
    s: config.sort,
    n: config.maxResults,
  });
  return `streams:${request.type}:${id}:${cfg}`;
}

/** Build the URL our own server exposes to resolve a torrent through debrid. */
function resolveUrl(config: UserConfig, t: ProcessedTorrent, request: MediaRequest): string {
  const seg = encodeConfig(config);
  const base = env.baseUrl.replace(/\/$/, '');
  const epPart =
    request.type === 'series' ? `/${request.season}/${request.episode}` : '/0/0';
  return `${base}/${seg}/resolve/${request.type}/${request.imdbId}/${t.infoHash}${epPart}`;
}

export async function getStreams(
  type: StreamType,
  id: string,
  config: UserConfig,
): Promise<StremioStream[]> {
  const request = parseStreamId(type, id);
  if (!request) return [];

  const ranked = await remember(cacheKey(request, config), env.streamCacheTtl, async () => {
    const meta = await resolveMeta(type, request.imdbId);
    const raws = await aggregate({ request, meta }, config);
    return rank(raws, config);
  });

  const debrid = createDebrid(config);
  if (!debrid) {
    // Pure peer-to-peer streams.
    return ranked.map((t) => toStream(t, ADDON_NAME));
  }

  // Debrid mode: mark cached entries and route playback through our resolver.
  const cached = await debrid.checkCached(ranked.map((t) => t.infoHash));
  const tag = debrid.id === 'realdebrid' ? 'RD' : debrid.id === 'alldebrid' ? 'AD' : 'PM';

  return ranked.map((t) => {
    const isCached = cached.has(t.infoHash);
    const stream = toStream(t, ADDON_NAME);
    stream.url = env.baseUrl ? resolveUrl(config, t, request) : undefined;
    stream.infoHash = stream.url ? undefined : t.infoHash;
    stream.name = `[${tag}${isCached ? '⚡' : '⤓'}] ${ADDON_NAME}\n${t.attrs.resolution}`;
    return stream;
  });
}

/** Resolve a single torrent to a direct debrid link (used by the /resolve route). */
export async function resolveStream(
  config: UserConfig,
  request: MediaRequest,
  infoHash: string,
): Promise<string | undefined> {
  const debrid = createDebrid(config);
  if (!debrid) return undefined;
  return debrid.resolve(infoHash, undefined, request);
}
