import type { MediaMeta, MediaRequest, RawTorrent } from '../types.js';

export interface ScrapeContext {
  request: MediaRequest;
  meta: MediaMeta;
}

/** A torrent source. Implementations should be resilient and never throw. */
export interface Scraper {
  /** Stable id used in config (provider filtering). */
  id: string;
  /** Human readable name shown in the configure UI. */
  name: string;
  /** Which media types this scraper can serve. */
  supports: (type: MediaRequest['type']) => boolean;
  /** Return raw torrents; should resolve to [] on any error. */
  scrape: (ctx: ScrapeContext) => Promise<RawTorrent[]>;
}
