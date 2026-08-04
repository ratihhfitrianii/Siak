import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';
import { cacheGet, cacheSet, cacheDelPattern, cacheKeys, CACHE_TTL } from '../../lib/cache';

/**
 * Modul Nilai (Grades) — T1.8 (F-06, F-06a, F-06b, F-06c, F-10).
 * - Input nilai: tugas (20%), UTS (30%), UAS (50%)
 * - Remedial: ambil max(asli, remedial) per komponen
 * - Skala nilai: A=4.0, A-=3.7, B+=3.3, B=3.0, B-=2.7, C+=2.3, C=2.0, D=1.0, E=0.0
 * - Admin edit nilai + atribusi "diinput oleh X"
 */

const gradeInputSchema = z.object({
  tugasScore: z.number().min(0).max(100).nullable().optional(),
  utsScore: z.number().min(0).max(100).nullable().optional(),
  uasScore: z.number().min(0).max(100).nullable().optional(),
  isRemedial: z.boolean().optional(),
  remedialScore: z.number().min(0).max(100).nullable().optional(),
});

const gradeEditSchema = z.object({
  tugasScore: z.number().min(0).max(100).nullable().optional(),
  utsScore: z.number().min(0).max(100).nullable().optional(),
  uasScore: z.number().min(0).max(100).nullable().optional(),
  isRemedial: z.boolean().optional(),
  remedialScore: z.number().min(0).max(100).nullable().optional(),
});

const queryParamsSchema = z.object({
  classId: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  studentId: z.string().transform(Number).pipe(z.number().int().positive()).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().positive().max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
});

/**
 * Hitung nilai akhir (bobot: tugas 20%, UTS 30%, UAS 50%).
 * Jika isRemedial=true, ambil max(komponen_asli, remedialScore) per komponen.
 * RemedialScore adalah skor tunggal yang menggantikan komponen terendah?
 * Per DL-12: "remedial per komponen, ambil max". Artinya remedial per komponen.
 * Kita simpan remedialScore sebagai objek? Tapi schema hanya punya 1 remedialScore.
 * Interpretasi: remedialScore adalah nilai pengganti untuk komponen yang diremedial.
 * Untuk simplicitas: jika isRemedial, gunakan remedialScore untuk komponen yang diremedial.
 * Tapi spec tidak jelas komponen mana. Asumsi: remedial menggantikan UAS (komponen terbesar).
 * Atau: remedialScore digunakan untuk UAS, tugas/UTS tetap asli.
 * Better: simpan remedial per komponen di kolom terpisah? Tapi migration sudah fixed.
 * Workaround: gunakan remedialScore sebagai nilai UAS remedial, tugas/UTS pakai asli.
 */
function calculateFinalScore(
  tugas: number | null,
  uts: number | null,
  uas: number | null,
  isRemedial: boolean,
  remedialScore: number | null,
): number | null {
  if (tugas === null && uts === null && uas === null) return null;

  const t = tugas ?? 0;
  const u = uts ?? 0;
  let a = uas ?? 0;

  if (isRemedial && remedialScore !== null) {
    // Remedial menggantikan UAS (komponen 50%)
    a = Math.max(a, remedialScore);
  }

  const final = Math.round((t * 0.2 + u * 0.3 + a * 0.5) * 100) / 100;
  return Math.min(100, Math.max(0, final));
}

function scoreToGrade(score: number): { letter: string; point: number } {
  if (score >= 85) return { letter: 'A', point: 4.0 };
  if (score >= 80) return { letter: 'A-', point: 3.7 };
  if (score >= 75) return { letter: 'B+', point: 3.3 };
  if (score >= 70) return { letter: 'B', point: 3.0 };
  if (score >= 65) return { letter: 'B-', point: 2.7 };
  if (score >= 60) return { letter: 'C+', point: 2.3 };
  if (score >= 55) return { letter: 'C', point: 2.0 };
  if (score >= 40) return { letter: 'D', point: 1.0 };
  return { letter: 'E', point: 0.0 };
}

export function createGradesRouter(): Router {
  const router = Router();

  // GET /grades/class/:classId — daftar nilai kelas (Dosen pengampu, Admin Akademik)
  router.get(
    '/class/:classId',
    authenticate,
    authorize('grade.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const classId = Number(req.params.classId);
        if (!Number.isInteger(classId) || classId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'Class ID tidak valid', 400);
        }

        // Verify dosen owns this class or is admin
        const classCheck = await pgPool.query(
          `SELECT c.id, c.lecturer_id, c.class_code as class_code, cl.code as course_code, cl.name as course_name
           FROM classes c
           JOIN curricula cur ON cur.id = c.curriculum_id
           JOIN courses cl ON cl.id = cur.course_id
           WHERE c.id = $1`,
          [classId],
        );
        if (classCheck.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Kelas tidak ditemukan', 404);
        }
        const cls = classCheck.rows[0];
        const isOwner = cls.lecturer_id !== null && Number(cls.lecturer_id) === req.user!.id;
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        if (!isOwner && !isAdmin) {
          throw new AppError('FORBIDDEN', 'Anda tidak mengajar kelas ini', 403);
        }

        const parsed = queryParamsSchema.safeParse(req.query);
        const limit = parsed.data?.limit ?? 50;
        const offset = parsed.data?.offset ?? 0;

        const result = await pgPool.query(
          `SELECT g.*, ki.class_id, ki.krs_submission_id,
                  s.nim, u.full_name as student_name,
                  cl.code as course_code, cl.name as course_name
           FROM grades g
           JOIN krs_items ki ON ki.id = g.krs_item_id
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           JOIN students s ON s.id = ks.student_id
           JOIN users u ON u.id = s.user_id
           JOIN classes c ON c.id = ki.class_id
           JOIN curricula cur ON cur.id = c.curriculum_id
           JOIN courses cl ON cl.id = cur.course_id
           WHERE ki.class_id = $1
           ORDER BY s.nim
           LIMIT $2 OFFSET $3`,
          [classId, limit, offset],
        );

        const items = result.rows.map((r) => ({
          id: Number(r.id),
          krsItemId: Number(r.krs_item_id),
          tugasScore: r.tugas_score ? Number(r.tugas_score) : null,
          utsScore: r.uts_score ? Number(r.uts_score) : null,
          uasScore: r.uas_score ? Number(r.uas_score) : null,
          finalScore: r.final_score ? Number(r.final_score) : null,
          gradeLetter: r.grade_letter,
          gradePoint: r.grade_point ? Number(r.grade_point) : null,
          isRemedial: r.is_remedial,
          remedialScore: r.remedial_score ? Number(r.remedial_score) : null,
          inputBy: Number(r.input_by),
          inputAt: r.input_at,
          updatedBy: r.updated_by ? Number(r.updated_by) : null,
          updatedAt: r.updated_at,
          student: { nim: r.nim, name: r.student_name },
        }));

        res.json({
          success: true,
          data: {
            class: {
              id: Number(cls.id),
              classCode: cls.class_code,
              courseCode: cls.course_code,
              courseName: cls.course_name,
            },
            items,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /grades/student/:studentId — nilai mahasiswa sendiri (Mahasiswa, Dosen Wali, Admin)
  router.get(
    '/student/:studentId',
    authenticate,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const studentId = Number(req.params.studentId);
        if (!Number.isInteger(studentId) || studentId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'Student ID tidak valid', 400);
        }

        // Authorization: own data, wali, or admin
        const isOwn = req.user!.studentId === studentId;
        const isWali = req.user!.roleCode === 'dosen' && req.user!.isWali;
        const isAdmin = ['admin_akademik', 'admin_sistem'].includes(req.user!.roleCode);

        if (!isOwn && !isWali && !isAdmin) {
          throw new AppError('FORBIDDEN', 'Akses ditolak', 403);
        }

        // If wali, verify this student is their mentee
        if (isWali && !isAdmin) {
          const menteeCheck = await pgPool.query(
            'SELECT 1 FROM students WHERE id = $1 AND prodi_id IN (SELECT prodi_id FROM lecturers WHERE user_id = $2)',
            [studentId, req.user!.id],
          );
          if (menteeCheck.rows.length === 0) {
            throw new AppError('FORBIDDEN', 'Bukan binaan Anda', 403);
          }
        }

        const parsed = queryParamsSchema.safeParse(req.query);
        const limit = parsed.data?.limit ?? 50;
        const offset = parsed.data?.offset ?? 0;

        // T1.12: cache transkrip per siswa (5 menit, §7.2) — invalidasi saat nilai diinput
        const cacheKey = `${cacheKeys.transcript(studentId)}:${limit}:${offset}`;
        const cached = await cacheGet<{ items: unknown[] }>(cacheKey);
        if (cached) {
          res.json({ success: true, data: cached });
          return;
        }

        const result = await pgPool.query(
          `SELECT g.*, ki.class_id,
                          cl.code as course_code, cl.name as course_name, cl.credits,
                          c.class_code, kp.name as period_name, s.code as semester_code
                   FROM grades g
                   JOIN krs_items ki ON ki.id = g.krs_item_id
                   JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
                   JOIN krs_periods kp ON kp.id = ks.krs_period_id
                   JOIN semesters s ON s.id = kp.semester_id
                   JOIN classes c ON c.id = ki.class_id
                   JOIN curricula cur ON cur.id = c.curriculum_id
                   JOIN courses cl ON cl.id = cur.course_id
                   WHERE ks.student_id = $1
                   ORDER BY kp.start_date DESC, cl.code
                   LIMIT $2 OFFSET $3`,
          [studentId, limit, offset],
        );

        const items = result.rows.map((r) => ({
          id: Number(r.id),
          krsItemId: Number(r.krs_item_id),
          classId: Number(r.class_id),
          classCode: r.class_code,
          course: { code: r.course_code, name: r.course_name, credits: r.credits },
          period: r.period_name,
          semester: r.semester_code,
          tugasScore: r.tugas_score ? Number(r.tugas_score) : null,
          utsScore: r.uts_score ? Number(r.uts_score) : null,
          uasScore: r.uas_score ? Number(r.uas_score) : null,
          finalScore: r.final_score ? Number(r.final_score) : null,
          gradeLetter: r.grade_letter,
          gradePoint: r.grade_point ? Number(r.grade_point) : null,
          isRemedial: r.is_remedial,
          remedialScore: r.remedial_score ? Number(r.remedial_score) : null,
          inputBy: Number(r.input_by),
          inputAt: r.input_at,
          updatedBy: r.updated_by ? Number(r.updated_by) : null,
          updatedAt: r.updated_at,
        }));

        // T1.12: store cache (5 menit) — invalidasi saat nilai diinput
        await cacheSet(cacheKey, { items }, CACHE_TTL.TRANSCRIPT);
        res.json({ success: true, data: { items } });
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /grades — input nilai baru (Dosen pengampu, Admin Akademik)
  router.post(
    '/',
    authenticate,
    authorize('grade.input'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = gradeInputSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data nilai tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { tugasScore, utsScore, uasScore, isRemedial, remedialScore } = parsed.data;

        // Need krs_item_id in body
        const { krsItemId } = req.body as { krsItemId?: number };
        if (!krsItemId || !Number.isInteger(krsItemId) || krsItemId <= 0) {
          throw new AppError('VALIDATION_ERROR', 'krsItemId wajib diisi', 400);
        }

        // Verify class ownership (+ studentId for cache invalidation)
        const itemCheck = await pgPool.query(
          `SELECT ki.id, ki.class_id, c.lecturer_id, ks.student_id
           FROM krs_items ki
           JOIN classes c ON c.id = ki.class_id
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE ki.id = $1`,
          [krsItemId],
        );
        if (itemCheck.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Item KRS tidak ditemukan', 404);
        }
        const item = itemCheck.rows[0];
        const isOwner = item.lecturer_id !== null && Number(item.lecturer_id) === req.user!.id;
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        if (!isOwner && !isAdmin) {
          throw new AppError('FORBIDDEN', 'Anda tidak mengajar kelas ini', 403);
        }

        // Check existing grade
        const existing = await pgPool.query('SELECT 1 FROM grades WHERE krs_item_id = $1', [
          krsItemId,
        ]);
        if (existing.rows.length > 0) {
          throw new AppError('CONFLICT', 'Nilai sudah ada untuk item ini', 409);
        }

        const finalScore = calculateFinalScore(
          tugasScore ?? null,
          utsScore ?? null,
          uasScore ?? null,
          isRemedial ?? false,
          remedialScore ?? null,
        );
        const { letter, point } =
          finalScore !== null ? scoreToGrade(finalScore) : { letter: '', point: 0 };

        const result = await pgPool.query(
          `INSERT INTO grades (krs_item_id, tugas_score, uts_score, uas_score, final_score, grade_letter, grade_point, is_remedial, remedial_score, input_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            krsItemId,
            tugasScore ?? null,
            utsScore ?? null,
            uasScore ?? null,
            finalScore,
            finalScore !== null ? letter : null,
            finalScore !== null ? point : null,
            isRemedial ?? false,
            remedialScore ?? null,
            req.user!.id,
          ],
        );

        // Audit trail (F-13, S-06, S-07) — atribusi "diinput oleh X"
        await auditFromRequest(req.user!, req, {
          tableName: 'grades',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: {
            krsItemId,
            tugasScore: tugasScore ?? null,
            utsScore: utsScore ?? null,
            uasScore: uasScore ?? null,
            finalScore,
            gradeLetter: finalScore !== null ? letter : null,
            isRemedial: isRemedial ?? false,
          },
        });

        // T1.12: invalidate transkrip cache siswa (nilai berubah)
        if (item.student_id) {
          await cacheDelPattern(`${cacheKeys.transcript(Number(item.student_id))}*`);
        }
        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /grades/:id — edit nilai + atribusi (Admin Akademik, Admin Sistem)
  router.put(
    '/:id',
    authenticate,
    authorize('grade.edit'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          throw new AppError('VALIDATION_ERROR', 'Grade ID tidak valid', 400);
        }

        const parsed = gradeEditSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data nilai tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }
        const { tugasScore, utsScore, uasScore, isRemedial, remedialScore } = parsed.data;

        // Get current grade (+ student_id for cache invalidation)
        const current = await pgPool.query(
          `SELECT g.*, ki.class_id, c.lecturer_id, ks.student_id
           FROM grades g
           JOIN krs_items ki ON ki.id = g.krs_item_id
           JOIN classes c ON c.id = ki.class_id
           JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
           WHERE g.id = $1`,
          [id],
        );
        if (current.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Nilai tidak ditemukan', 404);
        }
        const grade = current.rows[0];

        // Admin akademik/sistem can edit any, dosen hanya kelas sendiri
        const isOwner = grade.lecturer_id !== null && Number(grade.lecturer_id) === req.user!.id;
        const isAdmin =
          req.user!.roleCode === 'admin_akademik' || req.user!.roleCode === 'admin_sistem';
        if (!isOwner && !isAdmin) {
          throw new AppError('FORBIDDEN', 'Anda tidak berhak edit nilai ini', 403);
        }

        const finalScore = calculateFinalScore(
          tugasScore ?? (grade.tugas_score !== null ? Number(grade.tugas_score) : null),
          utsScore ?? (grade.uts_score !== null ? Number(grade.uts_score) : null),
          uasScore ?? (grade.uas_score !== null ? Number(grade.uas_score) : null),
          isRemedial ?? grade.is_remedial,
          remedialScore ?? (grade.remedial_score !== null ? Number(grade.remedial_score) : null),
        );
        const { letter, point } =
          finalScore !== null ? scoreToGrade(finalScore) : { letter: '', point: 0 };

        // Atribusi: updated_by = current user
        const result = await pgPool.query(
          `UPDATE grades
           SET tugas_score = COALESCE($2, tugas_score),
               uts_score = COALESCE($3, uts_score),
               uas_score = COALESCE($4, uas_score),
               final_score = $5,
               grade_letter = $6,
               grade_point = $7,
               is_remedial = COALESCE($8, is_remedial),
               remedial_score = COALESCE($9, remedial_score),
               updated_by = $10,
               updated_at = now()
           WHERE id = $1
           RETURNING *`,
          [
            id,
            tugasScore ?? null,
            utsScore ?? null,
            uasScore ?? null,
            finalScore,
            finalScore !== null ? letter : null,
            finalScore !== null ? point : null,
            isRemedial ?? null,
            remedialScore ?? null,
            req.user!.id,
          ],
        );

        // Audit trail (F-13, S-06, S-07) — old/new JSONB + atribusi
        await auditFromRequest(req.user!, req, {
          tableName: 'grades',
          recordId: id,
          action: 'UPDATE',
          oldValues: {
            tugasScore: grade.tugas_score,
            utsScore: grade.uts_score,
            uasScore: grade.uas_score,
            finalScore: grade.final_score,
            gradeLetter: grade.grade_letter,
            updatedBy: grade.updated_by,
          },
          newValues: {
            tugasScore: tugasScore ?? null,
            utsScore: utsScore ?? null,
            uasScore: uasScore ?? null,
            finalScore,
            gradeLetter: finalScore !== null ? letter : null,
            updatedBy: req.user!.id,
          },
        });

        // T1.12: invalidate transkrip cache siswa (nilai diupdate)
        if (grade.student_id) {
          await cacheDelPattern(`${cacheKeys.transcript(Number(grade.student_id))}*`);
        }
        res.json({
          success: true,
          data: result.rows[0],
          message: `Nilai diperbarui oleh ${req.user!.fullName} (${req.user!.roleCode})`,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
