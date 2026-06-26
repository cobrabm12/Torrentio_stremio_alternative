/**
 * Release-title parser.
 *
 * Extracts structured quality/audio/language attributes from a raw torrent
 * title. This is intentionally richer than Torrentio's parser: it recognises
 * detailed audio codecs (Atmos, DTS-X, TrueHD...), channel layouts, HDR
 * variants (Dolby Vision, HDR10+), bit depth and many languages, which powers
 * the addon's advanced filtering and sorting.
 */

import type {
  AudioChannels,
  AudioCodec,
  HdrFormat,
  ParsedAttributes,
  Resolution,
  VideoCodec,
  VideoSource,
} from '../types.js';

/** Normalise separators so token regexes can rely on spaces. */
function normalise(title: string): string {
  // Keep `+` so HDR10+ / DD+ survive; collapse every other separator to space.
  return ` ${title.replace(/[._\-()\[\]{}]+/g, ' ').replace(/\s+/g, ' ')} `.toLowerCase();
}

function detectResolution(raw: string, t: string): Resolution {
  if (/\b(2160p|4k|uhd)\b/.test(t) || /\b3840x\d{3,4}\b/.test(t)) return '2160p';
  if (/\b1080[pi]\b/.test(t) || /\b1920x\d{3,4}\b/.test(t)) return '1080p';
  if (/\b720[pi]\b/.test(t) || /\b1280x\d{3,4}\b/.test(t)) return '720p';
  if (/\b576[pi]\b/.test(t)) return '576p';
  if (/\b480[pi]\b/.test(t)) return '480p';
  if (/\b360[pi]\b/.test(t)) return '360p';
  if (/\b(cam(rip)?|hdcam)\b/.test(t)) return 'CAM';
  if (/\b(scr|screener|dvdscr)\b/.test(t)) return 'SCR';
  // Fall back on common source hints that imply SD.
  if (/\b(dvdrip|dvd)\b/.test(t)) return '480p';
  void raw;
  return 'unknown';
}

function detectSource(t: string): VideoSource | undefined {
  if (/\bremux\b/.test(t)) return 'REMUX';
  if (/\b(bluray|blu ray|bdmv)\b/.test(t)) return 'BluRay';
  if (/\bbdrip\b/.test(t)) return 'BDRip';
  if (/\bweb[ -]?dl\b/.test(t)) return 'WEB-DL';
  if (/\bweb[ -]?rip\b/.test(t) || /\bwebrip\b/.test(t) || /\bweb\b/.test(t)) return 'WEBRip';
  if (/\bhdrip\b/.test(t)) return 'HDRip';
  if (/\bdvdrip\b/.test(t)) return 'DVDRip';
  if (/\bhdtv\b/.test(t)) return 'HDTV';
  if (/\b(ts|telesync)\b/.test(t)) return 'TS';
  if (/\bcam\b/.test(t)) return 'CAM';
  return undefined;
}

function detectVideoCodec(t: string): VideoCodec | undefined {
  if (/\bav1\b/.test(t)) return 'AV1';
  if (/\b(x265|h ?265|hevc)\b/.test(t)) return 'HEVC';
  if (/\b(x264|h ?264|avc)\b/.test(t)) return 'AVC';
  if (/\bvp9\b/.test(t)) return 'VP9';
  if (/\b(xvid|divx)\b/.test(t)) return 'XviD';
  return undefined;
}

function detectHdr(t: string): { hdr: HdrFormat[]; bitDepth?: 8 | 10 | 12 } {
  const hdr: HdrFormat[] = [];
  if (/\b(dolby ?vision|dovi|\bdv\b)\b/.test(t)) hdr.push('DV');
  if (/\bhdr10\+/.test(t) || /\bhdr10plus\b/.test(t)) hdr.push('HDR10+');
  else if (/\bhdr10\b/.test(t)) hdr.push('HDR10');
  if (/\bhlg\b/.test(t)) hdr.push('HLG');
  if (!hdr.length && /\bhdr\b/.test(t)) hdr.push('HDR');
  if (/\bsdr\b/.test(t)) hdr.push('SDR');

  let bitDepth: 8 | 10 | 12 | undefined;
  if (/\b12 ?bit\b/.test(t)) bitDepth = 12;
  else if (/\b10 ?bit\b/.test(t)) bitDepth = 10;
  else if (/\b8 ?bit\b/.test(t)) bitDepth = 8;
  else if (hdr.length && !hdr.includes('SDR')) bitDepth = 10;

  return { hdr, bitDepth };
}

function detectAudioCodecs(t: string): AudioCodec[] {
  const codecs: AudioCodec[] = [];
  const add = (c: AudioCodec) => {
    if (!codecs.includes(c)) codecs.push(c);
  };
  if (/\b(atmos|dolby ?atmos)\b/.test(t)) add('Atmos');
  if (/\b(truehd|true ?hd)\b/.test(t)) add('TrueHD');
  if (/\bdts[ -]?x\b/.test(t)) add('DTS-X');
  if (/\bdts[ -]?hd( ?ma)?\b/.test(t)) add('DTS-HD');
  if (/\bdts\b/.test(t) && !codecs.includes('DTS-HD') && !codecs.includes('DTS-X')) add('DTS');
  if (/\b(eac3|e ?ac ?3|ddp\d*|dd\+|dolby ?digital ?plus)\b/.test(t)) add('EAC3');
  if (/\b(ac3|dd5|dd2|dolby ?digital)\b/.test(t) && !codecs.includes('EAC3')) add('AC3');
  if (/\b(aac)\b/.test(t)) add('AAC');
  if (/\bflac\b/.test(t)) add('FLAC');
  if (/\bopus\b/.test(t)) add('OPUS');
  if (/\bmp3\b/.test(t)) add('MP3');
  if (/\b(pcm|lpcm)\b/.test(t)) add('PCM');
  return codecs;
}

function detectChannels(t: string): AudioChannels | undefined {
  // `.` was normalised to a space, so "7.1" arrives as "7 1".
  if (/\b7[ .]1\b/.test(t) || /\b8ch\b/.test(t)) return '7.1';
  if (/\b6[ .]1\b/.test(t)) return '6.1';
  if (/\b5[ .]1\b/.test(t) || /\b6ch\b/.test(t) || /\bddp?\d?[ .]?5[ .]1\b/.test(t)) return '5.1';
  if (/\b2[ .]0\b/.test(t) || /\b2ch\b/.test(t) || /\bstereo\b/.test(t)) return '2.0';
  if (/\b1[ .]0\b/.test(t) || /\bmono\b/.test(t)) return '1.0';
  return undefined;
}

/** Map of language keyword -> ISO-ish display label. Order matters for `multi`. */
const LANGUAGE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(multi|multilang|multiaudio|dual ?audio)\b/, 'Multi'],
  [/\b(english|eng)\b/, 'English'],
  [/\b(french|french|vff|vostfr|truefrench|vf)\b/, 'French'],
  [/\b(spanish|espanol|castellano|latino|esp)\b/, 'Spanish'],
  [/\b(german|deutsch|ger)\b/, 'German'],
  [/\b(italian|ita)\b/, 'Italian'],
  [/\b(russian|rus)\b/, 'Russian'],
  [/\b(portuguese|portugues|dublado|leg)\b/, 'Portuguese'],
  [/\b(hindi|hin)\b/, 'Hindi'],
  [/\b(tamil|tam)\b/, 'Tamil'],
  [/\b(telugu|tel)\b/, 'Telugu'],
  [/\b(korean|kor)\b/, 'Korean'],
  [/\b(japanese|jpn|jap)\b/, 'Japanese'],
  [/\b(chinese|mandarin|cantonese|chs|cht)\b/, 'Chinese'],
  [/\b(arabic|ara)\b/, 'Arabic'],
  [/\b(romanian|romana|ron|rum)\b/, 'Romanian'],
  [/\b(dutch|nl)\b/, 'Dutch'],
  [/\b(polish|pol)\b/, 'Polish'],
  [/\b(turkish|tur)\b/, 'Turkish'],
  [/\b(swedish|swe)\b/, 'Swedish'],
  [/\b(danish|dan)\b/, 'Danish'],
  [/\b(norwegian|nor)\b/, 'Norwegian'],
  [/\b(finnish|fin)\b/, 'Finnish'],
  [/\b(greek|gre)\b/, 'Greek'],
  [/\b(hebrew|heb)\b/, 'Hebrew'],
  [/\b(thai)\b/, 'Thai'],
  [/\b(vietnamese|vie)\b/, 'Vietnamese'],
  [/\b(ukrainian|ukr)\b/, 'Ukrainian'],
  [/\b(czech|cze)\b/, 'Czech'],
  [/\b(hungarian|hun)\b/, 'Hungarian'],
];

function detectLanguages(t: string): string[] {
  const found: string[] = [];
  for (const [re, label] of LANGUAGE_PATTERNS) {
    if (re.test(t) && !found.includes(label)) found.push(label);
  }
  return found;
}

function detectFlags(t: string): string[] {
  const flags: string[] = [];
  if (/\bremux\b/.test(t)) flags.push('REMUX');
  if (/\b3d\b/.test(t)) flags.push('3D');
  if (/\b(extended|ext cut)\b/.test(t)) flags.push('Extended');
  if (/\b(directors? cut|dc)\b/.test(t)) flags.push("Director's Cut");
  if (/\b(imax)\b/.test(t)) flags.push('IMAX');
  if (/\b(unrated)\b/.test(t)) flags.push('Unrated');
  if (/\b(proper|repack)\b/.test(t)) flags.push('Proper');
  if (/\b(hybrid)\b/.test(t)) flags.push('Hybrid');
  if (/\b(complete|season|s\d{1,2}(?!e)|pack)\b/.test(t)) flags.push('Pack');
  return flags;
}

/** Extract a release group, typically the trailing `-GROUP` token. */
function detectGroup(raw: string): string | undefined {
  const m = raw.match(/-([A-Za-z0-9]{2,})(?:\.[a-z0-9]{2,4})?\s*$/);
  if (m && !/^(?:web|dl|rip|x264|x265)$/i.test(m[1])) return m[1];
  return undefined;
}

export function parseTitle(rawTitle: string): ParsedAttributes {
  const t = normalise(rawTitle);
  const { hdr, bitDepth } = detectHdr(t);
  return {
    resolution: detectResolution(rawTitle, t),
    source: detectSource(t),
    videoCodec: detectVideoCodec(t),
    hdr,
    bitDepth,
    audioCodecs: detectAudioCodecs(t),
    audioChannels: detectChannels(t),
    languages: detectLanguages(t),
    flags: detectFlags(t),
    group: detectGroup(rawTitle),
  };
}
