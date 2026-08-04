import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../../middleware/error-handler';
import { WaitingRoomService } from './waiting-room.service';

/**
 * Waiting Room routes — T1.13.
 *
 * `GET /api/v1/waiting-room/status?token=...` — fallback polling 30 detik (K-09):
 * frontend mengecek posisi antrean saat WebSocket tidak tersedia.
 */

const statusQuery = z.object({
  token: z.string().min(1, 'token wajib diisi'),
});

export function createWaitingRoomRouter(service: WaitingRoomService | null): Router {
  const router = Router();

  router.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = statusQuery.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Parameter token tidak valid', 400);
      }
      if (!service) {
        // Waiting room non-aktif (test/Redis down) → tidak ada antrean
        res.json({ success: true, data: { status: 'enter' } });
        return;
      }
      const status = await service.status(parsed.data.token);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
