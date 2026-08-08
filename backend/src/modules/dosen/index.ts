import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Dosen — T3.1 (F-20): Pilih MK
 * - GET /dosen/courses/available — MK yang bisa dipilih (filter prodi dosen, semester aktif)
 * - POST /dosen/courses/select — submit pilihan MK
 * - GET /dosen/courses/my — pilihan dosen sendiri per semester
 * - GET /dosen/courses/all — admin lihat semua pilihan (kurikulum.manage)
 * - PUT /dosen/courses/:id/review — admin review pilihan (diterima/ditolak)
 */

const courseSelectionSchema = z.object({
  curriculumId: z.number().int().positive(),
  priority: z.number().int().min(1).max(5).default(1),
  notes: z.string().optional(),
});

const reviewSchema = z.object({
  status: z.enum(['diterima', 'ditolak']),
  reviewNotes: z.string().optional(),
});

export function createDosenRouter(): Router {
  const router = Router();

  // --- DOSEN: MK yang tersedia untuk dipilih ---
  router.get(
    '/courses/available',
    authenticate,
    authorize('lecturer.select_course'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { semesterId } = req.query;
        if (!semesterId) {
          return res.status(400).json({ success: false, error: 'semesterId required' });
        }
        const semId = Number(semesterId as string);

        // Get lecturer profile from user
        const lecturerRes = await pgPool.query(
          `SELECT l.id, l.prodi_id FROM lecturers l WHERE l.user_id = $1 AND l.is_active`,
          [req.user!.id],
        );
        if (lecturerRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Lecturer profile not found' });
        }
        const lecturer = lecturerRes.rows[0];

        // Get curricula for this lecturer's prodi + semester (only active, with available capacity)
        const result = await pgPool.query(
          `SELECT 
              cur.id as curriculum_id,
              c.code as course_code,
              c.name as course_name,
              c.credits,
              cur.semester_number,
              cur.is_mandatory,
              COUNT(cl.id) FILTER (WHERE cl.is_active AND cl.current_enrolled < cl.capacity) as available_classes,
              -- Check if already selected
              CASE WHEN lcs.id IS NOT NULL THEN lcs.status ELSE 'belum_diajukan' END as selection_status,
              lcs.priority,
              lcs.notes
           FROM curricula cur
           JOIN courses c ON c.id = cur.course_id
           JOIN lecturers l ON l.prodi_id = cur.prodi_id
           LEFT JOIN classes cl ON cl.curriculum_id = cur.id
           LEFT JOIN lecturer_course_selections lcs 
             ON lcs.curriculum_id = cur.id AND lcs.lecturer_id = l.id
           WHERE cur.prodi_id = $1 
             AND cur.semester_id = $2
             AND c.is_active
             AND l.id = $3
           GROUP BY cur.id, c.code, c.name, c.credits, cur.semester_number, cur.is_mandatory, lcs.id, lcs.status, lcs.priority, lcs.notes
           ORDER BY cur.semester_number, c.code`,
          [lecturer.prodi_id, semId, lecturer.id],
        );

        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DOSEN: Submit pilihan MK ---
  router.post(
    '/courses/select',
    authenticate,
    authorize('lecturer.select_course'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = courseSelectionSchema.parse(req.body);

        // Get lecturer profile
        const lecturerRes = await pgPool.query(
          `SELECT l.id, l.prodi_id FROM lecturers l WHERE l.user_id = $1 AND l.is_active`,
          [req.user!.id],
        );
        if (lecturerRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Lecturer profile not found' });
        }
        const lecturer = lecturerRes.rows[0];

        // Verify curriculum belongs to lecturer's prodi
        const curRes = await pgPool.query(
          `SELECT cur.id, cur.prodi_id, cur.semester_id 
           FROM curricula cur 
           WHERE cur.id = $1 AND cur.prodi_id = $2`,
          [data.curriculumId, lecturer.prodi_id],
        );
        if (curRes.rows.length === 0) {
          return res
            .status(400)
            .json({ success: false, error: 'Curriculum not found or not in your prodi' });
        }
        const curriculum = curRes.rows[0];

        // Check if already selected
        const existingRes = await pgPool.query(
          `SELECT id FROM lecturer_course_selections 
           WHERE lecturer_id = $1 AND curriculum_id = $2`,
          [lecturer.id, data.curriculumId],
        );

        let result;
        if (existingRes.rows.length > 0) {
          // Update existing (only if status is 'diajukan' or 'ditolak')
          const existing = existingRes.rows[0];
          const checkStatus = await pgPool.query(
            `SELECT status FROM lecturer_course_selections WHERE id = $1`,
            [existing.id],
          );
          if (checkStatus.rows[0].status === 'diterima') {
            return res
              .status(400)
              .json({ success: false, error: 'Selection already accepted, cannot modify' });
          }

          result = await pgPool.query(
            `UPDATE lecturer_course_selections 
             SET status = 'diajukan', priority = $1, notes = $2, updated_at = now()
             WHERE id = $3 RETURNING *`,
            [data.priority, data.notes ?? null, existing.id],
          );
        } else {
          // Insert new
          result = await pgPool.query(
            `INSERT INTO lecturer_course_selections (lecturer_id, semester_id, curriculum_id, status, priority, notes)
             VALUES ($1, $2, $3, 'diajukan', $4, $5) RETURNING *`,
            [
              lecturer.id,
              curriculum.semester_id,
              data.curriculumId,
              data.priority,
              data.notes ?? null,
            ],
          );
        }

        // Audit trail
        await auditFromRequest(req.user!, req, {
          tableName: 'lecturer_course_selections',
          recordId: Number(result.rows[0].id),
          action: existingRes.rows.length > 0 ? 'UPDATE' : 'INSERT',
          newValues: {
            curriculumId: data.curriculumId,
            priority: data.priority,
            status: 'diajukan',
          },
        });

        res
          .status(existingRes.rows.length > 0 ? 200 : 201)
          .json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DOSEN: Lihat pilihan sendiri ---
  router.get(
    '/courses/my',
    authenticate,
    authorize('lecturer.select_course'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { semesterId } = req.query;

        const lecturerRes = await pgPool.query(
          `SELECT l.id FROM lecturers l WHERE l.user_id = $1 AND l.is_active`,
          [req.user!.id],
        );
        if (lecturerRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Lecturer profile not found' });
        }
        const lecturer = lecturerRes.rows[0];

        let query = `
          SELECT 
            lcs.*,
            c.code as course_code,
            c.name as course_name,
            c.credits,
            cur.semester_number,
            cur.is_mandatory,
            s.code as semester_code,
            s.name as semester_name,
            p.name as prodi_name
          FROM lecturer_course_selections lcs
          JOIN curricula cur ON cur.id = lcs.curriculum_id
          JOIN courses c ON c.id = cur.course_id
          JOIN semesters s ON s.id = cur.semester_id
          JOIN prodis p ON p.id = cur.prodi_id
          WHERE lcs.lecturer_id = $1
        `;
        const params: (number | string)[] = [lecturer.id];

        if (semesterId) {
          params.push(Number(semesterId));
          query += ` AND cur.semester_id = $${params.length}`;
        }

        query += ` ORDER BY s.code, cur.semester_number, c.code`;

        const result = await pgPool.query(query, params);
        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- ADMIN: Lihat semua pilihan dosen ---
  router.get(
    '/courses/all',
    authenticate,
    authorize('kurikulum.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { semesterId, prodiId, status } = req.query;

        let query = `
          SELECT 
            lcs.*,
            u.full_name as lecturer_name,
            l.nidn,
            c.code as course_code,
            c.name as course_name,
            c.credits,
            cur.semester_number,
            cur.is_mandatory,
            s.code as semester_code,
            s.name as semester_name,
            p.name as prodi_name,
            ru.full_name as reviewed_by_name
          FROM lecturer_course_selections lcs
          JOIN lecturers l ON l.id = lcs.lecturer_id
          JOIN users u ON u.id = l.user_id
          JOIN curricula cur ON cur.id = lcs.curriculum_id
          JOIN courses c ON c.id = cur.course_id
          JOIN semesters s ON s.id = cur.semester_id
          JOIN prodis p ON p.id = cur.prodi_id
          LEFT JOIN users ru ON ru.id = lcs.reviewed_by
        `;
        const params: (number | string)[] = [];
        const conditions: string[] = [];

        if (semesterId) {
          params.push(Number(semesterId as string));
          conditions.push(`cur.semester_id = $${params.length}`);
        }
        if (prodiId) {
          params.push(Number(prodiId as string));
          conditions.push(`cur.prodi_id = $${params.length}`);
        }
        if (status) {
          params.push(status as string);
          conditions.push(`lcs.status = $${params.length}`);
        }

        if (conditions.length > 0) {
          query += ` WHERE ` + conditions.join(' AND ');
        }

        query += ` ORDER BY s.code, p.name, u.full_name, cur.semester_number, c.code`;

        const result = await pgPool.query(query, params);
        res.json({ success: true, data: { items: result.rows } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- ADMIN: Review pilihan dosen ---
  router.put(
    '/courses/:id/review',
    authenticate,
    authorize('kurikulum.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const selectionId = Number(req.params.id);
        if (!Number.isInteger(selectionId) || selectionId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid selection ID' });
        }

        const data = reviewSchema.parse(req.body);

        // Check selection exists
        const existingRes = await pgPool.query(
          `SELECT * FROM lecturer_course_selections WHERE id = $1`,
          [selectionId],
        );
        if (existingRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Selection not found' });
        }

        const result = await pgPool.query(
          `UPDATE lecturer_course_selections 
           SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
           WHERE id = $4 RETURNING *`,
          [data.status, data.reviewNotes ?? null, req.user!.id, selectionId],
        );

        // Audit trail
        await auditFromRequest(req.user!, req, {
          tableName: 'lecturer_course_selections',
          recordId: selectionId,
          action: 'UPDATE',
          oldValues: { status: existingRes.rows[0].status },
          newValues: { status: data.status, reviewNotes: data.reviewNotes },
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DOSEN: Kelas yang diampu (jadwal + sesi terkait) — T3.8 fix ---
  router.get(
    '/my-classes',
    authenticate,
    authorize('class.view_students'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // classes.lecturer_id references users.id
        const classesRes = await pgPool.query(
          `SELECT
             cl.id, cl.class_code, cl.day_of_week, cl.start_time, cl.end_time,
             cl.room, cl.capacity, cl.current_enrolled, cl.is_active,
             cur.id as curriculum_id, cur.semester_id, cur.semester_number,
             co.code as course_code, co.name as course_name, co.credits
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses co ON co.id = cur.course_id
           WHERE cl.lecturer_id = $1 AND cl.is_active
           ORDER BY co.code, cl.class_code`,
          [req.user!.id],
        );

        const classIds = classesRes.rows.map((r) => r.id);
        const schedulesByClass = new Map<number, unknown[]>();
        if (classIds.length > 0) {
          const schedRes = await pgPool.query(
            `SELECT id, class_id, meeting_number, scheduled_date, topic, is_completed
             FROM schedules
             WHERE class_id = ANY($1)
             ORDER BY meeting_number`,
            [classIds],
          );
          for (const s of schedRes.rows) {
            const list = schedulesByClass.get(s.class_id) ?? [];
            list.push({
              id: Number(s.id),
              meetingNumber: Number(s.meeting_number),
              scheduledDate: s.scheduled_date,
              topic: s.topic,
              isCompleted: s.is_completed,
            });
            schedulesByClass.set(s.class_id, list);
          }
        }

        const items = classesRes.rows.map((r) => ({
          id: Number(r.id),
          classCode: r.class_code,
          dayOfWeek: r.day_of_week,
          startTime: r.start_time,
          endTime: r.end_time,
          room: r.room,
          capacity: Number(r.capacity),
          currentEnrolled: Number(r.current_enrolled),
          curriculumId: Number(r.curriculum_id),
          semesterId: Number(r.semester_id),
          semesterNumber: Number(r.semester_number),
          courseCode: r.course_code,
          courseName: r.course_name,
          credits: Number(r.credits),
          schedules: schedulesByClass.get(r.id) ?? [],
        }));

        res.json({ success: true, data: { items } });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- DOSEN/ADMIN: Daftar dosen aktif (untuk substitute teaching) — T3.8 fix ---
  router.get(
    '/lecturers',
    authenticate,
    authorize('substitute.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await pgPool.query(
          `SELECT l.id, l.user_id, l.nidn, u.full_name, u.email, p.code as prodi_code
           FROM lecturers l
           JOIN users u ON u.id = l.user_id
           JOIN prodis p ON p.id = l.prodi_id
           WHERE l.is_active AND u.is_active
           ORDER BY p.code, u.full_name`,
        );
        const items = result.rows.map((r) => ({
          id: Number(r.id), // lecturers.id (dipakai substitute_lecturer_id)
          userId: Number(r.user_id),
          nidn: r.nidn,
          fullName: r.full_name,
          email: r.email,
          prodiCode: r.prodi_code,
        }));
        res.json({ success: true, data: { items } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
