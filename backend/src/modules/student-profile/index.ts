import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { AppError } from '../../middleware/error-handler';
import { authenticate, authorize } from '../../lib/auth-middleware';

/**
 * Modul Student Profile — T1.11c (F-XX)
 * Endpoints untuk mahasiswa:
 *   GET  /students/me          — profil mahasiswa lengkap (photo, phone, personal_email, detail akademik)
 *   PUT  /students/me          — update profil mahasiswa (phone, personal_email, photo)
 *   GET  /students/me/ips      — IP per semester untuk grafik
 *
 * Permission: mahasiswa (studentId dari token)
 */

const updateStudentProfileSchema = z.object({
  phone: z.string().max(20).optional().nullable(),
  personalEmail: z.string().email('Email pribadi tidak valid').optional().nullable(),
  photoUrl: z.string().max(10000000).optional().nullable(), // terima data URLs untuk upload
});

export function createStudentProfileRouter(): Router {
  const router = Router();

  // GET /students/me — profil mahasiswa lengkap
  router.get(
    '/me',
    authenticate,
    authorize('student.profile'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        if (!user.studentId) {
          throw new AppError('FORBIDDEN', 'Hanya mahasiswa yang dapat mengakses profil ini', 403);
        }

        const result = await pgPool.query(
          `SELECT
            s.id,
            s.nim,
            u.full_name,
            u.email,
            s.phone,
            s.personal_email,
            s.photo_url,
            p.code as prodi_code,
            p.name as prodi_name,
            f.code as faculty_code,
            f.name as faculty_name,
            ay.code as academic_year_code,
            s.entry_type,
            s.status,
            s.created_at,
            s.updated_at
          FROM students s
          JOIN users u ON u.id = s.user_id
          JOIN prodis p ON p.id = s.prodi_id
          JOIN faculties f ON f.id = p.faculty_id
          JOIN academic_years ay ON ay.id = s.academic_year_id
          WHERE s.id = $1`,
          [user.studentId],
        );

        if (result.rows.length === 0) {
          throw new AppError('NOT_FOUND', 'Profil mahasiswa tidak ditemukan', 404);
        }

        const row = result.rows[0];
        res.json({
          success: true,
          data: {
            id: Number(row.id),
            nim: row.nim,
            fullName: row.full_name,
            email: row.email,
            phone: row.phone,
            personalEmail: row.personal_email,
            photoUrl: row.photo_url,
            prodiCode: row.prodi_code,
            prodiName: row.prodi_name,
            facultyCode: row.faculty_code,
            facultyName: row.faculty_name,
            academicYearCode: row.academic_year_code,
            entryType: row.entry_type,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /students/me — update profil mahasiswa (phone, personal_email, photo)
  router.put(
    '/me',
    authenticate,
    authorize('student.profile'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        if (!user.studentId) {
          throw new AppError('FORBIDDEN', 'Hanya mahasiswa yang dapat mengupdate profil ini', 403);
        }

        const parsed = updateStudentProfileSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Data profil tidak valid', 400, {
            fields: parsed.error.flatten().fieldErrors,
          });
        }

        const { phone, personalEmail, photoUrl } = parsed.data;

        const result = await pgPool.query(
          `UPDATE students
           SET phone = COALESCE($1, phone),
               personal_email = COALESCE($2, personal_email),
               photo_url = COALESCE($3, photo_url),
               updated_at = now()
           WHERE id = $4
           RETURNING id, phone, personal_email, photo_url, updated_at`,
          [phone ?? null, personalEmail ?? null, photoUrl ?? null, user.studentId],
        );

        res.json({
          success: true,
          data: {
            ...result.rows[0],
            message: 'Profil mahasiswa berhasil diperbarui',
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /students/me/ips — IP per semester untuk grafik
  router.get(
    '/me/ips',
    authenticate,
    authorize('student.profile'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const user = req.user!;
        if (!user.studentId) {
          throw new AppError('FORBIDDEN', 'Hanya mahasiswa yang dapat mengakses data ini', 403);
        }

        // Ambil data transkrip (reuse logic dari transcript module)
        const gradesWithCourseRes = await pgPool.query(
          `SELECT
            g.id,
            g.grade_point,
            cl.code as course_code,
            cl.credits,
            s.id as semester_id,
            s.code as semester_code,
            s.name as semester_name
          FROM grades g
          JOIN krs_items ki ON ki.id = g.krs_item_id
          JOIN krs_submissions ks ON ks.id = ki.krs_submission_id
          JOIN krs_periods kp ON kp.id = ks.krs_period_id
          JOIN semesters s ON s.id = kp.semester_id
          JOIN classes c ON c.id = ki.class_id
          JOIN curricula cur ON cur.id = c.curriculum_id
          JOIN courses cl ON cl.id = cur.course_id
          WHERE ks.student_id = $1
          ORDER BY kp.start_date DESC, cl.code`,
          [user.studentId],
        );

        const rowsWithCourse = gradesWithCourseRes.rows as Array<{
          id: string;
          grade_point: string | null;
          course_code: string;
          credits: string;
          semester_id: string;
          semester_code: string;
          semester_name: string;
        }>;

        // Nilai terbaik per course_code (untuk handling matkul diulang)
        const bestByCourse = new Map<string, { gradeId: number; point: number }>();

        for (const row of rowsWithCourse) {
          const point = row.grade_point !== null ? Number(row.grade_point) : 0;
          const existing = bestByCourse.get(row.course_code);
          if (!existing || point > existing.point) {
            bestByCourse.set(row.course_code, { gradeId: Number(row.id), point });
          }
        }

        // Group by semester
        const semesterMap = new Map<
          number,
          {
            semesterId: number;
            semesterCode: string;
            semesterName: string;
            ips: number;
            sksLulus: number;
            sksDiambil: number;
          }
        >();

        for (const row of rowsWithCourse) {
          const semId = Number(row.semester_id);
          if (!semesterMap.has(semId)) {
            semesterMap.set(semId, {
              semesterId: semId,
              semesterCode: row.semester_code,
              semesterName: row.semester_name,
              ips: 0,
              sksLulus: 0,
              sksDiambil: 0,
            });
          }
          const sem = semesterMap.get(semId)!;
          const point = row.grade_point !== null ? Number(row.grade_point) : 0;
          const best = bestByCourse.get(row.course_code)!;
          const isBest = best.gradeId === Number(row.id);

          if (isBest) {
            sem.sksDiambil += Number(row.credits);
            if (point > 0) sem.sksLulus += Number(row.credits);
          }
        }

        const semesters: Array<{
          semesterId: number;
          semesterCode: string;
          semesterName: string;
          ips: number;
          sksLulus: number;
          sksDiambil: number;
        }> = [];

        for (const sem of Array.from(semesterMap.values())) {
          let bobotSem = 0;
          // Need to get courses for this semester to calculate bobot
          // For simplicity, recalculate from rows
          for (const row of rowsWithCourse) {
            if (Number(row.semester_id) === sem.semesterId) {
              const point = row.grade_point !== null ? Number(row.grade_point) : 0;
              const best = bestByCourse.get(row.course_code)!;
              const isBest = best.gradeId === Number(row.id);
              if (isBest && point > 0) {
                bobotSem += point * Number(row.credits);
              }
            }
          }
          sem.ips = sem.sksLulus > 0 ? Math.round((bobotSem / sem.sksLulus) * 100) / 100 : 0;

          semesters.push(sem);
        }

        semesters.sort((a, b) => a.semesterCode.localeCompare(b.semesterCode));

        res.json({
          success: true,
          data: semesters,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
