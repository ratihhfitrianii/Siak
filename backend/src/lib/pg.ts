import pg from 'pg';
import { env } from '../config/env';
import { logger } from './logger';

const { Pool } = pg;

export const pgPool = new Pool({
  connectionString:
    env.DATABASE_URL ||
    `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE || 'siak'}`,
  max: env.DATABASE_POOL_MAX, // T1.14: kalibrasi via env (default 20)
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Neon free: resume dari auto-suspend bisa >5 detik
});

// Error pada client idle TIDAK fatal — Neon free (auto-suspend) menutup koneksi idle;
// pool otomatis membuat client baru saat query berikutnya (docs/02 §7.1 graceful degradation).
pgPool.on('error', (err) => {
  logger.warn({ err }, 'Idle PostgreSQL client error — pool akan reconnect otomatis');
});

// Test koneksi saat startup — retry beberapa kali agar toleran terhadap Neon yang sedang
// resume dari auto-suspend (2-5 detik) ketika Render cold start.
const STARTUP_RETRIES = 3;
const STARTUP_RETRY_DELAY_MS = 2000;

async function testConnection(attempt: number): Promise<void> {
  try {
    await pgPool.query('SELECT 1');
    logger.info('PostgreSQL pool connected');
  } catch (err) {
    if (attempt < STARTUP_RETRIES) {
      logger.warn(
        { attempt, err },
        'PostgreSQL pool connection failed — retry (Neon mungkin sedang cold start)',
      );
      await new Promise((resolve) => setTimeout(resolve, STARTUP_RETRY_DELAY_MS));
      await testConnection(attempt + 1);
    } else {
      logger.warn(
        { err },
        'PostgreSQL pool connection failed — app tetap berjalan, query akan retry otomatis',
      );
    }
  }
}

void testConnection(1);
