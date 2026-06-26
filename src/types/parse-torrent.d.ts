declare module 'parse-torrent' {
  interface TorrentFileEntry {
    name?: string;
    path?: string;
    length?: number;
    offset?: number;
  }
  interface ParsedTorrent {
    infoHash?: string;
    name?: string;
    length?: number;
    files?: TorrentFileEntry[];
  }
  /** Accepts a .torrent Buffer/magnet/etc. and resolves to parsed metadata. */
  export default function parseTorrent(input: Buffer | string | Uint8Array): Promise<ParsedTorrent>;
}
