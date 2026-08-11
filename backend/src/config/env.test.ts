import { env } from './env';

describe('Validasi environment (env.ts)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('memuat konfigurasi default di lingkungan test', () => {
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBeGreaterThan(0);
    expect(env.WAITING_ROOM_THRESHOLD).toBe(2000);
    expect(env.RATE_LIMIT_MAX).toBe(100);
  });

  it('melempar error di production tanpa DATABASE_URL/REDIS_URL/JWT_SECRET', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.JWT_SECRET;
    // Pastikan file .env lokal (dev) tidak bocor ke test — env.ts memakai dotenv/config.
    process.env.DOTENV_CONFIG_PATH = '/nonexistent/.env-for-test';

    jest.isolateModules(() => {
      expect(() => require('./env')).toThrow('Environment variables tidak valid');
    });
  });

  it('menerima konfigurasi production yang lengkap', () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://user:pass@localhost:5432/siak',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'x'.repeat(32),
    };

    jest.isolateModules(() => {
      const mod = require('./env') as typeof import('./env');
      expect(mod.env.NODE_ENV).toBe('production');
      expect(mod.env.DATABASE_URL).toContain('postgres://');
    });
  });
});
