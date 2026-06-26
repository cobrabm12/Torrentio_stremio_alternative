/**
 * Convert ProcessedTorrents into Stremio stream objects.
 *
 * Stremio renders streams that expose either a `url` (resolved http link, e.g.
 * via debrid) or `infoHash`+`fileIdx` (peer-to-peer). We build a readable,
 * emoji-tagged title that surfaces the resolution/audio/HDR attributes the
 * user filtered on.
 */

import type { ProcessedTorrent } from '../types.js';

export interface StremioStream {
  name: string;
  title: string;
  infoHash?: string;
  fileIdx?: number;
  url?: string;
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    filename?: string;
  };
}

function formatSize(bytes?: number): string | undefined {
  if (!bytes) return undefined;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

/** Compact attribute line, e.g. "💿 BluRay · 🎞 HEVC · 🔊 Atmos 7.1 · 🌈 DV". */
function attributeLine(t: ProcessedTorrent): string {
  const a = t.attrs;
  const parts: string[] = [];
  if (a.source) parts.push(`💿 ${a.source}`);
  if (a.videoCodec) parts.push(`🎞 ${a.videoCodec}`);
  if (a.audioCodecs.length) {
    const audio = a.audioCodecs[0] + (a.audioChannels ? ` ${a.audioChannels}` : '');
    parts.push(`🔊 ${audio}`);
  }
  if (a.hdr.length && !a.hdr.every((h) => h === 'SDR')) {
    parts.push(`🌈 ${a.hdr.filter((h) => h !== 'SDR').join('/')}`);
  }
  if (a.languages.length) parts.push(`🗣 ${a.languages.slice(0, 3).join('/')}`);
  return parts.join(' · ');
}

export function toStream(t: ProcessedTorrent, addonName: string): StremioStream {
  const size = formatSize(t.size);
  const metaParts: string[] = [];
  if (size) metaParts.push(`📦 ${size}`);
  if (t.seeders !== undefined) metaParts.push(`👤 ${t.seeders}`);
  metaParts.push(`⚙️ ${t.source}`);

  const attrLine = attributeLine(t);
  const title = [t.title, [attrLine, metaParts.join(' · ')].filter(Boolean).join('\n')]
    .filter(Boolean)
    .join('\n');

  return {
    name: `${addonName}\n${t.attrs.resolution}`,
    title,
    infoHash: t.infoHash,
    fileIdx: t.fileIdx,
    behaviorHints: {
      bingeGroup: `tta-${t.attrs.resolution}-${t.attrs.videoCodec ?? 'x'}`,
      notWebReady: true,
      filename: t.title,
    },
  };
}
