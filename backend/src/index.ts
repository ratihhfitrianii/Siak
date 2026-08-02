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

// Scheduler dasar AC-04d (T1.6): ingatkan mahasiswa yang belum mengisi KRS periode aktif.
// Idempotent (sekali per mahasiswa per periode); disabled di test. Interval via env
// KRS_REMINDER_INTERVAL_MS (default 6 jam), tick pertama 1 menit setelah start.
const reminderIntervalMs = Number(process.env.KRS_REMINDER_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
if (env.NODE_ENV !== 'test' && Number.isFinite(reminderIntervalMs) && reminderIntervalMs > 0) {
  const tick = () => {
    void import('./modules/notification')
      .then(({ remindUnfilledStudents }) => remindUnfilledStudents())
      .then((notified) => {
        if (notified > 0) logger.info({ notified }, 'reminder KRS terkirim');
      })
      .catch((err: unknown) => logger.error({ err }, 'reminder KRS gagal'));
  };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, reminderIntervalMs).unref();
  logger.info(
    `scheduler KRS reminder aktif (interval ${Math.round(reminderIntervalMs / 60_000)} menit)`,
  );
}

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
