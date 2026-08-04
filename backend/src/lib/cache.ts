/**
 * Redis Cache Layer — T1.12 (docs/02 §7.2, NF-02)
 *
 * TTL per data type (spec §7.2):
 * - kurikulum_per_prodi:<prodiId>:<semesterId>  → 3600 (1 jam)
 * - available_classes:<prodiId>:<semesterId>     → 30 (30 detik)
 * - transcript:<studentId>                       → 300 (5 menit)
 *
 * Graceful degradation: Redis down → cache bypass, semua request tembus ke DB.
 * Koneksi Redis di-share dari lib/redis.ts (T1.13) — satu koneksi untuk seluruh backend.
 */
import { getRedis, closeRedis } from './redis';
import { logger } from './logger';

/** TTL constants (detik) — konsisten dengan docs/02 §7.2 */
export const CACHE_TTL = {
  /** Kurikulum per prodi — 1 jam */
  CURRICULUM: 3600,
  /** Kelas tersedia — 30 detik (dinvalidate saat KRS submit) */
  AVAILABLE_CLASSES: 30,
  /** Transkrip mahasiswa — 5 menit (dinvalidate saat nilai diinput) */
  TRANSCRIPT: 300,
} as const;

/** Prefix cache keys per domain untuk invalidasi pattern */
const PREFIX = {
  CURRICULUM: 'siak:curriculum:',
  AVAILABLE_CLASSES: 'siak:avail_cls:',
  TRANSCRIPT: 'siak:transcript:',
} as const;

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
 * Graceful shutdown (alias ke shared closeRedis).
 */
export async function closeRedisCache(): Promise<void> {
  await closeRedis();
}
