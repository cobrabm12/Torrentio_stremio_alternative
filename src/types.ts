/**
 * Shared domain types for the addon.
 */

export type StreamType = 'movie' | 'series';

/** A request resolved from a Stremio stream lookup. */
export interface MediaRequest {
  type: StreamType;
  imdbId: string;
  /** Present only for series. */
  season?: number;
  episode?: number;
}

/** Resolved metadata for an IMDB id (from Cinemeta). */
export interface MediaMeta {
  imdbId: string;
  type: StreamType;
  title: string;
  year?: number;
  /** Alternate / original titles useful for matching scraper results. */
  aliases: string[];
}

/** Raw result returned by a scraper before parsing/enrichment. */
export interface RawTorrent {
  /** Human readable release title, e.g. "Movie.2021.2160p.WEB-DL.DDP5.1.x265-GROUP". */
  title: string;
  /** 40-char hex infoHash (lower-case) when known. */
  infoHash?: string;
  /** Full magnet URI when available (infoHash is derived from it). */
  magnet?: string;
  /** Size in bytes when known. */
  size?: number;
  seeders?: number;
  leechers?: number;
  /** Which provider produced this result. */
  source: string;
  /** For multi-file torrents (series packs): the index of the wanted file, if known. */
  fileIdx?: number;
}

/** Parsed quality/audio/language attributes extracted from a release title. */
export interface ParsedAttributes {
  resolution: Resolution;
  source?: VideoSource;
  videoCodec?: VideoCodec;
  hdr: HdrFormat[];
  bitDepth?: 8 | 10 | 12;
  audioCodecs: AudioCodec[];
  audioChannels?: AudioChannels;
  languages: string[];
  /** 3D, remux, extended/director's cut, etc. */
  flags: string[];
  group?: string;
}

export type Resolution =
  | '2160p'
  | '1080p'
  | '720p'
  | '576p'
  | '480p'
  | '360p'
  | 'CAM'
  | 'SCR'
  | 'unknown';

export type VideoSource =
  | 'REMUX'
  | 'BluRay'
  | 'WEB-DL'
  | 'WEBRip'
  | 'HDRip'
  | 'BDRip'
  | 'DVDRip'
  | 'HDTV'
  | 'TS'
  | 'CAM';

export type VideoCodec = 'AV1' | 'HEVC' | 'AVC' | 'XviD' | 'VP9';

export type HdrFormat = 'DV' | 'HDR10+' | 'HDR10' | 'HDR' | 'HLG' | 'SDR';

export type AudioCodec =
  | 'Atmos'
  | 'TrueHD'
  | 'DTS-HD'
  | 'DTS-X'
  | 'DTS'
  | 'EAC3'
  | 'AC3'
  | 'AAC'
  | 'FLAC'
  | 'OPUS'
  | 'MP3'
  | 'PCM';

export type AudioChannels = '1.0' | '2.0' | '5.1' | '6.1' | '7.1';

/** A fully processed torrent ready to be turned into a Stremio stream. */
export interface ProcessedTorrent extends RawTorrent {
  infoHash: string;
  attrs: ParsedAttributes;
  /** Computed relevance/quality score used for sorting. */
  score: number;
}
