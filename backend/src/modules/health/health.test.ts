import request from 'supertest';
import { createApp } from '../../app';
import { checkDependencies } from './health.routes';

describe('GET /api/v1/health (liveness)', () => {
  it('mengembalikan 200 dengan status ok', async () => {
    const res = await request(createApp()).get('/api/v1/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('siak-backend');
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });
});

describe('GET /api/v1/health/ready (readiness)', () => {
  it('mengembalikan 200 + not_configured saat DB/Redis tidak dikonfigurasi', async () => {
    const res = await request(createApp()).get('/api/v1/health/ready').expect(200);

    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies).toEqual({
      db: 'not_configured',
      redis: 'not_configured',
    });
  });

  it('mengembalikan 503 saat dependensi yang dikonfigurasi down', async () => {
    const app = createApp({
      pingDb: async () => {
        throw new Error('koneksi DB gagal');
      },
      pingRedis: async () => {
        throw new Error('koneksi Redis gagal');
      },
    });

    const res = await request(app).get('/api/v1/health/ready').expect(503);

    expect(res.body.success).toBe(false);
    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.dependencies).toEqual({ db: 'down', redis: 'down' });
  });

  it('mengembalikan 200 saat semua dependensi up', async () => {
    const app = createApp({
      pingDb: async () => undefined,
      pingRedis: async () => undefined,
    });

    const res = await request(app).get('/api/v1/health/ready').expect(200);

    expect(res.body.data.dependencies).toEqual({ db: 'up', redis: 'up' });
  });

  it('mengembalikan 503 saat hanya Redis yang down', async () => {
    const app = createApp({
      pingDb: async () => undefined,
      pingRedis: async () => {
        throw new Error('Redis down');
      },
    });

    const res = await request(app).get('/api/v1/health/ready').expect(503);

    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.dependencies).toEqual({ db: 'up', redis: 'down' });
  });

  it('mengembalikan 503 saat hanya DB yang down', async () => {
    const app = createApp({
      pingDb: async () => {
        throw new Error('DB down');
      },
      pingRedis: async () => undefined,
    });

    const res = await request(app).get('/api/v1/health/ready').expect(503);

    expect(res.body.data.status).toBe('not_ready');
    expect(res.body.data.dependencies).toEqual({ db: 'down', redis: 'up' });
  });
});

describe('checkDependencies (unit)', () => {
  it('melaporkan down jika ping throw', async () => {
    const status = await checkDependencies({
      pingDb: async () => {
        throw new Error('gagal');
      },
      pingRedis: async () => {
        throw new Error('gagal');
      },
    });

    expect(status).toEqual({ db: 'down', redis: 'down' });
  });

  it('melaporkan up jika ping sukses', async () => {
    const status = await checkDependencies({
      pingDb: async () => undefined,
      pingRedis: async () => undefined,
    });

    expect(status).toEqual({ db: 'up', redis: 'up' });
  });

  it('melaporkan not_configured tanpa dependency', async () => {
    const status = await checkDependencies({});

    expect(status).toEqual({ db: 'not_configured', redis: 'not_configured' });
  });

  it('hanya memeriksa db bila pingRedis tidak diberikan', async () => {
    const status = await checkDependencies({ pingDb: async () => undefined });

    expect(status).toEqual({ db: 'up', redis: 'not_configured' });
  });

  it('hanya memeriksa redis bila pingDb tidak diberikan', async () => {
    const status = await checkDependencies({ pingRedis: async () => undefined });

    expect(status).toEqual({ db: 'not_configured', redis: 'up' });
  });
});
