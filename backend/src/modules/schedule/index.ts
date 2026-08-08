import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pgPool } from '../../lib/pg';
import { authenticate, authorize } from '../../lib/auth-middleware';
import { auditFromRequest } from '../../lib/audit-service';

/**
 * Modul Schedule — T3.2 (F-21, F-22): Jadwal Kelas + Checklist Ketersediaan
 * - GET /schedule/class/:classId — jadwal pertemuan untuk satu kelas
 * - POST /schedule — buat jadwal (admin akademik, schedule.manage)
 * - PUT /schedule/:id — update jadwal (admin akademik)
 * - DELETE /schedule/:id — hapus jadwal (admin akademik)
 * - GET /schedule/availability — cek ketersediaan dosen (lecturer.availability)
 */

const scheduleCreateSchema = z.object({
  classId: z.number().int().positive(),
  meetingNumber: z.number().int().min(1).max(30),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  topic: z.string().max(200).optional(),
});

const scheduleUpdateSchema = z.object({
  meetingNumber: z.number().int().min(1).max(30).optional(),
  scheduledDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  topic: z.string().max(200).optional(),
  isCompleted: z.boolean().optional(),
});

export function createScheduleRouter(): Router {
  const router = Router();

  // --- DOSEN: Cek ketersediaan jadwal ---
  router.get(
    '/availability',
    authenticate,
    authorize('lecturer.availability'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { date } = req.query;
        if (!date) {
          return res.status(400).json({ success: false, error: 'date required (YYYY-MM-DD)' });
        }

        // Get lecturer profile from user
        const lecturerRes = await pgPool.query(
          `SELECT l.id, l.user_id FROM lecturers l WHERE l.user_id = $1 AND l.is_active`,
          [req.user!.id],
        );
        if (lecturerRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Lecturer profile not found' });
        }
        const lecturer = lecturerRes.rows[0];
        const userId = Number(lecturer.user_id);

        // Get all schedules for this lecturer on the given date
        // classes.lecturer_id references users.id, so we need to join through user_id
        const result = await pgPool.query(
          `SELECT 
              s.id,
              s.meeting_number,
              s.scheduled_date,
              s.topic,
              s.is_completed,
              cl.class_code,
              cur.id as curriculum_id,
              cur.semester_number,
              co.code as course_code,
              co.name as course_name
           FROM schedules s
           JOIN classes cl ON cl.id = s.class_id
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses co ON co.id = cur.course_id
           WHERE cl.lecturer_id = $1
             AND s.scheduled_date = $2
           ORDER BY s.meeting_number`,
          [userId, date], // classes.lecturer_id references users.id
        );

        // Get classes for this lecturer (to check available time slots)
        const classesRes = await pgPool.query(
          `SELECT 
              cl.id,
              cl.class_code,
              cl.day_of_week,
              cl.start_time,
              cl.end_time,
              cur.id as curriculum_id,
              cur.semester_number,
              co.code as course_code,
              co.name as course_name
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses co ON co.id = cur.course_id
           WHERE cl.lecturer_id = $1
             AND cl.is_active
           ORDER BY cl.day_of_week, cl.start_time`,
          [userId], // classes.lecturer_id references users.id
        );

        // Calculate busy slots on the given date
        const dayOfWeek = new Date(date as string).getDay() || 7; // 1=Mon..7=Sun
        const busySlots = result.rows.map((r) => ({
          id: Number(r.id), // schedule id (T3.8: dipakai create sesi/substitute)
          meetingNumber: r.meeting_number,
          topic: r.topic,
          isCompleted: r.is_completed,
          classCode: r.class_code,
          courseCode: r.course_code,
          courseName: r.course_name,
        }));

        // Available time slots based on class schedule
        const availableSlots = classesRes.rows
          .filter((c) => c.day_of_week === dayOfWeek)
          .map((c) => ({
            classId: c.id,
            classCode: c.class_code,
            startTime: c.start_time,
            endTime: c.end_time,
            courseCode: c.course_code,
            courseName: c.course_name,
            semesterNumber: c.semester_number,
          }));

        res.json({
          success: true,
          data: {
            date,
            dayOfWeek,
            busySlots,
            availableSlots,
            isAvailable: busySlots.length === 0 || availableSlots.length > busySlots.length,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  // --- ADMIN: CRUD Jadwal per Kelas ---
  router.get(
    '/class/:classId',
    authenticate,
    authorize('schedule.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const classId = Number(req.params.classId);
        if (!Number.isInteger(classId) || classId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid class ID' });
        }

        // Verify class exists
        const classRes = await pgPool.query(
          `SELECT cl.*, cur.semester_number, co.code as course_code, co.name as course_name, co.credits
           FROM classes cl
           JOIN curricula cur ON cur.id = cl.curriculum_id
           JOIN courses co ON co.id = cur.course_id
           WHERE cl.id = $1`,
          [classId],
        );
        if (classRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Class not found' });
        }

        const result = await pgPool.query(
          `SELECT * FROM schedules WHERE class_id = $1 ORDER BY meeting_number`,
          [classId],
        );

        res.json({
          success: true,
          data: {
            class: classRes.rows[0],
            schedules: result.rows,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    '/',
    authenticate,
    authorize('schedule.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const data = scheduleCreateSchema.parse(req.body);

        // Verify class exists
        const classRes = await pgPool.query('SELECT id FROM classes WHERE id = $1', [data.classId]);
        if (classRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Class not found' });
        }

        // Check meeting number unique per class
        const existingRes = await pgPool.query(
          `SELECT id FROM schedules WHERE class_id = $1 AND meeting_number = $2`,
          [data.classId, data.meetingNumber],
        );
        if (existingRes.rows.length > 0) {
          return res
            .status(409)
            .json({ success: false, error: 'Meeting number already exists for this class' });
        }

        const result = await pgPool.query(
          `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [data.classId, data.meetingNumber, data.scheduledDate, data.topic ?? null],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'schedules',
          recordId: Number(result.rows[0].id),
          action: 'INSERT',
          newValues: {
            classId: data.classId,
            meetingNumber: data.meetingNumber,
            scheduledDate: data.scheduledDate,
            topic: data.topic,
          },
        });

        res.status(201).json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    '/:id',
    authenticate,
    authorize('schedule.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const scheduleId = Number(req.params.id);
        if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid schedule ID' });
        }

        const data = scheduleUpdateSchema.parse(req.body);

        // Check exists
        const existingRes = await pgPool.query('SELECT * FROM schedules WHERE id = $1', [
          scheduleId,
        ]);
        if (existingRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        // If meeting_number or class_id changing, check unique
        if (data.meetingNumber !== undefined || data.scheduledDate !== undefined) {
          const checkRes = await pgPool.query(
            `SELECT id FROM schedules 
             WHERE class_id = $1 AND meeting_number = $2 AND id != $3`,
            [
              existingRes.rows[0].class_id,
              data.meetingNumber ?? existingRes.rows[0].meeting_number,
              scheduleId,
            ],
          );
          if (checkRes.rows.length > 0) {
            return res
              .status(409)
              .json({ success: false, error: 'Meeting number already exists for this class' });
          }
        }

        const result = await pgPool.query(
          `UPDATE schedules
           SET meeting_number = COALESCE($1, meeting_number),
               scheduled_date = COALESCE($2, scheduled_date),
               topic = COALESCE($3, topic),
               is_completed = COALESCE($4, is_completed),
               completed_at = CASE WHEN $4 = true AND is_completed = false THEN now() ELSE completed_at END,
               updated_at = now()
           WHERE id = $5 RETURNING *`,
          [
            data.meetingNumber ?? null,
            data.scheduledDate ?? null,
            data.topic ?? null,
            data.isCompleted ?? null,
            scheduleId,
          ],
        );

        await auditFromRequest(req.user!, req, {
          tableName: 'schedules',
          recordId: scheduleId,
          action: 'UPDATE',
          oldValues: {
            meetingNumber: existingRes.rows[0].meeting_number,
            scheduledDate: existingRes.rows[0].scheduled_date,
            topic: existingRes.rows[0].topic,
            isCompleted: existingRes.rows[0].is_completed,
          },
          newValues: data,
        });

        res.json({ success: true, data: result.rows[0] });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/:id',
    authenticate,
    authorize('schedule.manage'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const scheduleId = Number(req.params.id);
        if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid schedule ID' });
        }

        const existingRes = await pgPool.query('SELECT * FROM schedules WHERE id = $1', [
          scheduleId,
        ]);
        if (existingRes.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Schedule not found' });
        }

        await pgPool.query('DELETE FROM schedules WHERE id = $1', [scheduleId]);

        await auditFromRequest(req.user!, req, {
          tableName: 'schedules',
          recordId: scheduleId,
          action: 'DELETE',
          oldValues: existingRes.rows[0],
        });

        res.json({ success: true, data: { id: scheduleId, deleted: true } });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
