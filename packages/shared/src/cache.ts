import { Redis } from "ioredis";
import { CACHE_PREFIX } from "./constants";
import { createLogger } from "./logger";

const log = createLogger("shared:cache");

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPrefix(prefix: string): Promise<void>;
  /** Get a cached value or compute and store it, collapsing concurrent loads. */
  getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
  /** Run `fn` while holding a best-effort distributed lock. */
  withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
  publish(channel: string, payload: string): Promise<void>;
  subscribe(channel: string, handler: (payload: string) => void): Promise<void>;
  close(): Promise<void>;
}

interface MemoryEntry {
  value: unknown;
  expiresAt: number | null;
}

class MemoryCache implements Cache {
  private readonly store = new Map<string, MemoryEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly locks = new Map<string, number>();
  private readonly subscribers = new Map<string, Set<(payload: string) => void>>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.store.delete(key);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1_000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      const value = await loader();
      await this.set(key, value, ttlSeconds);
      return value;
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const held = this.locks.get(key);
    if (held && held > now) throw new Error(`Lock ${key} is held by another task`);
    this.locks.set(key, now + ttlMs);
    try {
      return await fn();
    } finally {
      this.locks.delete(key);
    }
  }

  async publish(channel: string, payload: string): Promise<void> {
    for (const handler of this.subscribers.get(channel) ?? []) {
      try {
        handler(payload);
      } catch (error) {
        log.error({ err: error, channel }, "memory subscriber failed");
      }
    }
  }

  async subscribe(channel: string, handler: (payload: string) => void): Promise<void> {
    const set = this.subscribers.get(channel) ?? new Set();
    set.add(handler);
    this.subscribers.set(channel, set);
  }

  async close(): Promise<void> {
    clearInterval(this.sweeper);
    this.store.clear();
    this.subscribers.clear();
  }
}

class RedisCache implements Cache {
  private readonly client: Redis;
  private subscriber: Redis | null = null;
  private readonly handlers = new Map<string, Set<(payload: string) => void>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(url: string) {
    this.client = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    this.client.on("error", (error) => log.error({ err: error }, "redis error"));
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, payload, "EX", ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = next;
      if (keys.length > 0) await this.client.del(...keys);
    } while (cursor !== "0");
  }

  async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = (async () => {
      const value = await loader();
      await this.set(key, value, ttlSeconds);
      return value;
    })();

    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const lockKey = `${CACHE_PREFIX}:lock:${key}`;
    const acquired = await this.client.set(lockKey, token, "PX", ttlMs, "NX");
    if (acquired !== "OK") throw new Error(`Lock ${key} is held by another task`);
    try {
      return await fn();
    } finally {
      await this.client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        token,
      );
    }
  }

  private async ensureSubscriber(): Promise<Redis> {
    if (this.subscriber) return this.subscriber;
    const sub = this.client.duplicate();
    sub.on("error", (error) => log.error({ err: error }, "redis subscriber error"));
    sub.on("message", (channel: string, payload: string) => {
      for (const handler of this.handlers.get(channel) ?? []) {
        try {
          handler(payload);
        } catch (error) {
          log.error({ err: error, channel }, "redis subscriber handler failed");
        }
      }
    });
    this.subscriber = sub;
    return sub;
  }

  async publish(channel: string, payload: string): Promise<void> {
    await this.client.publish(channel, payload);
  }

  async subscribe(channel: string, handler: (payload: string) => void): Promise<void> {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler);
    this.handlers.set(channel, set);
    const sub = await this.ensureSubscriber();
    await sub.subscribe(channel);
  }

  async close(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
    await this.client.quit().catch(() => undefined);
  }
}

let instance: Cache | null = null;

export function createCache(redisUrl: string | null): Cache {
  if (redisUrl) {
    log.info("using redis cache");
    return new RedisCache(redisUrl);
  }
  log.info("using in-process cache (REDIS_URL not set)");
  return new MemoryCache();
}

export function getCache(redisUrl: string | null = null): Cache {
  if (!instance) instance = createCache(redisUrl);
  return instance;
}

export function setCache(cache: Cache): void {
  instance = cache;
}
