/**
 * Redis Cache Layer — T1.12 (docs/02 §7.2, NF-02)
 *
 * TTL per data type (spec §7.2):
 * - kurikulum_per_prodi:<prodiId>:<semesterId>  → 3600 (1 jam)
 * - available_classes:<prodiId>:<semesterId>     → 30 (30 detik)
 * - transcript:<studentId>                       → 300 (5 menit)
 *
 * Graceful degradation: Redis down → cache bypass, semua request tembus ke DB.
 */
import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/** TTL constants (detik) — konsisten dengan docs/02 §7.2 */
export const CACHE_TTL = {
  /** Kurikulum per prodi — 1 jam */
  CURRICULUM: 3600,
  /** Kelas tersedia — 30 detik (d invalidate saat KRS submit) */
  AVAILABLE_CLASSES: 30,
  /** Transkrip mahasiswa — 5 menit (d invalidate saat nilai diinput) */
  TRANSCRIPT: 300,
} as const;

/** Prefix cache keys per domain untuk invalidasi pattern */
const PREFIX = {
  CURRICULUM: 'siak:curriculum:',
  AVAILABLE_CLASSES: 'siak:avail_cls:',
  TRANSCRIPT: 'siak:transcript:',
} as const;

let redis: Redis | undefined;
let redisAvailable = false;

/** Inisialisasi koneksi Redis (lazy — dipanggil sekali saat module pertama kali diimport) */
function getRedis(): Redis | undefined {
  if (redisAvailable) return redis;
  if (!env.REDIS_URL) {
    logger.warn('REDIS_URL not configured — cache disabled (bypass)');
    redisAvailable = false;
    return undefined;
  }
  try {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy(times: number) {
        if (times > 3) {
          logger.warn({ times }, 'Redis cache: giving up reconnection');
          redisAvailable = false;
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });
    redis.on('error', (err: Error) => {
      if (redisAvailable) {
        logger.warn(
          { err: err.message },
          'Redis cache: connection lost — cache disabled temporarily',
        );
        redisAvailable = false;
      }
    });
    redis.on('connect', () => {
      if (!redisAvailable) {
        logger.info('Redis cache: reconnected — cache enabled');
        redisAvailable = true;
      }
    });
    redisAvailable = true;
    return redis;
  } catch (err) {
    logger.warn({ err }, 'Redis cache: init failed — cache disabled');
    redisAvailable = false;
    return undefined;
  }
}

// Attempt connection eagerly on module load
getRedis();

/**
 * GET dari cache. Returns parsed object atau null (cache miss / Redis down).
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.debug({ err, key }, 'cacheGet error (bypass)');
    return null;
  }
}

/**
 * SET ke cache dengan TTL (detik).
 */
export async function cacheSet(key: string, data: unknown, ttlSeconds: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch (err) {
    logger.debug({ err, key }, 'cacheSet error (bypass)');
  }
}

/**
 * DEL satu key.
 */
export async function cacheDel(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch (err) {
    logger.debug({ err, key }, 'cacheDel error (bypass)');
  }
}

/**
 * DEL semua key dengan prefix (invalidasi pattern).
 * Menggunakan SCAN untuk menghindari blocking di production.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      if (keys.length > 0) {
        await r.del(...keys);
      }
    } while (cursor !== '0');
  } catch (err) {
    logger.debug({ err, pattern }, 'cacheDelPattern error (bypass)');
  }
}

/**
 * Build cache keys — dipakai oleh modules.
 */
export const cacheKeys = {
  /** Kurikulum: `siak:curriculum:<prodiId>:<semesterId>` */
  curriculum: (prodiId: number, semesterId: number) =>
    `${PREFIX.CURRICULUM}${prodiId}:${semesterId}`,
  /** Kelas tersedia: `siak:avail_cls:<prodiId>:<semesterId>` */
  availableClasses: (prodiId: number, semesterId: number) =>
    `${PREFIX.AVAILABLE_CLASSES}${prodiId}:${semesterId}`,
  /** Transkrip: `siak:transcript:<studentId>` */
  transcript: (studentId: number) => `${PREFIX.TRANSCRIPT}${studentId}`,
  /** Pattern untuk invalidasi semua transkrip */
  allTranscripts: `${PREFIX.TRANSCRIPT}*`,
  /** Pattern untuk invalidasi semua available classes */
  allAvailableClasses: `${PREFIX.AVAILABLE_CLASSES}*`,
} as const;

/**
 * Health check: test koneksi Redis.
 */
export async function pingRedisCache(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
  const r = getRedis();
  if (!r) return { status: 'down' };
  try {
    const start = Date.now();
    await r.ping();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down' };
  }
}

/**
 * Graceful shutdown.
 */
export async function closeRedisCache(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // ignore
    }
    redis = undefined;
    redisAvailable = false;
  }
}
