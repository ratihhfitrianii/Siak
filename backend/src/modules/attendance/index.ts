import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { AppError } from '../../middleware/error-handler';

/**
 * Modul Absensi — T3.3 (F-23): Absensi Mahasiswa
 * - attendance_sessions: sesi absensi per jadwal (topic wajib, QR code optional)
 * - attendance_records: record kehadiran mahasiswa (unique per session+student)
 * - Mahasiswa self check-in via QR/session_id
 * - Dosen buka/tutup sesi, lihat record, update manual
 */

const sessionCreateSchema = z.object({
  scheduleId: z.number().int().positive(),
  topic: z.string().min(1).max(200),
  qrCode: z.string().max(100).optional(),
});

const recordCreateSchema = z.object({
  sessionId: z.number().int().positive().optional(),
  // QR code alternative to sessionId (one of the two required)
  qrCode: z.string().max(100).optional(),
});

const recordUpdateSchema = z.object({
  status: z.enum(['hadir', 'tidak_hadir', 'izin', 'sakit']),
});

function requireStudent(req: Request): number {
  if (!req.user?.studentId) {
    throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
  }
  return req.user.studentId;
}

function requireLecturer(req: Request): number {
  if (!req.user?.lecturerId) {
    throw new AppError('FORBIDDEN', 'Akun bukan dosen aktif', 403);
  }
  return req.user.lecturerId;
}

export function createAttendanceRouter(): Router {
  const router = Router();

  // ============================================================
  // DOSEN: CRUD Attendance Sessions
  // ============================================================

  // GET /attendance/sessions — list sessions (dosen: own classes, admin: all)
  router.get(
    '/sessions',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { schedule_id, date_from, date_to, page = '1', limit = '20' } = req.query;
        const p = Math.max(1, parseInt(page as string, 10));
        const l = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const offset = (p - 1) * l;

        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';

        let where = 'WHERE 1=1';
        const params: (string | number)[] = [];
        let paramIdx = 1;

        if (!isAdmin) {
          // Dosen hanya lihat sesi dari jadwal kelas yang dia ajar
          // classes.lecturer_id references users.id
          where += ` AND s.schedule_id IN (
            SELECT sch.id FROM schedules sch
            JOIN classes cl ON cl.id = sch.class_id
            WHERE cl.lecturer_id = $${paramIdx++}
          )`;
          params.push(req.user!.id);
        }

        if (schedule_id) {
          where += ` AND s.schedule_id = $${paramIdx++}`;
          params.push(parseInt(schedule_id as string, 10));
        }
        if (date_from) {
          where += ` AND s.session_date >= $${paramIdx++}`;
          params.push(date_from as string);
        }
        if (date_to) {
          where += ` AND s.session_date <= $${paramIdx++}`;
          params.push(date_to as string);
        }

        // Count total
        const countSql = `SELECT COUNT(*) FROM attendance_sessions s ${where}`;
        const countRes = await pgPool.query(countSql, params);
        const total = parseInt(countRes.rows[0].count, 10);

        // Data
        const dataSql = `
          SELECT s.*, sch.meeting_number, sch.scheduled_date as schedule_date,
                 cl.class_code, cl.id as class_id,
                 cur.semester_number, co.code as course_code, co.name as course_name,
                 u.full_name as created_by_name,
                 (
                   SELECT COUNT(*) FROM krs_items ki
                   JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
                   WHERE ki.class_id = sch.class_id
                     AND ks.student_id IS NOT NULL
                     AND ks.status IN ('submitted', 'approved')
                 ) as total_records,
                 (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = s.id AND ar.status = 'hadir') as hadir_count
          FROM attendance_sessions s
          JOIN schedules sch ON sch.id = s.schedule_id
          JOIN classes cl ON cl.id = sch.class_id
          JOIN curricula cur ON cur.id = cl.curriculum_id
          JOIN courses co ON co.id = cur.course_id
          JOIN users u ON u.id = s.created_by
          ${where}
          ORDER BY s.session_date DESC, s.created_at DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx}
        `;
        params.push(l, offset);

        const dataRes = await pgPool.query(dataSql, params);

        res.json({
          success: true,
          data: dataRes.rows.map((r) => ({
            ...r,
            total_records: parseInt(r.total_records, 10),
            hadir_count: parseInt(r.hadir_count, 10),
          })),
          pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // DOSEN: Rekap Kehadiran per kelas
  // ============================================================

  // GET /attendance/recap?classId= — rekap kehadiran per mahasiswa (dosen pengampu, admin)
  router.get(
    '/recap',
    authenticate,
    authorize('attendance.recap'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        const classId = parseInt(req.query.classId as string, 10);
        if (isNaN(classId) || classId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'classId wajib diisi', 400);
        }

        // Kelas harus ada; dosen hanya boleh lihat kelas yang dia ampu
        const classRes = await pgPool.query(
          `SELECT cl.id, cl.lecturer_id FROM classes cl WHERE cl.id = $1`,
          [classId],
        );
        if (classRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Kelas tidak ditemukan', 404);
        }
        if (!isAdmin && Number(classRes.rows[0].lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Anda bukan pengampu kelas ini', 403);
        }

        // Semua mahasiswa terdaftar (submitted/approved) + agregat status dari record.
        // Mahasiswa tanpa record = belum absen di sesi manapun → semua counter 0,
        // totalSessions = jumlah sesi kelas (attendance_rate dihitung dari hadir/total).
        const result = await pgPool.query(
          `SELECT s.id as student_id, s.nim, u.full_name,
             COUNT(ar.id) FILTER (WHERE ar.status = 'hadir') AS hadir_count,
             COUNT(ar.id) FILTER (WHERE ar.status = 'izin') AS izin_count,
             COUNT(ar.id) FILTER (WHERE ar.status = 'sakit') AS sakit_count,
             COUNT(ar.id) FILTER (WHERE ar.status = 'tidak_hadir') AS alpha_count,
             (
               SELECT COUNT(*) FROM attendance_sessions sess
               JOIN schedules sch2 ON sch2.id = sess.schedule_id
               WHERE sch2.class_id = $1
             ) AS total_sessions
           FROM students s
           JOIN users u ON u.id = s.user_id
           JOIN krs_items ki ON ki.class_id = $1
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           LEFT JOIN attendance_records ar ON ar.student_id = s.id
             AND ar.session_id IN (
               SELECT sess.id FROM attendance_sessions sess
               JOIN schedules sch3 ON sch3.id = sess.schedule_id
               WHERE sch3.class_id = $1
             )
           WHERE ks.student_id = s.id AND ks.status IN ('submitted', 'approved')
           GROUP BY s.id, s.nim, u.full_name
           ORDER BY u.full_name`,
          [classId],
        );

        const items = result.rows.map((r) => {
          const hadir = parseInt(r.hadir_count, 10);
          const izin = parseInt(r.izin_count, 10);
          const sakit = parseInt(r.sakit_count, 10);
          const alpha = parseInt(r.alpha_count, 10);
          const totalSessions = parseInt(r.total_sessions, 10);
          const rate = totalSessions > 0 ? Math.round((hadir / totalSessions) * 100) : 0;
          return {
            studentId: Number(r.student_id),
            nim: r.nim,
            studentName: r.full_name,
            hadirCount: hadir,
            izinCount: izin,
            sakitCount: sakit,
            alphaCount: alpha,
            totalSessions,
            attendanceRate: rate,
          };
        });

        res.json({ success: true, data: items });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /attendance/sessions — create session (dosen, schedule owner)
  router.post(
    '/sessions',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireLecturer(req); // ensure caller is an active dosen
        const data = sessionCreateSchema.parse(req.body);

        // Verify schedule exists and belongs to this lecturer
        const scheduleRes = await pgPool.query(
          `SELECT sch.id, sch.class_id, cl.lecturer_id
           FROM schedules sch
           JOIN classes cl ON cl.id = sch.class_id
           WHERE sch.id = $1`,
          [data.scheduleId],
        );
        if (scheduleRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Jadwal tidak ditemukan', 404);
        }
        const schedule = scheduleRes.rows[0];
        // classes.lecturer_id references users.id, not lecturers.id
        if (Number(schedule.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Jadwal bukan milik Anda', 403);
        }

        // Check if session already exists for this schedule on the scheduled date
        const existingRes = await pgPool.query(
          `SELECT id FROM attendance_sessions WHERE schedule_id = $1 AND session_date = (SELECT scheduled_date FROM schedules WHERE id = $1)`,
          [data.scheduleId],
        );
        if (existingRes.rows.length > 0) {
          throw new AppError('CONFLICT', 'Sesi absensi untuk jadwal ini sudah ada', 409);
        }

        const result = await pgPool.query(
          `INSERT INTO attendance_sessions (schedule_id, session_date, topic, qr_code, created_by)
           VALUES ($1, (SELECT scheduled_date FROM schedules WHERE id = $1), $2, $3, $4) RETURNING *`,
          [data.scheduleId, data.topic, data.qrCode ?? null, req.user!.id],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_sessions',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: {
            scheduleId: data.scheduleId,
            topic: data.topic,
            qrCode: data.qrCode,
          },
        });

        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /attendance/sessions/:id/open — open session (dosen, owner)
  router.put(
    '/sessions/:id/open',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = parseInt(req.params.id ?? '', 10);
        if (isNaN(sessionId)) throw new AppError('VALIDATION_ERROR', 'Invalid session ID', 400);

        const sessionRes = await pgPool.query(
          `SELECT s.*, cl.lecturer_id
           FROM attendance_sessions s
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE s.id = $1`,
          [sessionId],
        );
        if (sessionRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const session = sessionRes.rows[0];
        // classes.lecturer_id references users.id
        if (Number(session.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Sesi bukan milik Anda', 403);
        }
        if (session.is_open) {
          throw new AppError('CONFLICT', 'Sesi sudah dibuka', 409);
        }

        const result = await pgPool.query(
          `UPDATE attendance_sessions
           SET is_open = true, opened_at = now()
           WHERE id = $1 RETURNING *`,
          [sessionId],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_sessions',
          recordId: sessionId,
          action: 'UPDATE',
          oldValues: { is_open: false, opened_at: null },
          newValues: { is_open: true, opened_at: new Date().toISOString() },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /attendance/sessions/:id/close — close session (dosen, owner)
  router.put(
    '/sessions/:id/close',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = parseInt(req.params.id ?? '', 10);
        if (isNaN(sessionId)) throw new AppError('VALIDATION_ERROR', 'Invalid session ID', 400);

        const sessionRes = await pgPool.query(
          `SELECT s.*, cl.lecturer_id
           FROM attendance_sessions s
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE s.id = $1`,
          [sessionId],
        );
        if (sessionRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const session = sessionRes.rows[0];
        // classes.lecturer_id references users.id
        if (Number(session.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Sesi bukan milik Anda', 403);
        }
        if (!session.is_open) {
          throw new AppError('CONFLICT', 'Sesi belum dibuka', 409);
        }

        const result = await pgPool.query(
          `UPDATE attendance_sessions
           SET is_open = false, closed_at = now()
           WHERE id = $1 RETURNING *`,
          [sessionId],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_sessions',
          recordId: sessionId,
          action: 'UPDATE',
          oldValues: { is_open: true, closed_at: null },
          newValues: { is_open: false, closed_at: new Date().toISOString() },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // MAHASISWA: Self Check-in
  // ============================================================

  // POST /attendance/check-in — mahasiswa absen mandiri (via sessionId atau qrCode)
  router.post(
    '/check-in',
    authenticate,
    authorize('krs.fill'), // mahasiswa
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = requireStudent(req);
        const { sessionId, qrCode } = recordCreateSchema.parse(req.body);

        let sessionRes;
        if (sessionId) {
          sessionRes = await pgPool.query(
            `SELECT s.*, sch.class_id
             FROM attendance_sessions s
             JOIN schedules sch ON sch.id = s.schedule_id
             WHERE s.id = $1`,
            [sessionId],
          );
        } else if (qrCode) {
          sessionRes = await pgPool.query(
            `SELECT s.*, sch.class_id
             FROM attendance_sessions s
             JOIN schedules sch ON sch.id = s.schedule_id
             WHERE s.qr_code = $1`,
            [qrCode],
          );
        } else {
          throw new AppError('VALIDATION_ERROR', 'sessionId atau qrCode wajib diisi', 400);
        }

        if (sessionRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const session = sessionRes.rows[0];

        if (!session.is_open) {
          throw new AppError('FORBIDDEN', 'Sesi absensi tidak dibuka atau sudah ditutup', 403);
        }

        // Check if student is enrolled in this class
        const enrollmentRes = await pgPool.query(
          `SELECT 1 FROM krs_items ki
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE ks.student_id = $1 AND ki.class_id = $2 AND ks.status IN ('submitted', 'approved')`,
          [studentId, session.class_id],
        );
        if (enrollmentRes.rows.length === 0) {
          throw new AppError('FORBIDDEN', 'Anda tidak terdaftar di kelas ini', 403);
        }

        // Upsert attendance record (mahasiswa self check-in = hadir)
        const existingRes = await pgPool.query(
          `SELECT id, status FROM attendance_records WHERE session_id = $1 AND student_id = $2`,
          [session.id, studentId],
        );

        let record;
        if (existingRes.rows.length > 0) {
          // Update existing
          const existing = existingRes.rows[0];
          if (existing.status !== 'hadir') {
            const updateRes = await pgPool.query(
              `UPDATE attendance_records
               SET status = 'hadir', marked_at = now(), marked_by = $1
               WHERE id = $2 RETURNING *`,
              [req.user!.id, existing.id],
            );
            record = updateRes.rows[0];
          } else {
            record = existing;
          }
        } else {
          // Insert new
          const insertRes = await pgPool.query(
            `INSERT INTO attendance_records (session_id, student_id, status, marked_by)
             VALUES ($1, $2, 'hadir', $3) RETURNING *`,
            [session.id, studentId, req.user!.id],
          );
          record = insertRes.rows[0];
        }

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_records',
          recordId: Number(record.id),
          action: existingRes.rows.length > 0 ? 'UPDATE' : 'INSERT',
          newValues: { session_id: session.id, student_id: studentId, status: 'hadir' },
        });

        res.json({ success: true, data: record, message: 'Absensi berhasil dicatat' });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // DOSEN/ADMIN: View & Update Attendance Records
  // ============================================================

  // GET /attendance/sessions/:id/records — view records (dosen: own, admin: all)
  router.get(
    '/sessions/:id/records',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        const sessionId = parseInt(req.params.id ?? '', 10);
        if (isNaN(sessionId)) throw new AppError('VALIDATION_ERROR', 'Invalid session ID', 400);

        // Verify session access
        const sessionRes = await pgPool.query(
          `SELECT s.*, cl.lecturer_id, cl.id as class_id
           FROM attendance_sessions s
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE s.id = $1`,
          [sessionId],
        );
        if (sessionRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const session = sessionRes.rows[0];
        if (!isAdmin && Number(session.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Sesi bukan milik Anda', 403);
        }

        const result = await pgPool.query(
          `SELECT ar.*, s.nim, u.full_name, u.email
           FROM attendance_records ar
           JOIN students s ON s.id = ar.student_id
           JOIN users u ON u.id = s.user_id
           WHERE ar.session_id = $1
           ORDER BY u.full_name`,
          [sessionId],
        );

        // Determine class_id from session (schedule)
        const classIdFromSchedule = Number(session.class_id);

        // Also get all enrolled students (for those who haven't checked in)
        const enrolledRes = await pgPool.query(
          `SELECT s.id as student_id, s.nim, u.full_name, u.email
           FROM students s
           JOIN users u ON u.id = s.user_id
           JOIN krs_items ki ON ki.class_id = $1
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE ks.student_id = s.id AND ks.status IN ('submitted', 'approved')
           ORDER BY u.full_name`,
          [classIdFromSchedule],
        );

        // Merge: enrolled students + their attendance records
        const recordsMap = new Map(result.rows.map((r) => [r.student_id, r]));
        const merged = enrolledRes.rows.map((student) => {
          const record = recordsMap.get(student.student_id);
          return {
            ...student,
            recordId: record?.id ?? null,
            status: record?.status ?? 'belum_absen',
            marked_at: record?.marked_at ?? null,
            marked_by: record?.marked_by ?? null,
          };
        });

        res.json({
          success: true,
          data: {
            session: {
              id: session.id,
              session_date: session.session_date,
              topic: session.topic,
              is_open: session.is_open,
              qr_code: session.qr_code,
            },
            records: merged,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /attendance/sessions/:id/records — dosen set status untuk mahasiswa yang
  // belum punya record (belum check-in). Membuat record baru sekaligus.
  router.post(
    '/sessions/:id/records',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        const sessionId = parseInt(req.params.id ?? '', 10);
        if (isNaN(sessionId)) throw new AppError('VALIDATION_ERROR', 'Invalid session ID', 400);

        const data = recordUpdateSchema.parse(req.body);
        const studentId = Number(req.body.studentId);
        if (!Number.isInteger(studentId) || studentId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'studentId wajib diisi', 400);
        }

        // Session harus ada & milik dosen (atau admin)
        const sessRes = await pgPool.query(
          `SELECT s.id, s.is_open, sch.class_id, cl.lecturer_id
           FROM attendance_sessions s
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE s.id = $1`,
          [sessionId],
        );
        if (sessRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const sess = sessRes.rows[0];
        if (!isAdmin && Number(sess.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Sesi bukan milik Anda', 403);
        }

        // Mahasiswa harus terdaftar di kelas ini
        const enr = await pgPool.query(
          `SELECT 1 FROM krs_items ki
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE ks.student_id = $1 AND ki.class_id = $2 AND ks.status IN ('submitted','approved')`,
          [studentId, sess.class_id],
        );
        if (enr.rows.length === 0) {
          throw new AppError('FORBIDDEN', 'Mahasiswa tidak terdaftar di kelas ini', 403);
        }

        // Upsert: kalau sudah ada record → update; kalau belum → buat
        const existing = await pgPool.query(
          `SELECT id FROM attendance_records WHERE session_id = $1 AND student_id = $2`,
          [sessionId, studentId],
        );
        let record;
        if (existing.rows.length > 0) {
          const upd = await pgPool.query(
            `UPDATE attendance_records SET status = $1, marked_at = now(), marked_by = $2
             WHERE id = $3 RETURNING *`,
            [data.status, req.user!.id, existing.rows[0].id],
          );
          record = upd.rows[0];
        } else {
          const ins = await pgPool.query(
            `INSERT INTO attendance_records (session_id, student_id, status, marked_by)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [sessionId, studentId, data.status, req.user!.id],
          );
          record = ins.rows[0];
        }

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_records',
          recordId: record.id,
          action: existing.rows.length > 0 ? 'UPDATE' : 'INSERT',
          newValues: { status: data.status },
        });

        res.status(existing.rows.length > 0 ? 200 : 201).json({ success: true, data: record });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /attendance/records/:id — dosen update record manually (dosen: own, admin: all)
  router.put(
    '/records/:id',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        const recordId = parseInt(req.params.id ?? '', 10);
        if (isNaN(recordId)) throw new AppError('VALIDATION_ERROR', 'Invalid record ID', 400);

        const data = recordUpdateSchema.parse(req.body);

        const recordRes = await pgPool.query(
          `SELECT ar.*, s.schedule_id, sch.class_id, cl.lecturer_id
           FROM attendance_records ar
           JOIN attendance_sessions s ON s.id = ar.session_id
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE ar.id = $1`,
          [recordId],
        );
        if (recordRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Record absensi tidak ditemukan', 404);
        }
        const record = recordRes.rows[0];
        if (!isAdmin && Number(record.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Record bukan milik Anda', 403);
        }

        const oldStatus = record.status;
        const result = await pgPool.query(
          `UPDATE attendance_records
           SET status = $1, marked_at = now(), marked_by = $2
           WHERE id = $3 RETURNING *`,
          [data.status, req.user!.id, recordId],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_records',
          recordId: recordId,
          action: 'UPDATE',
          oldValues: { status: oldStatus },
          newValues: { status: data.status },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // ADMIN: Generate QR Code for session (optional utility)
  // ============================================================

  // PUT /attendance/sessions/:id/qr — generate/regenerate QR code (dosen: own, admin: all)
  router.put(
    '/sessions/:id/qr',
    authenticate,
    authorize('attendance.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        const sessionId = parseInt(req.params.id ?? '', 10);
        if (isNaN(sessionId)) throw new AppError('VALIDATION_ERROR', 'Invalid session ID', 400);

        const sessionRes = await pgPool.query(
          `SELECT s.*, cl.lecturer_id
           FROM attendance_sessions s
           JOIN schedules sch ON sch.id = s.schedule_id
           JOIN classes cl ON cl.id = sch.class_id
           WHERE s.id = $1`,
          [sessionId],
        );
        if (sessionRes.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Sesi absensi tidak ditemukan', 404);
        }
        const session = sessionRes.rows[0];
        if (!isAdmin && Number(session.lecturer_id) !== req.user!.id) {
          throw new AppError('FORBIDDEN', 'Sesi bukan milik Anda', 403);
        }

        // Generate QR code: "SAIK-{sessionId}-{timestamp}"
        const qrCode = `SAIK-${sessionId}-${Date.now()}`;
        const result = await pgPool.query(
          `UPDATE attendance_sessions SET qr_code = $1 WHERE id = $2 RETURNING *`,
          [qrCode, sessionId],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'attendance_sessions',
          recordId: sessionId,
          action: 'UPDATE',
          oldValues: { qr_code: session.qr_code },
          newValues: { qr_code: qrCode },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
