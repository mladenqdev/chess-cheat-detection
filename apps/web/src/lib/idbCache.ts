import type { KvCache } from '@ccm/core';
import { get, set } from 'idb-keyval';

interface Entry<T> {
  v: T;
  /** epoch ms after which the entry is stale; null = never expires */
  exp: number | null;
}

/**
 * IndexedDB-backed KvCache for the platform clients. Failures are swallowed:
 * a broken cache (private browsing, storage pressure) must never break fetching.
 */
export const idbCache: KvCache = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const entry = (await get(`ccm:${key}`)) as Entry<T> | undefined;
      if (!entry) return undefined;
      if (entry.exp !== null && Date.now() > entry.exp) return undefined;
      return entry.v;
    } catch {
      return undefined;
    }
  },
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const entry: Entry<T> = { v: value, exp: ttlMs !== undefined ? Date.now() + ttlMs : null };
      await set(`ccm:${key}`, entry);
    } catch {
      // ignore, cache is best-effort
    }
  },
};
