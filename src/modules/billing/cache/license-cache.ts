import { Injectable, Logger } from '@nestjs/common';

/**
 * LicenseCache – Redis-ready in-memory cache.
 *
 * Design:
 * - Interface is async so it can be swapped for Redis later without changing callers.
 * - Keys are namespaced: `license:{tenantId}:{kind}`
 * - TTL in seconds.
 *
 * To switch to Redis:
 *   1. Inject Redis client
 *   2. Replace Map with redis.get / redis.setex
 *   3. Keep the same public API
 */
@Injectable()
export class LicenseCache {
  private readonly logger = new Logger(LicenseCache.name);
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** For tests / admin */
  clear(): void {
    this.store.clear();
  }
}
