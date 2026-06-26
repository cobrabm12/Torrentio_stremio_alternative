/**
 * Persistent lazy cache (SQLite).
 *
 * The "lazy/hybrid" model: instead of pre-scraping the whole torrent universe
 * like Torrentio's backend, we scrape on demand and persist the result. Popular
 * titles are requested repeatedly, so after the first lookup every subsequent
 * request (for any user) is served instantly from disk. The DB grows only with
 * actual usage, keeping it to MBs rather than tens of GBs.
 */

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';
import type { RawTorrent, TorrentFile } from '../types.js';

fs.mkdirSync(env.dataDir, { recursive: true });
const db = new Database(path.join(env.dataDir, 'torrentplus.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS media (
    media_key  TEXT PRIMARY KEY,
    torrents   TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS filelists (
    info_hash  TEXT PRIMARY KEY,
    files      TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

const stmtGetMedia = db.prepare<[string]>('SELECT torrents, updated_at FROM media WHERE media_key = ?');
const stmtSetMedia = db.prepare<[string, string, number]>(
  'INSERT INTO media (media_key, torrents, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(media_key) DO UPDATE SET torrents = excluded.torrents, updated_at = excluded.updated_at',
);
const stmtGetFiles = db.prepare<[string]>('SELECT files, updated_at FROM filelists WHERE info_hash = ?');
const stmtSetFiles = db.prepare<[string, string, number]>(
  'INSERT INTO filelists (info_hash, files, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(info_hash) DO UPDATE SET files = excluded.files, updated_at = excluded.updated_at',
);
const stmtCountMedia = db.prepare('SELECT COUNT(*) AS n FROM media');
const stmtCountFiles = db.prepare('SELECT COUNT(*) AS n FROM filelists');

export interface StoredMedia {
  torrents: RawTorrent[];
  updatedAt: number;
  /** Seconds since the entry was last refreshed. */
  ageSeconds: number;
  fresh: boolean;
}

export function getMedia(key: string): StoredMedia | undefined {
  const row = stmtGetMedia.get(key) as { torrents: string; updated_at: number } | undefined;
  if (!row) return undefined;
  const ageSeconds = Math.floor(Date.now() / 1000) - row.updated_at;
  return {
    torrents: JSON.parse(row.torrents) as RawTorrent[],
    updatedAt: row.updated_at,
    ageSeconds,
    fresh: ageSeconds < env.mediaTtl,
  };
}

export function setMedia(key: string, torrents: RawTorrent[]): void {
  stmtSetMedia.run(key, JSON.stringify(torrents), Math.floor(Date.now() / 1000));
}

export function getFileList(infoHash: string): TorrentFile[] | undefined {
  const row = stmtGetFiles.get(infoHash.toLowerCase()) as
    | { files: string; updated_at: number }
    | undefined;
  if (!row) return undefined;
  if (Math.floor(Date.now() / 1000) - row.updated_at > env.fileListTtl) return undefined;
  return JSON.parse(row.files) as TorrentFile[];
}

export function setFileList(infoHash: string, files: TorrentFile[]): void {
  stmtSetFiles.run(infoHash.toLowerCase(), JSON.stringify(files), Math.floor(Date.now() / 1000));
}

export function stats(): { media: number; fileLists: number } {
  return {
    media: (stmtCountMedia.get() as { n: number }).n,
    fileLists: (stmtCountFiles.get() as { n: number }).n,
  };
}
