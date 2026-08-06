import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { AppError } from '../../middleware/error-handler';

/**
 * Modul Substitute Teaching — T3.5 (F-25)
 * - POST /substitute — dosen/admin ajukan substitute teaching (langsung aktif tanpa approval)
 * - GET /substitute — list (dosen: own classes, admin: all)
 * - GET /substitute/:id — detail
 * - PUT /substitute/:id/cancel — cancel substitute
 * - Notifikasi real-time ke mahasiswa kelas terkait
 */

const createSchema = z.object({
  originalLecturerId: z.number().int().positive(), // dosen yang diganti
  substituteLecturerId: z.number().int().positive(), // dosen pengganti
  classId: z.number().int().positive(),
  scheduleId: z.number().int().positive(),
  reason: z.string().max(500).optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

async function sendSubstituteNotification(
  classId: number,
  originalLecturerId: number,
  substituteLecturerId: number,
  scheduleId: number,
  reason: string | undefined,
  action: 'created' | 'cancelled',
) {
  try {
    // Get students in this class
    const studentsRes = await pgPool.query(
      `SELECT s.id, s.user_id
       FROM students s
       JOIN krs_submissions ks ON ks.student_id = s.id
       JOIN krs_items ki ON ki.krs_submission_id = ks.id
       JOIN classes cl ON cl.id = ki.class_id
       WHERE cl.id = $1
         AND ks.status = 'disetujui'
         AND s.is_active`,
      [classId],
    );

    // Get lecturer names
    const lecturersRes = await pgPool.query(
      `SELECT l.id, u.full_name
       FROM lecturers l
       JOIN users u ON u.id = l.user_id
       WHERE l.id IN ($1, $2)`,
      [originalLecturerId, substituteLecturerId],
    );

    const originalLecturer = lecturersRes.rows.find((r) => r.id === originalLecturerId);
    const substituteLecturer = lecturersRes.rows.find((r) => r.id === substituteLecturerId);

    // Get schedule info for notification
    const scheduleRes = await pgPool.query(
      `SELECT s.scheduled_date, s.meeting_number, s.topic,
              c.code as course_code, c.name as course_name
       FROM schedules s
       JOIN classes cl ON cl.id = s.class_id
       JOIN curricula cur ON cur.id = cl.curriculum_id
       JOIN courses c ON c.id = cur.course_id
       WHERE s.id = $1`,
      [scheduleId],
    );

    const schedule = scheduleRes.rows[0];

    for (const student of studentsRes.rows) {
      const title =
        action === 'created' ? 'Pengganti Mengajar Baru' : 'Pengganti Mengajar Dibatalkan';
      const message =
        action === 'created'
          ? `Dosen ${substituteLecturer?.full_name || 'pengganti'} akan menggantikan ${originalLecturer?.full_name || 'dosen'} pada pertemuan ke-${schedule?.meeting_number} (${schedule?.topic || 'Mata Kuliah'}) pada ${schedule?.scheduled_date ? new Date(schedule.scheduled_date).toLocaleDateString('id-ID') : 'tanggal yang akan ditentukan'}.${reason ? ` Alasan: ${reason}` : ''}`
          : `Pengganti mengajar untuk pertemuan ke-${schedule?.meeting_number} (${schedule?.topic || 'Mata Kuliah'}) telah dibatalkan.`;

      await pgPool.query(
        `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via)
         VALUES ($1, $2, $3, 'substitute', 'schedule', $4, ARRAY['in_app'])`,
        [student.user_id, title, message, scheduleId],
      );
    }
  } catch (err) {
    // Log but don't fail the request if notification fails
    // eslint-disable-next-line no-console
    console.error('[Substitute] Notification error:', err);
  }
}

export function createSubstituteRouter(): Router {
  const router = Router();

  // ============================================================
  // DOSEN/ADMIN: Ajukan substitute teaching
  // ============================================================
  router.post(
    '/',
    authenticate,
    authorize('substitute.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = createSchema.parse(req.body);
        const { originalLecturerId, substituteLecturerId, classId, scheduleId, reason } = data;

        // Validasi: original != substitute
        if (originalLecturerId === substituteLecturerId) {
          return res.status(400).json({
            success: false,
            error: 'Dosen pengganti tidak boleh sama dengan dosen yang diganti',
          });
        }

        // Validasi: original lecturer mengajar kelas ini
        const classCheck = await pgPool.query(
          `SELECT 1 FROM classes c
           JOIN lecturers l ON l.user_id = c.lecturer_id
           WHERE c.id = $1 AND l.id = $2`,
          [classId, originalLecturerId],
        );
        if (classCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Dosen yang diganti bukan pengajar kelas ini',
          });
        }

        // Validasi: schedule milik kelas ini
        const scheduleCheck = await pgPool.query(
          `SELECT 1 FROM schedules WHERE id = $1 AND class_id = $2`,
          [scheduleId, classId],
        );
        if (scheduleCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Jadwal tidak ditemukan untuk kelas ini',
          });
        }

        // Validasi: substitute lecturer aktif
        const subCheck = await pgPool.query(`SELECT 1 FROM lecturers WHERE id = $1 AND is_active`, [
          substituteLecturerId,
        ]);
        if (subCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Dosen pengganti tidak aktif atau tidak ditemukan',
          });
        }

        // Cek duplicate active substitute untuk schedule ini
        const dupCheck = await pgPool.query(
          `SELECT 1 FROM substitute_teaching WHERE schedule_id = $1 AND status = 'active'`,
          [scheduleId],
        );
        if (dupCheck.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'Sudah ada substitute aktif untuk jadwal ini',
          });
        }

        // Insert substitute teaching record
        // approved_by = requested_by (langsung aktif tanpa approval)
        const result = await pgPool.query(
          `INSERT INTO substitute_teaching
             (original_lecturer_id, substitute_lecturer_id, class_id, schedule_id, reason, status, requested_by, approved_by, approved_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $6, now())
           RETURNING *`,
          [
            originalLecturerId,
            substituteLecturerId,
            classId,
            scheduleId,
            reason ?? null,
            req.user!.id,
          ],
        );

        const substitute = result.rows[0];

        // Audit trail
        await auditFromRequest(req.user!, req, {
          tableName: 'substitute_teaching',
          recordId: Number(substitute.id),
          action: 'INSERT',
          newValues: {
            originalLecturerId,
            substituteLecturerId,
            classId,
            scheduleId,
            reason,
            status: 'active',
          },
        });

        // Notifikasi real-time ke mahasiswa
        await sendSubstituteNotification(
          classId,
          originalLecturerId,
          substituteLecturerId,
          scheduleId,
          reason,
          'created',
        );

        res.status(201).json({ success: true, data: substitute });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // DOSEN/ADMIN: List substitute teaching
  // ============================================================
  router.get(
    '/',
    authenticate,
    authorize('substitute.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { class_id, schedule_id, status, page = '1', limit = '20' } = req.query;
        const p = Math.max(1, parseInt(page as string, 10));
        const l = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const offset = (p - 1) * l;

        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';

        let where = 'WHERE 1=1';
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (!isAdmin) {
          // Dosen hanya lihat substitute untuk kelas yang dia ajar (sebagai original ATAU substitute)
          const lecturerId = req.user!.lecturerId;
          if (!lecturerId) {
            throw new AppError('FORBIDDEN', 'Akun bukan dosen aktif', 403);
          }
          where += ` AND (st.original_lecturer_id = $${paramIdx} OR st.substitute_lecturer_id = $${paramIdx})`;
          params.push(lecturerId);
          paramIdx++;
        }

        if (class_id) {
          where += ` AND st.class_id = $${paramIdx++}`;
          params.push(parseInt(class_id as string, 10));
        }
        if (schedule_id) {
          where += ` AND st.schedule_id = $${paramIdx++}`;
          params.push(parseInt(schedule_id as string, 10));
        }
        if (status) {
          where += ` AND st.status = $${paramIdx++}`;
          params.push(status as string);
        }

        // Count total
        const countSql = `SELECT COUNT(*) FROM substitute_teaching st ${where}`;
        const countRes = await pgPool.query(countSql, params);
        const total = parseInt(countRes.rows[0].count, 10);

        // Get data with joins
        const dataSql = `
          SELECT
            st.*,
            ol.id as original_lecturer_id,
            uol.full_name as original_lecturer_name,
            ol.nidn as original_nidn,
            sl.id as substitute_lecturer_id,
            usl.full_name as substitute_lecturer_name,
            sl.nidn as substitute_nidn,
            c.id as class_id,
            c.class_code as class_name,
            s.id as schedule_id,
            s.meeting_number,
            s.scheduled_date,
            s.topic,
            cr.code as course_code,
            cr.name as course_name,
            ureq.full_name as requested_by_name,
            uapp.full_name as approved_by_name
          FROM substitute_teaching st
          JOIN lecturers ol ON ol.id = st.original_lecturer_id
          JOIN users uol ON uol.id = ol.user_id
          JOIN lecturers sl ON sl.id = st.substitute_lecturer_id
          JOIN users usl ON usl.id = sl.user_id
          JOIN classes c ON c.id = st.class_id
          JOIN schedules s ON s.id = st.schedule_id
          JOIN curricula cur ON cur.id = c.curriculum_id
          JOIN courses cr ON cr.id = cur.course_id
          JOIN users ureq ON ureq.id = st.requested_by
          LEFT JOIN users uapp ON uapp.id = st.approved_by
          ${where}
          ORDER BY st.created_at DESC
          LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
        `;
        params.push(l, offset);

        const dataRes = await pgPool.query(dataSql, params);

        res.json({
          success: true,
          data: {
            items: dataRes.rows,
            pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // DOSEN/ADMIN: Detail substitute
  // ============================================================
  router.get(
    '/:id',
    authenticate,
    authorize('substitute.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid substitute ID' });
        }

        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';

        let where = 'WHERE st.id = $1';
        const params: (number | string)[] = [id];

        if (!isAdmin) {
          const lecturerId = req.user!.lecturerId;
          if (!lecturerId) {
            throw new AppError('FORBIDDEN', 'Akun bukan dosen aktif', 403);
          }
          where += ` AND (st.original_lecturer_id = $2 OR st.substitute_lecturer_id = $2)`;
          params.push(lecturerId);
        }

        const result = await pgPool.query(
          `SELECT
             st.*,
             ol.id as original_lecturer_id,
             uol.full_name as original_lecturer_name,
             ol.nidn as original_nidn,
             sl.id as substitute_lecturer_id,
             usl.full_name as substitute_lecturer_name,
             sl.nidn as substitute_nidn,
             c.id as class_id,
             c.class_code as class_name,
             s.id as schedule_id,
             s.meeting_number,
             s.scheduled_date,
             s.topic,
             cr.code as course_code,
             cr.name as course_name,
             ureq.full_name as requested_by_name,
             uapp.full_name as approved_by_name
           FROM substitute_teaching st
           JOIN lecturers ol ON ol.id = st.original_lecturer_id
           JOIN users uol ON uol.id = ol.user_id
           JOIN lecturers sl ON sl.id = st.substitute_lecturer_id
           JOIN users usl ON usl.id = sl.user_id
           JOIN classes c ON c.id = st.class_id
           JOIN schedules s ON s.id = st.schedule_id
           JOIN curricula cur ON cur.id = c.curriculum_id
           JOIN courses cr ON cr.id = cur.course_id
           JOIN users ureq ON ureq.id = st.requested_by
           LEFT JOIN users uapp ON uapp.id = st.approved_by
           ${where}`,
          params,
        );

        if (result.rows.length === 0) {
          return res
            .status(404)
            .json({ success: false, error: 'Substitute teaching tidak ditemukan' });
        }

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // DOSEN/ADMIN: Cancel substitute teaching
  // ============================================================
  router.put(
    '/:id/cancel',
    authenticate,
    authorize('substitute.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid substitute ID' });
        }

        const { reason } = cancelSchema.parse(req.body);

        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';

        // Get existing record
        let where = 'WHERE st.id = $1';
        const params: (number | string)[] = [id];

        if (!isAdmin) {
          // Hanya original lecturer atau admin yang bisa cancel
          const lecturerId = req.user!.lecturerId;
          if (!lecturerId) {
            throw new AppError('FORBIDDEN', 'Akun bukan dosen aktif', 403);
          }
          where += ` AND st.original_lecturer_id = $2`;
          params.push(lecturerId);
        }

        const existingRes = await pgPool.query(
          `SELECT st.*, c.id as class_id
           FROM substitute_teaching st
           JOIN classes c ON c.id = st.class_id
           ${where}`,
          params,
        );

        if (existingRes.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Substitute teaching tidak ditemukan atau tidak berhak membatalkan',
          });
        }

        const existing = existingRes.rows[0];

        if (existing.status === 'cancelled') {
          return res.status(400).json({ success: false, error: 'Substitute sudah dibatalkan' });
        }

        // Update status
        const result = await pgPool.query(
          `UPDATE substitute_teaching
           SET status = 'cancelled', reason = COALESCE($1, reason)
           WHERE id = $2
           RETURNING *`,
          [reason ?? null, id],
        );

        // Audit trail
        await auditFromRequest(req.user!, req, {
          tableName: 'substitute_teaching',
          recordId: id,
          action: 'UPDATE',
          oldValues: { status: 'active', reason: existing.reason },
          newValues: { status: 'cancelled', reason: reason ?? existing.reason },
        });

        // Notifikasi real-time ke mahasiswa
        await sendSubstituteNotification(
          existing.class_id,
          existing.original_lecturer_id,
          existing.substitute_lecturer_id,
          existing.schedule_id,
          reason ?? existing.reason,
          'cancelled',
        );

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
