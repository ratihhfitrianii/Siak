import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { logger } from '../../lib/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Virtual Waiting Room service — T1.13 (F-17, NF-05, K-09).
 *
 * Mekanisme (docs/02 §7.1):
 * - `siak:wr:active`  ZSET — member = userKey, score = epoch ms kadaluarsa (TTL sesi 15 menit).
 *   ZSET menggantikan pola INCR/DECR dari spec: TTL per-member otomatis lewat score,
 *   tanpa sweeper terpisah untuk counter (deviasi didokumentasikan di DL-26).
 * - `siak:wr:queue`    LIST — antrean token (LPUSH di enqueue, LPOP FIFO saat slot bebas).
 * - `siak:wr:token:<t>` STRING — detail token { userKey, createdAt } TTL 30 menit.
 *
 * Graceful degradation: Redis down / tidak dikonfigurasi → selalu allow (docs/02 §7.1,
 * "Redis down → waiting room off (allow semua)"). T4.1: atomic Lua script untuk race condition.
 */

/** Lua script untuk atomic threshold check (T4.1). */
const WAITING_ROOM_LUA_SCRIPT = fs.readFileSync(path.join(__dirname, 'waiting-room.lua'), 'utf-8');

/** Koneksi Redis minimal yang dipakai service (memudahkan injeksi fake di test). */
export interface WaitingRoomRedis {
  zadd(key: string, score: number, member: string): Promise<number>;
  zcard(key: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
  lpop(key: string): Promise<string | null>;
  lpos(key: string, value: string): Promise<number | null>;
  llen(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  eval(script: string, numKeys: number, ...keysAndArgs: (string | number)[]): Promise<unknown>;
}

export const WR_ACTIVE_KEY = 'siak:wr:active';
export const WR_QUEUE_KEY = 'siak:wr:queue';
export const WR_TOKEN_TTL_SECONDS = 30 * 60; // token berlaku 30 menit

export const tokenKey = (token: string): string => `siak:wr:token:${token}`;

/** Event 'promoted' → token yang baru keluar antrean (dikonsumsi modul socket). */
export const waitingRoomEvents = new EventEmitter();

export interface WaitingRoomEntry {
  allowed: boolean;
  token?: string;
  position?: number;
}

export type WaitingRoomStatus =
  { status: 'enter' } | { status: 'waiting'; position: number } | { status: 'unknown' };

export interface WaitingRoomOptions {
  threshold: number;
  sessionTtlMs: number;
  now?: () => number;
}

export class WaitingRoomService {
  constructor(
    private readonly redis: WaitingRoomRedis | undefined,
    private readonly opts: WaitingRoomOptions,
  ) {}

  private get now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  /**
   * Cek + daftar user sebagai aktif (refresh TTL sesi 15 menit per request).
   * Kembalian: allowed=true (di bawah ambang) | allowed=false + token + posisi antrean.
   * T4.1: pakai Lua script atomic untuk mencegah race condition ZADD+ZCARD.
   */
  async enter(userKey: string): Promise<WaitingRoomEntry> {
    if (!this.redis) return { allowed: true }; // Redis down → allow semua
    const expiry = this.now + this.opts.sessionTtlMs;
    const token = randomUUID();
    try {
      // Lua script atomic: cleanup + ZADD + ZCARD + threshold check + enqueue
      const result = await this.redis.eval(
        WAITING_ROOM_LUA_SCRIPT,
        3,
        WR_ACTIVE_KEY,
        WR_QUEUE_KEY,
        'siak:wr:token:',
        userKey,
        expiry,
        this.opts.threshold,
        this.now,
        token,
        WR_TOKEN_TTL_SECONDS,
      );
      const allowed = (result as unknown[])[0] as number;
      if (allowed === 1) return { allowed: true };
      const returnedToken = (result as unknown[])[1] as string;
      const position = (result as unknown[])[2] as number;
      return { allowed: false, token: returnedToken, position };
    } catch (err) {
      logger.warn({ err }, 'waiting room: enter error — allow (bypass)');
      return { allowed: true };
    }
  }

  /** Perpanjang TTL sesi (dipakai pada request lanjutan). */
  async refresh(userKey: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.zadd(WR_ACTIVE_KEY, this.now + this.opts.sessionTtlMs, userKey);
    } catch (err) {
      logger.debug({ err }, 'waiting room: refresh error (bypass)');
    }
  }

  /**
   * User keluar (logout) → bebaskan slot → promosi token terdepan antrean.
   * Kembalian: token yang dipromosikan (atau null jika antrean kosong).
   */
  async leave(userKey: string): Promise<string | null> {
    if (!this.redis) return null;
    try {
      await this.redis.zrem(WR_ACTIVE_KEY, userKey);
      return this.promote();
    } catch (err) {
      logger.debug({ err }, 'waiting room: leave error (bypass)');
      return null;
    }
  }

  /**
   * Ambil token terdepan antrean (FIFO) dan daftarkan user-nya sebagai aktif.
   * Token kedaluwarsa dilewati (rekursif). Event 'promoted' di-emit ke socket layer.
   */
  async promote(): Promise<string | null> {
    if (!this.redis) return null;
    try {
      const token = await this.redis.lpop(WR_QUEUE_KEY);
      if (!token) return null;
      const raw = await this.redis.get(tokenKey(token));
      if (!raw) {
        // Token kedaluwarsa → lewati, promosikan berikutnya
        return this.promote();
      }
      const { userKey } = JSON.parse(raw) as { userKey: string };
      await this.redis.zadd(WR_ACTIVE_KEY, this.now + this.opts.sessionTtlMs, userKey);
      waitingRoomEvents.emit('promoted', token);
      return token;
    } catch (err) {
      logger.warn({ err }, 'waiting room: promote error (bypass)');
      return null;
    }
  }

  /** Status token untuk fallback polling 30 detik (K-09). */
  async status(token: string): Promise<WaitingRoomStatus> {
    if (!this.redis) return { status: 'enter' }; // Redis down → tidak ada antrean
    try {
      const raw = await this.redis.get(tokenKey(token));
      if (!raw) return { status: 'unknown' };
      const idx = await this.redis.lpos(WR_QUEUE_KEY, token);
      if (idx === null) return { status: 'enter' }; // sudah keluar antrean → silakan masuk
      return { status: 'waiting', position: idx + 1 };
    } catch (err) {
      logger.debug({ err }, 'waiting room: status error — treat as enter (bypass)');
      return { status: 'enter' };
    }
  }

  /** Panjang antrean (dashboard/monitoring). */
  async queueLength(): Promise<number> {
    if (!this.redis) return 0;
    try {
      return await this.redis.llen(WR_QUEUE_KEY);
    } catch {
      return 0;
    }
  }

  /** Bersihkan sesi kadaluarsa + promosikan slot yang terbebas. */
  async sweepExpired(): Promise<number> {
    if (!this.redis) return 0;
    try {
      const removed = await this.redis.zremrangebyscore(WR_ACTIVE_KEY, '-inf', this.now);
      let promoted = 0;
      for (let i = 0; i < removed; i++) {
        const token = await this.promote();
        if (!token) break;
        promoted++;
      }
      return promoted;
    } catch (err) {
      logger.warn({ err }, 'waiting room: sweep error (bypass)');
      return 0;
    }
  }

  private async enqueue(userKey: string): Promise<WaitingRoomEntry> {
    if (!this.redis) return { allowed: true };
    const token = randomUUID();
    await this.redis.set(
      tokenKey(token),
      JSON.stringify({ userKey, createdAt: this.now }),
      'EX',
      WR_TOKEN_TTL_SECONDS,
    );
    const position = await this.redis.rpush(WR_QUEUE_KEY, token);
    return { allowed: false, token, position };
  }
}
