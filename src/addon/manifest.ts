/** Stremio addon manifest. */

import type { UserConfig } from '../config/userConfig.js';

export const ADDON_NAME = 'Torrent+';
export const ADDON_ID = 'community.torrentplus';

export function buildManifest(config?: UserConfig) {
  const configured = !!config && (config.providers.length > 0 || !!config.debrid);
  return {
    id: ADDON_ID,
    version: '0.1.0',
    name: ADDON_NAME,
    description:
      'Modern, fast torrent streams for Stremio with advanced quality, audio (Atmos/DTS-X/TrueHD), HDR and language filtering, plus debrid support.',
    logo: 'https://dl.strem.io/addon-logo.png',
    background: 'https://dl.strem.io/addon-background.jpg',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },
    // Echoed for debugging which config a manifest was generated from.
    ...(configured ? { _configured: true } : {}),
  };
}
