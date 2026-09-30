import pg from 'pg';
import { env } from '../config/env';
import { logger } from './logger';

const { Pool } = pg;

export const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // FREE tier: max 5 connections
  max: 5,                     // ≤ quota max connections
  idleTimeoutMillis: 10000,   // tutup koneksi yang idle >10 s
  connectionTimeoutMillis: 5000,
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
