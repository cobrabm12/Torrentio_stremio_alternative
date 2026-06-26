/**
 * Core stream resolution.
 *
 * Lazy/hybrid flow:
 *   1. Look up the media in the persistent store. If a fresh entry exists, use
 *      it (instant). Otherwise scrape every provider once, persist the union,
 *      and reuse it for all future requests / users.
 *   2. Rank with the user's config (provider + quality/audio/language filters).
 *   3. For peer-to-peer playback, resolve season-pack file indexes so Stremio
 *      plays the right episode. For debrid, mark cached entries and route
 *      playback through our resolver.
 */

import { encodeConfig, type UserConfig } from '../config/userConfig.js';
import { env } from '../config/env.js';
import { createDebrid } from '../debrid/index.js';
import { resolveMeta } from '../meta/cinemeta.js';
import { process as rank } from '../process/rank.js';
import { aggregate } from '../scrapers/index.js';
import { getMedia, setMedia } from '../store/db.js';
import { resolvePackFileIdx } from '../torrent/fileList.js';
import type { MediaMeta, MediaRequest, ProcessedTorrent, RawTorrent, StreamType } from '../types.js';
import { ADDON_NAME } from './manifest.js';
import { toStream, type StremioStream } from './streamFormat.js';

/** Max season packs per request for which we resolve file lists (bounded I/O). */
const MAX_PACK_RESOLVE = 8;

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

function mediaKey(request: MediaRequest): string {
  return request.type === 'series'
    ? `series:${request.imdbId}:${request.season}:${request.episode}`
    : `movie:${request.imdbId}`;
}

// Coalesce concurrent scrapes for the same media key (stampede protection).
const inflight = new Map<string, Promise<RawTorrent[]>>();

async function scrapeAndStore(
  key: string,
  request: MediaRequest,
  meta: MediaMeta,
  staleFallback: RawTorrent[] | undefined,
): Promise<RawTorrent[]> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const raws = await aggregate({ request, meta });
      if (raws.length) {
        setMedia(key, raws);
        return raws;
      }
      // Empty scrape: keep any stale data we had rather than going blank.
      return staleFallback ?? raws;
    } catch {
      return staleFallback ?? [];
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Get raw torrents for a request from the store, scraping lazily on miss/stale. */
async function getRawTorrents(request: MediaRequest, meta: MediaMeta): Promise<RawTorrent[]> {
  const key = mediaKey(request);
  const stored = getMedia(key);
  if (stored?.fresh) return stored.torrents;
  return scrapeAndStore(key, request, meta, stored?.torrents);
}

/** Resolve `fileIdx` for the top season packs so P2P playback hits the episode. */
async function enrichPackFileIdx(
  ranked: ProcessedTorrent[],
  request: MediaRequest,
): Promise<void> {
  if (request.type !== 'series') return;
  const packs = ranked
    .filter((t) => t.seasonPack && t.fileIdx === undefined)
    .slice(0, MAX_PACK_RESOLVE);
  await Promise.all(
    packs.map(async (t) => {
      const idx = await resolvePackFileIdx(t.infoHash, request);
      if (idx !== undefined) t.fileIdx = idx;
    }),
  );
}

/** Build the URL our own server exposes to resolve a torrent through debrid. */
function resolveUrl(config: UserConfig, t: ProcessedTorrent, request: MediaRequest): string {
  const seg = encodeConfig(config);
  const base = env.baseUrl.replace(/\/$/, '');
  const epPart = request.type === 'series' ? `/${request.season}/${request.episode}` : '/0/0';
  return `${base}/${seg}/resolve/${request.type}/${request.imdbId}/${t.infoHash}${epPart}`;
}

export async function getStreams(
  type: StreamType,
  id: string,
  config: UserConfig,
): Promise<StremioStream[]> {
  const request = parseStreamId(type, id);
  if (!request) return [];

  const meta = await resolveMeta(type, request.imdbId);
  const raws = await getRawTorrents(request, meta);
  const ranked = rank(raws, config);

  const debrid = createDebrid(config);
  if (!debrid) {
    await enrichPackFileIdx(ranked, request);
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
