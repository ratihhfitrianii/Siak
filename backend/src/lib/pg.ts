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
  connectionTimeoutMillis: 5000,
});

pgPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
  process.exit(-1);
});

// Test connection on startup
pgPool
  .query('SELECT 1')
  .then(() => logger.info('PostgreSQL pool connected'))
  .catch((err) => logger.error({ err }, 'PostgreSQL pool connection failed'));
