import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Shared Redis client — T1.13.
 *
 * Satu koneksi Redis untuk seluruh backend (cache T1.12, waiting room T1.13,
 * health check). Graceful degradation: Redis tidak dikonfigurasi / down →
 * `getRedis()` mengembalikan `undefined` dan semua pemakai harus bypass
 * (bukan error) — konsisten dengan docs/02 §7.1 "Redis down → allow semua".
 */

let redis: Redis | undefined;
let redisAvailable = false;
let connecting = false;

/** Inisialisasi koneksi Redis (lazy — dipanggil sekali, lalu di-share). */
export function getRedis(): Redis | undefined {
  if (redisAvailable) return redis;
  if (connecting) return undefined;
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not configured — Redis disabled (bypass)');
    redisAvailable = false;
    return undefined;
  }
  connecting = true;
  try {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy(times: number) {
        if (times > 3) {
          logger.warn({ times }, 'Redis: giving up reconnection');
          redisAvailable = false;
          connecting = false;
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });
    redis.on('error', (err: Error) => {
      if (redisAvailable) {
        logger.warn(
          { err: err.message },
          'Redis: connection lost — Redis disabled temporarily (bypass)',
        );
        redisAvailable = false;
      }
    });
    redis.on('connect', () => {
      if (!redisAvailable) {
        logger.info('Redis: connected — Redis enabled');
        redisAvailable = true;
      }
    });
    redis.on('end', () => {
      redisAvailable = false;
      connecting = false;
    });
    redisAvailable = true;
    connecting = false;
    return redis;
  } catch (err) {
    logger.warn({ err }, 'Redis: init failed — Redis disabled');
    redisAvailable = false;
    connecting = false;
    return undefined;
  }
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

/** Tutup koneksi (graceful shutdown — docs/02 §7.3). */
export async function closeRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch (err) {
      logger.debug({ err }, 'closeRedis: quit error');
      redis.disconnect();
    }
    redis = undefined;
    redisAvailable = false;
    connecting = false;
  }
}

// Attempt connection eagerly on module load (cache + waiting room siap pakai).
getRedis();
