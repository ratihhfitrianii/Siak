import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

/**
 * Entry point backend Siak.
 * - Graceful shutdown: SIGTERM/SIGINT → stop menerima request → tutup koneksi (docs/02 §7.3).
 * - DB/Redis bersifat opsional pada T1.1 (health check menangani status not_configured/down).
 */

let pool: Pool | undefined;
let redis: Redis | undefined;

function buildHealthDeps() {
  const deps: { pingDb?: () => Promise<void>; pingRedis?: () => Promise<void> } = {};

  if (env.DATABASE_URL) {
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
    deps.pingDb = async () => {
      await pool!.query('SELECT 1');
    };
  }

  if (env.REDIS_URL) {
    redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    deps.pingRedis = async () => {
      await redis!.ping();
    };
  }

  return deps;
}

const app = createApp(buildHealthDeps());

const server = app.listen(env.PORT, () => {
  logger.info(`listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`menerima ${signal} — graceful shutdown dimulai`);

  server.close(async () => {
    try {
      if (pool) await pool.end();
      if (redis) await redis.quit();
    } catch (err) {
      logger.error({ err }, 'error saat menutup koneksi');
    } finally {
      process.exit(0);
    }
  });

  // Jaring pengaman: paksa exit jika koneksi macet.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
