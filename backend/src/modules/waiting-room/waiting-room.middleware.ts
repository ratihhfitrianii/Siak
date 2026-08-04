import type { NextFunction, Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { WaitingRoomService } from './waiting-room.service';

/**
 * Waiting Room middleware — T1.13 (docs/02 §7.1).
 *
 * Gerbang di tepi API: setiap request dihitung sebagai user aktif (key per IP
 * untuk request anonim; edge semantics — Nginx/Lua di spec, Express middleware
 * untuk MVP). Jika `active_users_count` melewati ambang → 429 RATE_LIMITED +
 * Virtual Token + posisi antrean (frontend menampilkan ruang tunggu).
 *
 * Bypass penuh saat NODE_ENV=test (determinisme suite) — test memakai service
 * yang diinjeksi eksplisit lewat createApp options.
 */
export function createWaitingRoomMiddleware(service: WaitingRoomService | null) {
  if (!service) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Bypass dikendalikan oleh app.ts (service null saat NODE_ENV=test) —
    // test yang butuh gate meng-injeksi service eksplisit.
    const userKey = `ip:${req.ip}`;
    try {
      const entry = await service.enter(userKey);
      if (entry.allowed) {
        next();
        return;
      }
      logger.info(
        { userKey, position: entry.position },
        'waiting room: request masuk antrean (429)',
      );
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Layanan sedang padat. Anda masuk antrean ruang tunggu.',
        data: { token: entry.token, position: entry.position },
      });
    } catch (err) {
      // Error Redis/dll → jangan blokir request (graceful degradation)
      logger.warn({ err }, 'waiting room middleware error — allow (bypass)');
      next();
    }
  };
}
