import "server-only";
import { Redis } from "@upstash/redis";
import { redisEnv } from "./db";

/*
 * Short-lived answers from other services (forecasts, climate averages,
 * geocoder hits), so a trip's weather is asked for once, not once per phone.
 * Redis in production, a Map in tests and local dev. Keys share the `cache:`
 * prefix with the trip map's geocoder cache.
 */

export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export class MemoryCache implements KeyValueCache {
  private entries = new Map<string, { value: string; until: number }>();
  constructor(private now: () => number = Date.now) {}
  async get(key: string) {
    const e = this.entries.get(key);
    return e && e.until > this.now() ? e.value : null;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.entries.set(key, { value, until: this.now() + ttlSeconds * 1000 });
  }
}

class RedisCache implements KeyValueCache {
  constructor(private redis: Redis) {}
  async get(key: string) {
    const v = await this.redis.get<string>(`cache:${key}`);
    return v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(`cache:${key}`, value, { ex: ttlSeconds });
  }
}

const g = globalThis as unknown as { kvCache?: KeyValueCache };

export function getCache(): KeyValueCache {
  if (g.kvCache) return g.kvCache;
  const env = redisEnv();
  g.kvCache = env ? new RedisCache(new Redis({ ...env, automaticDeserialization: false })) : new MemoryCache();
  return g.kvCache;
}

/** Tests swap in a fresh cache. */
export function setCacheForTests(cache: KeyValueCache | undefined) {
  g.kvCache = cache;
}
