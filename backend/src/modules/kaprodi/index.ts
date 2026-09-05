import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorizeKaprodi } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Kaprodi (2026-09) — Persetujuan Jadwal Dosen.
 * Alur: dosen lengkapi jadwal → klik "Ajukan Persetujuan" → kaprodi/wakil kaprodi
 * seprodi menyetujui/menolak (per dosen per semester).
 *
 * - POST /kaprodi/submissions — dosen mengajukan jadwalnya (semester aktif)
 * - GET  /kaprodi/submissions — kaprodi: daftar pengajuan dosen seprodi
 * - PUT  /kaprodi/submissions/:id — kaprodi: setujui/tolak
 * - GET  /kaprodi/my-submission — dosen: status pengajuannya
 */

const submitSchema = z.object({
  semesterId: z.number().int().positive().optional(),
});

const reviewSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  note: z.string().max(500).optional(),
});

/** Semester aktif = semester dengan is_active (konvensi SIAK). */
async function activeSemesterId(): Promise<number | null> {
  const res = await pgPool.query(
    `SELECT id FROM semesters WHERE is_active = true ORDER BY id DESC LIMIT 1`,
  );
  return res.rows[0] ? Number(res.rows[0].id) : null;
}

export function createKaprodiRouter(): Router {
  const router = Router();

  // --- DOSEN: ajukan jadwalnya untuk persetujuan kaprodi ---
  router.post(
    '/submissions',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = submitSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data pengajuan tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const user = req.user!;
        const lecturerId = user.lecturerId;
        if (!lecturerId) {
          throw new AppError('FORBIDDEN', 'Akun bukan dosen', 403);
        }

        const semesterId = parsed.data.semesterId ?? (await activeSemesterId());
        if (!semesterId) {
          throw new AppError('NOT_FOUND', 'Tidak ada semester aktif', 404);
        }

        // Validasi: dosen punya minimal 1 kelas di semester ini & semua terjadwal (hari/jam)
        const classesRes = await pgPool.query(
          `SELECT cl.id, cl.day_of_week, cl.start_time, cl.end_time
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           WHERE cl.lecturer_id = $1 AND cur.semester_id = $2 AND cl.is_active`,
          [user.id, semesterId],
        );
        if (classesRes.rows.length === 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Tidak ada kelas yang diampu pada semester ini',
            400,
          );
        }
        const unscheduled = classesRes.rows.filter(
          (r) => !r.day_of_week || !r.start_time || !r.end_time,
        );
        if (unscheduled.length > 0) {
          throw new AppError(
            'VALIDATION_ERROR',
            'Semua kelas harus punya hari & jam sebelum diajukan',
            400,
          );
        }

        // Insert/update submission (upsert per dosen-semester)
        const result = await pgPool.query(
          `INSERT INTO schedule_submissions (lecturer_id, semester_id, status, submitted_at, reviewed_by, reviewed_at, review_note)
           VALUES ($1, $2, 'awaiting', now(), NULL, NULL, NULL)
           ON CONFLICT (lecturer_id, semester_id)
           DO UPDATE SET status = 'awaiting', submitted_at = now(),
                         reviewed_by = NULL, reviewed_at = NULL, review_note = NULL
           RETURNING id, lecturer_id, semester_id, status, submitted_at`,
          [lecturerId, semesterId],
        );

        await auditFromRequest(user, req, {
          tableName: 'schedule_submissions',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: { semesterId, status: 'awaiting' },
        });

        res.status(201).json({
          success: true,
          data: { ...result.rows[0], id: Number(result.rows[0].id) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DOSEN: status pengajuan sendiri ---
  router.get(
    '/my-submission',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const lecturerId = req.user!.lecturerId;
        if (!lecturerId) {
          return res.json({ success: true, data: null });
        }
        const result = await pgPool.query(
          `SELECT ss.id, ss.lecturer_id, ss.semester_id, ss.status, ss.submitted_at,
                  ss.reviewed_by, ss.reviewed_at, ss.review_note,
                  sem.code AS semester_code, sem.name AS semester_name,
                  rv.full_name AS reviewer_name
           FROM schedule_submissions ss
           JOIN semesters sem ON sem.id = ss.semester_id
           LEFT JOIN users rv ON rv.id = ss.reviewed_by
           WHERE ss.lecturer_id = $1
           ORDER BY ss.submitted_at DESC
           LIMIT 1`,
          [lecturerId],
        );
        res.json({
          success: true,
          data: result.rows[0]
            ? {
                ...result.rows[0],
                id: Number(result.rows[0].id),
                semesterId: Number(result.rows[0].semester_id),
                lecturerId: Number(result.rows[0].lecturer_id),
                reviewedBy: result.rows[0].reviewed_by ? Number(result.rows[0].reviewed_by) : null,
              }
            : null,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- KAPRODI: daftar pengajuan dosen seprodi ---
  router.get(
    '/submissions',
    authenticate,
    authorizeKaprodi(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const prodiId = req.user!.prodiId;
        if (!prodiId) {
          throw new AppError('FORBIDDEN', 'Prodi kaprodi tidak ditemukan', 403);
        }
        const { status } = req.query;
        const statusFilter = typeof status === 'string' ? status : null;
        const params: (string | number)[] = [prodiId];
        let where = `WHERE l.prodi_id = $1 AND ss.status <> 'draft'`;
        if (statusFilter) {
          params.push(statusFilter);
          where += ` AND ss.status = $${params.length}`;
        }
        const result = await pgPool.query(
          `SELECT ss.id, ss.semester_id, ss.status, ss.submitted_at, ss.reviewed_at, ss.review_note,
                  l.id AS lecturer_id, u.full_name AS lecturer_name, u.email AS lecturer_email,
                  sem.code AS semester_code, sem.name AS semester_name,
                  rv.full_name AS reviewer_name,
                  (SELECT COUNT(*) FROM classes cl
                    JOIN curricula cur ON cur.id = cl.curriculum_id
                    WHERE cl.lecturer_id = u.id AND cur.semester_id = ss.semester_id AND cl.is_active)
                    AS total_classes
           FROM schedule_submissions ss
           JOIN lecturers l ON l.id = ss.lecturer_id
           JOIN users u ON u.id = l.user_id
           JOIN semesters sem ON sem.id = ss.semester_id
           LEFT JOIN users rv ON rv.id = ss.reviewed_by
           ${where}
           ORDER BY ss.submitted_at DESC`,
          params,
        );
        const items = result.rows.map((r) => ({
          ...r,
          id: Number(r.id),
          lecturerId: Number(r.lecturer_id),
          semesterId: Number(r.semester_id),
          totalClasses: Number(r.total_classes),
          reviewedBy: r.reviewed_by ? Number(r.reviewed_by) : null,
        }));
        res.json({ success: true, data: { items } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- KAPRODI: setujui/tolak pengajuan ---
  router.put(
    '/submissions/:id',
    authenticate,
    authorizeKaprodi(),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const submissionId = Number(req.params.id);
        if (!Number.isInteger(submissionId) || submissionId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID pengajuan tidak valid', 400);
        }
        const parsed = reviewSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data review tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        if (parsed.data.action === 'rejected' && !parsed.data.note?.trim()) {
          throw new AppError('VALIDATION_ERROR', 'Catatan penolakan wajib diisi', 400);
        }

        const prodiId = req.user!.prodiId;
        const subRes = await pgPool.query(
          `SELECT ss.id, ss.status, l.prodi_id AS lecturer_prodi,
                  u.full_name AS lecturer_name
           FROM schedule_submissions ss
           JOIN lecturers l ON l.id = ss.lecturer_id
           JOIN users u ON u.id = l.user_id
           WHERE ss.id = $1`,
          [submissionId],
        );
        if (subRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Pengajuan tidak ditemukan', 404);
        }
        const sub = subRes.rows[0];
        if (Number(sub.lecturer_prodi) !== prodiId) {
          throw new AppError('FORBIDDEN', 'Pengajuan bukan dari prodi Anda', 403);
        }
        if (sub.status === 'approved') {
          throw new AppError('VALIDATION_ERROR', 'Pengajuan sudah disetujui', 400);
        }

        const result = await pgPool.query(
          `UPDATE schedule_submissions
           SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3
           WHERE id = $4
           RETURNING id, lecturer_id, semester_id, status, review_note, reviewed_at`,
          [parsed.data.action, req.user!.id, parsed.data.note?.trim() ?? null, submissionId],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'schedule_submissions',
          recordId: submissionId,
          action: 'UPDATE',
          oldValues: { status: sub.status },
          newValues: {
            status: parsed.data.action,
            reviewerId: req.user!.id,
            note: parsed.data.note ?? null,
          },
        });

        res.json({
          success: true,
          data: {
            ...result.rows[0],
            id: Number(result.rows[0].id),
            semesterId: Number(result.rows[0].semester_id),
            lecturerId: Number(result.rows[0].lecturer_id),
          },
          message:
            parsed.data.action === 'approved'
              ? 'Pengajuan jadwal disetujui'
              : 'Pengajuan jadwal ditolak',
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
