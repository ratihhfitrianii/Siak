import { Router, type Request, type Response, type NextFunction } from 'express';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate } from '../../lib/auth-middleware';
import { logger } from '../../lib/logger';
import { createEmailProvider, type NotificationProvider } from './provider';

/**
 * Modul Notifikasi (in-app + email) — T1.6 / T2.5 (AC-04d, F-25).
 *
 * - `sendInAppNotification()`: helper yang dipakai modul lain (KRS approve/reject/reminder).
 * - `remindUnfilledStudents()`: AC-04d — notif otomatis ke mahasiswa yang belum mengisi KRS
 *   pada periode aktif. Idempotent (sekali per mahasiswa per periode via NOT EXISTS).
 * - `deliverPendingNotifications()`: T2.5 — antrean delivery email (PENDING → SENT/FAILED,
 *   retry max 3). In-app langsung SENT saat insert; hanya notif dengan kanal email yang
 *   melewati antrean.
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
  /** Kanal tambahan selain in_app (misal 'email'). Default: hanya in_app. */
  channels?: Array<'in_app' | 'email'>;
}

/**
 * Insert satu notifikasi (antrean `notifications`).
 * Kanal in_app → status langsung SENT (tersimpan = terkirim); kanal email → PENDING
 * menunggu `deliverPendingNotifications()`.
 */
export async function sendInAppNotification(params: SendInAppNotificationParams): Promise<void> {
  const channels = params.channels ?? ['in_app'];
  const hasEmail = channels.includes('email');
  await pgPool.query(
    `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via, status, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::varchar[], $8, $9)`,
    [
      params.userId,
      params.title,
      params.message,
      params.type,
      params.relatedEntityType ?? null,
      params.relatedEntityId ?? null,
      channels,
      hasEmail ? 'PENDING' : 'SENT',
      hasEmail ? null : new Date(),
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

  const channels = getEnabledChannels();
  const hasEmail = channels.includes('email');

  const result = await pgPool.query(
    `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via, status, sent_at)
     SELECT s.user_id,
            'Ingat: isi KRS',
            'Anda belum mengisi KRS pada periode ' || $2 || '. Segera isi sebelum periode ditutup.',
            'krs_reminder', 'krs_period', $1, $3::varchar[], $4, $5
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
    [periodId, periodName, channels, hasEmail ? 'PENDING' : 'SENT', hasEmail ? null : new Date()],
  );

  return result.rowCount ?? 0;
}

/** Kanal aktif dari env NOTIFICATION_PROVIDER ('email' | 'inapp' | 'email,inapp'). */
function getEnabledChannels(): Array<'in_app' | 'email'> {
  const raw = (process.env.NOTIFICATION_PROVIDER ?? 'inapp').toLowerCase();
  const channels: Array<'in_app' | 'email'> = ['in_app'];
  if (raw.includes('email')) channels.push('email');
  return channels;
}

const MAX_DELIVERY_ATTEMPTS = 3;
const DELIVERY_BATCH_SIZE = 100;

/**
 * T2.5 — proses antrean email: PENDING + kanal email → kirim via provider →
 * SENT (sukses) / FAILED (gagal 3×). Log delivery per notifikasi (DoD T2.5).
 * Idempotent & crash-safe: UPDATE ... WHERE status='PENDING' mencegah double-send.
 */
export async function deliverPendingNotifications(
  providers?: NotificationProvider[],
): Promise<{ delivered: number; failed: number }> {
  const active = providers ?? [createEmailProvider()];
  const result = await pgPool.query(
    `SELECT n.id, n.title, n.message, n.attempts, u.email, u.full_name
     FROM notifications n
     JOIN users u ON u.id = n.user_id
     WHERE n.status = 'PENDING' AND 'email' = ANY(n.sent_via)
       AND n.attempts < $1
     ORDER BY n.id
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [MAX_DELIVERY_ATTEMPTS, DELIVERY_BATCH_SIZE],
  );

  let delivered = 0;
  let failed = 0;
  for (const row of result.rows) {
    const id = Number(row.id);
    const attempts = Number(row.attempts) + 1;
    try {
      for (const provider of active) {
        await provider.send(
          { email: row.email as string, fullName: row.full_name as string },
          { title: row.title as string, message: row.message as string },
        );
      }
      await pgPool.query(
        `UPDATE notifications SET status = 'SENT', sent_at = now(), attempts = $2, last_error = NULL
         WHERE id = $1`,
        [id, attempts],
      );
      delivered += 1;
      logger.info({ id, attempts }, 'notifikasi terkirim (email)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isExhausted = attempts >= MAX_DELIVERY_ATTEMPTS;
      await pgPool.query(
        `UPDATE notifications
         SET status = $2, attempts = $3, last_error = $4
         WHERE id = $1`,
        [id, isExhausted ? 'FAILED' : 'PENDING', attempts, msg],
      );
      failed += 1;
      logger.warn(
        { id, attempts, err: msg },
        isExhausted ? 'notifikasi gagal permanen (retry habis)' : 'notifikasi gagal, akan retry',
      );
    }
  }
  return { delivered, failed };
}

export function createNotificationRouter(): Router {
  const router = Router();

  // GET /notifications/my — notifikasi user sendiri (AC-10) dengan pagination
  // Query: ?page=1&limit=5 (default limit 5 untuk pagination frontend)
  router.get(
    '/notifications/my',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 5));
        const offset = (page - 1) * limit;

        const [itemsResult, countResult] = await Promise.all([
          pgPool.query(
            `SELECT id, title, message, type, is_read, created_at
             FROM notifications
             WHERE user_id = $1
             ORDER BY created_at DESC, id DESC
             LIMIT $2 OFFSET $3`,
            [req.user!.id, limit, offset],
          ),
          pgPool.query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1`, [req.user!.id]),
        ]);

        const total = Number(countResult.rows[0].count);
        const totalPages = Math.ceil(total / limit);

        res.json({
          success: true,
          data: {
            items: itemsResult.rows.map((r) => ({
              id: Number(r.id),
              title: r.title,
              message: r.message,
              type: r.type,
              isRead: r.is_read,
              createdAt: r.created_at,
            })),
            pagination: {
              page,
              limit,
              total,
              totalPages,
              hasMore: page < totalPages,
            },
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

  // PUT /notifications/read-all — tandai semua dibaca (keluhan lama: list perbaikan.txt)
  router.put(
    '/notifications/read-all',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          `UPDATE notifications SET is_read = true, read_at = now()
           WHERE user_id = $1 AND is_read = false
           RETURNING id`,
          [req.user!.id],
        );
        res.json({
          success: true,
          data: { marked: result.rows.length },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
