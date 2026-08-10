import { Router, type Request, type Response, type NextFunction } from 'express';
import { z, type ZodType } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize, authorizeWali } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { AppError } from '../../middleware/error-handler';

/**
 * Modul Bimbingan — T3.4 (F-24): Dosen Wali catat pertemuan bimbingan
 * - guidance_sessions: catatan pertemuan yang SUDAH terjadi (bukan rencana)
 * - Dosen Wali (is_wali) menentukan progress/hasil per pertemuan
 * - Visibilitas: mahasiswa hanya melihat bimbingan sendiri (is_visible_to_student),
 *   wali melihat semua binaannya (prodi sama — pola DL-29/transcript)
 */

const PROGRESS_VALUES = ['berjalan', 'selesai', 'bermasalah'] as const;

const sessionCreateSchema = z.object({
  studentId: z.number().int().positive(),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD'),
  notes: z.string().max(2000).optional(),
  progress: z.enum(PROGRESS_VALUES),
  isVisibleToStudent: z.boolean().optional(),
  // Wajib diisi admin (dosen wali memakai lecturerId dari token)
  lecturerId: z.number().int().positive().optional(),
});

const sessionUpdateSchema = z
  .object({
    sessionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD')
      .optional(),
    notes: z.string().max(2000).optional(),
    progress: z.enum(PROGRESS_VALUES).optional(),
    isVisibleToStudent: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Tidak ada field yang diupdate' });

const SESSION_SELECT = `
  SELECT g.id, g.student_id, s.nim, u_s.full_name AS student_name,
         g.lecturer_id, u_l.full_name AS lecturer_name,
         to_char(g.session_date, 'YYYY-MM-DD') AS session_date,
         g.notes, g.progress, g.is_visible_to_student,
         g.created_at, g.updated_at
  FROM guidance_sessions g
  JOIN students s ON s.id = g.student_id
  JOIN users u_s ON u_s.id = s.user_id
  JOIN lecturers l ON l.id = g.lecturer_id
  JOIN users u_l ON u_l.id = l.user_id
`;

function isAdminRole(roleCode: string | undefined): boolean {
  return roleCode === 'admin_akademik' || roleCode === 'admin_sistem';
}

/** Parse zod → AppError VALIDATION_ERROR (ZodError polos → 500 oleh error-handler). */
function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', 'Data tidak valid', 400, {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}

/**
 * Wajib dosen Wali (is_wali) atau admin. Mengembalikan lecturer_id dosen wali,
 * atau 0 untuk admin (tidak terikat lecturer).
 * NOTE: authorizeWali('guidance.manage') saja TIDAK cukup — mahasiswa juga punya
 * permission guidance.manage (untuk GET /my), jadi endpoint wali perlu guard ini.
 */
function requireWaliOrAdmin(req: Request): number {
  const { roleCode, isWali, lecturerId } = req.user ?? {};
  if (roleCode === 'dosen' && isWali && lecturerId) {
    return lecturerId;
  }
  if (isAdminRole(roleCode)) {
    return 0;
  }
  throw new AppError('FORBIDDEN', 'Hanya dosen Wali atau admin yang bisa mengakses', 403);
}

function requireStudent(req: Request): number {
  if (!req.user?.studentId) {
    throw new AppError('FORBIDDEN', 'Akun bukan mahasiswa aktif', 403);
  }
  return req.user.studentId;
}

function parseId(raw: string | undefined): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('VALIDATION_ERROR', 'ID tidak valid', 400);
  }
  return id;
}

/** Cek mahasiswa binaan wali: 404 jika tidak ada, 403 jika bukan prodi wali. */
async function assertBinaan(studentId: number, waliUserId: number): Promise<void> {
  const exists = await pgPool.query(
    `SELECT 1 FROM students s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.is_active AND u.is_active`,
    [studentId],
  );
  if (exists.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Mahasiswa tidak ditemukan', 404);
  }
  const res = await pgPool.query(
    `SELECT 1 FROM students s
     WHERE s.id = $1
       AND s.prodi_id IN (SELECT prodi_id FROM lecturers WHERE user_id = $2)`,
    [studentId, waliUserId],
  );
  if (res.rows.length === 0) {
    throw new AppError('FORBIDDEN', 'Mahasiswa bukan binaan Anda', 403);
  }
}

/** Cek mahasiswa aktif ada (untuk admin yang boleh mencatat semua mahasiswa). */
async function assertStudentExists(studentId: number): Promise<void> {
  const res = await pgPool.query(
    `SELECT 1 FROM students s JOIN users u ON u.id = s.user_id
     WHERE s.id = $1 AND s.is_active AND u.is_active`,
    [studentId],
  );
  if (res.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Mahasiswa tidak ditemukan', 404);
  }
}

function assertPastOrToday(sessionDate: string): void {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(`${sessionDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d > today) {
    throw new AppError('VALIDATION_ERROR', 'Tanggal bimbingan tidak boleh di masa depan', 400);
  }
}

/** Ambil sesi + guard per-role; mengembalikan row atau melempar. */
async function fetchSessionGuarded(
  sessionId: number,
  req: Request,
): Promise<Record<string, unknown>> {
  const res = await pgPool.query(`${SESSION_SELECT} WHERE g.id = $1`, [sessionId]);
  if (res.rows.length === 0) {
    throw new AppError('NOT_FOUND', 'Sesi bimbingan tidak ditemukan', 404);
  }
  const row = res.rows[0];
  const { roleCode, studentId, lecturerId } = req.user ?? {};
  if (roleCode === 'mahasiswa') {
    if (Number(row.student_id) !== studentId || !row.is_visible_to_student) {
      throw new AppError('FORBIDDEN', 'Bukan bimbingan Anda', 403);
    }
  } else if (roleCode === 'dosen') {
    if (Number(row.lecturer_id) !== lecturerId) {
      throw new AppError('FORBIDDEN', 'Bukan sesi bimbingan Anda', 403);
    }
  }
  // admin_*: bebas
  return row;
}

export function createGuidanceRouter(): Router {
  const router = Router();
  router.use(authenticate);

  // ============================================================
  // WALI / ADMIN: CRUD Sesi Bimbingan
  // ============================================================

  // POST /guidance/sessions — wali catat pertemuan bimbingan yang sudah terjadi
  router.post(
    '/sessions',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actorLecturerId = requireWaliOrAdmin(req);
        const body = parseOrThrow(sessionCreateSchema, req.body);
        assertPastOrToday(body.sessionDate);

        const isAdmin = isAdminRole(req.user?.roleCode);
        const studentId = body.studentId;
        if (isAdmin) {
          await assertStudentExists(studentId);
        } else {
          await assertBinaan(studentId, req.user!.id);
        }

        const lecturerId = isAdmin ? body.lecturerId : actorLecturerId;
        if (!lecturerId) {
          throw new AppError('VALIDATION_ERROR', 'lecturerId wajib diisi admin', 400);
        }
        // Pastikan dosen wali yang dimaksud benar-benar wali
        const waliRes = await pgPool.query(
          `SELECT u.id FROM users u
           JOIN roles r ON r.id = u.role_id
           JOIN lecturers l ON l.user_id = u.id
           WHERE l.id = $1 AND r.code = 'dosen' AND u.is_wali AND u.is_active AND l.is_active`,
          [lecturerId],
        );
        if (waliRes.rows.length === 0) {
          throw new AppError('VALIDATION_ERROR', 'Dosen wali tidak valid', 400);
        }

        const ins = await pgPool.query(
          `INSERT INTO guidance_sessions
             (student_id, lecturer_id, session_date, notes, progress, is_visible_to_student)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            studentId,
            lecturerId,
            body.sessionDate,
            body.notes ?? null,
            body.progress,
            body.isVisibleToStudent ?? true,
          ],
        );
        const id = Number(ins.rows[0].id);

        await auditFromRequest(req.user!, req, {
          tableName: 'guidance_sessions',
          recordId: id,
          action: 'INSERT',
          newValues: {
            student_id: studentId,
            lecturer_id: lecturerId,
            session_date: body.sessionDate,
            progress: body.progress,
            is_visible_to_student: body.isVisibleToStudent ?? true,
          },
        });

        const out = await pgPool.query(`${SESSION_SELECT} WHERE g.id = $1`, [id]);
        res.status(201).json({ success: true, data: out.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /guidance/sessions — wali: binaannya; admin: semua; filter ?studentId=
  router.get(
    '/sessions',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const actorLecturerId = requireWaliOrAdmin(req);
        const isAdmin = isAdminRole(req.user?.roleCode);
        const { student_id } = req.query;

        const params: unknown[] = [];
        let where = 'WHERE 1=1';
        if (!isAdmin) {
          params.push(actorLecturerId);
          where += ` AND g.lecturer_id = $${params.length}`;
        }
        if (student_id) {
          params.push(Number(student_id));
          where += ` AND g.student_id = $${params.length}`;
        }

        const res2 = await pgPool.query(
          `${SESSION_SELECT} ${where} ORDER BY g.session_date DESC, g.id DESC`,
          params,
        );
        res.json({ success: true, data: res2.rows });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /guidance/sessions/:id — detail (wali punya sendiri, mhs punya sendiri & visible, admin bebas)
  router.get(
    '/sessions/:id',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId = parseId(req.params.id);
        const row = await fetchSessionGuarded(sessionId, req);
        res.json({ success: true, data: row });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /guidance/sessions/:id — wali update catatan (hanya miliknya)
  router.put(
    '/sessions/:id',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireWaliOrAdmin(req);
        const sessionId = parseId(req.params.id);
        const row = await fetchSessionGuarded(sessionId, req);
        const body = parseOrThrow(sessionUpdateSchema, req.body);
        if (body.sessionDate) assertPastOrToday(body.sessionDate);

        const sets: string[] = [];
        const params: unknown[] = [];
        const oldValues: Record<string, unknown> = {
          session_date: row.session_date,
          notes: row.notes,
          progress: row.progress,
          is_visible_to_student: row.is_visible_to_student,
        };
        const newValues: Record<string, unknown> = { ...oldValues };
        for (const [col, key] of [
          ['session_date', 'sessionDate'],
          ['notes', 'notes'],
          ['progress', 'progress'],
          ['is_visible_to_student', 'isVisibleToStudent'],
        ] as const) {
          if (body[key] !== undefined) {
            params.push(body[key]);
            sets.push(`${col} = $${params.length}`);
            newValues[col] = body[key];
          }
        }
        params.push(sessionId);
        await pgPool.query(
          `UPDATE guidance_sessions SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length}`,
          params,
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'guidance_sessions',
          recordId: sessionId,
          action: 'UPDATE',
          oldValues,
          newValues,
        });

        const out = await pgPool.query(`${SESSION_SELECT} WHERE g.id = $1`, [sessionId]);
        res.json({ success: true, data: out.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /guidance/sessions/:id — wali hapus catatan (hanya miliknya)
  router.delete(
    '/sessions/:id',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireWaliOrAdmin(req);
        const sessionId = parseId(req.params.id);
        const row = await fetchSessionGuarded(sessionId, req);

        await pgPool.query(`DELETE FROM guidance_sessions WHERE id = $1`, [sessionId]);
        await auditFromRequest(req.user!, req, {
          tableName: 'guidance_sessions',
          recordId: sessionId,
          action: 'DELETE',
          oldValues: {
            student_id: row.student_id,
            session_date: row.session_date,
            progress: row.progress,
          },
        });

        res.json({ success: true, data: { id: sessionId, deleted: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /guidance/mentees — wali: daftar binaan (prodi sama); admin: semua mahasiswa
  // Query: ?search= (NIM/nama/email/prodi), ?prodi_code=
  router.get(
    '/mentees',
    authorizeWali('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        requireWaliOrAdmin(req);
        const isAdmin = isAdminRole(req.user?.roleCode);
        const { search, prodi_code } = req.query;

        let query = `
          SELECT s.id AS student_id, s.nim, u.full_name AS student_name,
                 u.email, s.status, p.code AS prodi_code
          FROM students s
          JOIN users u ON u.id = s.user_id
          JOIN prodis p ON p.id = s.prodi_id
          WHERE s.is_active AND u.is_active`;
        const params: unknown[] = [];

        if (!isAdmin) {
          params.push(req.user!.id);
          query += ` AND s.prodi_id IN (SELECT prodi_id FROM lecturers WHERE user_id = $${params.length})`;
        }

        if (search) {
          params.push(`%${search}%`);
          query += ` AND (s.nim ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
        }

        if (prodi_code && isAdmin) {
          // admin can filter by prodi
          params.push(prodi_code);
          query += ` AND p.code = $${params.length}`;
        }

        query += ' ORDER BY s.nim';
        const res2 = await pgPool.query(query, params);
        res.json({ success: true, data: res2.rows });
      } catch (err) {
        next(err);
      }
    },
  );

  // ============================================================
  // MAHASISWA: Bimbingan Sendiri
  // ============================================================

  // GET /guidance/my — mahasiswa lihat bimbingan sendiri (hanya yang visible)
  router.get(
    '/my',
    authorize('guidance.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = requireStudent(req);
        const res2 = await pgPool.query(
          `${SESSION_SELECT} WHERE g.student_id = $1 AND g.is_visible_to_student
           ORDER BY g.session_date DESC, g.id DESC`,
          [studentId],
        );
        res.json({ success: true, data: res2.rows });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
