import Redis from 'ioredis';
import { config } from '../config';
import { logger } from './logger';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      logger.warn({ err }, 'Redis connection error');
    });
  }
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const r = getRedis();
    if (r.status !== 'ready') await r.connect();
    return await r.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== 'ready') await r.connect();
    if (ttlSeconds) {
      await r.setex(key, ttlSeconds, value);
    } else {
      await r.set(key, value);
    }
  } catch (err) {
    logger.warn({ err, key }, 'Cache set failed');
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const r = getRedis();
    if (r.status !== 'ready') await r.connect();
    await r.del(key);
  } catch {
    // ignore
  }
}

export async function rateLimitCheck(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status !== 'ready') await r.connect();
    const current = await r.incr(key);
    if (current === 1) {
      await r.expire(key, windowSeconds);
    }
    return current <= limit;
  } catch {
    return true; // fail open if redis unavailable
  }
}
