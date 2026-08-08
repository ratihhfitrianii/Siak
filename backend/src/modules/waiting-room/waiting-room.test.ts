/**
 * T1.13 — Virtual Waiting Room: unit test service (fake Redis in-memory)
 * + integrasi middleware via createApp (gate 429 + polling status).
 *
 * Tidak butuh Redis nyata → aman di CI. Redis down (undefined) → bypass (allow semua).
 */
import request from 'supertest';
import { createApp } from '../../app';
import { createWaitingRoomMiddleware } from './waiting-room.middleware';
import {
  WaitingRoomService,
  WR_ACTIVE_KEY,
  WR_QUEUE_KEY,
  tokenKey,
  type WaitingRoomRedis,
} from './waiting-room.service';

/** Fake Redis in-memory — subset perintah yang dipakai WaitingRoomService. */
class InMemoryRedis implements WaitingRoomRedis {
  private store = new Map<string, string>();
  private zsets = new Map<string, Map<string, number>>();
  private lists = new Map<string, string[]>();

  async zadd(key: string, score: number, member: string): Promise<number> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    const existed = z.has(member);
    z.set(member, score);
    this.zsets.set(key, z);
    return existed ? 0 : 1;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    let n = 0;
    for (const m of members) {
      if (z.delete(m)) n++;
    }
    return n;
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    const lo = min === '-inf' ? -Infinity : Number(min);
    const hi = max === '+inf' ? Infinity : Number(max);
    let n = 0;
    for (const [m, s] of [...z.entries()]) {
      if (s >= lo && s <= hi) {
        z.delete(m);
        n++;
      }
    }
    return n;
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    const l = this.lists.get(key) ?? [];
    l.push(...values);
    this.lists.set(key, l);
    return l.length;
  }

  async lpop(key: string): Promise<string | null> {
    const l = this.lists.get(key);
    if (!l || l.length === 0) return null;
    return l.shift() ?? null;
  }

  async lpos(key: string, value: string): Promise<number | null> {
    const l = this.lists.get(key) ?? [];
    const idx = l.indexOf(value);
    return idx === -1 ? null : idx;
  }

  async llen(key: string): Promise<number> {
    return this.lists.get(key)?.length ?? 0;
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string, _mode?: string, _ttl?: number): Promise<unknown> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) {
      if (this.store.delete(k) || this.zsets.delete(k) || this.lists.delete(k)) n++;
    }
    return n;
  }

  /** Helper test: simulasikan token kedaluwarsa (hapus key token). */
  expireKey(key: string): void {
    this.store.delete(key);
  }

  /** Eval Lua script — T4.1 atomic enter. */
  async eval(
    script: string,
    numKeys: number,
    ...keysAndArgs: (string | number)[]
  ): Promise<unknown> {
    // Parse args: 3 keys + 7 args = userKey, expiry, threshold, now, token, tokenTtl
    const [activeKey, queueKey, tokenPrefix] = keysAndArgs.slice(0, 3) as string[];
    const [userKeyRaw, expiryRaw, thresholdRaw, nowRaw, tokenRaw, _tokenTtlRaw] = keysAndArgs.slice(3) as (string | number | undefined)[];
    const userKey = String(userKeyRaw ?? '');
    const expiry = Number(expiryRaw ?? 0);
    const threshold = Number(thresholdRaw ?? 0);
    const now = Number(nowRaw ?? 0);
    const tokenStr = String(tokenRaw ?? '');
    
    // 1. Clean up expired sessions
    const z = this.zsets.get(activeKey);
    if (z !== undefined) {
      for (const [m, s] of z) {
        if (s <= now) {
          z.delete(m);
        }
      }
    }

    // 2. Add user to active set
    const z2 = this.zsets.get(activeKey) ?? new Map<string, number>();
    z2.set(userKey, expiry);
    this.zsets.set(activeKey, z2);

    // 3. Count active users
    const count = z2.size;

    // 4. Check threshold
    if (count <= threshold) {
      return [1];
    }

    // 5. Over threshold: remove user from active, add to queue
    z2.delete(userKey);
    
    // Store token details
    const tokenKey = tokenPrefix + tokenStr;
    this.store.set(tokenKey, JSON.stringify({ userKey, createdAt: now }));
    
    // Add to queue (FIFO)
    const l = this.lists.get(queueKey) ?? [];
    l.push(tokenStr);
    this.lists.set(queueKey, l);
    const position = l.length;

    return [0, tokenStr, position];
  }
}

const OPTS = { threshold: 2, sessionTtlMs: 15 * 60 * 1000 };

function makeService(redis: WaitingRoomRedis | undefined) {
  return new WaitingRoomService(redis, { ...OPTS });
}

describe('Waiting Room Service (T1.13)', () => {
  describe('Redis down / tidak dikonfigurasi → bypass (graceful degradation)', () => {
    const svc = makeService(undefined);

    it('enter selalu allowed', async () => {
      await expect(svc.enter('ip:x')).resolves.toEqual({ allowed: true });
    });

    it('status → enter (tidak ada antrean)', async () => {
      await expect(svc.status('token-x')).resolves.toEqual({ status: 'enter' });
    });

    it('queueLength 0 dan leave null (tidak ada slot untuk dipromosikan)', async () => {
      await expect(svc.queueLength()).resolves.toBe(0);
      await expect(svc.leave('ip:x')).resolves.toBeNull();
    });
  });

  describe('enter — ambang (threshold=2)', () => {
    it('di bawah ambang → allowed dan terdaftar aktif', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await expect(svc.enter('ip:a')).resolves.toEqual({ allowed: true });
      await expect(svc.enter('ip:b')).resolves.toEqual({ allowed: true });
      await expect(redis.zcard(WR_ACTIVE_KEY)).resolves.toBe(2);
    });

    it('di atas ambang → waiting + token + posisi antrean', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await svc.enter('ip:a');
      await svc.enter('ip:b');
      const c = await svc.enter('ip:c');
      expect(c.allowed).toBe(false);
      expect(c.token).toBeDefined();
      expect(c.position).toBe(1);
      // C tidak terdaftar aktif, hanya di antrean
      await expect(redis.zcard(WR_ACTIVE_KEY)).resolves.toBe(2);
      await expect(redis.llen(WR_QUEUE_KEY)).resolves.toBe(1);
    });

    it('request paralel dari user yang sama tidak menggandakan hitungan', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await Promise.all([svc.enter('ip:a'), svc.enter('ip:a'), svc.enter('ip:a')]);
      await expect(redis.zcard(WR_ACTIVE_KEY)).resolves.toBe(1);
    });

    it('sesi kadaluarsa dibersihkan otomatis (TTL 15 menit via score)', async () => {
      let now = 1_000_000;
      const svc = new WaitingRoomService(new InMemoryRedis(), {
        ...OPTS,
        now: () => now,
      });
      await svc.enter('ip:a'); // aktif
      await svc.enter('ip:b'); // aktif
      now += OPTS.sessionTtlMs + 1; // waktu maju melewati TTL keduanya
      const entry = await svc.enter('ip:c'); // cleanup + c masuk, count = 1
      expect(entry.allowed).toBe(true);
    });
  });

  describe('leave / promote — slot bebas → token terdepan masuk (FIFO)', () => {
    it('leave mempromosikan token pertama di antrean dan mendaftarkannya aktif', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await svc.enter('ip:a');
      await svc.enter('ip:b');
      const c = await svc.enter('ip:c');
      const d = await svc.enter('ip:d');

      const promoted1 = await svc.leave('ip:a');
      expect(promoted1).toBe(c.token);
      // c sekarang aktif, d masih menunggu posisi 1
      await expect(redis.zcard(WR_ACTIVE_KEY)).resolves.toBe(2);
      await expect(svc.status(d.token!)).resolves.toEqual({ status: 'waiting', position: 1 });
      await expect(svc.status(c.token!)).resolves.toEqual({ status: 'enter' });

      const promoted2 = await svc.leave('ip:b');
      expect(promoted2).toBe(d.token);
      await expect(redis.llen(WR_QUEUE_KEY)).resolves.toBe(0);
    });

    it('leave dengan antrean kosong → null', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await svc.enter('ip:a');
      await expect(svc.leave('ip:a')).resolves.toBeNull();
    });

    it('promote melewati token yang sudah kedaluwarsa', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await svc.enter('ip:a');
      const c = await svc.enter('ip:c');
      const d = await svc.enter('ip:d');
      // Token c "kedaluwarsa" → harus dilewati, d yang dipromosikan
      redis.expireKey(tokenKey(c.token!));
      const promoted = await svc.leave('ip:a');
      expect(promoted).toBe(d.token);
    });
  });

  describe('status — polling fallback 30 detik (K-09)', () => {
    it('token tidak dikenal → unknown', async () => {
      const svc = makeService(new InMemoryRedis());
      await expect(svc.status('tidak-ada')).resolves.toEqual({ status: 'unknown' });
    });

    it('token masih di antrean → waiting + posisi; sudah keluar → enter', async () => {
      const redis = new InMemoryRedis();
      const svc = makeService(redis);
      await svc.enter('ip:a');
      await svc.enter('ip:b');
      const c = await svc.enter('ip:c');
      const d = await svc.enter('ip:d');
      await expect(svc.status(c.token!)).resolves.toEqual({ status: 'waiting', position: 1 });
      await expect(svc.status(d.token!)).resolves.toEqual({ status: 'waiting', position: 2 });
      await svc.leave('ip:a');
      await expect(svc.status(d.token!)).resolves.toEqual({ status: 'waiting', position: 1 });
      await svc.leave('ip:b');
      await expect(svc.status(d.token!)).resolves.toEqual({ status: 'enter' });
    });
  });

  describe('sweepExpired — sesi kadaluarsa membebaskan slot', () => {
    it('membersihkan sesi expired dan mempromosikan slot yang terbebas', async () => {
      let now = 1_000_000;
      const redis = new InMemoryRedis();
      const svc = new WaitingRoomService(redis, { ...OPTS, now: () => now });
      await svc.enter('ip:a');
      await svc.enter('ip:b');
      const c = await svc.enter('ip:c');
      now += OPTS.sessionTtlMs + 1; // a & b kedaluwarsa → 2 slot bebas → 2 promosi
      const promoted = await svc.sweepExpired();
      expect(promoted).toBe(1); // hanya 1 antrean
      await expect(svc.status(c.token!)).resolves.toEqual({ status: 'enter' });
      await expect(redis.zcard(WR_ACTIVE_KEY)).resolves.toBe(1); // hanya c
    });
  });
});

describe('Waiting Room Middleware (T1.13)', () => {
  it('di bawah ambang → next(); di atas ambang → 429 RATE_LIMITED + token + posisi', async () => {
    const redis = new InMemoryRedis();
    const service = makeService(redis);
    const mw = createWaitingRoomMiddleware(service);
    const next = jest.fn();

    // 2 user berbeda lolos
    await mw({ ip: '1.1.1.1' } as never, {} as never, next);
    await mw({ ip: '2.2.2.2' } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(2);

    // user ketiga → 429
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await mw({ ip: '3.3.3.3' } as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(2); // tidak bertambah
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED' }));
    const payload = (res.json as jest.Mock).mock.calls[0][0] as {
      data: { token: string; position: number };
    };
    expect(payload.data.token).toBeDefined();
    expect(payload.data.position).toBe(1);
  });

  it('service null → selalu next (gate mati)', async () => {
    const mw = createWaitingRoomMiddleware(null);
    const next = jest.fn();
    await mw({ ip: '1.1.1.1' } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('error internal service → allow (graceful degradation, jangan blokir)', async () => {
    const broken = {
      enter: jest.fn().mockRejectedValue(new Error('redis boom')),
    } as never;
    const mw = createWaitingRoomMiddleware(broken as never);
    const next = jest.fn();
    await mw({ ip: '1.1.1.1' } as never, {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('Waiting Room Routes — polling fallback (T1.13, K-09)', () => {
  it('flow: user ketiga masuk antrean → polling waiting → slot bebas → enter', async () => {
    const redis = new InMemoryRedis();
    const service = makeService(redis);
    const app = createApp({}, { waitingRoom: service });

    // 2 user aktif + 1 antrean (langsung via service — unit middleware di atas)
    await service.enter('ip:1.1.1.1');
    await service.enter('ip:2.2.2.2');
    const queued = await service.enter('ip:3.3.3.3');
    expect(queued.allowed).toBe(false);
    const token = queued.token!;

    // polling status → waiting position 1
    const status1 = await request(app)
      .get('/api/v1/waiting-room/status')
      .query({ token })
      .expect(200);
    expect(status1.body.data).toEqual({ status: 'waiting', position: 1 });

    // slot bebas → token dipromosikan → polling: enter
    const promoted = await service.promote();
    expect(promoted).toBe(token);
    const status2 = await request(app)
      .get('/api/v1/waiting-room/status')
      .query({ token })
      .expect(200);
    expect(status2.body.data).toEqual({ status: 'enter' });

    // token tidak dikenal → unknown
    const status3 = await request(app)
      .get('/api/v1/waiting-room/status')
      .query({ token: 'tidak-ada' })
      .expect(200);
    expect(status3.body.data).toEqual({ status: 'unknown' });

    // tanpa token → 400 VALIDATION_ERROR
    await request(app).get('/api/v1/waiting-room/status').expect(400);
  });

  it('service null (NODE_ENV=test default) → tidak ada gate, status selalu enter', async () => {
    const app = createApp({});
    await request(app).get('/api/v1/health').expect(200);
    await request(app).get('/api/v1/waiting-room/status').query({ token: 'apa-saja' }).expect(200);
  });
});
