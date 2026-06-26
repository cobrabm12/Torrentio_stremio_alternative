import type { MediaRequest } from '../types.js';

export interface DebridClient {
  id: string;
  /**
   * Given a list of infoHashes, return the subset the service already has
   * cached (instantly streamable). Should resolve to an empty set on error.
   */
  checkCached(infoHashes: string[]): Promise<Set<string>>;
  /**
   * Resolve a single torrent to a direct, playable HTTP url. `request` carries
   * season/episode so the right file can be picked from multi-file torrents.
   */
  resolve(
    infoHash: string,
    magnet: string | undefined,
    request: MediaRequest,
    fileIdx?: number,
  ): Promise<string | undefined>;
}
