import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { remindUnfilledStudents } from '../notification';
import { cacheGet, cacheSet, cacheDelPattern, cacheKeys, CACHE_TTL } from '../../lib/cache';
import { fetchKrsPdfData, generateKrsPdf } from './krs-pdf';

/**
 * Modul KRS Core — T1.5 + Validasi Admin T1.6 (F-07, F-07a, F-07d, F-11, F-14, F-15,
 * AC-02, AC-04, AC-04a, AC-04b, AC-04c, AC-04d, AC-07).
 *
 * Endpoints:
 *   GET  /krs/period            — periode KRS aktif (Mahasiswa, Admin)
 *   GET  /krs/available-classes — kelas tersedia kuota>0 utk prodi mhs (Mahasiswa)
 *   POST /krs/draft             — simpan draft (Mahasiswa; boleh revisi setelah reject — AC-04c)
 *   POST /krs/submit            — locking transaksi SELECT FOR UPDATE (Mahasiswa)
 *   GET  /krs/my                — status + items KRS periode aktif (Mahasiswa)
 *   GET  /krs/admin/pending     — daftar KRS menunggu persetujuan (Admin Akademik — AC-04)
 *   POST /krs/admin/:id/approve — setujui KRS + notif in-app (AC-04)
 *   POST /krs/admin/:id/reject  — tolak + alasan, unlock utk revisi (AC-04c)
 *   POST /krs/admin/remind-unfilled — pemicu manual reminder AC-04d (idempotent)
 *
 * Integritas kuota: SELECT ... FOR UPDATE pada rows classes (A-5, AC-02).
 * Setelah submit, mahasiswa tidak bisa mengubah KRS (AC-07 → is_locked=true);
 * reject membuka lagi (is_locked=false) agar bisa revisi & submit ulang (AC-04c).
 * Tidak ada daftar tunggu — kelas penuh berarti tidak bisa dipilih (AC-04b).
 */

const classIdsSchema = z.object({
  classIds: z.array(z.number().int().positive()).min(1, 'Pilih minimal 1 kelas'),
});

const rejectSchema = z.object({
  reason: z
    .string()
    .min(5, 'Alasan penolakan minimal 5 karakter')
    .max(500, 'Alasan maksimal 500 karakter'),
});

/** Cari periode KRS aktif saat ini (is_active AND now() dalam rentang). */
async function findActivePeriod() {
  const result = await pgPool.query(
    `SELECT kp.id, kp.semester_id, kp.name, kp.start_date, kp.end_date, kp.is_revision,
            s.code AS semester_code
     FROM krs_periods kp
     JOIN semesters s ON s.id = kp.semester_id
     WHERE kp.is_active AND now() BETWEEN kp.start_date AND kp.end_date
       AND kp.name NOT LIKE 'T1.%-TEST%'
     ORDER BY kp.id DESC
     LIMIT 1`,
  );
  return result.rows[0] ?? null;
}

/** Validasi mahasiswa punya studentId (dari JOIN users→students di authenticate). */
function requireStudent(req: Request): number {
  if (!req.user?.studentId) {
    throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
  }
  return req.user.studentId;
}

/** Ambil prodi mahasiswa (satu query). */
async function assertPaymentStatus(studentId: number, semesterId: number): Promise<void> {
  const res = await pgPool.query(
    `SELECT status FROM payments WHERE student_id = $1 AND semester_id = $2`,
    [studentId, semesterId],
  );
  if (res.rows.length > 0 && res.rows[0].status !== 'lunas') {
    throw new AppError(
      'PAYMENT_UNPAID',
      'Halaman KRS tidak bisa diakses karena pembayaran semester ini belum lunas.',
      403,
    );
  }
}

async function getStudentProdi(studentId: number): Promise<number> {
  const result = await pgPool.query('SELECT prodi_id FROM students WHERE id = $1', [studentId]);
  if (result.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Data mahasiswa tidak ditemukan', 404);
  }
  return Number(result.rows[0].prodi_id);
}

export function createKrsRouter(): Router {
  const router = Router();

  // GET /krs/period — info periode aktif (Mahasiswa, Admin)
  router.get('/period', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const period = await findActivePeriod();
      if (!period) {
        res.json({
          success: true,
          data: { status: 'closed', message: 'Tidak ada periode KRS yang sedang buka' },
        });
        return;
      }
      res.json({
        success: true,
        data: {
          id: Number(period.id),
          semesterId: Number(period.semester_id),
          semesterCode: period.semester_code,
          name: period.name,
          startDate: period.start_date,
          endDate: period.end_date,
          isRevision: period.is_revision,
          status: 'open',
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /krs/available-classes — kelas tersedia kuota>0 untuk prodi mahasiswa (F-07, AC-04b)
  router.get(
    '/available-classes',
    authenticate,
    authorize('krs.view_classes'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = requireStudent(req);
        const prodiId = await getStudentProdi(studentId);
        const period = await findActivePeriod();
        if (!period) {
          throw new AppError('KRS_PERIOD_CLOSED', 'Periode KRS tidak sedang buka', 403);
        }
        await assertPaymentStatus(studentId, Number(period.semester_id));

        // T1.12: cache 30 detik — invalidasi saat KRS submit (§7.2)
        const cacheKey = cacheKeys.availableClasses(prodiId, Number(period.semester_id));
        const cached = await cacheGet<{ period: { id: number; name: string }; items: unknown[] }>(
          cacheKey,
        );
        if (cached) {
          res.json({ success: true, data: cached });
          return;
        }

        const result = await pgPool.query(
          `SELECT cl.id, cl.class_code, cl.capacity, cl.current_enrolled,
                  (cl.capacity - cl.current_enrolled) AS quota_left,
                  cl.room, cl.day_of_week, cl.start_time, cl.end_time,
                  c.code AS course_code, c.name AS course_name, c.credits,
                  lecturer.full_name AS lecturer_name,
                  cur.is_mandatory, cur.semester_number
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses c ON c.id = cur.course_id
           LEFT JOIN users lecturer ON lecturer.id = cl.lecturer_id
           WHERE cur.prodi_id = $1
             AND cur.semester_id = $2
             AND cl.is_active
             AND cl.current_enrolled < cl.capacity
           ORDER BY c.code, cl.class_code`,
          [prodiId, period.semester_id],
        );

        const responseData = {
          period: { id: Number(period.id), name: period.name },
          items: result.rows.map((r) => ({
            id: Number(r.id),
            classCode: r.class_code,
            capacity: r.capacity,
            currentEnrolled: r.current_enrolled,
            quotaLeft: Number(r.quota_left),
            room: r.room,
            dayOfWeek: r.day_of_week,
            startTime: r.start_time,
            endTime: r.end_time,
            course: { code: r.course_code, name: r.course_name, credits: r.credits },
            // Keluhan #29/#30 (Gelombang 3): nama dosen pengampu — dipakai untuk
            // menggabungkan kelas dengan jadwal+dosen sama dan format kartu matkul.
            lecturerName: r.lecturer_name ?? null,
            isMandatory: r.is_mandatory,
            semesterNumber: r.semester_number,
          })),
        };

        await cacheSet(cacheKey, responseData, CACHE_TTL.AVAILABLE_CLASSES);
        res.json({ success: true, data: responseData });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /krs/my — status + items periode aktif (Mahasiswa)
  router.get(
    '/my',
    authenticate,
    authorize('krs.fill'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = requireStudent(req);
        const period = await findActivePeriod();
        if (!period) {
          res.json({ success: true, data: { status: 'no_period', items: [] } });
          return;
        }

        const submission = await pgPool.query(
          `SELECT ks.id, ks.status, ks.submitted_at, ks.is_locked, ks.rejection_reason
         FROM krs_submissions ks
         WHERE ks.student_id = $1 AND ks.krs_period_id = $2`,
          [studentId, period.id],
        );

        if (submission.rows.length === 0) {
          res.json({
            success: true,
            data: { status: 'not_filled', items: [], submissionId: null },
          });
          return;
        }

        const items = await pgPool.query(
          `SELECT ki.id as krs_item_id, cl.id, cl.class_code, cl.capacity, cl.current_enrolled,
                c.code AS course_code, c.name AS course_name, c.credits,
                cl.day_of_week, cl.start_time, cl.end_time, cl.room,
                lecturer.full_name AS lecturer_name
        FROM krs_items ki
        JOIN classes cl ON cl.id = ki.class_id
        JOIN curricula cur ON cur.id = cl.curriculum_id
        JOIN courses c ON c.id = cur.course_id
        LEFT JOIN users lecturer ON lecturer.id = cl.lecturer_id
        WHERE ki.krs_submission_id = $1
        ORDER BY c.code`,
          [submission.rows[0].id],
        );

        const totalCredits = items.rows.reduce((sum: number, r) => sum + Number(r.credits), 0);

        res.json({
          success: true,
          data: {
            submissionId: Number(submission.rows[0].id),
            status: submission.rows[0].status,
            isLocked: submission.rows[0].is_locked,
            submittedAt: submission.rows[0].submitted_at,
            rejectionReason: submission.rows[0].rejection_reason,
            totalCredits,
            items: items.rows.map((r) => ({
              id: Number(r.krs_item_id),
              classCode: r.class_code,
              course: { code: r.course_code, name: r.course_name, credits: r.credits },
              dayOfWeek: r.day_of_week,
              startTime: r.start_time,
              endTime: r.end_time,
              room: r.room,
              lecturerName: r.lecturer_name ?? null,
            })),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /krs/my/download — PDF KRS sendiri (mahasiswa; status approved).
  // Keluhan lama: "KRS yang sudah disetujui bisa di download PDF" & "download PDF belum berhasil".
  // Fix: download memakai submission TERAKHIR mahasiswa (semua periode), bukan hanya periode
  // yang sedang buka — sehingga KRS yang sudah disetujui tetap bisa diunduh setelah periode tutup.
  router.get(
    '/my/download',
    authenticate,
    authorize('krs.fill'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = requireStudent(req);
        const latest = await pgPool.query(
          `SELECT krs_period_id FROM krs_submissions
           WHERE student_id = $1 AND status = 'approved'
           ORDER BY updated_at DESC LIMIT 1`,
          [studentId],
        );
        let periodId: number | null = null;
        if (latest.rows.length > 0) {
          periodId = Number(latest.rows[0].krs_period_id);
        } else {
          const period = await findActivePeriod();
          periodId = period?.id ?? null;
        }
        if (!periodId) {
          throw new AppError('KRS_PERIOD_CLOSED', 'Belum ada KRS disetujui untuk diunduh', 403);
        }
        const data = await fetchKrsPdfData(studentId, periodId);
        const pdf = await generateKrsPdf(data);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="krs-${data.student.nim}.pdf"`);
        res.send(pdf);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /krs/draft — simpan draft (Mahasiswa). Belum mengunci kuota (lock saat submit).
  router.post(
    '/draft',
    authenticate,
    authorize('krs.fill'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = classIdsSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data draft tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const studentId = requireStudent(req);
        const prodiId = await getStudentProdi(studentId);
        const period = await findActivePeriod();
        if (!period) {
          throw new AppError('KRS_PERIOD_CLOSED', 'Periode KRS tidak sedang buka', 403);
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');

          // Gate: locked, atau status selain draft/rejected → tidak bisa diubah (AC-07, AC-04c)
          const existing = await client.query(
            `SELECT id, status, is_locked FROM krs_submissions
           WHERE student_id = $1 AND krs_period_id = $2`,
            [studentId, period.id],
          );
          if (
            existing.rows.length > 0 &&
            (existing.rows[0].is_locked || !['draft', 'rejected'].includes(existing.rows[0].status))
          ) {
            throw new AppError('KRS_LOCKED', 'KRS sudah dikunci — tidak bisa diubah lagi', 409);
          }

          // Validasi kelas: milik prodi mahasiswa + aktif
          const classes = await client.query(
            `SELECT cl.id FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           WHERE cl.id = ANY($1::bigint[]) AND cur.prodi_id = $2 AND cur.semester_id = $3 AND cl.is_active
           ORDER BY cl.id`,
            [parsed.data.classIds, prodiId, period.semester_id],
          );
          if (classes.rows.length !== parsed.data.classIds.length) {
            throw new AppError(
              'CLASS_NOT_AVAILABLE',
              'Ada kelas yang tidak tersedia untuk prodi Anda',
              409,
            );
          }

          let submissionId: number;
          if (existing.rows.length > 0) {
            submissionId = Number(existing.rows[0].id);
            await client.query('DELETE FROM krs_items WHERE krs_submission_id = $1', [
              submissionId,
            ]);
          } else {
            const inserted = await client.query(
              `INSERT INTO krs_submissions (student_id, krs_period_id, status)
             VALUES ($1, $2, 'draft')
             RETURNING id`,
              [studentId, period.id],
            );
            submissionId = Number(inserted.rows[0].id);
          }

          for (const classId of parsed.data.classIds) {
            await client.query(
              `INSERT INTO krs_items (krs_submission_id, class_id)
             VALUES ($1, $2)
             ON CONFLICT (krs_submission_id, class_id) DO NOTHING`,
              [submissionId, classId],
            );
          }

          // Audit trail (F-13, S-06, S-07) — atomik dalam transaksi yang sama
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'krs_submissions',
              recordId: submissionId,
              action: existing.rows.length > 0 ? 'UPDATE' : 'INSERT',
              newValues: { status: 'draft', classIds: parsed.data.classIds },
            },
            client,
          );

          await client.query('COMMIT');
          res.json({
            success: true,
            data: { submissionId, status: 'draft', message: 'Draft tersimpan' },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /krs/submit — locking transaksi + kuota (F-07, AC-02); terkunci setelah submit (AC-07)
  router.post(
    '/submit',
    authenticate,
    authorize('krs.fill'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = classIdsSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data KRS tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const studentId = requireStudent(req);
        const prodiId = await getStudentProdi(studentId);
        const period = await findActivePeriod();
        if (!period) {
          throw new AppError('KRS_PERIOD_CLOSED', 'Periode KRS tidak sedang buka', 403);
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');

          // Gate: locked, atau status selain draft/rejected → tolak (AC-07, AC-04c)
          const existing = await client.query(
            `SELECT id, status, is_locked FROM krs_submissions
          WHERE student_id = $1 AND krs_period_id = $2
          FOR UPDATE`,
            [studentId, period.id],
          );
          if (
            existing.rows.length > 0 &&
            (existing.rows[0].is_locked || !['draft', 'rejected'].includes(existing.rows[0].status))
          ) {
            throw new AppError('KRS_LOCKED', 'KRS sudah dikunci — tidak bisa diubah lagi', 409);
          }

          // Validasi kelas + kunci kuota (SELECT ... FOR UPDATE — A-5, AC-02)
          // ORDER BY cl.id → urut locking deterministik, mencegah deadlock
          // di concurrency tinggi (T1.14 load test: 5k VU → deadlock 40P01).
          const classes = await client.query(
            `SELECT cl.id, cl.class_code, cl.capacity, cl.current_enrolled, c.code AS course_code
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses c ON c.id = cur.course_id
           WHERE cl.id = ANY($1::bigint[]) AND cur.prodi_id = $2 AND cur.semester_id = $3 AND cl.is_active
           ORDER BY cl.id
           FOR UPDATE`,
            [parsed.data.classIds, prodiId, period.semester_id],
          );
          if (classes.rows.length !== parsed.data.classIds.length) {
            throw new AppError(
              'CLASS_NOT_AVAILABLE',
              'Ada kelas yang tidak tersedia untuk prodi Anda',
              409,
            );
          }

          const fullClasses = classes.rows.filter(
            (r) => Number(r.current_enrolled) >= Number(r.capacity),
          );
          if (fullClasses.length > 0) {
            throw new AppError(
              'CLASS_FULL',
              `Kelas ${fullClasses[0].course_code}-${fullClasses[0].class_code} sudah penuh.`,
              409,
              {
                details: fullClasses.map((r) => ({
                  field: `classIds[${classes.rows.indexOf(r)}]`,
                  message: `Kelas ${r.course_code}-${r.class_code} tidak tersedia`,
                })),
              },
            );
          }

          // Update kuota (increment current_enrolled)
          for (const row of classes.rows) {
            await client.query(
              `UPDATE classes SET current_enrolled = current_enrolled + 1, updated_at = now()
             WHERE id = $1`,
              [row.id],
            );
          }

          // Buat/update submission → submitted + locked (AC-07)
          let submissionId: number;
          if (existing.rows.length > 0) {
            submissionId = Number(existing.rows[0].id);
            await client.query('DELETE FROM krs_items WHERE krs_submission_id = $1', [
              submissionId,
            ]);
          } else {
            const inserted = await client.query(
              `INSERT INTO krs_submissions (student_id, krs_period_id, status)
             VALUES ($1, $2, 'submitted')
             RETURNING id`,
              [studentId, period.id],
            );
            submissionId = Number(inserted.rows[0].id);
          }

          for (const classId of parsed.data.classIds) {
            await client.query(
              `INSERT INTO krs_items (krs_submission_id, class_id, is_confirmed)
             VALUES ($1, $2, true)
             ON CONFLICT (krs_submission_id, class_id) DO NOTHING`,
              [submissionId, classId],
            );
          }

          await client.query(
            `UPDATE krs_submissions
           SET status = 'submitted', submitted_at = now(), is_locked = true,
               rejection_reason = NULL, approved_by = NULL, approved_at = NULL, updated_at = now()
           WHERE id = $1`,
            [submissionId],
          );

          // Audit trail (F-13, S-06, S-07) — atomik dalam transaksi yang sama
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'krs_submissions',
              recordId: submissionId,
              action: existing.rows.length > 0 ? 'UPDATE' : 'INSERT',
              newValues: { status: 'submitted', classIds: parsed.data.classIds, isLocked: true },
            },
            client,
          );

          await client.query('COMMIT');
          // T1.12: invalidate available_classes cache (kuota berubah setelah submit)
          await cacheDelPattern(cacheKeys.allAvailableClasses);
          res.json({ success: true, data: { submissionId, status: 'submitted', locked: true } });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /krs/admin/pending — daftar KRS menunggu persetujuan (Admin Akademik — AC-04)
  router.get(
    '/admin/pending',
    authenticate,
    authorize('krs.approve'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          `SELECT ks.id, ks.submitted_at, ks.status,
                  s.nim, u.full_name AS student_name, p.code AS prodi_code,
                  (SELECT count(*) FROM krs_items ki WHERE ki.krs_submission_id = ks.id)::int AS item_count,
                  COALESCE((SELECT sum(c.credits)
                            FROM krs_items ki
                            JOIN classes cl ON cl.id = ki.class_id
                            JOIN curricula cur ON cur.id = cl.curriculum_id
                            JOIN courses c ON c.id = cur.course_id
                            WHERE ki.krs_submission_id = ks.id), 0) AS total_credits
           FROM krs_submissions ks
           JOIN students s ON s.id = ks.student_id
           JOIN users u ON u.id = s.user_id
           JOIN prodis p ON p.id = s.prodi_id
           WHERE ks.status = 'submitted'
           ORDER BY ks.submitted_at ASC, ks.id ASC`,
        );
        res.json({
          success: true,
          data: {
            items: result.rows.map((r) => ({
              id: Number(r.id),
              nim: r.nim,
              studentName: r.student_name,
              prodiCode: r.prodi_code,
              submittedAt: r.submitted_at,
              itemCount: r.item_count,
              totalCredits: Number(r.total_credits),
            })),
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /krs/admin/:id/approve — setujui KRS + notifikasi in-app (AC-04)
  router.post(
    '/admin/:id/approve',
    authenticate,
    authorize('krs.approve'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID pengajuan tidak valid', 400);
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          const sub = await client.query(
            `SELECT ks.id, ks.status, s.user_id
             FROM krs_submissions ks
             JOIN students s ON s.id = ks.student_id
             WHERE ks.id = $1
             FOR UPDATE`,
            [id],
          );
          if (sub.rows.length === 0) {
            throw new AppError('NOT_FOUND', 'Pengajuan KRS tidak ditemukan', 404);
          }
          if (sub.rows[0].status !== 'submitted') {
            throw new AppError(
              'KRS_NOT_PENDING',
              'Hanya KRS berstatus submitted yang bisa diproses',
              409,
            );
          }

          await client.query(
            `UPDATE krs_submissions
             SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
             WHERE id = $1`,
            [id, req.user!.id],
          );

          // Notifikasi in-app ke mahasiswa (AC-04) — atomik dalam transaksi yang sama
          await client.query(
            `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via)
             VALUES ($1, 'KRS Disetujui', 'KRS Anda telah disetujui oleh Admin Akademik.',
                     'krs_approved', 'krs_submission', $2, ARRAY['in_app'])`,
            [sub.rows[0].user_id, id],
          );

          // Audit trail (F-13, S-06, S-07)
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'krs_submissions',
              recordId: id,
              action: 'UPDATE',
              newValues: { status: 'approved', approvedBy: req.user!.id },
            },
            client,
          );

          await client.query('COMMIT');
          res.json({
            success: true,
            data: { id, status: 'approved', approvedBy: req.user!.id },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /krs/admin/:id/reject — tolak + alasan; unlock agar mahasiswa bisa revisi (AC-04c)
  router.post(
    '/admin/:id/reject',
    authenticate,
    authorize('krs.approve'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = rejectSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data penolakan tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'ID pengajuan tidak valid', 400);
        }

        const client = await pgPool.connect();
        try {
          await client.query('BEGIN');
          const sub = await client.query(
            `SELECT ks.id, ks.status, s.user_id
             FROM krs_submissions ks
             JOIN students s ON s.id = ks.student_id
             WHERE ks.id = $1
             FOR UPDATE`,
            [id],
          );
          if (sub.rows.length === 0) {
            throw new AppError('NOT_FOUND', 'Pengajuan KRS tidak ditemukan', 404);
          }
          if (sub.rows[0].status !== 'submitted') {
            throw new AppError(
              'KRS_NOT_PENDING',
              'Hanya KRS berstatus submitted yang bisa diproses',
              409,
            );
          }

          await client.query(
            `UPDATE krs_submissions
             SET status = 'rejected', rejection_reason = $2,
                 approved_by = $3, approved_at = now(),
                 is_locked = false, updated_at = now()
             WHERE id = $1`,
            [id, parsed.data.reason, req.user!.id],
          );

          // Notifikasi in-app ke mahasiswa dengan alasan (AC-04c)
          await client.query(
            `INSERT INTO notifications (user_id, title, message, type, related_entity_type, related_entity_id, sent_via)
             VALUES ($1, 'KRS Ditolak',
                     'KRS Anda ditolak: ' || $3,
                     'krs_rejected', 'krs_submission', $2, ARRAY['in_app'])`,
            [sub.rows[0].user_id, id, parsed.data.reason],
          );

          // Audit trail (F-13, S-06, S-07)
          await auditFromRequest(
            req.user!,
            req,
            {
              tableName: 'krs_submissions',
              recordId: id,
              action: 'UPDATE',
              newValues: { status: 'rejected', rejectionReason: parsed.data.reason },
            },
            client,
          );

          await client.query('COMMIT');
          res.json({
            success: true,
            data: { id, status: 'rejected', rejectionReason: parsed.data.reason },
          });
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /krs/admin/remind-unfilled — pemicu manual reminder AC-04d (idempotent; scheduler otomatis di index.ts)
  router.post(
    '/admin/remind-unfilled',
    authenticate,
    authorize('krs.approve'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const notified = await remindUnfilledStudents();
        res.json({ success: true, data: { notified } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
