/**
 * Interface de cache + implementação Redis (ioredis) e NoOp.
 *
 *   - Se REDIS_URL estiver definido e alcançável: usa RedisCache.
 *   - Caso contrário: NoOpCache (get sempre retorna null, set no-op).
 *
 * Conveniência: `remember(key, ttl, loader)` — busca no cache,
 * se não achar roda loader, guarda, retorna.
 */
import Redis from 'ioredis';
import { env } from '../../shared/env';
import { logger } from '../logger';

export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<number>;
  remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T>;
  isReady(): boolean;
  quit(): Promise<void>;
}

class NoOpCache implements Cache {
  async get<T>(_: string): Promise<T | null> {
    return null;
  }
  async set(): Promise<void> {}
  async del(): Promise<void> {}
  async delByPrefix(): Promise<number> {
    return 0;
  }
  async remember<T>(_: string, __: number, loader: () => Promise<T>): Promise<T> {
    return loader();
  }
  isReady(): boolean {
    return false;
  }
  async quit(): Promise<void> {}
}

class RedisCache implements Cache {
  private readonly client: Redis;
  private ready = false;

  constructor(url: string) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });
    this.client.on('ready', () => {
      this.ready = true;
      logger.info({ url: url.replace(/:[^/]+@/, '://***@') }, 'redis connected');
    });
    this.client.on('error', (err) => {
      this.ready = false;
      logger.warn({ err: err.message }, 'redis error (operando sem cache)');
    });
    this.client.connect().catch((err) => {
      logger.warn({ err: err.message }, 'redis connect failed (operando sem cache)');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.ready) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      logger.warn({ err, key }, 'redis.get falhou');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, 'redis.set falhou');
    }
  }

  async del(key: string): Promise<void> {
    if (!this.ready) return;
    try {
      await this.client.del(key);
    } catch (err) {
      logger.warn({ err, key }, 'redis.del falhou');
    }
  }

  async delByPrefix(prefix: string): Promise<number> {
    if (!this.ready) return 0;
    try {
      const stream = this.client.scanStream({ match: `${prefix}*`, count: 200 });
      let deleted = 0;
      for await (const batch of stream as AsyncIterable<string[]>) {
        if (batch.length > 0) {
          deleted += await this.client.del(...batch);
        }
      }
      return deleted;
    } catch (err) {
      logger.warn({ err, prefix }, 'redis.delByPrefix falhou');
      return 0;
    }
  }

  async remember<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  isReady(): boolean {
    return this.ready;
  }

  async quit(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      /* ignora */
    }
  }
}

let singleton: Cache | null = null;
export function getCache(): Cache {
  if (singleton) return singleton;
  const url = env.REDIS_URL;
  singleton = url ? new RedisCache(url) : new NoOpCache();
  return singleton;
}

export const CACHE_TTL = {
  ARVORE: env.CACHE_TTL_ARVORE,
  DASHBOARD: env.CACHE_TTL_DASHBOARD,
} as const;

// Consome env pra garantir que está carregado antes dos imports
void env;
