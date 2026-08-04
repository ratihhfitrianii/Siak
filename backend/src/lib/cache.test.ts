/**
 * T1.12 — Redis Cache Layer unit tests
 *
 * Tests graceful degradation (Redis offline → cache bypass) and
 * key construction logic. Does NOT require a live Redis instance.
 */
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, cacheKeys, CACHE_TTL } from '../lib/cache';

describe('Redis Cache Layer (T1.12)', () => {
  describe('cacheKeys — key construction', () => {
    it('availableClasses builds correct key', () => {
      expect(cacheKeys.availableClasses(1, 3)).toBe('siak:avail_cls:1:3');
    });

    it('transcript builds correct key', () => {
      expect(cacheKeys.transcript(42)).toBe('siak:transcript:42');
    });

    it('curriculum builds correct key', () => {
      expect(cacheKeys.curriculum(5, 2)).toBe('siak:curriculum:5:2');
    });

    it('allAvailableClasses is wildcard pattern', () => {
      expect(cacheKeys.allAvailableClasses).toBe('siak:avail_cls:*');
    });

    it('allTranscripts is wildcard pattern', () => {
      expect(cacheKeys.allTranscripts).toBe('siak:transcript:*');
    });
  });

  describe('CACHE_TTL — TTL constants match spec §7.2', () => {
    it('AVAILABLE_CLASSES = 30 seconds', () => {
      expect(CACHE_TTL.AVAILABLE_CLASSES).toBe(30);
    });

    it('TRANSCRIPT = 300 seconds (5 minutes)', () => {
      expect(CACHE_TTL.TRANSCRIPT).toBe(300);
    });

    it('CURRICULUM = 3600 seconds (1 hour)', () => {
      expect(CACHE_TTL.CURRICULUM).toBe(3600);
    });
  });

  describe('cacheGet / cacheSet / cacheDel — graceful degradation', () => {
    it('cacheGet returns null when Redis is offline', async () => {
      // Redis is not running in test environment → should return null, not throw
      const result = await cacheGet('siak:test:key');
      expect(result).toBeNull();
    });

    it('cacheSet does not throw when Redis is offline (no-op)', async () => {
      await expect(cacheSet('siak:test:key', { data: 'test' }, 30)).resolves.toBeUndefined();
    });

    it('cacheDel does not throw when Redis is offline (no-op)', async () => {
      await expect(cacheDel('siak:test:key')).resolves.toBeUndefined();
    });

    it('cacheDelPattern does not throw when Redis is offline (no-op)', async () => {
      await expect(cacheDelPattern('siak:test:*')).resolves.toBeUndefined();
    });
  });
});
