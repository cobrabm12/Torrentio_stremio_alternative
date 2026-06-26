/**
 * Turn raw scraper output into a filtered, scored and sorted list of
 * ProcessedTorrents according to the user's configuration.
 */

import type { UserConfig } from '../config/userConfig.js';
import { parseTitle } from '../parser/titleParser.js';
import type { ParsedAttributes, ProcessedTorrent, RawTorrent, Resolution } from '../types.js';

const RESOLUTION_SCORE: Record<Resolution, number> = {
  '2160p': 5000,
  '1080p': 4000,
  '720p': 3000,
  '576p': 2200,
  '480p': 2000,
  '360p': 1000,
  SCR: 600,
  CAM: 300,
  unknown: 1500,
};

const AUDIO_SCORE: Partial<Record<string, number>> = {
  Atmos: 400,
  'DTS-X': 380,
  TrueHD: 360,
  'DTS-HD': 340,
  DTS: 220,
  EAC3: 200,
  AC3: 160,
  FLAC: 180,
  AAC: 120,
  OPUS: 110,
  MP3: 60,
  PCM: 140,
};

const SOURCE_SCORE: Partial<Record<string, number>> = {
  REMUX: 900,
  BluRay: 700,
  'WEB-DL': 600,
  WEBRip: 450,
  BDRip: 500,
  HDRip: 300,
  HDTV: 250,
  DVDRip: 150,
  TS: 50,
  CAM: 20,
};

const GB = 1024 ** 3;

function intersects(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

/** Decide whether a torrent passes the user's hard filters. */
function passesFilters(attrs: ParsedAttributes, raw: RawTorrent, config: UserConfig): boolean {
  if (config.qualities.length && !config.qualities.includes(attrs.resolution)) return false;
  if (config.videoCodecs.length && (!attrs.videoCodec || !config.videoCodecs.includes(attrs.videoCodec)))
    return false;
  if (config.audioCodecs.length && !intersects(attrs.audioCodecs, config.audioCodecs)) return false;
  if (config.audioChannels.length && (!attrs.audioChannels || !config.audioChannels.includes(attrs.audioChannels)))
    return false;
  if (config.hdrOnly && (attrs.hdr.length === 0 || attrs.hdr.every((h) => h === 'SDR'))) return false;
  if (config.strictLanguage && config.languages.length && !intersects(attrs.languages, config.languages))
    return false;
  if (config.minSeeders && (raw.seeders ?? 0) < config.minSeeders) return false;
  if (config.minSizeGb && raw.size && raw.size < config.minSizeGb * GB) return false;
  if (config.maxSizeGb && raw.size && raw.size > config.maxSizeGb * GB) return false;
  return true;
}

function computeScore(attrs: ParsedAttributes, raw: RawTorrent, config: UserConfig): number {
  let score = RESOLUTION_SCORE[attrs.resolution] ?? 0;
  if (attrs.source) score += SOURCE_SCORE[attrs.source] ?? 0;
  for (const codec of attrs.audioCodecs) score += AUDIO_SCORE[codec] ?? 0;
  if (attrs.audioChannels === '7.1') score += 80;
  else if (attrs.audioChannels === '5.1') score += 50;
  if (attrs.hdr.includes('DV')) score += 220;
  if (attrs.hdr.includes('HDR10+')) score += 180;
  else if (attrs.hdr.some((h) => h.startsWith('HDR'))) score += 120;
  if (attrs.videoCodec === 'HEVC' || attrs.videoCodec === 'AV1') score += 60;
  if (attrs.flags.includes('REMUX')) score += 150;
  if (attrs.flags.includes('Proper')) score += 30;

  // Preferred-language boost (soft, unless strictLanguage already filtered).
  if (config.languages.length && intersects(attrs.languages, config.languages)) score += 300;

  // Health: log-scaled seeders so a few seeders matter but don't dominate.
  const seeders = raw.seeders ?? 0;
  score += Math.min(600, Math.round(Math.log2(seeders + 1) * 60));

  return score;
}

export function process(raws: RawTorrent[], config: UserConfig): ProcessedTorrent[] {
  const processed: ProcessedTorrent[] = [];
  for (const raw of raws) {
    if (!raw.infoHash) continue;
    const attrs = parseTitle(raw.title);
    if (!passesFilters(attrs, raw, config)) continue;
    processed.push({
      ...raw,
      infoHash: raw.infoHash,
      attrs,
      score: computeScore(attrs, raw, config),
    });
  }

  processed.sort((a, b) => {
    switch (config.sort) {
      case 'seeders':
        return (b.seeders ?? 0) - (a.seeders ?? 0) || b.score - a.score;
      case 'size':
        return (b.size ?? 0) - (a.size ?? 0) || b.score - a.score;
      case 'quality':
      default:
        return b.score - a.score || (b.seeders ?? 0) - (a.seeders ?? 0);
    }
  });

  return processed.slice(0, config.maxResults || 30);
}
