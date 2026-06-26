/** Heuristics for recognising season / complete-series packs from a title. */

import type { MediaRequest } from '../types.js';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Returns true when `title` looks like a multi-episode pack for the requested
 * series/season rather than a single episode. Used to flag results so the file
 * picker (debrid or .torrent file list) selects the right episode later.
 */
export function detectSeasonPack(title: string, request: MediaRequest): boolean {
  if (request.type !== 'series') return false;
  const t = title.toLowerCase();

  // An explicit single-episode marker means it is NOT a pack.
  if (request.season !== undefined && request.episode !== undefined) {
    const single = new RegExp(`s${pad2(request.season)}\\s*e${pad2(request.episode)}`, 'i');
    if (single.test(title)) return false;
  }
  // A specific SxxExx for *some* episode also means single-episode.
  if (/s\d{1,2}\s*e\d{1,3}/i.test(title)) return false;

  if (/\b(complete|full)\b.*\b(series|season)\b/.test(t)) return true;
  if (/\bcomplete\b/.test(t) && /\bseason\b/.test(t)) return true;
  if (/\bseason\s*\d{1,2}\b/.test(t)) return true;
  // Bare SxxE? season folder, e.g. "Show S03" or "Show S01-S05".
  if (request.season !== undefined && new RegExp(`s${pad2(request.season)}\\b`, 'i').test(title))
    return true;
  if (/\bs\d{1,2}\s*-\s*s?\d{1,2}\b/i.test(title)) return true;
  return false;
}
