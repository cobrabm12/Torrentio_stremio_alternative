/**
 * Resolve a torrent's file list (for season packs) without downloading data.
 *
 * We fetch the .torrent metadata from public caches and parse it, so we can
 * pick the exact episode file inside a pack and hand Stremio a `fileIdx` for
 * peer-to-peer playback. Results are persisted so we only do this once per
 * infoHash.
 */

import parseTorrent from 'parse-torrent';
import { getBuffer } from '../http.js';
import { getFileList, setFileList } from '../store/db.js';
import type { MediaRequest, TorrentFile } from '../types.js';

const VIDEO_EXT = /\.(mkv|mp4|avi|mov|m4v|wmv|flv|ts|webm)$/i;

const TORRENT_CACHES = (hash: string): string[] => [
  `https://itorrents.org/torrent/${hash.toUpperCase()}.torrent`,
  `https://torrage.info/torrent.php?h=${hash.toLowerCase()}`,
];

interface ParsedTorrentLike {
  files?: Array<{ name?: string; path?: string; length?: number }>;
}

export async function fetchFileList(infoHash: string): Promise<TorrentFile[] | undefined> {
  const cached = getFileList(infoHash);
  if (cached) return cached;

  for (const url of TORRENT_CACHES(infoHash)) {
    try {
      const buf = await getBuffer(url);
      const parsed = (await parseTorrent(buf)) as ParsedTorrentLike;
      const files = (parsed.files ?? []).map((f, index) => ({
        index,
        name: f.path ?? f.name ?? `file-${index}`,
        size: f.length ?? 0,
      }));
      if (files.length) {
        setFileList(infoHash, files);
        return files;
      }
    } catch {
      // Try the next cache.
    }
  }
  return undefined;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Pick the file index matching the requested episode, preferring video files. */
export function pickEpisodeFile(
  files: TorrentFile[],
  request: MediaRequest,
): TorrentFile | undefined {
  if (request.season === undefined || request.episode === undefined) return undefined;
  const s = pad2(request.season);
  const e = pad2(request.episode);
  const patterns = [
    new RegExp(`s${s}\\s*e${e}`, 'i'),
    new RegExp(`${request.season}x${e}`, 'i'),
    new RegExp(`\\bep?\\s*${e}\\b`, 'i'),
    new RegExp(`\\b${s}${e}\\b`),
  ];
  const videos = files.filter((f) => VIDEO_EXT.test(f.name));
  for (const p of patterns) {
    const match = videos.filter((f) => p.test(f.name)).sort((a, b) => b.size - a.size)[0];
    if (match) return match;
  }
  return undefined;
}

/** Resolve the wanted episode file index inside a pack, caching the result. */
export async function resolvePackFileIdx(
  infoHash: string,
  request: MediaRequest,
): Promise<number | undefined> {
  if (request.type !== 'series') return undefined;
  const files = await fetchFileList(infoHash);
  if (!files) return undefined;
  return pickEpisodeFile(files, request)?.index;
}
