import 'dotenv/config';
import { z } from 'zod';
import { logger } from '../lib/logger';

/**
 * Validasi environment variables dengan Zod.
 * Semua secret hanya dibaca dari environment (S-04) — tidak pernah ditulis di kode/artefak.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().url().optional(),
    REDIS_URL: z.string().url().optional(),
    JWT_SECRET: z.string().min(16).optional(),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    JWT_REFRESH_EXPIRY: z.string().default('7d'),
    SESSION_TIMEOUT_MS: z.coerce.number().int().positive().default(900000),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    WAITING_ROOM_THRESHOLD: z.coerce.number().int().positive().default(2000),
    // T1.14: ukuran pool PostgreSQL (kalibrasi load test; default 20 — test/CI aman)
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(20),
    NOTIFICATION_PROVIDER: z.string().default('inapp'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .superRefine((value, ctx) => {
    // Fail-fast di production: dependensi wajib dikonfigurasi (K-01, S-04).
    if (value.NODE_ENV === 'production') {
      if (!value.DATABASE_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'DATABASE_URL wajib diisi saat NODE_ENV=production',
        });
      }
      if (!value.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL wajib diisi saat NODE_ENV=production',
        });
      }
      if (!value.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET wajib diisi saat NODE_ENV=production',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error(
    { errors: parsed.error.flatten().fieldErrors },
    'Konfigurasi environment tidak valid',
  );
  throw new Error('Environment variables tidak valid — periksa .env');
}

export const env: Env = parsed.data;
