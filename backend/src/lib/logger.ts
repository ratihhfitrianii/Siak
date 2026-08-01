import { pino } from 'pino';

/**
 * Logger terpusat (structured JSON — docs/02 §10.2).
 * Level bisa diatur via env LOG_LEVEL (default: info).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'siak-backend' },
});
