/** Premiumize client: cached check + magnet -> direct link resolution. */

import got from 'got';
import { env } from '../config/env.js';
import type { MediaRequest } from '../types.js';
import type { DebridClient } from './types.js';

const BASE = 'https://www.premiumize.me/api';
const VIDEO_EXT = /\.(mkv|mp4|avi|mov|m4v|wmv|flv|ts|webm)$/i;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function matchesEpisode(name: string, request: MediaRequest): boolean {
  if (request.season === undefined || request.episode === undefined) return true;
  return new RegExp(`s${pad2(request.season)}\\s*e${pad2(request.episode)}`, 'i').test(name);
}

export function createPremiumize(apiKey: string): DebridClient {
  const client = got.extend({
    prefixUrl: BASE,
    searchParams: { apikey: apiKey },
    timeout: { request: env.scrapeTimeoutMs },
    retry: { limit: 1 },
  });

  return {
    id: 'premiumize',

    async checkCached(infoHashes: string[]): Promise<Set<string>> {
      const cached = new Set<string>();
      if (!infoHashes.length) return cached;
      try {
        const search = new URLSearchParams({ apikey: apiKey });
        for (const h of infoHashes) search.append('items[]', h.toLowerCase());
        const data = await got
          .get(`${BASE}/cache/check`, { searchParams: search })
          .json<{ response?: boolean[] }>();
        (data.response ?? []).forEach((isCached, i) => {
          if (isCached) cached.add(infoHashes[i].toLowerCase());
        });
      } catch {
        /* nothing cached */
      }
      return cached;
    },

    async resolve(infoHash, magnet, request): Promise<string | undefined> {
      try {
        const uri = magnet ?? `magnet:?xt=urn:btih:${infoHash}`;
        const data = await client
          .post('transfer/directdl', { form: { src: uri } })
          .json<{ content?: Array<{ path: string; link: string; size: number }> }>();
        const videos = (data.content ?? []).filter((c) => VIDEO_EXT.test(c.path));
        const chosen =
          videos.find((c) => matchesEpisode(c.path, request)) ??
          videos.sort((a, b) => b.size - a.size)[0];
        return chosen?.link;
      } catch {
        return undefined;
      }
    },
  };
}
