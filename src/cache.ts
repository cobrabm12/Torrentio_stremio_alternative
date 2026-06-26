/**
 * Tiny TTL cache wrapper around lru-cache with a coalescing helper so that
 * concurrent requests for the same key share a single in-flight computation
 * (avoids thundering-herd scraping).
 */

import { LRUCache } from 'lru-cache';
import { env } from './config/env.js';

// lru-cache requires the value type to be non-nullable; we only ever store
// objects/arrays so a `{}` constraint is fine and callers cast on the way out.
const store = new LRUCache<string, NonNullable<unknown>>({
  max: env.cacheMax,
  ttl: env.streamCacheTtl * 1000,
});

const inflight = new Map<string, Promise<unknown>>();

export function get<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function set<T extends NonNullable<unknown>>(
  key: string,
  value: T,
  ttlSeconds?: number,
): void {
  store.set(key, value, ttlSeconds ? { ttl: ttlSeconds * 1000 } : undefined);
}

/**
 * Return a cached value or compute it once. Concurrent callers for the same key
 * await the same promise.
 */
export async function remember<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = store.get(key);
  if (cached !== undefined) return cached as T;

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fn();
      if (value != null) store.set(key, value as NonNullable<unknown>, { ttl: ttlSeconds * 1000 });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}
