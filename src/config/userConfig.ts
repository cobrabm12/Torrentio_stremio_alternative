/**
 * User configuration: the per-install settings encoded into the addon URL.
 *
 * Stremio addons are stateless, so all user preferences live in the install
 * URL. We encode them as URL-safe base64 JSON in a single path segment, e.g.
 *   /<config>/manifest.json
 *   /<config>/stream/movie/tt0111161.json
 */

import type {
  AudioChannels,
  AudioCodec,
  Resolution,
  VideoCodec,
} from '../types.js';

export type SortStrategy = 'quality' | 'seeders' | 'size';
export type DebridProvider = 'realdebrid' | 'alldebrid' | 'premiumize';

export interface UserConfig {
  /** Enabled scraper ids. Empty = all built-in providers. */
  providers: string[];
  /** Allowed resolutions. Empty = all. */
  qualities: Resolution[];
  /** Allowed audio codecs. Empty = all. */
  audioCodecs: AudioCodec[];
  /** Allowed channel layouts. Empty = all. */
  audioChannels: AudioChannels[];
  /** Allowed video codecs. Empty = all. */
  videoCodecs: VideoCodec[];
  /** Require at least one HDR/DV format. */
  hdrOnly: boolean;
  /** Preferred languages (results matching these are boosted, others kept). */
  languages: string[];
  /** Hard-drop results whose language set does not intersect `languages`. */
  strictLanguage: boolean;
  /** Minimum seeders to keep a result. */
  minSeeders: number;
  /** Size bounds in GB (0 = unbounded). */
  minSizeGb: number;
  maxSizeGb: number;
  /** Max number of streams returned per request. */
  maxResults: number;
  sort: SortStrategy;
  /** Optional debrid integration. */
  debrid?: {
    provider: DebridProvider;
    apiKey: string;
  };
}

export const DEFAULT_CONFIG: UserConfig = {
  providers: [],
  qualities: [],
  audioCodecs: [],
  audioChannels: [],
  videoCodecs: [],
  hdrOnly: false,
  languages: [],
  strictLanguage: false,
  minSeeders: 0,
  minSizeGb: 0,
  maxSizeGb: 0,
  maxResults: 30,
  sort: 'quality',
};

function toUrlSafe(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return s.replace(/-/g, '+').replace(/_/g, '/') + pad;
}

/** Encode a config into a single URL-safe path segment. */
export function encodeConfig(config: UserConfig): string {
  const json = JSON.stringify(config);
  return toUrlSafe(Buffer.from(json, 'utf8').toString('base64'));
}

/** Decode a path segment back into a config, falling back to defaults. */
export function decodeConfig(segment: string | undefined): UserConfig {
  if (!segment || segment === 'manifest.json') return { ...DEFAULT_CONFIG };
  try {
    const json = Buffer.from(fromUrlSafe(segment), 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Partial<UserConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
