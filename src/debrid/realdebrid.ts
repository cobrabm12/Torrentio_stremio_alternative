/**
 * RealDebrid client. Implements cached-availability checks and on-demand
 * torrent -> direct-link resolution (add magnet, pick the right file,
 * unrestrict the resulting link).
 */

import got from 'got';
import { env } from '../config/env.js';
import type { MediaRequest } from '../types.js';
import type { DebridClient } from './types.js';

const BASE = 'https://api.real-debrid.com/rest/1.0';

const VIDEO_EXT = /\.(mkv|mp4|avi|mov|m4v|wmv|flv|ts|webm)$/i;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Heuristic: does a filename match the requested SxxExx episode? */
function matchesEpisode(name: string, request: MediaRequest): boolean {
  if (request.season === undefined || request.episode === undefined) return true;
  const s = pad2(request.season);
  const e = pad2(request.episode);
  const patterns = [
    new RegExp(`s${s}\\s*e${e}`, 'i'),
    new RegExp(`${request.season}x${e}`, 'i'),
    new RegExp(`\\b${s}${e}\\b`),
  ];
  return patterns.some((p) => p.test(name));
}

export function createRealDebrid(apiKey: string): DebridClient {
  const client = got.extend({
    prefixUrl: BASE,
    headers: { authorization: `Bearer ${apiKey}` },
    timeout: { request: env.scrapeTimeoutMs },
    retry: { limit: 1 },
  });

  return {
    id: 'realdebrid',

    async checkCached(infoHashes: string[]): Promise<Set<string>> {
      const cached = new Set<string>();
      if (!infoHashes.length) return cached;
      try {
        // Batched instant-availability lookup.
        const path = infoHashes.map((h) => h.toLowerCase()).join('/');
        const data = await client
          .get(`torrents/instantAvailability/${path}`)
          .json<Record<string, unknown>>();
        for (const hash of infoHashes) {
          const entry = data[hash.toLowerCase()] as Record<string, unknown> | undefined;
          // A non-empty provider map means at least one cached variant exists.
          if (entry && Object.values(entry).some((v) => Array.isArray(v) && v.length)) {
            cached.add(hash.toLowerCase());
          }
        }
      } catch {
        // Treat as nothing cached on failure.
      }
      return cached;
    },

    async resolve(infoHash, magnet, request, fileIdx): Promise<string | undefined> {
      try {
        const uri = magnet ?? `magnet:?xt=urn:btih:${infoHash}`;
        const added = await client
          .post('torrents/addMagnet', { form: { magnet: uri } })
          .json<{ id: string }>();

        const info = await client
          .get(`torrents/info/${added.id}`)
          .json<{ files: Array<{ id: number; path: string; bytes: number }> }>();

        const videoFiles = info.files.filter((f) => VIDEO_EXT.test(f.path));
        let chosen =
          videoFiles.find((f) => matchesEpisode(f.path, request)) ??
          (fileIdx !== undefined ? info.files[fileIdx] : undefined) ??
          // Default to the largest video file.
          videoFiles.sort((a, b) => b.bytes - a.bytes)[0];
        if (!chosen) chosen = info.files.sort((a, b) => b.bytes - a.bytes)[0];
        if (!chosen) return undefined;

        await client.post(`torrents/selectFiles/${added.id}`, {
          form: { files: String(chosen.id) },
        });

        const final = await client
          .get(`torrents/info/${added.id}`)
          .json<{ links: string[] }>();
        const link = final.links[0];
        if (!link) return undefined;

        const unrestricted = await client
          .post('unrestrict/link', { form: { link } })
          .json<{ download: string }>();
        return unrestricted.download;
      } catch {
        return undefined;
      }
    },
  };
}
