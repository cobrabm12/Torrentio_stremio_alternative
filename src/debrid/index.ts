/** Debrid factory: build a client from a user's debrid config. */

import type { UserConfig } from '../config/userConfig.js';
import { createAllDebrid } from './alldebrid.js';
import { createPremiumize } from './premiumize.js';
import { createRealDebrid } from './realdebrid.js';
import type { DebridClient } from './types.js';

export type { DebridClient } from './types.js';

export const DEBRID_PROVIDERS = [
  { id: 'realdebrid', name: 'RealDebrid' },
  { id: 'alldebrid', name: 'AllDebrid' },
  { id: 'premiumize', name: 'Premiumize' },
] as const;

export function createDebrid(config: UserConfig): DebridClient | undefined {
  if (!config.debrid?.apiKey) return undefined;
  switch (config.debrid.provider) {
    case 'realdebrid':
      return createRealDebrid(config.debrid.apiKey);
    case 'alldebrid':
      return createAllDebrid(config.debrid.apiKey);
    case 'premiumize':
      return createPremiumize(config.debrid.apiKey);
    default:
      return undefined;
  }
}
