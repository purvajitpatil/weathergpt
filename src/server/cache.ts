/**
 * WeatherGPT — Cache layer.
 *
 * Primary: Redis (shared across instances, supports rate limiting).
 * Fallback: in-memory store (single instance) when Redis is unreachable.
 * The /health endpoint reports which backend is active.
 */
import Redis from "ioredis";
import { logger } from "./logger";

export interface CacheBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** used for atomic rate limiting when possible */
  incr(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  isRedis(): boolean;
}

class MemoryCache implements CacheBackend {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const cur = this.store.get(key);
    if (!cur || Date.now() > cur.expiresAt) {
      this.store.set(key, { value: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
      return 1;
    }
    const next = parseInt(cur.value, 10) + 1;
    this.store.set(key, { value: String(next), expiresAt: cur.expiresAt });
    return next;
  }
  async ping(): Promise<boolean> {
    return true;
  }
  isRedis(): boolean {
    return false;
  }
}

class RedisCache implements CacheBackend {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }
  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const piped = this.redis.multi().incr(key).expire(key, ttlSeconds, "NX");
    const results = await piped.exec();
    return results?.[0][1] as number;
  }
  async ping(): Promise<boolean> {
    const pong = await this.redis.ping();
    return pong === "PONG";
  }
  isRedis(): boolean {
    return true;
  }
}

export class CacheService {
  private backend: CacheBackend;
  private redisClient: Redis | null = null;

  constructor(redisUrl?: string) {
    if (redisUrl) {
      this.redisClient = new Redis(redisUrl, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 3_000,
        retryStrategy: () => null, // do not auto-retry; we degrade instead
      });
      this.redisClient.on("error", (err) => {
        logger.warn("Redis unavailable, using in-memory cache fallback", { error: err.message });
        this.backend = new MemoryCache();
      });
      this.backend = new RedisCache(this.redisClient);
      // fire-and-forget connect
      this.redisClient.connect().catch((err: Error) => {
        logger.warn("Redis connection failed, using in-memory cache fallback", { error: err.message });
        this.backend = new MemoryCache();
      });
    } else {
      this.backend = new MemoryCache();
      logger.info("No REDIS_URL configured — using in-memory cache (single instance)");
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.backend.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.backend.set(key, JSON.stringify(value), ttlSeconds);
    } catch {
      /* caching is best-effort */
    }
  }

  async invalidate(key: string): Promise<void> {
    try {
      await this.backend.del(key);
    } catch {
      /* best-effort */
    }
  }

  /** atomic increment for rate limiting */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    try {
      return await this.backend.incr(key, ttlSeconds);
    } catch {
      return 1; // allow under cache failure (fail-open for availability)
    }
  }

  async ping(): Promise<{ ok: boolean; backend: "redis" | "memory" }> {
    try {
      const ok = await this.backend.ping();
      return { ok, backend: this.backend.isRedis() ? "redis" : "memory" };
    } catch {
      return { ok: false, backend: "memory" };
    }
  }

  key = {
    current: (lat: number, lon: number) => `weather:${lat.toFixed(4)}:${lon.toFixed(4)}:current`,
    forecast: (lat: number, lon: number, days: number) => `forecast:${lat.toFixed(4)}:${lon.toFixed(4)}:${days}d`,
    aqi: (lat: number, lon: number) => `aqi:${lat.toFixed(4)}:${lon.toFixed(4)}`,
    geo: (query: string) => `geocode:${query.toLowerCase().trim()}`,
    alerts: (district: string) => `alerts:${district.toLowerCase().trim()}`,
    rate: (scope: string, id: string) => `rl:${scope}:${id}`,
  };
}