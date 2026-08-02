import { Router, type Request, type Response, type NextFunction } from 'express';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate } from '../../lib/auth-middleware';

/**
 * Modul Notifikasi (in-app) — T1.6 (AC-04d, F-25).
 *
 * - `sendInAppNotification()`: helper yang dipakai modul lain (KRS approve/reject/reminder).
 * - `remindUnfilledStudents()`: AC-04d — notif otomatis ke mahasiswa yang belum mengisi KRS
 *   pada periode aktif. Idempotent (sekali per mahasiswa per periode via NOT EXISTS).
 * - Router: baca notifikasi milik user sendiri (AC-10 — user hanya melihat miliknya).
 *
 * Delivery email/push + scheduler penuh dijadwalkan T2.5 (plan docs/03).
 */

export type NotificationType =
  | 'krs_approved'
  | 'krs_rejected'
  | 'krs_reminder'
  | 'payment_due'
  | 'grade_posted'
  | 'schedule_change'
  | 'substitute'
  | 'system';

export interface SendInAppNotificationParams {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: number;
}

/** Insert satu notifikasi in-app (antrean `notifications`, sent_via=['in_app']). */
export async function sendInAppNotification(params: SendInAppNotificationParams): Promise<void> {
  await pgPool.query(
    `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via)
     VALUES ($1, $2, $3, $4, $5, $6, ARRAY['in_app'])`,
    [
      params.userId,
      params.title,
      params.message,
      params.type,
      params.relatedEntityType ?? null,
      params.relatedEntityId ?? null,
    ],
  );
}

/**
 * AC-04d — reminder otomatis ke mahasiswa aktif yang belum punya KRS (submitted/approved)
 * pada periode aktif. Idempotent: NOT EXISTS menolak duplikat per (user, periode).
 * Mengembalikan jumlah notifikasi yang baru dibuat.
 */
export async function remindUnfilledStudents(): Promise<number> {
  const period = await pgPool.query(
    `SELECT id, name FROM krs_periods
     WHERE is_active AND now() BETWEEN start_date AND end_date
     ORDER BY id DESC LIMIT 1`,
  );
  if (period.rows.length === 0) return 0;
  const periodId = Number(period.rows[0].id);
  const periodName = period.rows[0].name as string;

  const result = await pgPool.query(
    `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via)
     SELECT s.user_id,
            'Ingat: isi KRS',
            'Anda belum mengisi KRS pada periode ' || $2 || '. Segera isi sebelum periode ditutup.',
            'krs_reminder', 'krs_period', $1, ARRAY['in_app']
     FROM students s
     JOIN users u ON u.id = s.user_id
     WHERE u.role_id = (SELECT id FROM roles WHERE code = 'mahasiswa')
       AND u.is_active
       AND s.is_active
       AND s.status = 'aktif'
       AND NOT EXISTS (
         SELECT 1 FROM krs_submissions ks
         WHERE ks.student_id = s.id AND ks.krs_period_id = $1
           AND ks.status IN ('submitted', 'approved')
       )
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.user_id = s.user_id
           AND n.type = 'krs_reminder'
           AND n.related_entity_type = 'krs_period'
           AND n.related_entity_id = $1
       )
     RETURNING id`,
    [periodId, periodName],
  );

  return result.rowCount ?? 0;
}

export function createNotificationRouter(): Router {
  const router = Router();

  // GET /notifications/my — notifikasi user sendiri (AC-10)
  router.get(
    '/notifications/my',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          `SELECT id, title, message, type, is_read, created_at
           FROM notifications
           WHERE user_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT 50`,
          [req.user!.id],
        );
        res.json({
          success: true,
          data: {
            items: result.rows.map((r) => ({
              id: Number(r.id),
              title: r.title,
              message: r.message,
              type: r.type,
              isRead: r.is_read,
              createdAt: r.created_at,
            })),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /notifications/:id/read — tandai dibaca (hanya milik sendiri)
  router.put(
    '/notifications/:id/read',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID notifikasi tidak valid', 400);
        }
        const result = await pgPool.query(
          `UPDATE notifications SET is_read = true, read_at = now()
           WHERE id = $1 AND user_id = $2
           RETURNING id`,
          [id, req.user!.id],
        );
        if (result.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Notifikasi tidak ditemukan', 404);
        }
        res.json({ success: true, data: { id: Number(result.rows[0].id), isRead: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
