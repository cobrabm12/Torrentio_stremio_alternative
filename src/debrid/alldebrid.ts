/** AllDebrid client: cached check + magnet -> direct link resolution. */

import got from 'got';
import { env } from '../config/env.js';
import type { MediaRequest } from '../types.js';
import type { DebridClient } from './types.js';

const BASE = 'https://api.alldebrid.com/v4';
const AGENT = 'torrentplus';
const VIDEO_EXT = /\.(mkv|mp4|avi|mov|m4v|wmv|flv|ts|webm)$/i;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function matchesEpisode(name: string, request: MediaRequest): boolean {
  if (request.season === undefined || request.episode === undefined) return true;
  return new RegExp(`s${pad2(request.season)}\\s*e${pad2(request.episode)}`, 'i').test(name);
}

export function createAllDebrid(apiKey: string): DebridClient {
  const client = got.extend({
    prefixUrl: BASE,
    searchParams: { agent: AGENT, apikey: apiKey },
    timeout: { request: env.scrapeTimeoutMs },
    retry: { limit: 1 },
  });

  return {
    id: 'alldebrid',

    async checkCached(infoHashes: string[]): Promise<Set<string>> {
      const cached = new Set<string>();
      if (!infoHashes.length) return cached;
      try {
        const search = new URLSearchParams({ agent: AGENT, apikey: apiKey });
        for (const h of infoHashes) search.append('magnets[]', h.toLowerCase());
        const data = await got
          .get(`${BASE}/magnet/instant`, { searchParams: search })
          .json<{ data?: { magnets?: Array<{ magnet: string; instant: boolean }> } }>();
        for (const m of data.data?.magnets ?? []) {
          if (m.instant) cached.add(m.magnet.toLowerCase());
        }
      } catch {
        /* nothing cached */
      }
      return cached;
    },

    async resolve(infoHash, magnet, request): Promise<string | undefined> {
      try {
        const uri = magnet ?? `magnet:?xt=urn:btih:${infoHash}`;
        const uploaded = await client
          .get('magnet/upload', { searchParams: { 'magnets[]': uri } })
          .json<{ data?: { magnets?: Array<{ id: number }> } }>();
        const id = uploaded.data?.magnets?.[0]?.id;
        if (id === undefined) return undefined;

        const status = await client
          .get('magnet/status', { searchParams: { id } })
          .json<{ data?: { magnets?: { links?: Array<{ link: string; filename: string; size: number }> } } }>();
        const links = status.data?.magnets?.links ?? [];
        const videos = links.filter((l) => VIDEO_EXT.test(l.filename));
        const chosen =
          videos.find((l) => matchesEpisode(l.filename, request)) ??
          videos.sort((a, b) => b.size - a.size)[0];
        if (!chosen) return undefined;

        const unlocked = await client
          .get('link/unlock', { searchParams: { link: chosen.link } })
          .json<{ data?: { link?: string } }>();
        return unlocked.data?.link;
      } catch {
        return undefined;
      }
    },
  };
}
